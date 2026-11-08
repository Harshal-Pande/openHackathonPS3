import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config.js';
import { Database, QuoteRow, PurchaseAttemptRow, PaymentAuditEventRow } from '../db/database.js';
import { BuyQuoteSummary, QuoteStatus, BuyHealthStatus } from '../forensics/types.js';
import { BuyAdapter, PurchaseExecutionResult, SettlementResolutionResult } from '../adapters/buyAdapter.js';
import {
  validateCapabilityRequest,
  getRegisteredCapability,
  normalizeAndVerifyAmount
} from './capabilityRegistry.js';

export interface OperatorApprovalPacket {
  approvalId: string;
  quoteId: string;
  investigationId: string | null;
  capabilityId: string;
  url: string;
  method: string;
  bodySha256: string;
  tokenContract: string;
  tokenSymbol: string;
  amountAtomic: string;
  amountDisplay: string;
  recipient: string;
  chainId: number;
  approvedBy: string;
  approvedAt: string;
  status: 'APPROVED';
  paidExecutionTriggered: false;
  reason: string;
}

export class BuyQuoteServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = 'BAD_REQUEST'
  ) {
    super(message);
    this.name = 'BuyQuoteServiceError';
  }
}

export const DEFAULT_ALLOWED_CAPABILITIES = ['cencori.v1.chat.completions'];
export const DEFAULT_ALLOWED_RECIPIENTS = ['0x20faaca5f980e29639a0fcc6dca6988e18ed333b'];
export const DEFAULT_ALLOWED_TOKENS = [
  '0xceba9300f2b948710d2653dd7b07f33a8b32118c' // USDC
];

/**
 * Resolves allowlists: if configured list is empty or omitted, returns authoritative defaults.
 * If explicitly configured with values, returns configured list.
 */
export function resolveAllowlist(configured: string[] | undefined | null, defaults: string[]): string[] {
  if (!configured || configured.length === 0) {
    return defaults;
  }
  return configured.map(s => (typeof s === 'string' ? s.trim() : s)).filter(Boolean);
}

export class BuyQuoteService {
  private buyAdapter?: BuyAdapter;

  constructor(
    private db: Database,
    private config: AppConfig,
    buyAdapter?: BuyAdapter
  ) {
    this.buyAdapter = buyAdapter;
  }

  public setBuyAdapter(adapter: BuyAdapter): void {
    this.buyAdapter = adapter;
  }

  public getKillSwitch(): boolean {
    return this.db.getKillSwitch();
  }

  public setKillSwitch(enabled: boolean): void {
    this.db.setKillSwitch(enabled);
  }

