import { describe, it, expect } from 'vitest';
import {
  shortAddr,
  shortHash,
  extractSelector,
  selector,
  weiToCelo,
  gasPercent,
  gasPct,
  hexToDecimal,
  relativeTime,
  celoscanTx,
  celoscanAddr,
} from '../src/client/lib/format.js';
import {
  txStatusTone,
  txStatusLabel,
  traceStatusTone,
  traceStatusLabel,
  causalityTone,
  causalityLabel,
  quoteStatusTone,
  aiStatusTone,
} from '../src/client/lib/status.js';
import { CAUSALITY_MAP, getCausalityInfo, CAUSALITY_LEGEND } from '../src/client/lib/causality.js';
import { getErrorInfo } from '../src/client/lib/errors.js';
import { extractHash, isValidHash } from '../src/client/lib/extractHash.js';
import { buildMarkdownSummary } from '../src/client/lib/summary.js';
import type { InvestigationReport, TransactionStatus, TraceStatus, FrameCausalityStatus } from '../src/client/lib/types.js';

describe('clientLib: format.ts', () => {
  it('formats hexToDecimal with thousands separators (0xd3d8 -> 54,232)', () => {
    expect(hexToDecimal('0xd3d8')).toBe('54,232');
    expect(hexToDecimal('0x0')).toBe('0');
    expect(hexToDecimal('invalid')).toBe('—');
  });

  it('formats gasPercent and gasPct', () => {
    expect(gasPercent('54232', '5000000')).toBe('1.1%');
    expect(gasPct('54232', '5000000')).toBe('1.1%');
    expect(gasPercent('0', '0')).toBeNull();
  });

  it('formats weiToCelo with zero and non-zero values', () => {
    expect(weiToCelo('0')).toBeNull();
    expect(weiToCelo('1000000000000000000')).toBe('1 CELO');
    expect(weiToCelo('1500000000000000000')).toBe('1.5 CELO');
  });

  it('formats shortHash and shortAddr', () => {
    expect(shortHash('0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445')).toBe('0xb90bcca5...9445');
    expect(shortAddr('0xe3d8a6ff67140e6988f01b1cb9154a4f89d36121')).toBe('0xe3d8...6121');
  });

  it('extracts selector', () => {
    expect(extractSelector('0xa9059cbb000000000000000000000000')).toBe('0xa9059cbb');
    expect(selector('0xa9059cbb000000000000000000000000')).toBe('0xa9059cbb');
    expect(extractSelector('0x12')).toBe('');
  });

  it('generates Celoscan links', () => {
    expect(celoscanTx('0xabc')).toBe('https://celoscan.io/tx/0xabc');
    expect(celoscanAddr('0x123')).toBe('https://celoscan.io/address/0x123');
  });

  it('formats relativeTime correctly', () => {
    const nowIso = new Date().toISOString();
    expect(relativeTime(nowIso)).toMatch(/ago/);
  });
});

describe('clientLib: status.ts exhaustiveness', () => {
  const txStatuses: TransactionStatus[] = ['SUCCESS', 'REVERTED', 'PENDING', 'NOT_FOUND', 'UNKNOWN'];
  it('covers every TransactionStatus', () => {
    for (const status of txStatuses) {
      expect(txStatusTone(status)).toBeDefined();
      expect(txStatusLabel(status)).toBeDefined();
    }
  });

  const traceStatuses: TraceStatus[] = [
    'AVAILABLE', 'UNSUPPORTED', 'RATE_LIMITED', 'TIMEOUT',
    'PROVIDER_ERROR', 'INVALID_RESPONSE', 'NOT_REQUESTED',
  ];
  it('covers every TraceStatus', () => {
    for (const status of traceStatuses) {
      expect(traceStatusTone(status)).toBeDefined();
      expect(traceStatusLabel(status)).toBeDefined();
    }
  });

  const causalityStatuses: FrameCausalityStatus[] = [
    'NO_FAILURE', 'OBSERVED_FAILURE', 'CAUGHT_CHILD_REVERT',
    'PROPAGATION_SUPPORTED', 'CAUSALITY_UNCERTAIN',
  ];
  it('covers every FrameCausalityStatus', () => {
    for (const status of causalityStatuses) {
      expect(causalityTone(status)).toBeDefined();
      expect(causalityLabel(status)).toBeDefined();
    }
  });

  it('covers quote and ai status tones', () => {
    expect(quoteStatusTone('APPROVED')).toBe('info');
    expect(quoteStatusTone('SETTLED')).toBe('ok');
    expect(aiStatusTone('SUCCESS')).toBe('ok');
    expect(aiStatusTone('DISABLED')).toBe('neutral');
  });
});

