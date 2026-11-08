import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ChainstackProvider,
  ChainstackProviderError,
  ALLOWED_READ_ONLY_RPC_METHODS
} from '../src/server/providers/chainstack.js';
import { AttributionError, ERC_8021_MARKER } from '../src/server/services/celoAttributionService.js';

describe('Chainstack Provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects unconfigured provider and throws clean error', async () => {
    const provider = new ChainstackProvider({ rpcUrl: '' });
    expect(provider.isConfigured()).toBe(false);

    await expect(provider.getChainId()).rejects.toThrowError(
      /Chainstack Celo RPC URL is not configured/
    );
  });

  it('validates chainId 42220 (0xa4ec) for Celo Mainnet', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0xa4ec' })
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ChainstackProvider({ rpcUrl: 'https://test-node.chainstack.com/auth-key-secret-123' });
    const chainId = await provider.getChainId();

    expect(chainId).toBe(42220);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('rejects invalid chain ID (e.g. Ethereum Mainnet 1)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x1' })
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ChainstackProvider({ rpcUrl: 'https://test-node.chainstack.com/auth-key-secret-123' });

    await expect(provider.getChainId()).rejects.toThrowError(
      /Invalid chain ID: expected 42220/
    );
  });

  it('redacts secret RPC URL from error messages', async () => {
    const secretUrl = 'https://celo-mainnet.chainstack.com/secret_auth_token_xyz987';
    const mockFetch = vi.fn().mockRejectedValue(new Error(`Failed to fetch ${secretUrl}`));
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ChainstackProvider({ rpcUrl: secretUrl, maxRetries: 0 });

    try {
      await provider.getChainId();
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const error = err as Error;
      expect(error.message).not.toContain('secret_auth_token_xyz987');
      expect(error.message).toContain('[REDACTED_RPC_ENDPOINT]');
    }
  });

  it('handles HTTP 429 rate limit error without retrying endlessly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests'
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ChainstackProvider({ rpcUrl: 'https://test-rpc', maxRetries: 0 });

    await expect(provider.getChainId()).rejects.toThrowError(
      /Rate limit exceeded/
    );
  });

  it('handles JSON-RPC method not supported error (-32601) gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'the method debug_traceTransaction does not exist/is not available' }
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ChainstackProvider({ rpcUrl: 'https://test-rpc', maxRetries: 0 });
    const trace = await provider.getCallTrace('0x123');

    // Method not supported returns null rather than throwing fatal error
    expect(trace).toBeNull();
  });

  describe('Read-Only RPC Method Enforcement (DEF-56)', () => {
    it('defines the approved set of 20 read-only methods', () => {
      expect(ALLOWED_READ_ONLY_RPC_METHODS.size).toBe(20);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_chainId')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_blockNumber')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_getTransactionByHash')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_getTransactionReceipt')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_call')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_getBalance')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_getCode')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_getStorageAt')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_getLogs')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_getTransactionCount')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_getBlockByNumber')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_getBlockByHash')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_estimateGas')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_gasPrice')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_maxPriorityFeePerGas')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('eth_feeHistory')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('debug_traceTransaction')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('debug_traceCall')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('debug_traceBlockByNumber')).toBe(true);
      expect(ALLOWED_READ_ONLY_RPC_METHODS.has('debug_traceBlockByHash')).toBe(true);
    });

    it('rejects state-changing and wallet-signing methods before fetch is called', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const provider = new ChainstackProvider({ rpcUrl: 'https://test-rpc' });
      const forbiddenMethods = [
        'eth_sendTransaction',
        'eth_sendRawTransaction',
        'personal_sendTransaction',
        'wallet_sendCalls',
        'eth_signTransaction',
        'personal_sign'
      ];

      for (const method of forbiddenMethods) {
        await expect(provider.callRpc(method, [])).rejects.toThrowError(
          ChainstackProviderError
        );

        try {
          await provider.callRpc(method, []);
        } catch (err: unknown) {
          const rpcErr = err as ChainstackProviderError;
          expect(rpcErr.code).toBe('READ_ONLY_METHOD_REQUIRED');
          expect(rpcErr.statusCode).toBe(400);
          expect(rpcErr.message).toContain('not an authorized read-only RPC method');
        }
      }

      // Assert fetch was NEVER invoked across any forbidden method calls
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects unapproved and unknown RPC methods before fetch is called', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const provider = new ChainstackProvider({ rpcUrl: 'https://test-rpc' });
      const unknownMethods = [
        'eth_unknownFoo',
        'custom_method',
        'random_rpc',
        'eth_submitWork',
        'admin_nodeInfo',
        'eth_mining',
        'debug_setHead',
        'eth_accounts'
      ];

      for (const method of unknownMethods) {
        await expect(provider.callRpc(method, [])).rejects.toThrowError(
          ChainstackProviderError
        );

        try {
          await provider.callRpc(method, []);
        } catch (err: unknown) {
          const rpcErr = err as ChainstackProviderError;
          expect(rpcErr.code).toBe('READ_ONLY_METHOD_REQUIRED');
          expect(rpcErr.statusCode).toBe(400);
        }
      }

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects attribution marker injection in read-only RPC parameters before fetch', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const provider = new ChainstackProvider({ rpcUrl: 'https://test-rpc' });
      const maliciousPayload = [{ to: '0x123', data: '0x1234' + ERC_8021_MARKER.slice(2) }];

      await expect(provider.callRpc('eth_call', maliciousPayload)).rejects.toThrowError(
        AttributionError
      );

      try {
        await provider.callRpc('eth_call', maliciousPayload);
      } catch (err: unknown) {
        const attrErr = err as AttributionError;
        expect(attrErr.code).toBe('ILLEGAL_READ_ONLY_TAGGING');
      }

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('permits authorized read-only methods when fetch succeeds', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x123' })
      });
      vi.stubGlobal('fetch', mockFetch);

      const provider = new ChainstackProvider({ rpcUrl: 'https://test-rpc' });
      const res = await provider.callRpc('eth_blockNumber');

      expect(res).toBe('0x123');
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });
});
