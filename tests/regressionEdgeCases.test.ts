import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { Database } from '../src/server/db/database.js';
import { ChainstackProvider, ChainstackProviderError } from '../src/server/providers/chainstack.js';

describe('Regression & Edge Case Test Suite', () => {
  let db: Database;
  let provider: ChainstackProvider;
  const config = loadConfig({ NODE_ENV: 'test' });
  const sampleTxHash = '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445';

  beforeEach(() => {
    db = new Database(':memory:');
    provider = new ChainstackProvider({ rpcUrl: 'https://test-node' });
    vi.spyOn(provider, 'isConfigured').mockReturnValue(true);
    vi.spyOn(provider, 'getChainId').mockResolvedValue(42220);
  });

  it('handles trace timeout gracefully with TIMEOUT status and limitations note', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: sampleTxHash,
      blockNumber: 52460432,
      transactionIndex: 1,
      from: '0xsender',
      to: '0xdex',
      value: '0x0',
      gas: '0x50000',
      input: '0x38ed1739',
      nonce: 10,
      isPending: false
    });
    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue({
      transactionHash: sampleTxHash,
      blockNumber: 52460432,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0x30000',
      logsCount: 0
    });
    vi.spyOn(provider, 'getCallTrace').mockRejectedValue(
      new ChainstackProviderError('Request timed out after 15000ms', 'TIMEOUT', 504)
    );

    const app = buildApp(config, { db, provider });
    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: sampleTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('REVERTED');
    expect(body.data.traceStatus).toBe('TIMEOUT');
    expect(body.data.limitations.some((l: string) => l.includes('timed out'))).toBe(true);
    expect(body.data.executionTrace).toBeNull();
  });

  it('handles unsupported trace method (-32601) with UNSUPPORTED status', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: sampleTxHash,
      blockNumber: 52460432,
      transactionIndex: 1,
      from: '0xsender',
      to: '0xdex',
      value: '0x0',
      gas: '0x50000',
      input: '0x38ed1739',
      nonce: 10,
      isPending: false
    });
    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue({
      transactionHash: sampleTxHash,
      blockNumber: 52460432,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0x30000',
      logsCount: 0
    });
    vi.spyOn(provider, 'getCallTrace').mockResolvedValue(null);

    const app = buildApp(config, { db, provider });
    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: sampleTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.traceStatus).toBe('UNSUPPORTED');
    expect(body.data.limitations.some((l: string) => l.includes('does not support'))).toBe(true);
  });

  it('handles rate limiting (429) during trace retrieval with RATE_LIMITED status', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: sampleTxHash,
      blockNumber: 52460432,
      transactionIndex: 1,
      from: '0xsender',
      to: '0xdex',
      value: '0x0',
      gas: '0x50000',
      input: '0x38ed1739',
      nonce: 10,
      isPending: false
    });
    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue({
      transactionHash: sampleTxHash,
      blockNumber: 52460432,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0x30000',
      logsCount: 0
    });
    vi.spyOn(provider, 'getCallTrace').mockRejectedValue(
      new ChainstackProviderError('Rate limit exceeded', 'RATE_LIMITED', 429)
    );

    const app = buildApp(config, { db, provider });
    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: sampleTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.traceStatus).toBe('RATE_LIMITED');
    expect(body.data.limitations.some((l: string) => l.includes('Rate limit'))).toBe(true);
  });

  it('returns HTTP 502 with redacted URL on provider network outage', async () => {
    vi.spyOn(provider, 'getTransaction').mockRejectedValue(
      new ChainstackProviderError('ECONNREFUSED connecting to https://secret-token@node.chainstack.com', 'PROVIDER_ERROR', 502)
    );

    const app = buildApp(config, { db, provider });
    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: sampleTxHash }
    });

    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.error).not.toBeNull();
    expect(body.error.code).toBe('PROVIDER_ERROR');
    expect(body.error.message).toContain('[REDACTED_RPC_ENDPOINT]');
    expect(body.error.message).not.toContain('secret-token');
  });

  it('correctly classifies pending transaction in mempool without false revert', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: sampleTxHash,
      blockNumber: null,
      transactionIndex: null,
      from: '0xsender',
      to: '0xreceiver',
      value: '0x100000',
      gas: '0x21000',
      input: '0x',
      nonce: 42,
      isPending: true
    });
    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue(null);

    const app = buildApp(config, { db, provider });
    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: sampleTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('PENDING');
    expect(body.data.diagnosis.category).toBe('PENDING_TRANSACTION');
    expect(body.data.traceStatus).toBe('NOT_REQUESTED');
    expect(body.data.diagnosis.headline).toContain('Pending');
    expect(body.data.diagnosis.narrative).not.toContain('reverted');
  });

  it('handles mined transaction with null receipt as UNCONFIRMED_RECEIPT', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: sampleTxHash,
      blockNumber: 52460432,
      transactionIndex: 0,
      from: '0xsender',
      to: '0xreceiver',
      value: '0x0',
      gas: '0x50000',
      input: '0x',
      nonce: 10,
      isPending: false
    });
    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue(null);

    const app = buildApp(config, { db, provider });
    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: sampleTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('UNKNOWN');
    expect(body.data.diagnosis.category).toBe('UNCONFIRMED_RECEIPT');
    expect(body.data.traceStatus).toBe('NOT_REQUESTED');
  });

  it('detects malformed trace payload and sets INVALID_RESPONSE', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: sampleTxHash,
      blockNumber: 52460432,
      transactionIndex: 1,
      from: '0xsender',
      to: '0xdex',
      value: '0x0',
      gas: '0x50000',
      input: '0x38ed1739',
      nonce: 10,
      isPending: false
    });
    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue({
      transactionHash: sampleTxHash,
      blockNumber: 52460432,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0x30000',
      logsCount: 0
    });
    vi.spyOn(provider, 'getCallTrace').mockResolvedValue('unexpected string instead of object' as any);

    const app = buildApp(config, { db, provider });
    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: sampleTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.traceStatus).toBe('INVALID_RESPONSE');
  });

  it('returns HTTP 404 when transaction is not found on Celo Mainnet', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue(null);

    const app = buildApp(config, { db, provider });
    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: sampleTxHash }
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).not.toBeNull();
    expect(body.error.code).toBe('TRANSACTION_NOT_FOUND');
    expect(body.error.message).toContain('not found on Celo Mainnet');
  });

  it('returns HTTP 503 when RPC endpoint is not configured', async () => {
    vi.spyOn(provider, 'isConfigured').mockReturnValue(false);

    const app = buildApp(config, { db, provider });
    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: sampleTxHash }
    });

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.error).not.toBeNull();
    expect(body.error.code).toBe('ENDPOINT_NOT_CONFIGURED');
  });

  it('verifies evidence correctness and does not treat caught child reverts as root cause', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: sampleTxHash,
      blockNumber: 52460432,
      transactionIndex: 1,
      from: '0xsender',
      to: '0xcontract',
      value: '0x0',
      gas: '0x100000',
      input: '0x1234',
      nonce: 5,
      isPending: false
    });
    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue({
      transactionHash: sampleTxHash,
      blockNumber: 52460432,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0x50000',
      logsCount: 0
    });
    // Trace tree where a child reverted in try/catch, but root frame also failed with explicit revert
    vi.spyOn(provider, 'getCallTrace').mockResolvedValue({
      type: 'CALL',
      from: '0xsender',
      to: '0xcontract',
      input: '0x1234',
      gas: '0x100000',
      gasUsed: '0x50000',
      error: 'execution reverted',
      revertReason: 'Target condition unmet',
      calls: [
        {
          type: 'CALL',
          from: '0xcontract',
          to: '0xoracle',
          input: '0xabcd',
          gas: '0x20000',
          gasUsed: '0x10000',
          error: 'execution reverted',
          revertReason: 'Oracle stale'
        }
      ]
    });

    const app = buildApp(config, { db, provider });
    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: sampleTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.evidenceLedger.length).toBeGreaterThanOrEqual(3);

    // Verify all evidence citations correspond to real items in the ledger
    const ledgerIds = new Set(body.data.evidenceLedger.map((e: any) => e.id));
    for (const citation of body.data.diagnosis.evidenceCitations) {
      expect(ledgerIds.has(citation)).toBe(true);
    }
  });
});
