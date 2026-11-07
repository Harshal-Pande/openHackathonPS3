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
    expect(childFrame?.causalityStatus).toBe('CAUGHT_CHILD_REVERT');
    expect(childFrame?.propagatedToParent).toBe(false);
    expect(childFrame?.isDeepestFailingFrame).toBe(false);
  });

  it('marks child error as CAUGHT_CHILD_REVERT when parent continues and makes subsequent calls', () => {
    // Parent makes call 0 (fails/caught in try), then call 1 (succeeds), then parent reverts itself
    const rawTrace: RawCallFrame = {
      type: 'CALL',
      from: '0xuser',
      to: '0xcontract',
      error: 'execution reverted',
      revertReason: 'Custom error at end of execution',
      calls: [
        {
          type: 'CALL',
          from: '0xcontract',
          to: '0xoracle1',
          error: 'execution reverted',
          revertReason: 'Oracle 1 timed out'
        },
        {
          type: 'CALL',
          from: '0xcontract',
          to: '0xoracle2',
          // successful call!
          output: '0x0000000000000000000000000000000000000000000000000000000000000001'
        }
      ]
    };

    const parsed = parseCallTrace(rawTrace);
    expect(parsed.totalFrames).toBe(3);

    const oracle1Frame = parsed.flattenedFrames.find((f) => f.to === '0xoracle1');
    expect(oracle1Frame).toBeDefined();
    // Since oracle1 was call index 0 of 2, it has subsequent calls in parent
    expect(oracle1Frame?.hasSubsequentCallsInParent).toBe(true);
    expect(oracle1Frame?.causalityStatus).toBe('CAUGHT_CHILD_REVERT');
    expect(oracle1Frame?.propagatedToParent).toBe(false);

    // Root is the observed failure since child didn't cause it
    expect(parsed.deepestFailingFrame?.id).toBe('0');
    expect(parsed.deepestFailingFrame?.causalityStatus).toBe('OBSERVED_FAILURE');
  });

  it('classifies multiple failing child branches as CAUSALITY_UNCERTAIN', () => {
    // Parent reverts, and multiple children reverted
    const rawTrace: RawCallFrame = {
      type: 'CALL',
      from: '0xuser',
      to: '0xbatchProcessor',
      error: 'execution reverted',
      calls: [
        {
          type: 'CALL',
          from: '0xbatchProcessor',
          to: '0xsubA',
          error: 'execution reverted'
        },
        {
          type: 'CALL',
          from: '0xbatchProcessor',
          to: '0xsubB',
          error: 'execution reverted'
        }
      ]
    };

    const parsed = parseCallTrace(rawTrace);
    const subB = parsed.flattenedFrames.find((f) => f.to === '0xsubb');
    expect(subB).toBeDefined();
    // Has multiple failing siblings
    expect(subB?.causalityStatus).toBe('CAUSALITY_UNCERTAIN');
    expect(subB?.propagatedToParent).toBe(true);
  });

  it('marks root-only failure as OBSERVED_FAILURE', () => {
    const rawTrace: RawCallFrame = {
      type: 'CALL',
      from: '0xuser',
      to: '0xvault',
      error: 'execution reverted',
      revertReason: 'Unauthorized caller',
      calls: []
    };

    const parsed = parseCallTrace(rawTrace);
    expect(parsed.totalFrames).toBe(1);
    expect(parsed.deepestFailingFrame?.id).toBe('0');
    expect(parsed.deepestFailingFrame?.causalityStatus).toBe('OBSERVED_FAILURE');
    expect(parsed.deepestFailingFrame?.propagatedToParent).toBe(true);
  });

  it('handles empty revert data and missing optional frame fields gracefully', () => {
    const rawTrace: RawCallFrame = {
      type: 'CALL',
      from: '0xuser',
      to: '0xcontract',
      error: 'execution reverted',
      output: '0x' // empty output
    };

    const parsed = parseCallTrace(rawTrace);
    expect(parsed.totalFrames).toBe(1);
    expect(parsed.deepestFailingFrame?.error).toBe('execution reverted');
    expect(parsed.deepestFailingFrame?.decodedRevert?.type).toBe('ERROR_STRING');
    expect(parsed.deepestFailingFrame?.decodedRevert?.reason).toBe('execution reverted');
  });
});
