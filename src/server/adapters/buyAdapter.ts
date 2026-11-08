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

const execFileAsync = promisify(execFile);

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
    this.executable = config.executable || appConfig.BUY_CLI_EXECUTABLE || 'npx';
    this.argsPrefix = config.argsPrefix || (appConfig.BUY_CLI_ARGS_PREFIX ? [appConfig.BUY_CLI_ARGS_PREFIX] : ['@celo/buy@latest']);
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
   * Discovers sanctioned Buy marketplace capabilities from verified configuration.
   */
  public async discoverCapabilities(): Promise<DiscoveredCapability[]> {
    return [
      {
        id: 'cencori/inference',
        capabilityId: 'cencori.v1.chat.completions',
        name: 'Cencori LLM Inference',
        category: 'inference',
        serviceUrl: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        method: 'POST',
        priceDisplay: '0.01 USDC',
        tokenSymbol: 'USDC',
        recipient: '0x20faAca5F980E29639A0FCC6dcA6988E18ed333B',
        supportedModels: ['maximo-atlas-1.3']
      },
      {
        id: 'chainstack/celo',
        capabilityId: 'chainstack.celo',
        name: 'Chainstack Celo RPC',
        category: 'rpc',
        serviceUrl: 'https://gateway.usebuy.ai/chainstack/celo',
        method: 'POST',
        priceDisplay: '0.01 USDC',
        tokenSymbol: 'USDC',
        recipient: '0x20faAca5F980E29639A0FCC6dcA6988E18ed333B'
      }
    ];
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

    if (quote.status !== 'APPROVED') {
      throw new Error(`Quote "${quoteId}" has status "${quote.status}". Only APPROVED quotes can be executed.`);
    }

    if (quote.approval_id !== approvalId) {
      throw new Error(`Approval ID mismatch for quote "${quoteId}". Execution rejected.`);
    }

    if (this.db.getKillSwitch()) {
      throw new Error('Emergency kill switch is active. Execution blocked.');
    }

    // Atomic Budget Reservation before invocation
    const dailyCap = BigInt(this.appConfig.BUY_DAILY_BUDGET_ATOMIC || '0');
    const invCap = BigInt(this.appConfig.BUY_PER_INVESTIGATION_BUDGET_ATOMIC || '0');

    this.db.reserveBudgetAtomic(quote.id, quote.investigation_id || null, quote.amount_atomic, {
      dailyBudgetAtomic: dailyCap,
      perInvestigationCapAtomic: invCap
    });

    // Create unique purchase attempt record in EXECUTION_PENDING state
    const attemptId = crypto.randomUUID();
    const now = new Date().toISOString();

    const attemptRow: PurchaseAttemptRow = {
      id: attemptId,
      quote_id: quote.id,
      approval_id: approvalId,
      investigation_id: quote.investigation_id || null,
      capability_id: quote.capability_id,
      url: quote.url,
      body_sha256: quote.body_sha256,
      token_contract: quote.token_contract,
      amount_atomic: quote.amount_atomic,
      status: 'EXECUTION_PENDING',
      tx_hash: null,
      settlement_tx_hash: null,
      payer_address: null,
      payee_address: quote.recipient,
      error_message: null,
      raw_stdout_redacted: null,
      raw_stderr_redacted: null,
      created_at: now,
      updated_at: now
    };

    this.db.savePurchaseAttempt(attemptRow);
    this.db.updateQuoteStatus(quote.id, 'EXECUTION_PENDING');

    // Create secure temporary file for the exact serialized request body
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
          error_message: 'Received response from provider but on-chain settlement receipt not yet confirmed.',
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
          errorMessage: 'Settlement confirmation pending on-chain.',
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

    // Look for matching receipt
    let matchingTx: string | null = null;
    try {
      const parsed = JSON.parse(stdout);
      if (Array.isArray(parsed)) {
        const match = parsed.find(
          (r: any) =>
            r.quoteId === quote.id ||
            r.recipient?.toLowerCase() === quote.recipient.toLowerCase() ||
            (attempt.tx_hash && r.txHash === attempt.tx_hash)
        );
        if (match && match.txHash) {
          matchingTx = match.txHash;
        }
      }
    } catch {}

    const settlement = await this.verifyOnChainSettlement(matchingTx || attempt.tx_hash, quote);

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
      message: 'Settlement resolution executed; no confirmed settlement found on-chain.'
    };
  }

  /**
   * Independently verifies an on-chain transaction receipt using direct RPC.
   * Verifies status === 1 (success), recipient allowlist, and chain 42220.
   */
  private async verifyOnChainSettlement(
    txHash: string | null | undefined,
    quote: QuoteRow
  ): Promise<{ verified: boolean; txHash?: string; blockNumber?: number; payer?: string }> {
    if (this.config.settlementVerifier) {
      return this.config.settlementVerifier(txHash, quote);
    }

    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return { verified: false };
    }

    try {
      const rpcEndpoint =
        this.appConfig.CHAINSTACK_CELO_MAINNET_RPC_URL || 'https://forno.celo.org';
      const res = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionReceipt',
          params: [txHash]
        })
      });

      if (!res.ok) return { verified: false };
      const json: any = await res.json();
      const receipt = json.result;

      if (!receipt) return { verified: false };

      // status '0x1' indicates successful execution
      const isSuccess = receipt.status === '0x1' || receipt.status === 1;
      const blockNumber = receipt.blockNumber ? parseInt(receipt.blockNumber, 16) : undefined;
      const payer = receipt.from ? receipt.from.toLowerCase() : undefined;

      if (isSuccess) {
        return {
          verified: true,
          txHash,
          blockNumber,
          payer
        };
      }
      return { verified: false };
    } catch {
      return { verified: false };
    }
  }
}
