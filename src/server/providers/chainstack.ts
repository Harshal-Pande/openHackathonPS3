export interface NormalizedTransaction {
  hash: string;
  blockNumber: number;
  transactionIndex: number;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  input: string;
  nonce: number;
}

export interface NormalizedReceipt {
  transactionHash: string;
  blockNumber: number;
  status: 'SUCCESS' | 'REVERTED';
  rawStatus: number;
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
   */
  public async callRpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    if (!this.isConfigured()) {
      throw new ChainstackProviderError(
        'Chainstack Celo RPC URL is not configured. Set CHAINSTACK_CELO_MAINNET_RPC_URL in .env',
        'ENDPOINT_NOT_CONFIGURED'
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

        const response = await fetch(this.rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
          if (response.status === 429) {
            throw new ChainstackProviderError('Rate limit exceeded (HTTP 429) on Chainstack endpoint.', 'RATE_LIMITED', 429);
          }
          throw new ChainstackProviderError(
            `Chainstack HTTP error: ${response.status} ${response.statusText}`,
            'HTTP_ERROR',
            response.status
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
              'METHOD_NOT_SUPPORTED'
            );
          }
          throw new ChainstackProviderError(
            `JSON-RPC error from Chainstack (${data.error.code}): ${data.error.message}`,
            'JSON_RPC_ERROR'
          );
        }

        return data.result as T;
      } catch (err: unknown) {
        const error = err as Error;
        lastError = error;

        // If client error or method unsupported, do not retry
        if (
          error instanceof ChainstackProviderError &&
          (error.code === 'METHOD_NOT_SUPPORTED' || (error.statusCode && error.statusCode < 500 && error.statusCode !== 429))
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
    throw new ChainstackProviderError(
      `Chainstack RPC call to '${method}' failed after ${attempt} attempts: ${sanitizedMsg}`,
      'RPC_TIMEOUT_OR_NETWORK_ERROR'
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
        'INVALID_CHAIN_ID'
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

    return {
      hash: String(raw.hash),
      blockNumber: typeof raw.blockNumber === 'string' ? parseInt(raw.blockNumber, 16) : Number(raw.blockNumber),
      transactionIndex: typeof raw.transactionIndex === 'string' ? parseInt(raw.transactionIndex, 16) : Number(raw.transactionIndex),
      from: String(raw.from).toLowerCase(),
      to: raw.to ? String(raw.to).toLowerCase() : null,
      value: String(raw.value || '0x0'),
      gas: String(raw.gas || '0x0'),
      gasPrice: raw.gasPrice ? String(raw.gasPrice) : undefined,
      maxFeePerGas: raw.maxFeePerGas ? String(raw.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: raw.maxPriorityFeePerGas ? String(raw.maxPriorityFeePerGas) : undefined,
      input: String(raw.input || '0x'),
      nonce: typeof raw.nonce === 'string' ? parseInt(raw.nonce, 16) : Number(raw.nonce)
    };
  }

  /**
   * Retrieve and normalize receipt by hash.
   */
  public async getTransactionReceipt(txHash: string): Promise<NormalizedReceipt | null> {
    const raw = await this.callRpc<Record<string, unknown> | null>('eth_getTransactionReceipt', [txHash]);
    if (!raw) return null;

    const rawStatus = typeof raw.status === 'string' ? parseInt(raw.status, 16) : Number(raw.status);

    return {
      transactionHash: String(raw.transactionHash),
      blockNumber: typeof raw.blockNumber === 'string' ? parseInt(raw.blockNumber, 16) : Number(raw.blockNumber),
      status: rawStatus === 1 ? 'SUCCESS' : 'REVERTED',
      rawStatus,
      gasUsed: String(raw.gasUsed || '0x0'),
      effectiveGasPrice: raw.effectiveGasPrice ? String(raw.effectiveGasPrice) : undefined,
      contractAddress: raw.contractAddress ? String(raw.contractAddress) : null,
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
}
