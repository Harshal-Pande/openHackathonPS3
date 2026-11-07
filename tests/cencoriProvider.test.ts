import { describe, it, expect } from 'vitest';
import { CencoriProvider } from '../src/server/providers/cencori.js';
import { InvestigationReport } from '../src/server/forensics/types.js';

describe('Cencori Provider Abstraction', () => {
  const sampleReport: InvestigationReport = {
    investigationId: 'test-inv-id',
    txHash: '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445',
    chainId: 42220,
    status: 'REVERTED',
    traceStatus: 'AVAILABLE',
    transaction: {
      hash: '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445',
      from: '0x6bfc49bad93465d272e9ef2afb4960245b62b5ea',
      to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
      value: '0x0',
      gas: '0x4c4b40',
      nonce: 1,
      blockNumber: 52460432,
      isPending: false
    },
    receipt: {
      transactionHash: '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445',
      blockNumber: 52460432,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '0xd3d8',
      logsCount: 0
    },
    executionTrace: {
      rawTree: null,
      flattenedFrames: [
        {
          id: '0',
          depth: 0,
          parentFrameId: null,
          type: 'CALL',
          from: '0x6bfc49bad93465d272e9ef2afb4960245b62b5ea',
          to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
          value: '0x0',
          gas: '0x4c4b40',
          gasUsed: '0xd3d8',
          input: '0x',
          error: 'execution reverted',
          revertReason: 'Swap reverted',
          propagatedToParent: true,
          isDeepestFailingFrame: false,
          causalityStatus: 'OBSERVED_FAILURE'
        },
        {
          id: '0.1',
          depth: 1,
          parentFrameId: '0',
          type: 'CALL',
          from: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
          to: '0xe3d8bd6aed4f159bc8000a9cd47cffdb95f96121',
          value: '0x0',
          gas: '0x400000',
          gasUsed: '0xd3d8',
          input: '0x',
          error: 'execution reverted',
          propagatedToParent: true,
          isDeepestFailingFrame: true,
          causalityStatus: 'PROPAGATION_SUPPORTED'
        }
      ],
      totalFrames: 2,
      maxDepth: 1,
      deepestFailingFrame: null
    },
    decodedRevert: {
      type: 'ERROR_STRING',
      reason: 'Swap reverted',
      selector: '0x08c379a0'
    },
    evidenceLedger: [
      {
        id: 'E-01',
        kind: 'TRANSACTION_FACT',
        sourceMethod: 'eth_getTransactionByHash',
        description: 'Transaction sender details',
        value: { from: '0x6bfc...' },
        contentHash: 'hash-01',
        observedAt: '2026-11-07T00:00:00Z'
      },
      {
        id: 'E-02',
        kind: 'RECEIPT_FACT',
        sourceMethod: 'eth_getTransactionReceipt',
        description: 'Mined execution status',
        value: { status: 0 },
        contentHash: 'hash-02',
        observedAt: '2026-11-07T00:00:00Z'
      },
      {
        id: 'E-03',
        kind: 'REVERT_DATA',
        sourceMethod: 'debug_traceTransaction',
        description: 'Decoded revert string',
        value: { reason: 'Swap reverted' },
        contentHash: 'hash-03',
        observedAt: '2026-11-07T00:00:00Z'
      }
    ],
    diagnosis: {
      category: 'PROPAGATED_CHILD_REVERT',
      confidence: 'HIGH',
      headline: 'Nested Call Failure at Depth 1',
      narrative: 'Child call reverted.',
      evidenceCitations: ['E-01', 'E-02', 'E-03'],
      provenFacts: ['[E-01] Sender submitted tx', '[E-02] Receipt confirms failure'],
      likelyExplanations: ['Sub-call rejected execution'],
      unknowns: ['Internal contract storage'],
      safeNextSteps: ['Check pool balance'],
      rootRevertReason: 'Swap reverted',
      nestedFailureReason: 'execution reverted',
      causalityCategory: 'PROPAGATION_SUPPORTED'
    },
    limitations: ['Trace limited to call tree'],
    createdAt: '2026-11-07T00:00:00Z',
    completedAt: '2026-11-07T00:00:01Z'
  };

  it('respects enabled and disabled states', () => {
    const disabledProvider = new CencoriProvider({ enabled: false });
    expect(disabledProvider.isEnabled()).toBe(false);

    const enabledProvider = new CencoriProvider({ enabled: true });
    expect(enabledProvider.isEnabled()).toBe(true);
  });

  it('constructs strict, evidence-only prompt payload conforming to schema', () => {
    const provider = new CencoriProvider({ enabled: true });
    const payload = provider.buildPromptPayload(sampleReport);

    expect(payload.model).toBe('maximo-atlas-1.3');
    expect(payload.max_tokens).toBe(1024);
    expect(payload.messages.length).toBe(2);

    const systemMsg = payload.messages[0];
    expect(systemMsg.role).toBe('system');
    expect(systemMsg.content).toContain('You are explaining an existing deterministic blockchain forensic investigation');
    expect(systemMsg.content).toContain('Never invent facts, addresses, call frames, revert messages');

    const userMsg = payload.messages[1];
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toContain(sampleReport.txHash);
    expect(userMsg.content).toContain('Swap reverted');
    expect(userMsg.content).toContain('E-01');

    // Security check: Must never include internal secrets or endpoints
    expect(userMsg.content).not.toContain('CHAINSTACK');
    expect(userMsg.content).not.toContain('SESSION_SECRET');
    expect(userMsg.content).not.toContain('OPERATOR_PASSWORD');
  });

  it('generates quote object with exact body SHA-256 hash', async () => {
    const provider = new CencoriProvider({ enabled: true });
    const payload = provider.buildPromptPayload(sampleReport);
    const quote = await provider.getQuote(payload);

    expect(quote.capabilityId).toBe('cencori.v1.chat.completions');
    expect(quote.method).toBe('POST');
    expect(quote.url).toContain('cencori/v1/chat/completions');
    expect(quote.amountAtomic).toBe('10000');
    expect(quote.amountDisplay).toBe('$0.01');
    expect(quote.recipient.toLowerCase()).toBe('0x20faaca5f980e29639a0fcc6dca6988e18ed333b');
    expect(quote.chainId).toBe(42220);
    expect(quote.bodySha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
