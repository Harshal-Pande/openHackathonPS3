import { describe, it, expect } from 'vitest';
import { buildEvidenceLedger } from '../src/server/forensics/evidenceBuilder.js';
import { classifyFailure } from '../src/server/forensics/classifier.js';
import { generateDeterministicExplanation } from '../src/server/forensics/explanationEngine.js';
import { parseCallTrace } from '../src/server/forensics/traceParser.js';
import { NormalizedTransaction, NormalizedReceipt, RawCallFrame } from '../src/server/providers/chainstack.js';

describe('Forensics Engine & Evidence Ledger', () => {
  const mockTx: NormalizedTransaction = {
    hash: '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445',
    blockNumber: 52460432,
    transactionIndex: 12,
    from: '0x6bfc49bad93465d272e9ef2afb4960245b62b5ea',
    to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
    value: '0x0',
    gas: '0x100000',
    input: '0x38ed1739',
    nonce: 42
  };

  const mockReceipt: NormalizedReceipt = {
    transactionHash: '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445',
    blockNumber: 52460432,
    status: 'REVERTED',
    rawStatus: 0,
    gasUsed: '0x45000',
    logsCount: 0
  };

  const mockTraceRaw: RawCallFrame = {
    type: 'CALL',
    from: '0x6bfc49bad93465d272e9ef2afb4960245b62b5ea',
    to: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
    value: '0x0',
    gas: '0x100000',
    gasUsed: '0x45000',
    input: '0x38ed1739',
    error: 'execution reverted',
    calls: [
      {
        type: 'CALL',
        from: '0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0',
        to: '0xpoolcontract',
        value: '0x0',
        gas: '0x80000',
        gasUsed: '0x30000',
        input: '0xswap',
        error: 'execution reverted',
        revertReason: 'Swap reverted'
      }
    ]
  };

  it('builds evidence ledger with stable IDs and content hashes', () => {
    const trace = parseCallTrace(mockTraceRaw);
    const revert = { type: 'ERROR_STRING' as const, reason: 'Swap reverted' };
    const ledger = buildEvidenceLedger(mockTx, mockReceipt, trace, revert);

    expect(ledger.length).toBeGreaterThanOrEqual(4);
    expect(ledger[0].id).toBe('E-01');
    expect(ledger[1].id).toBe('E-02');
    expect(ledger[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(ledger.some((e) => e.kind === 'FAILURE_PROPAGATION')).toBe(true);
  });

  it('classifies explicit revert with high confidence', () => {
    const trace = parseCallTrace(mockTraceRaw);
    const revert = { type: 'ERROR_STRING' as const, reason: 'Swap reverted' };
    const ledger = buildEvidenceLedger(mockTx, mockReceipt, trace, revert);
    const diagnosis = classifyFailure(mockTx, mockReceipt, trace, revert, ledger);

    expect(diagnosis.confidence).toBe('HIGH');
    expect(diagnosis.category).toBe('PROPAGATED_CHILD_REVERT');
    expect(diagnosis.headline).toContain('Nested Call Failure');
    expect(diagnosis.provenFacts.length).toBeGreaterThan(0);
    expect(diagnosis.safeNextSteps.length).toBeGreaterThan(0);
  });

  it('generates narrative citing evidence IDs directly', () => {
    const trace = parseCallTrace(mockTraceRaw);
    const revert = { type: 'ERROR_STRING' as const, reason: 'Swap reverted' };
    const ledger = buildEvidenceLedger(mockTx, mockReceipt, trace, revert);
    const explanation = generateDeterministicExplanation(mockTx, mockReceipt, trace, revert, ledger);

    expect(explanation.summaryParagraph).toContain('Every claim is backed by atomic evidence records');
    expect(explanation.annotatedFacts.some((f) => f.startsWith('[E-01]'))).toBe(true);
    expect(explanation.annotatedFacts.some((f) => f.startsWith('[E-02]'))).toBe(true);
    expect(explanation.limitations.length).toBeGreaterThan(0);
  });
});