  /**
   * Creates an immutable quote record bound to the exact request body SHA-256.
   * Stops at the AWAITING_OPERATOR_APPROVAL state. Zero funds are spent.
   */
  public async createQuote(params: {
    investigationId?: string;
    capabilityId: string;
    url: string;
    method: string;
    exactBody: string;
    tokenSymbol: string;
    tokenContract: string;
    amountAtomic: string;
    amountDisplay: string;
    recipient: string;
    chainId?: number;
    ttlSeconds?: number;
    reason?: string;
  }): Promise<BuyQuoteSummary> {
    // 1. Emergency Kill-Switch Check
    if (this.db.getKillSwitch()) {
      throw new BuyQuoteServiceError(
        'Emergency kill switch is active. All Buy quotes and purchases are blocked.',
        503,
        'KILL_SWITCH_ACTIVE'
      );
    }

    // 2. Validate Capability ID Allowlist
    const allowedCaps = resolveAllowlist(this.config.BUY_ALLOWED_CAPABILITY_IDS, DEFAULT_ALLOWED_CAPABILITIES);
    if (!allowedCaps.includes(params.capabilityId)) {
      throw new BuyQuoteServiceError(
        `Capability "${params.capabilityId}" is not in the approved Buy capability allowlist.`,
        403,
        'CAPABILITY_NOT_ALLOWED'
      );
    }

    // 3. Enforce Per-Call Spending Cap (checked on amountAtomic format)
    if (!/^[1-9][0-9]*$/.test(params.amountAtomic)) {
      throw new BuyQuoteServiceError(
        `Invalid atomic amount: "${params.amountAtomic}". Must be a positive base-10 integer string with no signs, decimals, or leading zeros.`,
        400,
        'INVALID_AMOUNT'
      );
    }
    const callCap = BigInt(this.config.BUY_PER_CALL_CAP_ATOMIC || '0');
    const rawQuoteAmount = BigInt(params.amountAtomic);
    if (callCap > 0n && rawQuoteAmount > callCap) {
      throw new BuyQuoteServiceError(
        `Quote amount ${params.amountAtomic} exceeds per-call spending cap of ${this.config.BUY_PER_CALL_CAP_ATOMIC}.`,
        403,
        'PER_CALL_CAP_EXCEEDED'
      );
    }

    // 4. Enforce Daily Budget
    const dailyCap = BigInt(this.config.BUY_DAILY_BUDGET_ATOMIC || '0');
    if (dailyCap > 0n) {
      const todayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const currentDailySpend = this.db.getGlobalDailySpendAtomic(todayIso);
      if (currentDailySpend + rawQuoteAmount > dailyCap) {
        throw new BuyQuoteServiceError(
          `Quote amount would exceed daily spending budget cap of ${this.config.BUY_DAILY_BUDGET_ATOMIC}.`,
          403,
          'DAILY_BUDGET_EXCEEDED'
        );
      }
    }

    // 5. Strict Authoritative Capability Registry & Payload Validation
    let validation: ReturnType<typeof validateCapabilityRequest>;
    try {
      validation = validateCapabilityRequest({
        capabilityId: params.capabilityId,
        url: params.url,
        method: params.method,
        tokenSymbol: params.tokenSymbol,
        tokenContract: params.tokenContract,
        amountAtomic: params.amountAtomic,
        amountDisplay: params.amountDisplay,
        recipient: params.recipient,
        exactBody: params.exactBody,
        chainId: params.chainId
      });
    } catch (valErr: any) {
      throw new BuyQuoteServiceError(valErr.message, 400, 'CAPABILITY_VALIDATION_FAILED');
    }

    // 6. Validate Token Contract Allowlist
    const allowedTokens = resolveAllowlist(this.config.BUY_ALLOWED_TOKEN_CONTRACTS, DEFAULT_ALLOWED_TOKENS);
    const cleanToken = validation.tokenConfig.contract.toLowerCase();
    if (!allowedTokens.includes(cleanToken)) {
      throw new BuyQuoteServiceError(
        `Token contract "${params.tokenContract}" is not in the approved token allowlist.`,
        403,
        'TOKEN_NOT_ALLOWED'
      );
    }

    // 7. Validate Recipient / Payee Allowlist
    const allowedRecipients = resolveAllowlist(this.config.BUY_ALLOWED_RECIPIENTS, DEFAULT_ALLOWED_RECIPIENTS);
    const cleanRecipient = validation.capability.payee.toLowerCase();
    if (!allowedRecipients.includes(cleanRecipient)) {
      throw new BuyQuoteServiceError(
        `Payee address "${params.recipient}" is not in the approved recipient allowlist.`,
        403,
        'RECIPIENT_NOT_ALLOWED'
      );
    }

    // 8. Compute Cryptographic Body Hash
    const bodySha256 = crypto.createHash('sha256').update(params.exactBody).digest('hex');

    // 9. Store Immutable Quote Record with verified canonical amounts
    const quoteId = randomUUID();
    const now = new Date();
    const ttlMs = (params.ttlSeconds || 900) * 1000;
    const expiry = new Date(now.getTime() + ttlMs).toISOString();

    const quoteRow: QuoteRow = {
      id: quoteId,
      investigation_id: params.investigationId || null,
      capability_id: validation.capability.capabilityId,
      url: validation.capability.serviceUrl,
      method: validation.capability.method,
      exact_body: params.exactBody,
      body_sha256: bodySha256,
      token_symbol: validation.tokenConfig.symbol,
      token_contract: cleanToken,
      amount_atomic: validation.canonicalAtomic,
      amount_display: params.amountDisplay || validation.canonicalDisplay,
      recipient: cleanRecipient,
      chain_id: validation.capability.chainId,
      status: 'AWAITING_OPERATOR_APPROVAL',
      expiry,
      reason: params.reason || 'AI forensic explanation requested',
      created_at: now.toISOString()
    };

    this.db.saveQuote(quoteRow);

    return this.toSummary(quoteRow);
  }

  /**
   * Binds an operator approval strictly to the exact quote ID and body SHA-256.
   * If any byte of the payload or quote parameters differ, approval fails.
   * Atomically transitions the quote to APPROVED using an immediate SQLite transaction.
   * STOPS at the approval stage; no paid execution occurs.
   */
  public async approveQuote(params: {
    quoteId: string;
    expectedBodySha256: string;
    operatorUsername: string;
    isOperatorAuthenticated: boolean;
  }): Promise<OperatorApprovalPacket> {
    // 1. Enforce Operator Authentication
    if (!params.isOperatorAuthenticated) {
      throw new BuyQuoteServiceError(
        'Public callers cannot approve project-wallet spending. Authenticated operator session required.',
        401,
        'UNAUTHORIZED'
      );
    }

    // 2. Emergency Kill-Switch Check
    if (this.db.getKillSwitch()) {
      throw new BuyQuoteServiceError(
        'Emergency kill switch is active. Quote approvals are blocked.',
        503,
        'KILL_SWITCH_ACTIVE'
      );
    }

    // 3. Atomically Validate and Approve Quote
    let approvedQuote: QuoteRow;
    try {
      approvedQuote = this.db.approveQuoteAtomic({
        quoteId: params.quoteId,
        expectedBodySha256: params.expectedBodySha256,
        operatorUsername: params.operatorUsername
      });
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('not found')) {
        throw new BuyQuoteServiceError(msg, 404, 'QUOTE_NOT_FOUND');
      }
      if (msg.includes('already approved')) {
        throw new BuyQuoteServiceError(msg, 409, 'ALREADY_APPROVED');
      }
      if (msg.includes('expired')) {
        throw new BuyQuoteServiceError(msg, 410, 'QUOTE_EXPIRED');
      }
      if (msg.includes('mismatch')) {
        throw new BuyQuoteServiceError(msg, 400, 'HASH_MISMATCH');
      }
      throw new BuyQuoteServiceError(msg, 400, 'APPROVAL_FAILED');
    }

