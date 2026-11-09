import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppConfig } from '../config.js';
import { Database, QuoteRow, PurchaseAttemptRow } from '../db/database.js';
import {
  BuyQuoteSummary,
  PurchaseStatus,
  PurchaseAttemptRecord,
  SettlementProofRecord,
  DiscoveredCapability,
  BuyHealthStatus
} from '../forensics/types.js';
import {
  getRegisteredCapability,
  listRegisteredCapabilities,
  normalizeAndVerifyAmount
} from '../services/capabilityRegistry.js';

const execFileAsync = promisify(execFile);

export const ERC20_TRANSFER_EVENT_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Strictly decodes an ABI-encoded 20-byte address from a 32-byte indexed event topic.
 * Enforces:
 * 1. Topic must be a non-null string starting with '0x' followed by exactly 64 hex characters (32 bytes).
 * 2. The first 12 bytes (24 hex characters) must be zero-padded ('000000000000000000000000').
 * 3. Returns the normalized lowercase 20-byte address ('0x' + 40 hex characters) only after validation.
 */
export function decodeAddressFromTopic(topic: string): string {
  if (!topic || typeof topic !== 'string') return '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(topic)) return '';
  const padding = topic.slice(2, 26);
  if (padding !== '000000000000000000000000') return '';
  return '0x' + topic.slice(26).toLowerCase();
}

export function decodeUint256FromData(data: string): bigint {
  if (!data || typeof data !== 'string' || data === '0x') return 0n;
  const clean = data.startsWith('0x') ? data : `0x${data}`;
  try {
    return BigInt(clean);
  } catch {
    return 0n;
  }
}

export interface ReceiptVerificationResult {
  verified: boolean;
  txHash?: string;
  blockNumber?: number;
  payer?: string;
  recipient?: string;
  amountAtomic?: string;
  reason?: string;
}

/**
 * Validates an on-chain transaction receipt for successful execution and verifies
 * that event logs contain matching ERC-20 Transfer logs transferring the exact quoted
 * atomic amount to the quoted recipient contract.
 *
 * Enforces:
 * 1. Receipt existence and successful status (0x1 or 1).
 * 2. Requested transaction hash matches receipt transactionHash case-insensitively.
 * 3. ERC-20 Transfer topic matching with strict 32-byte ABI word validation.
 * 4. Payer and recipient indexed address topic validation (first 12 bytes zero-padded).
 * 5. Payer identity verified from topics[1] matching expectedPayer without fallbacks.
 * 6. Sum of all matching transfer logs to recipient equals the exact quoted atomic amount.
 */
