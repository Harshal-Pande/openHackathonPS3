import { describe, it, expect } from 'vitest';
import { parseCallTrace } from '../src/server/forensics/traceParser.js';
import { RawCallFrame } from '../src/server/providers/chainstack.js';

describe('Trace Parser & Failure Propagation Analyzer', () => {
  it('parses single frame without subcalls', () => {
    const rawTrace: RawCallFrame = {
      type: 'CALL',
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '0x0',
      gas: '0x10000',
      gasUsed: '0x5000',
      input: '0x',
      error: 'execution reverted'
    };

    const parsed = parseCallTrace(rawTrace);
    expect(parsed.totalFrames).toBe(1);
    expect(parsed.maxDepth).toBe(0);
    expect(parsed.deepestFailingFrame).not.toBeNull();
    expect(parsed.deepestFailingFrame?.id).toBe('0');
    expect(parsed.deepestFailingFrame?.propagatedToParent).toBe(true);
  });

  it('correctly tracks nested calls and identifies propagated failure', () => {
    // Root CALL -> calls Child DELEGATECALL -> calls Grandchild CALL (reverts)
    const rawTrace: RawCallFrame = {
      type: 'CALL',
      from: '0xuser',
      to: '0xrouter',
      value: '0x0',
      gas: '0x50000',
      gasUsed: '0x25000',
      input: '0xswap',
      error: 'execution reverted',
      calls: [
        {
          type: 'DELEGATECALL',
          from: '0xrouter',
          to: '0xlogic',
          value: '0x0',
          gas: '0x40000',
          gasUsed: '0x20000',
          input: '0xinternalSwap',
          error: 'execution reverted',
          calls: [
            {
              type: 'CALL',
              from: '0xrouter',
              to: '0xpool',
              value: '0x0',
              gas: '0x30000',
              gasUsed: '0x15000',
              input: '0xexecute',
              error: 'execution reverted',
              revertReason: 'INSUFFICIENT_LIQUIDITY'
            }
          ]
        }
      ]
    };

    const parsed = parseCallTrace(rawTrace);
    expect(parsed.totalFrames).toBe(3);
    expect(parsed.maxDepth).toBe(2);

    // Deepest failing frame should be the pool call at depth 2
    expect(parsed.deepestFailingFrame).not.toBeNull();
    expect(parsed.deepestFailingFrame?.depth).toBe(2);
    expect(parsed.deepestFailingFrame?.to).toBe('0xpool');
    expect(parsed.deepestFailingFrame?.revertReason).toBe('INSUFFICIENT_LIQUIDITY');
    expect(parsed.deepestFailingFrame?.propagatedToParent).toBe(true);
  });

  it('distinguishes caught child error (parent does not fail) vs propagated error', () => {
    // Parent CALL succeeds, but child CALL caught internal error
    const rawTrace: RawCallFrame = {
      type: 'CALL',
      from: '0xuser',
      to: '0xcontract',
      value: '0x0',
      gas: '0x50000',
      gasUsed: '0x20000',
      input: '0xtryCall',
      // No error on parent!
      calls: [
        {
          type: 'CALL',
          from: '0xcontract',
          to: '0xsub',
          value: '0x0',
          gas: '0x10000',
          gasUsed: '0x5000',
          input: '0x',
          error: 'execution reverted'
        }
      ]
    };

    const parsed = parseCallTrace(rawTrace);
    expect(parsed.totalFrames).toBe(2);

    const childFrame = parsed.flattenedFrames.find((f) => f.depth === 1);
    expect(childFrame?.error).toBe('execution reverted');
    // Because parent did not have an error, child error was caught
    expect(childFrame?.propagatedToParent).toBe(false);
    expect(childFrame?.isDeepestFailingFrame).toBe(false);
  });
});
