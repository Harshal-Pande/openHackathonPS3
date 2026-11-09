import { CeloAttributionService } from '../services/celoAttributionService.js';

/**
 * Strict allowlist of authorized read-only JSON-RPC methods permitted on the Chainstack gateway.
 * All state-mutating, wallet-signing, account management, and unapproved methods are rejected
 * before network execution (DEF-56).
 */
export const ALLOWED_READ_ONLY_RPC_METHODS = new Set<string>([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_call',
  'eth_getBalance',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getLogs',
  'eth_getTransactionCount',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'debug_traceTransaction',
  'debug_traceCall',
  'debug_traceBlockByNumber',
  'debug_traceBlockByHash'
]);

export interface NormalizedTransaction {
  hash: string;
  blockNumber: number | null;
  transactionIndex: number | null;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  input: string;
  nonce: number;
  isPending: boolean;
}

export interface NormalizedReceipt {
  transactionHash: string;
  blockNumber: number | null;
  status: 'SUCCESS' | 'REVERTED' | 'UNKNOWN';
  rawStatus: number | null;
  gasUsed: string;
  effectiveGasPrice?: string;
  contractAddress?: string | null;
  logsCount: number;
}

export interface RawCallFrame {
  type: string;
  from: string;
  to?: string;
  value?: string;
  gas?: string;
  gasUsed?: string;
  input?: string;
  output?: string;
  error?: string;
  revertReason?: string;
  calls?: RawCallFrame[];
}