export function verifyReceiptTransferLogs(
  receipt: any,
  quote: {
    token_contract: string;
    recipient: string;
    amount_atomic: string;
  },
  expectedTxHash: string,
  expectedPayer: string
): ReceiptVerificationResult {
  if (!receipt || typeof receipt !== 'object') {
    return { verified: false, reason: 'Missing or null receipt.' };
  }

  // DEFECT-44: Make expected payer mandatory and validate format strictly as a 20-byte EVM address
  if (!expectedPayer || typeof expectedPayer !== 'string' || !/^0[xX][0-9a-fA-F]{40}$/.test(expectedPayer.trim())) {
    return {
      verified: false,
      reason: 'Expected payer address is missing, empty, or malformed: must be a valid 20-byte EVM address.'
    };
  }
  const normalizedExpectedPayer = expectedPayer.trim().toLowerCase();

  // 1. Receipt status check (0x1 or 1 indicates success)
  const isSuccess = receipt.status === '0x1' || receipt.status === 1;
  if (!isSuccess) {
    return { verified: false, reason: `Transaction failed with receipt status "${receipt.status}".` };
  }

  // 2. Validate expected and receipt transaction hashes (DEFECT MOD03.3-02)
  if (!expectedTxHash || !/^0x[0-9a-fA-F]{64}$/.test(expectedTxHash)) {
    return { verified: false, reason: 'Invalid or missing expected transaction hash format.' };
  }

  const receiptTxHash = receipt.transactionHash || receipt.txHash;
  if (!receiptTxHash || !/^0x[0-9a-fA-F]{64}$/.test(receiptTxHash)) {
    return { verified: false, reason: 'Invalid or missing transaction hash in receipt.' };
  }

  if (receiptTxHash.toLowerCase() !== expectedTxHash.toLowerCase()) {
    return {
      verified: false,
      reason: `Receipt transaction hash "${receiptTxHash}" does not match requested transaction hash "${expectedTxHash}".`
    };
  }

  const blockNumber =
    typeof receipt.blockNumber === 'number'
      ? receipt.blockNumber
      : receipt.blockNumber
      ? parseInt(receipt.blockNumber, 16)
      : undefined;

  // 3. Validate logs
  if (!Array.isArray(receipt.logs) || receipt.logs.length === 0) {
    return { verified: false, reason: 'Transaction receipt contains no event logs.' };
  }

  const expectedToken = quote.token_contract.toLowerCase();
  const expectedRecipient = quote.recipient.toLowerCase();
  const expectedAmount = BigInt(quote.amount_atomic);

  let totalTransferredAmount = 0n;
  let matchingLogsCount = 0;
  let verifiedPayer: string | undefined = undefined;

  for (const log of receipt.logs) {
    if (!log || typeof log !== 'object') continue;

    const logAddress = (log.address || '').toLowerCase();
    // Only inspect logs from the quoted payment token contract (DEFECT-43 Requirement 7)
    if (logAddress !== expectedToken) continue;

    if (!Array.isArray(log.topics) || log.topics.length === 0) continue;
    const topic0 = (log.topics[0] || '').toLowerCase();

    // Ignore unrelated valid event types on the token contract (DEFECT-43 Requirement 7)
    if (topic0 !== ERC20_TRANSFER_EVENT_TOPIC) continue;

    // From this point, topics[0] identifies an ERC-20 Transfer on the quoted token contract.
    // DEFECT-43: Must NOT silently skip malformed Transfer events from the quoted token contract!

    // Requirement 2 & 3: Require exactly three topics
    if (log.topics.length !== 3) {
      return {
        verified: false,
        reason: `Transfer event on payment token has invalid topic count: expected exactly 3 topics, found ${log.topics.length}.`
      };
    }

    // Requirement 4: Sender topic validation (topics[1])
    const senderTopic = log.topics[1];
    if (!senderTopic || typeof senderTopic !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(senderTopic)) {
      return {
        verified: false,
        reason: 'Transfer log contains invalid or missing sender topic (topics[1]): must be 32-byte hex.'
      };
    }
    if (senderTopic.slice(2, 26) !== '000000000000000000000000') {
      return {
        verified: false,
        reason: 'Transfer log contains invalid non-zero address padding in sender topic (topics[1]).'
      };
    }

    // Requirement 4: Recipient topic validation (topics[2])
    const recipientTopic = log.topics[2];
    if (!recipientTopic || typeof recipientTopic !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(recipientTopic)) {
      return {
        verified: false,
        reason: 'Transfer log contains invalid or missing recipient topic (topics[2]): must be 32-byte hex.'
      };
    }
    if (recipientTopic.slice(2, 26) !== '000000000000000000000000') {
      return {
        verified: false,
        reason: 'Transfer log contains invalid non-zero address padding in recipient topic (topics[2]).'
      };
    }

    // Requirement 5: Event data validation (must be exactly one 32-byte uint256 word)
    if (typeof log.data !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) {
      return {
        verified: false,
        reason: 'Transfer log contains malformed or un-decodable data amount: must be exactly one 32-byte uint256 word hex.'
      };
    }

    const logSender = '0x' + senderTopic.slice(26).toLowerCase();
    const logRecipient = '0x' + recipientTopic.slice(26).toLowerCase();

    // If recipient is NOT our expected recipient, this is an unrelated transfer on the quoted token
    if (logRecipient !== expectedRecipient) {
      continue;
    }

    // DEFECT-44: Relevant transfer to our expected recipient: must strictly match expected payer
    if (logSender !== normalizedExpectedPayer) {
      return {
        verified: false,
        reason: `Transfer sender "${logSender}" does not match expected payer "${normalizedExpectedPayer}".`
      };
    }

    const logAmount = decodeUint256FromData(log.data);

    totalTransferredAmount += logAmount;
    matchingLogsCount++;
    verifiedPayer = logSender;
  }

  if (matchingLogsCount === 0) {
    return {
      verified: false,
      reason: `No matching ERC-20 Transfer log found in receipt for token ${expectedToken} and recipient ${expectedRecipient}.`
    };
  }

  // Exact amount match required (DEFECT MOD03.3-04)
  if (totalTransferredAmount !== expectedAmount) {
    return {
      verified: false,
      reason: `Total transferred amount ${totalTransferredAmount.toString()} does not equal quoted atomic amount ${expectedAmount.toString()}.`
    };
  }

  if (!verifiedPayer) {
    return {
      verified: false,
      reason: 'Failed to verify payer address from ERC-20 Transfer logs.'
    };
  }

  return {
    verified: true,
    txHash: receiptTxHash,
    blockNumber,
    payer: verifiedPayer,
    recipient: expectedRecipient,
    amountAtomic: expectedAmount.toString()
  };
}

export interface BuyAdapterConfig {
  executable?: string;
  argsPrefix?: string[];
  timeoutMs?: number;
  maxOutputBufferBytes?: number;
  cliRunner?: (
    cmd: string,
    args: string[],
    options: { timeout: number; maxBuffer: number }
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  settlementVerifier?: (
    txHash: string | null | undefined,
    quote: QuoteRow
  ) => Promise<{ verified: boolean; txHash?: string; blockNumber?: number; payer?: string }>;
}

export interface PurchaseExecutionResult {
  purchaseAttemptId: string;
  quoteId: string;
  status: PurchaseStatus;
  providerResponse?: unknown;
  txHash?: string | null;
  settlementTxHash?: string | null;
  errorMessage?: string | null;
  isSettled: boolean;
}

export interface SettlementResolutionResult {
  purchaseAttemptId: string;
  quoteId: string;
  status: PurchaseStatus;
  resolved: boolean;
  txHash?: string | null;
  receiptStatus?: number;
  message: string;
}

/**
 * Strict regex pattern for redacting sensitive credentials and key material from CLI outputs.
 */
const PRIVATE_KEY_REGEX = /\b0x[0-9a-fA-F]{64}\b/g;
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const AUTH_HEADER_REGEX = /"authorization":\s*"[^"]+"/gi;
const X_AUTH_HEADER_REGEX = /x-[a-z0-9_-]*auth[a-z0-9_-]*:\s*[^\r\n]+/gi;

export function redactSensitiveOutput(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(BEARER_REGEX, 'Bearer [REDACTED_TOKEN]')
    .replace(AUTH_HEADER_REGEX, '"authorization": "[REDACTED_AUTH]"')
    .replace(X_AUTH_HEADER_REGEX, 'x-auth: [REDACTED_HEADER]')
    .replace(PRIVATE_KEY_REGEX, '[REDACTED_KEY_MATERIAL]');
}