    return {
      approvalId: approvedQuote.approval_id!,
      quoteId: approvedQuote.id,
      investigationId: approvedQuote.investigation_id || null,
      capabilityId: approvedQuote.capability_id,
      url: approvedQuote.url,
      method: approvedQuote.method,
      bodySha256: approvedQuote.body_sha256,
      tokenContract: approvedQuote.token_contract,
      tokenSymbol: approvedQuote.token_symbol,
      amountAtomic: approvedQuote.amount_atomic,
      amountDisplay: approvedQuote.amount_display,
      recipient: approvedQuote.recipient,
      chainId: approvedQuote.chain_id,
      approvedBy: approvedQuote.approved_by || params.operatorUsername,
      approvedAt: approvedQuote.approved_at || new Date().toISOString(),
      status: 'APPROVED',
      paidExecutionTriggered: false,
      reason: approvedQuote.reason || 'Operator authorized quote packet'
    };
  }

  public getQuote(quoteId: string): BuyQuoteSummary | null {
    const row = this.db.getQuote(quoteId);
    return row ? this.toSummary(row) : null;
  }

  public getQuotesForInvestigation(investigationId: string): BuyQuoteSummary[] {
    const rows = this.db.getQuotesByInvestigationId(investigationId);
    return rows.map((r) => this.toSummary(r));
  }

  public listQuotes(limit: number = 20): BuyQuoteSummary[] {
    const rows = this.db.listQuotes(limit);
    return rows.map((r) => this.toSummary(r));
  }

  /**
   * Executes a quote that has been explicitly approved by the operator.
   * Requires authenticated operator session.
   */
  public async executeQuote(params: {
    quoteId: string;
    approvalId: string;
    operatorUsername: string;
    isOperatorAuthenticated: boolean;
  }): Promise<PurchaseExecutionResult> {
    if (!params.isOperatorAuthenticated) {
      throw new BuyQuoteServiceError(
        'Public callers cannot execute project-wallet purchases. Authenticated operator session required.',
        401,
        'UNAUTHORIZED'
      );
    }

    if (!this.buyAdapter) {
      throw new BuyQuoteServiceError('Buy adapter is not configured or unavailable.', 500, 'ADAPTER_UNAVAILABLE');
    }

    return this.buyAdapter.executeApprovedRequest(
      params.quoteId,
      params.approvalId,
      params.operatorUsername
    );
  }

  /**
   * Resolves settlement for a purchase attempt (e.g. following timeout or unknown status).
   */
  public async resolvePurchaseSettlement(params: {
    attemptId: string;
    isOperatorAuthenticated: boolean;
  }): Promise<SettlementResolutionResult> {
    if (!params.isOperatorAuthenticated) {
      throw new BuyQuoteServiceError(
        'Public callers cannot resolve settlements. Authenticated operator session required.',
        401,
        'UNAUTHORIZED'
      );
    }

    if (!this.buyAdapter) {
      throw new BuyQuoteServiceError('Buy adapter is not configured or unavailable.', 500, 'ADAPTER_UNAVAILABLE');
    }

    return this.buyAdapter.resolveSettlement(params.attemptId);
  }

  public getPurchaseAttempt(id: string): PurchaseAttemptRow | null {
    return this.db.getPurchaseAttempt(id);
  }

  public listPurchaseAttempts(limit: number = 20): PurchaseAttemptRow[] {
    return this.db.listPurchaseAttempts(limit);
  }

  public getAuditEvents(entityId?: string, limit: number = 50): PaymentAuditEventRow[] {
    return this.db.listPaymentAuditEvents(entityId, limit);
  }

  public async getBuyHealth(): Promise<BuyHealthStatus> {
    if (!this.buyAdapter) {
      return {
        ready: false,
        cliVersion: 'unavailable',
        account: '0x3e1bef07824cd0E076F4907641F0A0EF27898e52',
        network: 'celo',
        balances: {},
        killSwitchActive: this.getKillSwitch(),
        timestamp: new Date().toISOString()
      };
    }
    return this.buyAdapter.getHealth();
  }

  private toSummary(row: QuoteRow): BuyQuoteSummary {
    return {
      quoteId: row.id,
      investigationId: row.investigation_id,
      capabilityId: row.capability_id,
      status: row.status as QuoteStatus,
      url: row.url,
      method: row.method,
      bodySha256: row.body_sha256,
      tokenSymbol: row.token_symbol,
      tokenContract: row.token_contract,
      amountAtomic: row.amount_atomic,
      amountDisplay: row.amount_display,
      recipient: row.recipient,
      chainId: row.chain_id || 42220,
      expiry: row.expiry,
      reason: row.reason,
      approvalId: row.approval_id,
      approvedAt: row.approved_at,
      approvedBy: row.approved_by
    };
  }
}
