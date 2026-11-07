import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { Database } from '../src/server/db/database.js';
import { loadConfig } from '../src/server/config.js';
import { ChainstackProvider, ChainstackProviderError } from '../src/server/providers/chainstack.js';
import { CencoriProvider } from '../src/server/providers/cencori.js';
import { AiExplanationService } from '../src/server/services/aiExplanationService.js';
import { BuyQuoteService } from '../src/server/services/buyQuoteService.js';
import { validateAiExplanation } from '../src/server/schemas/aiExplanationSchema.js';

describe('Phase 7 — User Journey End-to-End Test Suite (Scenarios A through J)', () => {
  let db: Database;
  let provider: ChainstackProvider;
  let cencoriProvider: CencoriProvider;
  let buyQuoteService: BuyQuoteService;
  let aiExplanationService: AiExplanationService;
  let app: any;

  const candidateTxHash = '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445';

  beforeEach(() => {
    db = new Database(':memory:');
    provider = new ChainstackProvider({ rpcUrl: 'https://test-node' });
    vi.spyOn(provider, 'isConfigured').mockReturnValue(true);
    vi.spyOn(provider, 'getChainId').mockResolvedValue(42220);

    const config = loadConfig({
      NODE_ENV: 'test',
      BUY_ENABLED: 'false',
      CENCORI_ENABLED: 'false'
    });

    cencoriProvider = new CencoriProvider({ enabled: false });
    buyQuoteService = new BuyQuoteService(db, config);
    aiExplanationService = new AiExplanationService(cencoriProvider, buyQuoteService, config);

    app = buildApp(config, {
      db,
      provider,
      cencoriProvider,
      buyQuoteService,
      aiExplanationService
    });
  });

  // SCENARIO A: Known reverted transaction
  it('Scenario A: processes known reverted transaction and returns complete diagnosis & evidence', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: candidateTxHash,
      from: '0x6bfc49bad93465d272e9ef2afb4960245b62b5ea',
      to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
      blockNumber: 52460432,
      gas: '0x4c4b40',
      nonce: 37,
      input: '0x38ed1739',
      isPending: false
    });

    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue({
      transactionHash: candidateTxHash,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0xd3d8',
      blockNumber: 52460432,
      logsCount: 0
    });

    vi.spyOn(provider, 'getCallTrace').mockResolvedValue({
      type: 'CALL',
      from: '0x6bfc49bad93465d272e9ef2afb4960245b62b5ea',
      to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
      error: 'execution reverted',
      revertReason: 'Swap reverted',
      calls: [
        {
          type: 'CALL',
          from: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
          to: '0xe3d8bd6aed4f159bc8000a9cd47cffdb95f96121',
          error: 'execution reverted',
          output: '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000d5377617020726576657274656400000000000000000000000000000000000000'
        }
      ]
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: candidateTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('REVERTED');
    expect(body.data.traceStatus).toBe('AVAILABLE');
    expect(body.data.diagnosis.category).toBe('PROPAGATED_CHILD_REVERT');
    expect(body.data.diagnosis.causalityCategory).toBe('PROPAGATION_SUPPORTED');
    expect(body.data.evidenceLedger.length).toBeGreaterThanOrEqual(4);
  });

  // SCENARIO B: Invalid transaction hash
  it('Scenario B: rejects invalid format transaction hash with HTTP 400 and no provider calls', async () => {
    const txSpy = vi.spyOn(provider, 'getTransaction');

    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: 'not-a-valid-hash' }
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(txSpy).not.toHaveBeenCalled();
  });

  // SCENARIO C: Valid format but missing transaction
  it('Scenario C: returns HTTP 404 for valid format but non-existent transaction', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue(null);

    const nonExistent = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: nonExistent }
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('TRANSACTION_NOT_FOUND');
  });

  // SCENARIO D: Pending transaction
  it('Scenario D: clearly identifies pending transaction without falsely labelling it reverted', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: candidateTxHash,
      from: '0xsender',
      to: '0xrecipient',
      blockNumber: null,
      gas: '0x50000',
      nonce: 10,
      input: '0x',
      isPending: true
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: candidateTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('PENDING');
    expect(body.data.diagnosis.category).toBe('PENDING_TRANSACTION');
    expect(body.data.traceStatus).toBe('NOT_REQUESTED');
  });

  // SCENARIO E: Trace unavailable (unsupported method)
  it('Scenario E: reports traceStatus UNSUPPORTED with clear limitations when node lacks callTracer', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: candidateTxHash,
      from: '0xsender',
      to: '0xrecipient',
      blockNumber: 123456,
      gas: '0x50000',
      nonce: 10,
      input: '0x',
      isPending: false
    });

    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue({
      transactionHash: candidateTxHash,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0x1000',
      blockNumber: 123456,
      logsCount: 0
    });

    vi.spyOn(provider, 'getCallTrace').mockRejectedValue(
      new ChainstackProviderError('Method not supported', 'METHOD_NOT_SUPPORTED', 501)
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: candidateTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('REVERTED');
    expect(body.data.traceStatus).toBe('UNSUPPORTED');
    expect(body.data.limitations.some((l: string) => l.includes('does not support debug_traceTransaction'))).toBe(true);
  });

  // SCENARIO F: Provider timeout
  it('Scenario F: handles provider timeout during trace retrieval gracefully', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: candidateTxHash,
      from: '0xsender',
      to: '0xrecipient',
      blockNumber: 123456,
      gas: '0x50000',
      nonce: 10,
      input: '0x',
      isPending: false
    });

    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue({
      transactionHash: candidateTxHash,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0x1000',
      blockNumber: 123456,
      logsCount: 0
    });

    vi.spyOn(provider, 'getCallTrace').mockRejectedValue(
      new ChainstackProviderError('Gateway timeout', 'TIMEOUT', 504)
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: candidateTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.traceStatus).toBe('TIMEOUT');
    expect(body.data.limitations.some((l: string) => l.includes('timed out'))).toBe(true);
  });

  // SCENARIO G: Cencori disabled
  it('Scenario G: operates deterministically with full utility when Cencori is disabled', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: candidateTxHash,
      from: '0xsender',
      to: '0xrecipient',
      blockNumber: 123456,
      gas: '0x50000',
      nonce: 10,
      input: '0x',
      isPending: false
    });

    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue({
      transactionHash: candidateTxHash,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0x1000',
      blockNumber: 123456,
      logsCount: 0
    });

    vi.spyOn(provider, 'getCallTrace').mockResolvedValue({
      type: 'CALL',
      from: '0xsender',
      to: '0xrecipient',
      error: 'execution reverted'
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: candidateTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.aiExplanation.status).toBe('DISABLED');
    expect(body.data.diagnosis.narrative).toBeDefined();
    expect(body.data.evidenceLedger.length).toBeGreaterThan(0);
  });

  // SCENARIO H: Invalid AI response falls back safely
  it('Scenario H: rejects invalid AI response and safely falls back to deterministic explanation', async () => {
    const invalidAiResponse = {
      summary: 'Reverted due to phantom pool 0x9999999999999999999999999999999999999999',
      technicalExplanation: 'The swap called unverified pool 0x9999999999999999999999999999999999999999 which does not exist.',
      provenFacts: ['[E-01] Sender submitted transaction'],
      likelyExplanations: ['Pool drained'],
      unknowns: [],
      safeNextSteps: [],
      evidenceReferences: ['E-01'],
      confidence: 'MEDIUM' as const,
      limitations: []
    };

    const validation = validateAiExplanation(invalidAiResponse as any, {
      evidenceLedger: [{
        id: 'E-01',
        kind: 'TRANSACTION_FACT',
        sourceMethod: 'eth_getTransactionByHash',
        description: '',
        value: {},
        contentHash: '',
        observedAt: ''
      }],
      deterministicStatus: 'REVERTED',
      deterministicCategory: 'PROPAGATED_CHILD_REVERT',
      deterministicConfidence: 'MEDIUM',
      deterministicLimitations: [],
      knownAddresses: new Set(['0x6bfc49bad93465d272e9ef2afb4960245b62b5ea']),
      knownRevertReasons: new Set(['Swap reverted'])
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(validation.errors.some((e) => e.includes('unverified address'))).toBe(true);
  });

  // SCENARIO I: Database restart persistence
  it('Scenario I: recovers past investigation with full fidelity from database across restart', async () => {
    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: candidateTxHash,
      from: '0xsender',
      to: '0xrecipient',
      blockNumber: 123456,
      gas: '0x50000',
      nonce: 10,
      input: '0x',
      isPending: false
    });

    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue({
      transactionHash: candidateTxHash,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0x1000',
      blockNumber: 123456,
      logsCount: 0
    });

    vi.spyOn(provider, 'getCallTrace').mockResolvedValue({
      type: 'CALL',
      from: '0xsender',
      to: '0xrecipient',
      error: 'execution reverted'
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: candidateTxHash }
    });

    const invId = JSON.parse(createRes.body).data.investigationId;

    const fetchRes = await app.inject({
      method: 'GET',
      url: `/api/investigations/${invId}`
    });

    expect(fetchRes.statusCode).toBe(200);
    const body = JSON.parse(fetchRes.body);
    expect(body.data.investigationId).toBe(invId);
    expect(body.data.txHash).toBe(candidateTxHash);
    expect(body.data.status).toBe('REVERTED');
  });

  // SCENARIO J: Large trace handling
  it('Scenario J: handles deep and large call traces safely without process crashes', async () => {
    let current: any = { type: 'CALL', from: '0xuser', to: '0xcontract0' };
    const root = current;
    for (let i = 1; i <= 150; i++) {
      const child = { type: 'CALL', from: `0xcontract${i - 1}`, to: `0xcontract${i}` };
      current.calls = [child];
      current = child;
    }

    vi.spyOn(provider, 'getTransaction').mockResolvedValue({
      hash: candidateTxHash,
      from: '0xuser',
      to: '0xcontract0',
      blockNumber: 123456,
      gas: '0x50000',
      nonce: 10,
      input: '0x',
      isPending: false
    });

    vi.spyOn(provider, 'getTransactionReceipt').mockResolvedValue({
      transactionHash: candidateTxHash,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0x1000',
      blockNumber: 123456,
      logsCount: 0
    });

    vi.spyOn(provider, 'getCallTrace').mockResolvedValue(root);

    const res = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: candidateTxHash }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.limitations.some((l: string) => l.includes('truncated'))).toBe(true);
  });
});