export interface ChainstackProviderOptions {
  rpcUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class ChainstackProviderError extends Error {
  public code: string;
  public statusCode?: number;

  constructor(message: string, code: string = 'CHAINSTACK_RPC_ERROR', statusCode?: number) {
    super(message);
    this.name = 'ChainstackProviderError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ChainstackProvider {
  private rpcUrl: string;
  private timeoutMs: number;
  private maxRetries: number;

  constructor(options: ChainstackProviderOptions = {}) {
    this.rpcUrl = options.rpcUrl || '';
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  public isConfigured(): boolean {
    return Boolean(this.rpcUrl && this.rpcUrl.trim().length > 0);
  }

  /**
   * Safe JSON-RPC caller with retry on transient network errors and strict URL redaction.
   * Intercepts and guards read-only RPC methods against illicit ERC-8021 marker injection (DEF-52)
   * and enforces strict read-only RPC method allowlist before URL checks, payload construction, or network fetch (DEF-56).
   */
  public async callRpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    // 1. Strict read-only RPC method enforcement (DEF-56)
    if (!ALLOWED_READ_ONLY_RPC_METHODS.has(method)) {
      throw new ChainstackProviderError(
        `Method '${method}' is not an authorized read-only RPC method. ChainstackProvider is strictly read-only.`,
        'READ_ONLY_METHOD_REQUIRED',
        400
      );
    }

    // 2. Enforce read-only RPC isolation at the provider gateway boundary
    CeloAttributionService.assertReadOnlyRpcUntagged(method, params);

    // 3. Ensure endpoint configuration
    if (!this.isConfigured()) {
      throw new ChainstackProviderError(
        'Chainstack Celo RPC URL is not configured. Set CHAINSTACK_CELO_MAINNET_RPC_URL in .env',
        'ENDPOINT_NOT_CONFIGURED',
        503
      );
    }

    const payload = {
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1000000),
      method,
      params
    };

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        let response: Response;
        try {
          response = await fetch(this.rpcUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
        } catch (fetchErr: unknown) {
          const fErr = fetchErr as Error;
          if (fErr.name === 'AbortError') {
            throw new ChainstackProviderError(
              `Request timed out after ${this.timeoutMs}ms while calling RPC method '${method}'.`,
              'TIMEOUT',
              504
            );
          }
          throw fErr;
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          if (response.status === 429) {
            throw new ChainstackProviderError('Rate limit exceeded (HTTP 429) on Chainstack endpoint.', 'RATE_LIMITED', 429);
          }
          throw new ChainstackProviderError(
            `Chainstack HTTP error: ${response.status} ${response.statusText}`,
            'PROVIDER_ERROR',
            response.status >= 500 ? 502 : response.status
          );
        }

        const data = (await response.json()) as {
          jsonrpc?: string;
          id?: number;
          result?: T;
          error?: { code: number; message: string; data?: unknown };
        };

        if (data.error) {
          // Do not retry method not found / invalid params
          if (data.error.code === -32601) {
            throw new ChainstackProviderError(
              `RPC method '${method}' is not supported by this Chainstack node: ${data.error.message}`,
              'METHOD_NOT_SUPPORTED',
              501
            );
          }
          throw new ChainstackProviderError(
            `JSON-RPC error from Chainstack (${data.error.code}): ${data.error.message}`,
            'JSON_RPC_ERROR',
            502
          );
        }

        return data.result as T;
      } catch (err: unknown) {
        const error = err as Error;
        lastError = error;

        // If client error, timeout, rate limit, or method unsupported, do not retry
        if (
          error instanceof ChainstackProviderError &&
          (error.code === 'METHOD_NOT_SUPPORTED' ||
            error.code === 'TIMEOUT' ||
            error.code === 'RATE_LIMITED' ||
            (error.statusCode && error.statusCode < 500 && error.statusCode !== 429))
        ) {
          throw error;
        }

        if (attempt <= this.maxRetries) {
          // Bounded backoff
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }
    }

    // Sanitize any potential URL in error message
    const sanitizedMsg = (lastError?.message || 'Unknown network error').replace(/https?:\/\/[^\s]+/g, '[REDACTED_RPC_ENDPOINT]');
    if (lastError instanceof ChainstackProviderError) {
      throw lastError;
    }
    throw new ChainstackProviderError(
      `Chainstack RPC call to '${method}' failed after ${attempt} attempts: ${sanitizedMsg}`,
      'PROVIDER_ERROR',
      502
    );
  }

  /**
   * Verify chainId matches Celo Mainnet (42220 / 0xa4ec).
   */
  public async getChainId(): Promise<number> {
    const raw = await this.callRpc<string>('eth_chainId');
    const chainId = parseInt(raw, 16);

    if (chainId !== 42220) {
      throw new ChainstackProviderError(
        `Invalid chain ID: expected 42220 (Celo Mainnet), received ${chainId}`,
        'INVALID_CHAIN_ID',
        502
      );
    }

    return chainId;
  }

  /**
   * Retrieve and normalize transaction by hash.
   */
  public async getTransaction(txHash: string): Promise<NormalizedTransaction | null> {
    const raw = await this.callRpc<Record<string, unknown> | null>('eth_getTransactionByHash', [txHash]);
    if (!raw) return null;

    const isPending = raw.blockNumber === null || raw.blockNumber === undefined;
    const blockNumber = isPending
      ? null
      : typeof raw.blockNumber === 'string'
        ? parseInt(raw.blockNumber, 16)
        : Number(raw.blockNumber);

    const transactionIndex =
      raw.transactionIndex === null || raw.transactionIndex === undefined
        ? null
        : typeof raw.transactionIndex === 'string'
          ? parseInt(raw.transactionIndex, 16)
          : Number(raw.transactionIndex);

    const nonce =
      raw.nonce === null || raw.nonce === undefined
        ? 0
        : typeof raw.nonce === 'string'
          ? parseInt(raw.nonce, 16)
          : Number(raw.nonce);

    return {
      hash: String(raw.hash || txHash).toLowerCase(),
      blockNumber,
      transactionIndex,
      from: String(raw.from || '').toLowerCase(),
      to: raw.to ? String(raw.to).toLowerCase() : null,
      value: String(raw.value || '0x0'),
      gas: String(raw.gas || '0x0'),
      gasPrice: raw.gasPrice ? String(raw.gasPrice) : undefined,
      maxFeePerGas: raw.maxFeePerGas ? String(raw.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: raw.maxPriorityFeePerGas ? String(raw.maxPriorityFeePerGas) : undefined,
      input: String(raw.input || '0x'),
      nonce,
      isPending
    };
  }

  /**
   * Retrieve and normalize receipt by hash.
   */
  public async getTransactionReceipt(txHash: string): Promise<NormalizedReceipt | null> {
    const raw = await this.callRpc<Record<string, unknown> | null>('eth_getTransactionReceipt', [txHash]);
    if (!raw) return null;

    let status: 'SUCCESS' | 'REVERTED' | 'UNKNOWN' = 'UNKNOWN';
    let rawStatus: number | null = null;

    if (raw.status !== null && raw.status !== undefined) {
      const parsedStatus = typeof raw.status === 'string' ? parseInt(raw.status, 16) : Number(raw.status);
      if (!isNaN(parsedStatus)) {
        rawStatus = parsedStatus;
        if (parsedStatus === 1) {
          status = 'SUCCESS';
        } else if (parsedStatus === 0) {
          status = 'REVERTED';
        }
      }
    }

    const blockNumber =
      raw.blockNumber === null || raw.blockNumber === undefined
        ? null
        : typeof raw.blockNumber === 'string'
          ? parseInt(raw.blockNumber, 16)
          : Number(raw.blockNumber);

    return {
      transactionHash: String(raw.transactionHash || txHash).toLowerCase(),
      blockNumber,
      status,
      rawStatus,
      gasUsed: String(raw.gasUsed || '0x0'),
      effectiveGasPrice: raw.effectiveGasPrice ? String(raw.effectiveGasPrice) : undefined,
      contractAddress: raw.contractAddress ? String(raw.contractAddress).toLowerCase() : null,
      logsCount: Array.isArray(raw.logs) ? raw.logs.length : 0
    };
  }

  /**
   * Request execution trace with callTracer.
   */
  public async getCallTrace(txHash: string): Promise<RawCallFrame | null> {
    try {
      const trace = await this.callRpc<RawCallFrame>('debug_traceTransaction', [
        txHash,
        { tracer: 'callTracer' }
      ]);
      return trace || null;
    } catch (err: unknown) {
      if (err instanceof ChainstackProviderError && err.code === 'METHOD_NOT_SUPPORTED') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Retrieve raw transaction record for attribution and receipt verification.
   */
  public async getRawTransaction(txHash: string): Promise<Record<string, unknown> | null> {
    return this.callRpc<Record<string, unknown> | null>('eth_getTransactionByHash', [txHash]);
  }

  /**
   * Retrieve raw transaction receipt for ERC-8004 event and status verification.
   */
  public async getRawTransactionReceipt(txHash: string): Promise<Record<string, unknown> | null> {
    return this.callRpc<Record<string, unknown> | null>('eth_getTransactionReceipt', [txHash]);
  }

  /**
   * Retrieve account balance in Wei.
   */
  public async getBalance(address: string): Promise<string> {
    const raw = await this.callRpc<string>('eth_getBalance', [address, 'latest']);
    return raw || '0x0';
  }

  /**
   * Retrieve current gas price in Wei.
   */
  public async getGasPrice(): Promise<string> {
    const raw = await this.callRpc<string>('eth_gasPrice', []);
    return raw || '0x0';
  }
}
