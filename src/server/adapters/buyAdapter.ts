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

export function decodeAddressFromTopic(topic: string): string {
  if (!topic || typeof topic !== 'string') return '';
  const clean = topic.startsWith('0x') ? topic.slice(2) : topic;
  if (clean.length < 40) return '';
  return '0x' + clean.slice(-40).toLowerCase();
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
 * that event logs contain an exact matching ERC-20 Transfer log transferring the quoted
 * atomic amount to the quoted recipient contract.
 */
export function verifyReceiptTransferLogs(
  receipt: any,
  quote: {
    token_contract: string;
    recipient: string;
    amount_atomic: string;
  },
  expectedChainId: number = 42220
): ReceiptVerificationResult {
  if (!receipt || typeof receipt !== 'object') {
    return { verified: false, reason: 'Missing or null receipt.' };
  }

  // 1. Receipt status check (0x1 or 1 indicates success)
  const isSuccess = receipt.status === '0x1' || receipt.status === 1;
  if (!isSuccess) {
    return { verified: false, reason: `Transaction failed with receipt status "${receipt.status}".` };
  }

  const txHash = receipt.transactionHash || receipt.txHash;
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { verified: false, reason: 'Invalid or missing transaction hash in receipt.' };
  }

  const blockNumber =
    typeof receipt.blockNumber === 'number'
      ? receipt.blockNumber
      : receipt.blockNumber
      ? parseInt(receipt.blockNumber, 16)
      : undefined;

  // 2. Validate logs
  if (!Array.isArray(receipt.logs) || receipt.logs.length === 0) {
    return { verified: false, reason: 'Transaction receipt contains no event logs.' };
  }

  const expectedToken = quote.token_contract.toLowerCase();
  const expectedRecipient = quote.recipient.toLowerCase();
  const expectedAmount = BigInt(quote.amount_atomic);

  let matchingLog: any = null;
  let matchingPayer: string | undefined = undefined;

  for (const log of receipt.logs) {
    if (!log || typeof log !== 'object') continue;

    const logAddress = (log.address || '').toLowerCase();
    if (logAddress !== expectedToken) continue;

    if (!Array.isArray(log.topics) || log.topics.length < 3) continue;

    const topic0 = (log.topics[0] || '').toLowerCase();
    if (topic0 !== ERC20_TRANSFER_EVENT_TOPIC) continue;

    const logTo = decodeAddressFromTopic(log.topics[2]);
    if (logTo !== expectedRecipient) continue;

    const logAmount = decodeUint256FromData(log.data);
    if (logAmount !== expectedAmount) continue;

    // Found exact matching Transfer log
    matchingLog = log;
    matchingPayer =
      decodeAddressFromTopic(log.topics[1]) || (receipt.from ? receipt.from.toLowerCase() : undefined);
    break;
  }

  if (!matchingLog) {
    return {
      verified: false,
      reason: `No matching ERC-20 Transfer log found in receipt for token ${expectedToken}, recipient ${expectedRecipient}, and atomic amount ${expectedAmount.toString()}.`
    };
  }

  return {
    verified: true,
    txHash,
    blockNumber,
    payer: matchingPayer,
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
    if (config.executable) {
      this.executable = config.executable;
      this.argsPrefix = config.argsPrefix || [];
    } else {
      // Prefer pinned local package entrypoint executed directly via Node.js
      const localBuyPath = path.resolve(process.cwd(), 'node_modules/@celo/buy/dist/main.js');
      if (fs.existsSync(localBuyPath)) {
        this.executable = process.execPath;
        this.argsPrefix = [localBuyPath];
      } else {
        const defaultNpx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        this.executable = appConfig.BUY_CLI_EXECUTABLE || defaultNpx;
        this.argsPrefix = appConfig.BUY_CLI_ARGS_PREFIX
          ? [appConfig.BUY_CLI_ARGS_PREFIX]
          : ['@celo/buy@0.8.5'];
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
   */
  public async getHealth(): Promise<BuyHealthStatus> {
    const killSwitchActive = this.db.getKillSwitch();
    const now = new Date().toISOString();

    try {
      // Check version
      const verRes = await this.runCli(['-V']);
      const cliVersion = verRes.stdout.trim() || 'unknown';

      // Check account & balance
      const whoamiRes = await this.runCli(['--json', 'whoami']);
      let account = 'unknown';
      const balances: Record<string, string> = {};

      try {
        const parsed = JSON.parse(whoamiRes.stdout);
        if (parsed.payingAddress) account = parsed.payingAddress;
        else if (parsed.account) account = parsed.account;
        if (parsed.balances && typeof parsed.balances === 'object') {
          Object.assign(balances, parsed.balances);
        }
      } catch {
        // Fallback to text parsing
      }

      if (account === 'unknown') {
        const lines = whoamiRes.stdout.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          const match = trimmed.match(/0x[0-9a-fA-F]{40}/);
          if (match && account === 'unknown') {
            account = match[0];
          }
          if (trimmed.includes('balances')) {
            const balanceStr = trimmed.replace(/.*balances\s*/i, '').trim();
            const parts = balanceStr.split(',').map((p) => p.trim());
            for (const p of parts) {
              const [val, tok] = p.split(' ');
              if (val && tok) balances[tok] = val;
            }
          }
        }
      }

      const isFunded = Object.values(balances).some((v) => parseFloat(v) > 0);

      return {
        ready: whoamiRes.exitCode === 0,
        cliVersion,
        account,
        network: 'celo',
        funded: isFunded,
        balances,
        killSwitchActive,
        timestamp: now
      };
    } catch (err: any) {
      return {
        ready: false,
        cliVersion: 'unavailable',
        account: '0x3e1bef07824cd0E076F4907641F0A0EF27898e52',
        network: 'celo',
        funded: false,
        balances: {},
        killSwitchActive,
        timestamp: now
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

    // 1. Re-validate quote against authoritative capability registry
    const cap = getRegisteredCapability(quote.capability_id);
    if (!cap) {
      throw new Error(
        `Capability "${quote.capability_id}" is not registered in the authoritative capability registry.`
      );
    }
    if (new Date(cap.expiresAt).getTime() < Date.now()) {
      throw new Error(`Capability registration for "${quote.capability_id}" has expired.`);
    }
    if (quote.url !== cap.serviceUrl) {
      throw new Error(
        `Execution rejected: quote URL "${quote.url}" does not match registered URL (${cap.serviceUrl}).`
      );
    }
    if (quote.method !== cap.method) {
      throw new Error(
        `Execution rejected: quote method "${quote.method}" does not match registered method (${cap.method}).`
      );
    }
    if (quote.recipient.toLowerCase() !== cap.payee.toLowerCase()) {
      throw new Error(
        `Execution rejected: quote recipient "${quote.recipient}" does not match registered payee (${cap.payee}).`
      );
    }
    const tokenMatch = cap.supportedTokens.find(
      (t) => t.contract.toLowerCase() === quote.token_contract.toLowerCase()
    );
    if (!tokenMatch) {
      throw new Error(
        `Execution rejected: token "${quote.token_contract}" not supported for capability.`
      );
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

    // 3. Create secure temporary file for the exact serialized request body
    const tempFilePath = path.join(os.tmpdir(), `buy_req_${attemptId}.json`);
    try {
      fs.writeFileSync(tempFilePath, quote.exact_body, { encoding: 'utf-8', mode: 0o600 });
    } catch (writeErr: any) {
      this.db.releaseBudgetReservation(quote.id, `Failed to write temp request body: ${writeErr.message}`);
      this.db.updatePurchaseAttemptStatus(attemptId, 'FAILED', { error_message: writeErr.message });
      this.db.updateQuoteStatus(quote.id, 'FAILED');
      throw writeErr;
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

      const { stdout, stderr, exitCode } = await this.runCli(cliArgs);

      const redactedStdout = redactSensitiveOutput(stdout);
      const redactedStderr = redactSensitiveOutput(stderr);

      if (exitCode !== 0) {
        // Distinguish definite failure vs ambiguous timeout
        const isTimeout =
          redactedStderr.toLowerCase().includes('timeout') ||
          redactedStderr.toLowerCase().includes('timed out') ||
          redactedStderr.toLowerCase().includes('etimedout') ||
          redactedStderr.toLowerCase().includes('hang up');

        if (isTimeout) {
          // Ambiguous outcome: mark SETTLEMENT_UNKNOWN, preserve budget reservation, NEVER retry automatically
          this.db.updatePurchaseAttemptStatus(attemptId, 'SETTLEMENT_UNKNOWN', {
            error_message: 'Request timed out or interrupted before settlement confirmation.',
            raw_stdout_redacted: redactedStdout,
            raw_stderr_redacted: redactedStderr
          });
          this.db.updateQuoteStatus(quote.id, 'SETTLEMENT_UNKNOWN');

          return {
            purchaseAttemptId: attemptId,
            quoteId: quote.id,
            status: 'SETTLEMENT_UNKNOWN',
            errorMessage: 'Execution timed out. Marked SETTLEMENT_UNKNOWN. Run settlement resolution before retrying.',
            isSettled: false
          };
        }

        // Definitive pre-settlement failure: release budget reservation
        this.db.releaseBudgetReservation(quote.id, `CLI exit code ${exitCode}: ${redactedStderr.slice(0, 100)}`);
        this.db.updatePurchaseAttemptStatus(attemptId, 'FAILED', {
          error_message: `CLI exited with code ${exitCode}`,
          raw_stdout_redacted: redactedStdout,
          raw_stderr_redacted: redactedStderr
        });
        this.db.updateQuoteStatus(quote.id, 'FAILED');

        return {
          purchaseAttemptId: attemptId,
          quoteId: quote.id,
          status: 'FAILED',
          errorMessage: redactedStderr || `CLI exited with code ${exitCode}`,
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

      // Check for transaction settlement evidence in CLI output
      let txHash: string | null = null;
      let settlementTxHash: string | null = null;
      if (parsedResponse?.paymentResponse?.settlementTxHash) {
        settlementTxHash = parsedResponse.paymentResponse.settlementTxHash;
      }
      if (parsedResponse?.paymentResponse?.txHash) {
        txHash = parsedResponse.paymentResponse.txHash;
      }
      if (!settlementTxHash && !txHash) {
        const txMatch = stdout.match(/0x[0-9a-fA-F]{64}/);
        if (txMatch) txHash = txMatch[0];
      }
      const targetHash = settlementTxHash || txHash;

      // Independent receipt resolution: verify on-chain settlement
      const settlement = await this.verifyOnChainSettlement(targetHash, quote);

      if (settlement.verified) {
        // Confirmed settlement: commit budget reservation and record proof
        this.db.commitBudgetReservation(quote.id);
        this.db.saveSettlementProof({
          id: crypto.randomUUID(),
          purchase_attempt_id: attemptId,
          quote_id: quote.id,
          tx_hash: settlement.txHash || targetHash || '0x' + '0'.repeat(64),
          chain_id: 42220,
          block_number: settlement.blockNumber || null,
          token_contract: quote.token_contract,
          payer: settlement.payer || '0x3e1bef07824cd0E076F4907641F0A0EF27898e52',
          recipient: quote.recipient,
          amount_atomic: quote.amount_atomic,
          receipt_status: 1,
          verified_at: new Date().toISOString()
        });

        this.db.updatePurchaseAttemptStatus(attemptId, 'SETTLED', {
          tx_hash: txHash || settlement.txHash || targetHash,
          settlement_tx_hash: settlementTxHash || settlement.txHash || targetHash,
          raw_stdout_redacted: redactedStdout,
          raw_stderr_redacted: redactedStderr
        });
        this.db.updateQuoteStatus(quote.id, 'SETTLED');

        return {
          purchaseAttemptId: attemptId,
          quoteId: quote.id,
          status: 'SETTLED',
          providerResponse: parsedResponse,
          txHash: txHash || settlement.txHash || targetHash,
          settlementTxHash: settlementTxHash || settlement.txHash || targetHash,
          isSettled: true
        };
      } else {
        // Payment response arrived but settlement not yet confirmed on chain: set SETTLEMENT_UNKNOWN
        this.db.updatePurchaseAttemptStatus(attemptId, 'SETTLEMENT_UNKNOWN', {
          tx_hash: txHash,
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
   * Strictly enforces unique association (quoteId, purchaseAttemptId, or exact known txHash).
   * Forbids recipient-only matching!
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
        txHash: attempt.settlement_tx_hash,
        receiptStatus: 1,
        message: 'Payment already verified as settled.'
      };
    }

    const { stdout, stderr, exitCode } = await this.runCli(['receipts', '--json', '--resolve']);
    const redactedStderr = redactSensitiveOutput(stderr);

    // Look for matching receipt using ONLY strong unique associations (never recipient-only!)
    let matchingTx: string | null = null;
    try {
      const parsed = JSON.parse(stdout);
      if (Array.isArray(parsed)) {
        const match = parsed.find((r: any) => {
          if (!r || typeof r !== 'object') return false;
          // 1. Direct quote ID match
          if (r.quoteId && r.quoteId === quote.id) return true;
          if (r.quote_id && r.quote_id === quote.id) return true;
          // 2. Direct purchase attempt ID match
          if (r.purchaseAttemptId && r.purchaseAttemptId === attempt.id) return true;
          if (r.purchase_attempt_id && r.purchase_attempt_id === attempt.id) return true;
          // 3. Documented payment reference
          if (
            r.paymentReference &&
            (r.paymentReference === attempt.id || r.paymentReference === quote.id)
          ) {
            return true;
          }
          // 4. Exact transaction hash previously recorded for that attempt
          if (
            attempt.tx_hash &&
            r.txHash &&
            r.txHash.toLowerCase() === attempt.tx_hash.toLowerCase()
          ) {
            return true;
          }
          if (
            attempt.settlement_tx_hash &&
            r.txHash &&
            r.txHash.toLowerCase() === attempt.settlement_tx_hash.toLowerCase()
          ) {
            return true;
          }
          return false;
        });
        if (match && match.txHash) {
          matchingTx = match.txHash;
        }
      }
    } catch {}

    const targetTx = matchingTx || attempt.settlement_tx_hash || attempt.tx_hash;
    if (!targetTx) {
      return {
        purchaseAttemptId: attempt.id,
        quoteId: quote.id,
        status: attempt.status as PurchaseStatus,
        resolved: false,
        txHash: null,
        message: 'Settlement resolution executed; no matching unique receipt found for this purchase attempt.'
      };
    }

    const settlement = await this.verifyOnChainSettlement(targetTx, quote);

    if (settlement.verified) {
      this.db.commitBudgetReservation(quote.id);
      this.db.saveSettlementProof({
        id: crypto.randomUUID(),
        purchase_attempt_id: attempt.id,
        quote_id: quote.id,
        tx_hash: settlement.txHash!,
        chain_id: 42220,
        block_number: settlement.blockNumber || null,
        token_contract: quote.token_contract,
        payer: settlement.payer || '0x3e1bef07824cd0E076F4907641F0A0EF27898e52',
        recipient: quote.recipient,
        amount_atomic: quote.amount_atomic,
        receipt_status: 1,
        verified_at: new Date().toISOString()
      });

      this.db.updatePurchaseAttemptStatus(attempt.id, 'SETTLED', {
        settlement_tx_hash: settlement.txHash
      });
      this.db.updateQuoteStatus(quote.id, 'SETTLED');

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
   * Verifies status === 1 (success), chain ID 42220, and that ERC-20 event logs
   * prove exact token, recipient, and atomic amount transfer.
   */
  private async verifyOnChainSettlement(
    txHash: string | null | undefined,
    quote: QuoteRow
  ): Promise<ReceiptVerificationResult> {
    if (this.config.settlementVerifier) {
      return this.config.settlementVerifier(txHash, quote);
    }

    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return { verified: false, reason: 'Invalid or missing transaction hash format.' };
    }

    try {
      const rpcEndpoint =
        this.appConfig.CHAINSTACK_CELO_MAINNET_RPC_URL || 'https://forno.celo.org';

      // 1. Verify chain ID
      const chainRes = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: []
        })
      });
      if (chainRes.ok) {
        const chainJson: any = await chainRes.json();
        const chainIdDec = parseInt(chainJson.result, 16);
        if (chainIdDec !== 42220) {
          return {
            verified: false,
            reason: `Connected RPC reported chain ID ${chainIdDec}, expected 42220 (Celo Mainnet).`
          };
        }
      }

      // 2. Fetch receipt
      const res = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'eth_getTransactionReceipt',
          params: [txHash]
        })
      });

      if (!res.ok) return { verified: false, reason: `RPC request failed with HTTP ${res.status}.` };
      const json: any = await res.json();
      const receipt = json.result;

      if (!receipt) return { verified: false, reason: 'Transaction receipt not found on chain.' };

      return verifyReceiptTransferLogs(receipt, quote, 42220);
    } catch (err: any) {
      return { verified: false, reason: `RPC settlement verification error: ${err.message}` };
    }
  }
}
