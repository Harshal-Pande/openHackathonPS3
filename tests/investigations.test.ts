import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { Database } from '../src/server/db/database.js';
import { ChainstackProvider } from '../src/server/providers/chainstack.js';

describe('Investigation API Endpoints & Persistence', () => {
  let db: Database;
  let provider: ChainstackProvider;

  beforeEach(() => {
    // In-memory database for isolated, fast test execution
    db = new Database(':memory:');
    provider = new ChainstackProvider({ rpcUrl: 'https://test-node' });
  });

  it('rejects invalid transaction hash format with HTTP 400', async () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    const app = buildApp(config, { db, provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: 'not-a-valid-hash' }
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).not.toBeNull();
    expect(body.error.message).toContain('Invalid transaction hash format');
  });

  it('executes full investigation with mocked provider and persists report', async () => {
    // Mock provider methods
    vi.spyOn(provider, 'isConfigured').mockReturnValue(true);
    vi.spyOn(provider, 'getChainId').mockResolvedValue(42220);
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445',
      blockNumber: 52460432,
      transactionIndex: 1,
      from: '0xsender',
      to: '0xdexrouter',
      value: '0x0',
      gas: '0x50000',
      input: '0x38ed1739',
      nonce: 10
    });
    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue({
      transactionHash: '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445',
      blockNumber: 52460432,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0x30000',
      logsCount: 0
    });
    vi.spyOn(provider, 'getCallTrace').mockResolvedValue({
      type: 'CALL',
      from: '0xsender',
      to: '0xdexrouter',
      value: '0x0',
      gas: '0x50000',
      gasUsed: '0x30000',
      input: '0x38ed1739',
      error: 'execution reverted',
      revertReason: 'Swap reverted'
    });

    const config = loadConfig({ NODE_ENV: 'test' });
    const app = buildApp(config, { db, provider });

    const postRes = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445' }
    });

    expect(postRes.statusCode).toBe(200);
    const postBody = JSON.parse(postRes.body);
    expect(postBody.data).not.toBeNull();
    expect(postBody.data.status).toBe('REVERTED');
    expect(postBody.data.traceStatus).toBe('AVAILABLE');
    expect(postBody.data.diagnosis.category).toBe('EXPLICIT_REVERT');
    expect(postBody.data.evidenceLedger.length).toBeGreaterThanOrEqual(3);

    const invId = postBody.data.investigationId;

    // Retrieve via GET /api/investigations/:id
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/investigations/${invId}`
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.investigationId).toBe(invId);
    expect(getBody.data.txHash).toBe('0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445');

    // List recent investigations
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/investigations'
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.data.length).toBe(1);
    expect(listBody.data[0].id).toBe(invId);
  });
});
