import { describe, it, expect, vi, afterEach } from 'vitest';
import { ChainstackProvider, ChainstackProviderError } from '../src/server/providers/chainstack.js';

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
});