export class BuyAdapter {
  private executable: string;
  private argsPrefix: string[];
  private timeoutMs: number;
  private maxOutputBufferBytes: number;
  private payingAddress: string;
  private cliRunner?: (
    cmd: string,
    args: string[],
    options: { timeout: number; maxBuffer: number }
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

  constructor(
    private config: BuyAdapterConfig,
    private db: Database,
    private appConfig: AppConfig
  ) {
    const rawWallet = this.appConfig?.AGENT_WALLET_ADDRESS;
    if (rawWallet && typeof rawWallet === 'string' && /^0[xX][0-9a-fA-F]{40}$/.test(rawWallet.trim())) {
      this.payingAddress = rawWallet.trim().toLowerCase();
    } else {
      this.payingAddress = '';
    }
    if (config.executable !== undefined) {
      this.executable = config.executable;
      this.argsPrefix = config.argsPrefix || [];
    } else if (appConfig.BUY_CLI_EXECUTABLE) {
      this.executable = appConfig.BUY_CLI_EXECUTABLE;
      this.argsPrefix = appConfig.BUY_CLI_ARGS_PREFIX ? [appConfig.BUY_CLI_ARGS_PREFIX] : [];
    } else {
      // Prefer pinned local package entrypoint executed directly via Node.js
      const localBuyPath = path.resolve(process.cwd(), 'node_modules/@celo/buy/dist/main.js');
      if (fs.existsSync(localBuyPath)) {
        this.executable = process.execPath;
        this.argsPrefix = [localBuyPath];
      } else {
        // DEFECT REMEDIATION (Area 2): Never silently download executable code using npx at runtime.
        // If local pinned entrypoint is not on disk and no explicit executable was configured, fail closed.
        this.executable = '';
        this.argsPrefix = [];
      }
    }

    this.timeoutMs = config.timeoutMs || 60000;
    this.maxOutputBufferBytes = config.maxOutputBufferBytes || 512 * 1024;
    this.cliRunner = config.cliRunner;
  }

  /**
   * Spawns Buy CLI safely using fixed executable and argument array (shell: false).
   */
  private async runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.executable && !this.cliRunner) {
      return {
        stdout: '',
        stderr: 'Buy CLI is unavailable: local pinned @celo/buy entrypoint not found on disk, and runtime npx download is prohibited.',
        exitCode: 127
      };
    }

    const fullArgs = [...this.argsPrefix, ...args];
    const timeout = this.timeoutMs;
    const maxBuffer = this.maxOutputBufferBytes;

    if (this.cliRunner) {
      try {
        return await this.cliRunner(this.executable, fullArgs, { timeout, maxBuffer });
      } catch (err: any) {
        const exitCode = typeof err.code === 'number' ? err.code : 1;
        const stdout = err.stdout ? String(err.stdout) : '';
        const stderr = [err.stderr, err.message, err.code].filter(Boolean).join(' ');
        return { stdout, stderr, exitCode };
      }
    }

    const resolvedExecutable =
      process.platform === 'win32' && this.executable === 'npx' ? 'npx.cmd' : this.executable;