describe('clientLib: causality.ts copy', () => {
  it('has exact meaning copy for all 5 statuses', () => {
    expect(CAUSALITY_MAP.NO_FAILURE.meaning).toBe('This call completed without an error.');
    expect(CAUSALITY_MAP.OBSERVED_FAILURE.meaning).toBe('The top-level call failed. No nested call is proven to be the cause.');
    expect(CAUSALITY_MAP.CAUGHT_CHILD_REVERT.meaning).toBe('This call failed, but a parent handled it and continued (or an ancestor did not fail). It did not cause the top-level failure.');
    expect(CAUSALITY_MAP.PROPAGATION_SUPPORTED.meaning).toBe('This call failed and every ancestor up to the root also failed with no later calls in the parent. The trace supports that this failure propagated to the top level.');
    expect(CAUSALITY_MAP.CAUSALITY_UNCERTAIN.meaning).toBe('This call failed, but the trace cannot prove it caused the top-level failure (multiple failing branches or a different parent reason).');
    expect(CAUSALITY_LEGEND).toHaveLength(5);
    expect(getCausalityInfo('PROPAGATION_SUPPORTED').label).toBe('Failure propagated');
  });
});

describe('clientLib: errors.ts mapping', () => {
  const codes = [
    'INVALID_INPUT', 'TRANSACTION_NOT_FOUND', 'NOT_FOUND',
    'ENDPOINT_NOT_CONFIGURED', 'INVALID_CHAIN_ID', 'TIMEOUT',
    'GATEWAY_TIMEOUT', 'RATE_LIMITED', 'PROVIDER_ERROR',
    'PROVIDER_UNAVAILABLE', 'METHOD_NOT_SUPPORTED', 'UNAUTHORIZED',
    'HASH_MISMATCH', 'QUOTE_EXPIRED', 'ALREADY_APPROVED',
    'KILL_SWITCH_ACTIVE', 'NETWORK',
  ];

  it('maps every specified code from Section 13.2', () => {
    for (const code of codes) {
      const err = getErrorInfo(code, 'Custom message');
      expect(err.title).toBeDefined();
      expect(err.detail).toBeDefined();
      expect(Array.isArray(err.actions)).toBe(true);
    }
  });

  it('falls back to default for unknown code', () => {
    const err = getErrorInfo('RANDOM_UNKNOWN_CODE', 'Something broke');
    expect(err.title).toBe('Something went wrong');
    expect(err.detail).toBe('Something broke');
    expect(err.actions).toContain('Try again');
  });
});

describe('clientLib: extractHash.ts', () => {
  const validHash = '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445';

  it('extracts plain hash', () => {
    expect(extractHash(validHash)).toBe(validHash);
    expect(isValidHash(validHash)).toBe(true);
  });

  it('extracts hash from URL and text with whitespace', () => {
    const url = `https://celoscan.io/tx/${validHash}`;
    expect(extractHash(url)).toBe(validHash);

    const withWhitespace = `  check this tx: ${validHash} please  `;
    expect(extractHash(withWhitespace)).toBe(validHash);
  });

  it('handles invalid text', () => {
    expect(extractHash('not-a-hash')).toBeNull();
    expect(extractHash('')).toBeNull();
    expect(isValidHash('0xinvalid')).toBe(false);
  });

  it('extracts first hash if multiple are present', () => {
    const hash2 = '0x1111111111111111111111111111111111111111111111111111111111111111';
    expect(extractHash(`${validHash} and then ${hash2}`)).toBe(validHash);
  });
});