    try {
      const { stdout, stderr } = await execFileAsync(resolvedExecutable, fullArgs, {
        timeout,
        maxBuffer,
        windowsHide: true,
        shell: false
      });
      return { stdout: stdout || '', stderr: stderr || '', exitCode: 0 };
    } catch (err: any) {
      const exitCode = typeof err.code === 'number' ? err.code : 1;
      const stdout = err.stdout ? String(err.stdout) : '';
      const stderr = err.stderr ? String(err.stderr) : err.message || '';
      return { stdout, stderr, exitCode };
    }
  }

  /**
   * Discovers sanctioned Buy marketplace capabilities from verified capability registry.
   * Only active, unexpired, authorized capabilities are surfaced.
   */
  public async discoverCapabilities(): Promise<DiscoveredCapability[]> {
    const registered = listRegisteredCapabilities().filter((cap) => {
      return new Date(cap.expiresAt).getTime() >= Date.now();
    });

    return registered.map((cap) => ({
      id: cap.id,
      capabilityId: cap.capabilityId,
      name: cap.name,
      category: cap.category,
      serviceUrl: cap.serviceUrl,
      method: cap.method,
      priceDisplay: cap.flatPriceDisplay,
      tokenSymbol: cap.supportedTokens[0]?.symbol || 'USDC',
      recipient: cap.payee,
      supportedModels: cap.supportedModels
    }));
  }

  /**
   * Reads the health and wallet identity of the Buy CLI environment (read-only).
   * DEFECT-42: Mandatory payer configuration for readiness.
   * Never substitutes configured payer for CLI account.
   * Reports UNAVAILABLE/UNKNOWN for CLI account and UNCONFIGURED for missing/invalid payer.
   * ready is false for every missing, malformed, unknown, or mismatched identity.
   */
  public async getHealth(): Promise<BuyHealthStatus> {
    const killSwitchActive = this.db.getKillSwitch();
    const now = new Date().toISOString();

    const hasValidConfiguredPayer = Boolean(
      this.payingAddress && /^0x[0-9a-fA-F]{40}$/.test(this.payingAddress)
    );
    const configuredPayer = hasValidConfiguredPayer ? this.payingAddress : 'UNCONFIGURED';

    if (!this.executable && !this.cliRunner) {
      return {
        ready: false,
        cliVersion: 'unavailable',
        account: 'UNAVAILABLE',
        network: 'celo',
        funded: false,
        balances: {},
        killSwitchActive,
        timestamp: now,
        configuredPayer,
        payerMismatch: false
      };
    }

    try {
      // Check version
      const verRes = await this.runCli(['-V']);
      const cliVersion = verRes.stdout.trim() || 'unknown';

      // Check account & balance strictly from JSON schema (DEFECT-45)
      // Only authoritative paying-address field (payingAddress or account)
      // Do not extract addresses from arbitrary text, warnings, diagnostic output, or unrelated fields.
      const whoamiRes = await this.runCli(['--json', 'whoami']);
      let rawCliAccount: string | null = null;
      const balances: Record<string, string> = {};

      if (whoamiRes.exitCode === 0) {
        try {
          const parsed = JSON.parse(whoamiRes.stdout);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            // Strictly check for authoritative paying-address field
            const candidateAddress =
              typeof parsed.payingAddress === 'string' && parsed.payingAddress.trim()
                ? parsed.payingAddress.trim()
                : typeof parsed.account === 'string' && parsed.account.trim()
                  ? parsed.account.trim()
                  : null;

            if (candidateAddress && /^0[xX][0-9a-fA-F]{40}$/.test(candidateAddress)) {
              rawCliAccount = candidateAddress;
            }

            if (parsed.balances && typeof parsed.balances === 'object' && !Array.isArray(parsed.balances)) {
              for (const [tok, val] of Object.entries(parsed.balances)) {
                if (typeof val === 'string' || typeof val === 'number') {
                  balances[tok] = String(val);
                }
              }
            }
          }
        } catch {
          // If JSON is malformed or stdout is not JSON, do NOT scan text lines!
          rawCliAccount = null;
        }
      }

      // DEFECT-42 & DEFECT-45:
      // 2. Do not use configured payer as substitute for CLI-reported account
      // 3. If CLI identity is unknown, report UNAVAILABLE or UNKNOWN
      // 4. If JSON is malformed, missing paying-address, or invalid, report UNKNOWN
      let account: string;
      if (whoamiRes.exitCode !== 0) {
        account = 'UNAVAILABLE';
      } else if (rawCliAccount) {
        account = rawCliAccount.toLowerCase();
      } else {
        account = 'UNKNOWN';
      }

      const hasValidCliAccount = account !== 'UNKNOWN' && account !== 'UNAVAILABLE' && /^0x[0-9a-fA-F]{40}$/.test(account);
      const isFunded = Object.values(balances).some((v) => parseFloat(v) > 0);

      const identitiesMatch = Boolean(
        hasValidConfiguredPayer &&
        hasValidCliAccount &&
        account.toLowerCase() === this.payingAddress.toLowerCase()
      );

      const payerMismatch = Boolean(
        (hasValidConfiguredPayer || hasValidCliAccount) && !identitiesMatch
      );

      // DEFECT-42: getHealth must NEVER return ready: true unless:
      // 1. AGENT_WALLET_ADDRESS is explicitly configured
      // 2. It matches exactly 0x plus 40 hexadecimal characters
      // 3. Buy CLI whoami succeeds (exitCode === 0)
      // 4. The CLI-reported paying address is valid
      // 5. The CLI address matches configured payer case-insensitively
      // 6. Kill switch is not active
      const isReady =
        whoamiRes.exitCode === 0 &&
        hasValidConfiguredPayer &&
        hasValidCliAccount &&
        identitiesMatch &&
        !killSwitchActive;

      return {
        ready: isReady,
        cliVersion,
        account,
        network: 'celo',
        funded: isFunded,
        balances,
        killSwitchActive,
        timestamp: now,
        configuredPayer,
        payerMismatch
      };
    } catch (err: any) {
      return {
        ready: false,
        cliVersion: 'unavailable',
        account: 'UNAVAILABLE',
        network: 'celo',
        funded: false,
        balances: {},
        killSwitchActive,
        timestamp: now,
        configuredPayer,
        payerMismatch: hasValidConfiguredPayer
      };
    }
  }

  /**
   * Executes a single, quote-bound operator-approved Buy request.
   * Enforces:
   * 1. Kill-switch check
   * 2. Quote status === APPROVED
   * 3. Approval ID and exact body SHA-256 match
   * 4. Atomic budget reservation before invocation
   * 5. Spawning CLI with no shell and temporary request file
   * 6. Sensitive credential redaction
   * 7. Independent settlement resolution (no automatic retries)
   */
  public async executeApprovedRequest(
    quoteId: string,
    approvalId: string,
    operatorUsername: string
  ): Promise<PurchaseExecutionResult> {
    const quote = this.db.getQuote(quoteId);
    if (!quote) {
      throw new Error(`Quote "${quoteId}" not found.`);
    }

    // DEFECT-42: Mandatory payer configuration validation before dispatch
    if (!this.payingAddress || !/^0x[0-9a-fA-F]{40}$/.test(this.payingAddress)) {
      this.db.releaseBudgetReservation(quote.id, 'Agent payer wallet address is not configured or invalid.');
      this.db.updateQuoteStatus(quote.id, 'FAILED');
      return {
        purchaseAttemptId: '',
        quoteId: quote.id,
        status: 'FAILED',
        errorMessage: 'Execution rejected: Agent payer wallet address is not configured or invalid.',
        isSettled: false
      };
    }

    // DEFECT REMEDIATION (Area 2): Mandatory Buy CLI executable verification before dispatch
    if (!this.executable && !this.cliRunner) {
      this.db.releaseBudgetReservation(quote.id, 'Buy CLI is unavailable: local pinned @celo/buy entrypoint not found on disk.');
      this.db.updateQuoteStatus(quote.id, 'FAILED');
      return {
        purchaseAttemptId: '',
        quoteId: quote.id,
        status: 'FAILED',
        errorMessage: 'Execution rejected: Buy CLI is unavailable (local pinned @celo/buy entrypoint not found, runtime npx prohibited).',
        isSettled: false
      };
    }

    // 1. Re-validate quote against authoritative capability registry
    const cap = getRegisteredCapability(quote.capability_id);
    if (!cap) {
      this.db.releaseBudgetReservation(quote.id, `Capability "${quote.capability_id}" is not registered.`);
      this.db.updateQuoteStatus(quote.id, 'FAILED');
      return {
        purchaseAttemptId: '',
        quoteId: quote.id,
        status: 'FAILED',
        errorMessage: `Capability "${quote.capability_id}" is not registered in the authoritative capability registry.`,
        isSettled: false
      };
    }
    if (new Date(cap.expiresAt).getTime() < Date.now()) {
      this.db.releaseBudgetReservation(quote.id, `Capability registration for "${quote.capability_id}" has expired.`);
      this.db.updateQuoteStatus(quote.id, 'FAILED');
      return {
        purchaseAttemptId: '',
        quoteId: quote.id,
        status: 'FAILED',
        errorMessage: `Capability registration for "${quote.capability_id}" has expired.`,
        isSettled: false
      };
    }
    if (quote.url !== cap.serviceUrl) {
      this.db.releaseBudgetReservation(quote.id, `Quote URL "${quote.url}" does not match registered URL.`);
      this.db.updateQuoteStatus(quote.id, 'FAILED');
      return {
        purchaseAttemptId: '',
        quoteId: quote.id,
        status: 'FAILED',
        errorMessage: `Execution rejected: quote URL "${quote.url}" does not match registered URL (${cap.serviceUrl}).`,
        isSettled: false
      };
    }
    if (quote.method !== cap.method) {
      this.db.releaseBudgetReservation(quote.id, `Quote method "${quote.method}" does not match registered method.`);
      this.db.updateQuoteStatus(quote.id, 'FAILED');
      return {
        purchaseAttemptId: '',
        quoteId: quote.id,
        status: 'FAILED',
        errorMessage: `Execution rejected: quote method "${quote.method}" does not match registered method (${cap.method}).`,
        isSettled: false
      };
    }
    if (quote.recipient.toLowerCase() !== cap.payee.toLowerCase()) {
      this.db.releaseBudgetReservation(quote.id, `Quote recipient "${quote.recipient}" does not match registered payee.`);
      this.db.updateQuoteStatus(quote.id, 'FAILED');
      return {
        purchaseAttemptId: '',
        quoteId: quote.id,
        status: 'FAILED',
        errorMessage: `Execution rejected: quote recipient "${quote.recipient}" does not match registered payee (${cap.payee}).`,
        isSettled: false
      };
    }
    const tokenMatch = cap.supportedTokens.find(
      (t) => t.contract.toLowerCase() === quote.token_contract.toLowerCase()
    );
    if (!tokenMatch) {
      this.db.releaseBudgetReservation(quote.id, `Token "${quote.token_contract}" not supported for capability.`);
      this.db.updateQuoteStatus(quote.id, 'FAILED');
      return {
        purchaseAttemptId: '',
        quoteId: quote.id,
        status: 'FAILED',
        errorMessage: `Execution rejected: token "${quote.token_contract}" not supported for capability.`,
        isSettled: false
      };
    }
    normalizeAndVerifyAmount(quote.amount_atomic, quote.amount_display, tokenMatch.decimals);

    // 2. Consume approval and create purchase attempt atomically in SQLite
    const dailyCap = BigInt(this.appConfig.BUY_DAILY_BUDGET_ATOMIC || '0');
    const invCap = BigInt(this.appConfig.BUY_PER_INVESTIGATION_BUDGET_ATOMIC || '0');

    const { attempt: attemptRow } = this.db.consumeApprovalAndCreateAttemptAtomic({
      quoteId,
      approvalId,
      operatorUsername,
      limits: {
        dailyBudgetAtomic: dailyCap,
        perInvestigationCapAtomic: invCap
      }
    });
    const attemptId = attemptRow.id;

    // 3. Pre-dispatch check: verify CLI executable exists if not using injected runner
    if (!this.cliRunner && !fs.existsSync(this.executable)) {
      this.db.releaseBudgetReservation(quote.id, `Buy CLI entry point not found at ${this.executable}`);
      this.db.updatePurchaseAttemptStatus(attemptId, 'FAILED', {
        error_message: `Buy CLI entry point not found at ${this.executable}`
      });
      this.db.updateQuoteStatus(quote.id, 'FAILED');
      return {
        purchaseAttemptId: attemptId,
        quoteId: quote.id,
        status: 'FAILED',
        errorMessage: `Buy CLI entry point not found at ${this.executable}`,
        isSettled: false
      };
    }

    // 4. Create secure temporary file for the exact serialized request body
    const tempFilePath = path.join(os.tmpdir(), `buy_req_${attemptId}.json`);
    try {
      fs.writeFileSync(tempFilePath, quote.exact_body, { encoding: 'utf-8', mode: 0o600 });
    } catch (writeErr: any) {
      this.db.releaseBudgetReservation(quote.id, `Failed to write temp request body: ${writeErr.message}`);
      this.db.updatePurchaseAttemptStatus(attemptId, 'FAILED', { error_message: writeErr.message });
      this.db.updateQuoteStatus(quote.id, 'FAILED');
      return {
        purchaseAttemptId: attemptId,
        quoteId: quote.id,
        status: 'FAILED',
        errorMessage: `Failed to write request body: ${writeErr.message}`,
        isSettled: false
      };
    }

    try {
      const displayAmount = (quote.amount_display || '0.01').replace('$', '');
      const tokenSymbol = quote.token_symbol || 'USDC';

      const cliArgs = [
        '--json',
        'curl',
        '--max-amount',
        displayAmount,
        '--token',
        tokenSymbol,
        '--data-file',
        tempFilePath,
        '-X',
        quote.method,
        quote.url,
        '-H',
        'Content-Type: application/json'
      ];

      let cliOutput: { stdout: string; stderr: string; exitCode: number };
      try {
        cliOutput = await this.runCli(cliArgs);
      } catch (cliSpawnErr: any) {
        // DEFECT MOD03.3-05: Post-dispatch failure preserves budget reservation!
        const redactedErr = redactSensitiveOutput(cliSpawnErr.message || String(cliSpawnErr));
        this.db.updatePurchaseAttemptStatus(attemptId, 'SETTLEMENT_UNKNOWN', {
          error_message: `CLI execution error after dispatch: ${redactedErr}`,
          raw_stderr_redacted: redactedErr
        });
        this.db.updateQuoteStatus(quote.id, 'SETTLEMENT_UNKNOWN');

        return {
          purchaseAttemptId: attemptId,
          quoteId: quote.id,
          status: 'SETTLEMENT_UNKNOWN',
          errorMessage: `Execution error after dispatch: ${redactedErr}. Marked SETTLEMENT_UNKNOWN. Budget reservation preserved.`,
          isSettled: false
        };
      }

      const { stdout, stderr, exitCode } = cliOutput;
      const redactedStdout = redactSensitiveOutput(stdout);
      const redactedStderr = redactSensitiveOutput(stderr);

      if (exitCode !== 0) {
        // DEFECT MOD03.3-05: Non-zero exit code after dispatch cannot prove no payment occurred.
        // All non-zero exits preserve budget reservation and transition to SETTLEMENT_UNKNOWN.
        this.db.updatePurchaseAttemptStatus(attemptId, 'SETTLEMENT_UNKNOWN', {
          error_message: `CLI exited with code ${exitCode}: ${redactedStderr || 'Unknown error'}`,
          raw_stdout_redacted: redactedStdout,
          raw_stderr_redacted: redactedStderr
        });
        this.db.updateQuoteStatus(quote.id, 'SETTLEMENT_UNKNOWN');

        return {
          purchaseAttemptId: attemptId,
          quoteId: quote.id,
          status: 'SETTLEMENT_UNKNOWN',
          errorMessage: `CLI exited with code ${exitCode}${redactedStderr ? ': ' + redactedStderr : ''}. Payment dispatch may have occurred. Marked SETTLEMENT_UNKNOWN. Budget reservation preserved.`,
          isSettled: false
        };
      }

      // Parse provider response
      let parsedResponse: any;
      try {
        parsedResponse = JSON.parse(stdout);
      } catch {
        parsedResponse = { raw: redactedStdout };
      }

      // DEFECT-40: Parse ONLY documented structured paymentResponse fields.
      // Strictly validate 32-byte hex format. NEVER search arbitrary stdout with regex!
      let txHash: string | null = null;
      let settlementTxHash: string | null = null;

      const rawTxHash = parsedResponse?.paymentResponse?.txHash;
      if (typeof rawTxHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(rawTxHash)) {
        txHash = rawTxHash.toLowerCase();
      }

      const rawSettlementTxHash = parsedResponse?.paymentResponse?.settlementTxHash;
      if (typeof rawSettlementTxHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(rawSettlementTxHash)) {
        settlementTxHash = rawSettlementTxHash.toLowerCase();
      }

      const targetHash = settlementTxHash || txHash;

      // If no valid structured settlement reference is available, mark SETTLEMENT_UNKNOWN and preserve budget reservation
      if (!targetHash) {
        this.db.updatePurchaseAttemptStatus(attemptId, 'SETTLEMENT_UNKNOWN', {
          error_message: 'No valid structured payment response reference (txHash or settlementTxHash) in CLI output.',
          raw_stdout_redacted: redactedStdout,
          raw_stderr_redacted: redactedStderr
        });
        this.db.updateQuoteStatus(quote.id, 'SETTLEMENT_UNKNOWN');

        return {
          purchaseAttemptId: attemptId,
          quoteId: quote.id,
          status: 'SETTLEMENT_UNKNOWN',
          providerResponse: parsedResponse,
          txHash: null,
          settlementTxHash: null,
          errorMessage: 'No valid structured settlement reference in provider response. Marked SETTLEMENT_UNKNOWN. Budget reservation preserved.',
          isSettled: false
        };
      }

      // Independent receipt resolution: verify on-chain settlement
      const settlement = await this.verifyOnChainSettlement(targetHash, quote);

      if (settlement.verified) {
        // Confirmed settlement: atomically commit proof, budget reservation, attempt, and quote
        this.db.commitSettlementAtomic(
          {
            id: crypto.randomUUID(),
            purchase_attempt_id: attemptId,
            quote_id: quote.id,
            tx_hash: settlement.txHash || targetHash,
            chain_id: 42220,
            block_number: settlement.blockNumber || null,
            token_contract: quote.token_contract,
            payer: settlement.payer!,
            recipient: quote.recipient,
            amount_atomic: quote.amount_atomic,
            receipt_status: 1,
            verified_at: new Date().toISOString()
          },
          {
            tx_hash: txHash || settlement.txHash || targetHash,
            raw_stdout_redacted: redactedStdout,
            raw_stderr_redacted: redactedStderr
          }
        );

        return {
          purchaseAttemptId: attemptId,
          quoteId: quote.id,
          status: 'SETTLED',
          providerResponse: parsedResponse,
          txHash: settlement.txHash || targetHash,
          settlementTxHash: settlement.txHash || targetHash,
          isSettled: true
        };
      } else {
        // Payment response arrived but on-chain settlement receipt not yet confirmed: set SETTLEMENT_UNKNOWN
        this.db.updatePurchaseAttemptStatus(attemptId, 'SETTLEMENT_UNKNOWN', {
          tx_hash: txHash,
          settlement_tx_hash: settlementTxHash,
          error_message: settlement.reason || 'Received response from provider but on-chain settlement receipt not yet confirmed.',
          raw_stdout_redacted: redactedStdout,
          raw_stderr_redacted: redactedStderr
        });
        this.db.updateQuoteStatus(quote.id, 'SETTLEMENT_UNKNOWN');

        return {
          purchaseAttemptId: attemptId,
          quoteId: quote.id,
          status: 'SETTLEMENT_UNKNOWN',
          providerResponse: parsedResponse,
          txHash,
          settlementTxHash,
          errorMessage: settlement.reason || 'Settlement confirmation pending on-chain.',
          isSettled: false
        };
      }
    } finally {
      // Securely delete temporary request file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch {}
    }
  }

  /**
   * Resolves doubtful or pending settlements by querying Buy CLI receipts with --resolve.
   * Strictly enforces:
   * 1. CLI execution must succeed with exitCode === 0 (DEFECT-41).
   * 2. CLI output must strictly parse as a JSON array.
   * 3. Candidate schemas and association fields validated (quoteId, purchaseAttemptId, paymentReference).
   * 4. Forbids recipient-only matching and ambiguous multiple matches!
   * 5. Retains budget reservation on unresolved/ambiguous outcomes.
   */
  public async resolveSettlement(attemptId: string): Promise<SettlementResolutionResult> {
    const attempt = this.db.getPurchaseAttempt(attemptId);
    if (!attempt) {
      throw new Error(`Purchase attempt "${attemptId}" not found.`);
    }

    const quote = this.db.getQuote(attempt.quote_id);
    if (!quote) {
      throw new Error(`Quote "${attempt.quote_id}" not found.`);
    }

    if (attempt.status === 'SETTLED') {
      return {
        purchaseAttemptId: attempt.id,
        quoteId: attempt.quote_id,
        status: 'SETTLED',
        resolved: true,
        txHash: attempt.settlement_tx_hash || attempt.tx_hash,
        receiptStatus: 1,
        message: 'Payment already verified as settled.'
      };
    }

    let cliResult: { stdout: string; stderr: string; exitCode: number };
    try {
      cliResult = await this.runCli(['receipts', '--json', '--resolve']);
    } catch (cliErr: any) {
      const redactedErr = redactSensitiveOutput(cliErr.message || String(cliErr));
      return {
        purchaseAttemptId: attempt.id,
        quoteId: quote.id,
        status: attempt.status as PurchaseStatus,
        resolved: false,
        txHash: attempt.tx_hash,
        message: `Settlement resolution execution error or timeout: ${redactedErr}. Retaining reservation.`
      };
    }

    const { stdout, stderr, exitCode } = cliResult;
    const redactedStderr = redactSensitiveOutput(stderr);

    // DEFECT-41: Require exitCode === 0 before parsing receipt candidates
    if (exitCode !== 0) {
      return {
        purchaseAttemptId: attempt.id,
        quoteId: quote.id,
        status: attempt.status as PurchaseStatus,
        resolved: false,
        txHash: attempt.tx_hash,
        message: `Buy CLI receipts command exited with code ${exitCode}${redactedStderr ? ': ' + redactedStderr : ''}. Unresolved. Retaining reservation.`
      };
    }

    // DEFECT-41: Parse stdout strictly as JSON array
    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch (parseErr: any) {
      return {
        purchaseAttemptId: attempt.id,
        quoteId: quote.id,
        status: attempt.status as PurchaseStatus,
        resolved: false,
        txHash: attempt.tx_hash,
        message: 'Settlement resolution failed: malformed JSON response from receipts command. Unresolved.'
      };
    }

    if (!Array.isArray(parsed)) {
      return {
        purchaseAttemptId: attempt.id,
        quoteId: quote.id,
        status: attempt.status as PurchaseStatus,
        resolved: false,
        txHash: attempt.tx_hash,
        message: 'Settlement resolution failed: receipts output is not a JSON array. Unresolved.'
      };
    }

    const candidateTxHashes = new Set<string>();

    for (const r of parsed) {
      if (!r || typeof r !== 'object') continue;

      const rawHash = r.txHash || r.settlementTxHash;
      if (!rawHash || typeof rawHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(rawHash)) {
        continue;
      }

      const matchQuote =
        (typeof r.quoteId === 'string' && r.quoteId === quote.id) ||
        (typeof r.quote_id === 'string' && r.quote_id === quote.id);
      const matchAttempt =
        (typeof r.purchaseAttemptId === 'string' && r.purchaseAttemptId === attempt.id) ||
        (typeof r.purchase_attempt_id === 'string' && r.purchase_attempt_id === attempt.id);
      const matchPaymentRef =
        typeof r.paymentReference === 'string' &&
        (r.paymentReference === attempt.id || r.paymentReference === quote.id);
      const matchRecordedTx =
        (attempt.tx_hash && rawHash.toLowerCase() === attempt.tx_hash.toLowerCase()) ||
        (attempt.settlement_tx_hash && rawHash.toLowerCase() === attempt.settlement_tx_hash.toLowerCase());

      // FORBID recipient-only matching!
      if (matchQuote || matchAttempt || matchPaymentRef || matchRecordedTx) {
        candidateTxHashes.add(rawHash.toLowerCase());
      }
    }

    // Fallback: If CLI receipts didn't have candidate, but attempt had a recorded tx_hash
    if (candidateTxHashes.size === 0) {
      const recorded = attempt.settlement_tx_hash || attempt.tx_hash;
      if (recorded && typeof recorded === 'string' && /^0x[0-9a-fA-F]{64}$/.test(recorded)) {
        candidateTxHashes.add(recorded.toLowerCase());
      }
    }

    if (candidateTxHashes.size === 0) {
      return {
        purchaseAttemptId: attempt.id,
        quoteId: quote.id,
        status: attempt.status as PurchaseStatus,
        resolved: false,
        txHash: null,
        message: 'Settlement resolution executed; no matching unique receipt found for this purchase attempt.'
      };
    }

    if (candidateTxHashes.size > 1) {
      return {
        purchaseAttemptId: attempt.id,
        quoteId: quote.id,
        status: attempt.status as PurchaseStatus,
        resolved: false,
        txHash: null,
        message: `Settlement resolution ambiguous: found ${candidateTxHashes.size} distinct candidate transaction hashes for this purchase attempt. Unresolved.`
      };
    }

    const uniqueTx = Array.from(candidateTxHashes)[0];
    const settlement = await this.verifyOnChainSettlement(uniqueTx, quote);

    if (settlement.verified) {
      this.db.commitSettlementAtomic(
        {
          id: crypto.randomUUID(),
          purchase_attempt_id: attempt.id,
          quote_id: quote.id,
          tx_hash: settlement.txHash!,
          chain_id: 42220,
          block_number: settlement.blockNumber || null,
          token_contract: quote.token_contract,
          payer: settlement.payer!,
          recipient: quote.recipient,
          amount_atomic: quote.amount_atomic,
          receipt_status: 1,
          verified_at: new Date().toISOString()
        }
      );

      return {
        purchaseAttemptId: attempt.id,
        quoteId: quote.id,
        status: 'SETTLED',
        resolved: true,
        txHash: settlement.txHash,
        receiptStatus: 1,
        message: 'Settlement confirmed and verified on-chain.'
      };
    }

    return {
      purchaseAttemptId: attempt.id,
      quoteId: quote.id,
      status: attempt.status as PurchaseStatus,
      resolved: false,
      txHash: attempt.tx_hash,
      message: `Settlement resolution executed; no confirmed settlement found on-chain: ${settlement.reason || 'unverified'}`
    };
  }

  /**
   * Independently verifies an on-chain transaction receipt using direct RPC.
   * Mandates strict fail-closed chain ID verification (42220), matching transaction hash,
   * non-fallback verified payer, and exact aggregate ERC-20 transfer amounts.
   */
  public async verifyOnChainSettlement(
    txHash: string | null | undefined,
    quote: QuoteRow
  ): Promise<ReceiptVerificationResult> {
    // DEFECT-37: Require valid, explicitly configured AGENT_WALLET_ADDRESS before settlement verification runs
    if (!this.payingAddress) {
      return {
        verified: false,
        reason: 'Settlement verification blocked: Agent wallet address is not configured or malformed.'
      };
    }

    if (this.config.settlementVerifier) {
      return this.config.settlementVerifier(txHash, quote);
    }

    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return { verified: false, reason: 'Invalid or missing transaction hash format.' };
    }

    try {
      const rpcEndpoint =
        this.appConfig.CHAINSTACK_CELO_MAINNET_RPC_URL || 'https://forno.celo.org';

      // 1. Mandatory Chain ID verification (FAIL CLOSED - DEFECT MOD03.3-01)
      let chainRes: Response;
      try {
        chainRes = await fetch(rpcEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_chainId',
            params: []
          })
        });
      } catch (chainNetErr: any) {
        return {
          verified: false,
          reason: `Chain verification network error: ${chainNetErr.message}`
        };
      }

      if (!chainRes.ok) {
        return {
          verified: false,
          reason: `Chain verification RPC request failed with HTTP ${chainRes.status}.`
        };
      }

      let chainJson: any;
      try {
        chainJson = await chainRes.json();
      } catch (chainJsonErr: any) {
        return {
          verified: false,
          reason: `Chain verification response is not valid JSON: ${chainJsonErr.message}`
        };
      }

      if (!chainJson || typeof chainJson !== 'object') {
        return {
          verified: false,
          reason: 'Malformed JSON-RPC response object for eth_chainId.'
        };
      }

      if (chainJson.id !== 1) {
        return {
          verified: false,
          reason: `JSON-RPC response id mismatch on eth_chainId: received ${chainJson.id}, expected 1.`
        };
      }

      if (chainJson.error) {
        return {
          verified: false,
          reason: `RPC returned JSON-RPC error on eth_chainId: ${JSON.stringify(chainJson.error)}`
        };
      }

      if (typeof chainJson.result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(chainJson.result)) {
        return {
          verified: false,
          reason: `Invalid or missing hexadecimal chain ID result: "${chainJson.result}".`
        };
      }

      const chainIdDec = parseInt(chainJson.result, 16);
      if (chainIdDec !== 42220) {
        return {
          verified: false,
          reason: `Connected RPC reported chain ID ${chainIdDec}, expected 42220 (Celo Mainnet).`
        };
      }

      // 2. Fetch receipt (Only reached if chain verification succeeds!)
      let res: Response;
      try {
        res = await fetch(rpcEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'eth_getTransactionReceipt',
            params: [txHash]
          })
        });
      } catch (receiptNetErr: any) {
        return {
          verified: false,
          reason: `Receipt retrieval network error: ${receiptNetErr.message}`
        };
      }

      if (!res.ok) {
        return { verified: false, reason: `RPC request for receipt failed with HTTP ${res.status}.` };
      }

      let json: any;
      try {
        json = await res.json();
      } catch (receiptJsonErr: any) {
        return {
          verified: false,
          reason: `Receipt response is not valid JSON: ${receiptJsonErr.message}`
        };
      }

      if (!json || typeof json !== 'object') {
        return {
          verified: false,
          reason: 'Malformed JSON-RPC response object for eth_getTransactionReceipt.'
        };
      }

      if (json.id !== 2) {
        return {
          verified: false,
          reason: `JSON-RPC response id mismatch on eth_getTransactionReceipt: received ${json.id}, expected 2.`
        };
      }

      if (json.error) {
        return {
          verified: false,
          reason: `RPC returned JSON-RPC error on eth_getTransactionReceipt: ${JSON.stringify(json.error)}`
        };
      }

      const receipt = json.result;
      if (!receipt) {
        return { verified: false, reason: 'Transaction receipt not found on chain.' };
      }

      return verifyReceiptTransferLogs(receipt, quote, txHash, this.payingAddress);
    } catch (err: any) {
      return { verified: false, reason: `RPC settlement verification error: ${err.message}` };
    }
  }
}