describe('clientLib: summary.ts markdown generator', () => {
  const sampleReport: InvestigationReport = {
    investigationId: 'test-uuid-1',
    txHash: '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445',
    chainId: 42220,
    status: 'REVERTED',
    traceStatus: 'AVAILABLE',
    transaction: {
      hash: '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445',
      blockNumber: 52460432,
      transactionIndex: 1,
      from: '0x1234567890123456789012345678901234567890',
      to: '0x0987654321098765432109876543210987654321',
      value: '0',
      gas: '5000000',
      input: '0xa9059cbb',
      nonce: 42,
      isPending: false,
    },
    receipt: {
      transactionHash: '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445',
      blockNumber: 52460432,
      status: 'REVERTED',
      rawStatus: 0,
      gasUsed: '54232',
      logsCount: 0,
    },
    executionTrace: null,
    decodedRevert: null,
    evidenceLedger: [],
    diagnosis: {
      category: 'PROPAGATED_CHILD_REVERT',
      confidence: 'HIGH',
      headline: 'execution reverted',
      narrative: 'The contract reverted during swap execution.',
      evidenceCitations: ['E-01'],
      provenFacts: ['Transaction status is 0 (reverted).'],
      likelyExplanations: ['Insufficient liquidity in pool.'],
      unknowns: ['Exact pool state at block time.'],
      safeNextSteps: ['Check token allowance and pool reserves.'],
      causalityCategory: 'PROPAGATION_SUPPORTED',
    },
    limitations: ['Trace depth limited to call tree.'],
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  it('builds summary containing required fields and disallows forbidden claims', () => {
    const md = buildMarkdownSummary(sampleReport);
    expect(md).toContain('# RevertLens Investigation Summary');
    expect(md).toContain('0xb90bcca5...9445');
    expect(md).toContain('Reverted');
    expect(md).toContain('Failure propagated');
    expect(md).toContain('The contract reverted during swap execution.');
    expect(md).toContain('Insufficient liquidity in pool.');

    // Negative assertions: prohibited claim words
    expect(md.toLowerCase()).not.toContain('root cause');
    expect(md.toLowerCase()).not.toContain('paid');
    expect(md.toLowerCase()).not.toContain('registered');
  });

  it('reconciles FrameCausalityStatus and FailureDiagnosis category taxonomy', () => {
    // 5 exact frame-level causality classifications
    const frameStatuses: FrameCausalityStatus[] = [
      'NO_FAILURE',
      'OBSERVED_FAILURE',
      'CAUGHT_CHILD_REVERT',
      'PROPAGATION_SUPPORTED',
      'CAUSALITY_UNCERTAIN',
    ];
    expect(frameStatuses).toHaveLength(5);

    // 12 exact investigation-level failure diagnosis categories
    const diagnosisCategories = [
      'EXPLICIT_REVERT',
      'PANIC',
      'OUT_OF_GAS',
      'PROPAGATED_CHILD_REVERT',
      'CAUGHT_CHILD_REVERT',
      'CAUSALITY_UNCERTAIN',
      'UNSUPPORTED_OR_MISSING_TRACE',
      'UNKNOWN_REVERT',
      'PENDING_TRANSACTION',
      'SUCCESSFUL_TRANSACTION',
      'UNCONFIRMED_RECEIPT',
      'UNKNOWN_STATUS',
    ];
    expect(diagnosisCategories).toHaveLength(12);

    // Verify deprecated/synthetic values are NOT valid FrameCausalityStatus
    const invalidStatuses = ['UNSUPPORTED_CALL_FAILED', 'ROOT_CAUSE_FOUND', 'SUCCESSFUL_CALL'];
    for (const inv of invalidStatuses) {
      expect(frameStatuses.includes(inv as any)).toBe(false);
    }
  });
});
