import { RawCallFrame } from '../providers/chainstack.js';
import { FlattenedCallFrame } from './types.js';
import { decodeRevertData } from './revertDecoder.js';

export const MAX_TRACE_DEPTH = 100;
export const MAX_TRACE_FRAMES = 1000;

export interface ParsedTraceResult {
  rawTree: RawCallFrame;
  flattenedFrames: FlattenedCallFrame[];
  totalFrames: number;
  maxDepth: number;
  deepestFailingFrame: FlattenedCallFrame | null;
  isTruncated?: boolean;
}

export function parseCallTrace(rawTree: RawCallFrame): ParsedTraceResult {
  const flattened: FlattenedCallFrame[] = [];
  let maxDepth = 0;
  let isTruncated = false;

  function traverse(
    frame: RawCallFrame,
    depth: number,
    parentId: string | null,
    indexInParent: number,
    totalSiblings: number
  ): string {
    const frameId = parentId ? `${parentId}.${indexInParent}` : '0';
    if (depth > maxDepth) maxDepth = depth;

    const rawError = frame.error || frame.revertReason;
    const revertBytes = rawError && frame.output && frame.output.startsWith('0x') && frame.output.length >= 10 ? frame.output : undefined;
    const fallbackReason = frame.revertReason || frame.error;
    const decoded = rawError ? decodeRevertData(revertBytes, fallbackReason) : undefined;

    const isLastCallInParent = totalSiblings > 0 ? indexInParent === totalSiblings - 1 : true;
    const hasSubsequentCallsInParent = totalSiblings > 0 ? indexInParent < totalSiblings - 1 : false;

    const currentFrame: FlattenedCallFrame = {
      id: frameId,
      depth,
      parentFrameId: parentId,
      type: frame.type || 'CALL',
      from: (frame.from || '').toLowerCase(),
      to: frame.to ? frame.to.toLowerCase() : null,
      value: frame.value || '0x0',
      gas: frame.gas || '0x0',
      gasUsed: frame.gasUsed || '0x0',
      input: frame.input || '0x',
      output: frame.output,
      error: rawError,
      revertReason: frame.revertReason,
      decodedRevert: decoded || undefined,
      propagatedToParent: false, // Evaluated in second pass
      isDeepestFailingFrame: false,
      causalityStatus: 'NO_FAILURE',
      orderIndex: indexInParent,
      isLastCallInParent,
      hasSubsequentCallsInParent,
      ancestorsReverted: false
    };

    flattened.push(currentFrame);

    if (Array.isArray(frame.calls)) {
      if (depth >= MAX_TRACE_DEPTH || flattened.length >= MAX_TRACE_FRAMES) {
        isTruncated = true;
      } else {
        const childCount = frame.calls.length;
        for (let idx = 0; idx < childCount; idx++) {
          if (flattened.length >= MAX_TRACE_FRAMES) {
            isTruncated = true;
            break;
          }
          traverse(frame.calls[idx], depth + 1, frameId, idx, childCount);
        }
      }
    }

    return frameId;
  }

  traverse(rawTree, 0, null, 0, 1);

  // Map for fast parent lookups
  const frameMap = new Map<string, FlattenedCallFrame>();
  for (const f of flattened) {
    frameMap.set(f.id, f);
  }

  // Helper to check if all ancestors continuously have an error indicator
  function checkAncestorsReverted(frame: FlattenedCallFrame): boolean {
    if (!frame.parentFrameId) return false;
    let curr = frameMap.get(frame.parentFrameId);
    while (curr) {
      const currError = Boolean(curr.error || curr.decodedRevert || curr.revertReason);
      if (!currError) return false;
      if (!curr.parentFrameId) return true; // Reached root and it had error
      curr = frameMap.get(curr.parentFrameId);
    }
    return false;
  }

  // Second pass: Evaluate Failure Propagation and Causality Status
  for (const frame of flattened) {
    const hasError = Boolean(frame.error || frame.decodedRevert || frame.revertReason);
    frame.ancestorsReverted = checkAncestorsReverted(frame);

    if (!hasError) {
      frame.causalityStatus = 'NO_FAILURE';
      frame.propagatedToParent = false;
      continue;
    }

    if (!frame.parentFrameId) {
      // Root frame with error
      frame.causalityStatus = 'OBSERVED_FAILURE';
      frame.propagatedToParent = true;
      continue;
    }

    // Child frame with error:
    if (!frame.ancestorsReverted) {
      // Parent or an ancestor did not revert -> failure was definitely handled/caught
      frame.causalityStatus = 'CAUGHT_CHILD_REVERT';
      frame.propagatedToParent = false;
      continue;
    }

    if (frame.hasSubsequentCallsInParent) {
      // Parent continued executing and made subsequent sub-calls after this child!
      // This proves parent caught this child's failure.
      frame.causalityStatus = 'CAUGHT_CHILD_REVERT';
      frame.propagatedToParent = false;
      continue;
    }

    // Terminal failing sub-call with ancestors that also reverted.
    // Check if multiple sibling branches failed or if parent has a distinct independent revert message:
    const parentSiblings = flattened.filter(
      (f) => f.parentFrameId === frame.parentFrameId && Boolean(f.error || f.revertReason)
    );
    const multipleFailingSiblings = parentSiblings.length > 1;

    const parent = frameMap.get(frame.parentFrameId);
    const parentReason = parent?.decodedRevert?.reason || parent?.revertReason;
    const childReason = frame.decodedRevert?.reason || frame.revertReason;

    // Distinct explicit messages between parent and child indicate parent may have reverted independently
    const reasonsDifferSignificantly = Boolean(
      parentReason &&
        childReason &&
        parentReason !== childReason &&
        parentReason !== 'execution reverted' &&
        childReason !== 'execution reverted'
    );

    if (multipleFailingSiblings || reasonsDifferSignificantly) {
      frame.causalityStatus = 'CAUSALITY_UNCERTAIN';
      frame.propagatedToParent = true;
    } else {
      frame.causalityStatus = 'PROPAGATION_SUPPORTED';
      frame.propagatedToParent = true;
    }
  }

  // Third pass: Identify the Deepest Failing Frame
  // Priority: deepest frame with PROPAGATION_SUPPORTED, then CAUSALITY_UNCERTAIN, then OBSERVED_FAILURE
  let deepestFailing: FlattenedCallFrame | null = null;
  const propagatingFrames = flattened.filter((f) => f.propagatedToParent && f.causalityStatus === 'PROPAGATION_SUPPORTED');

  if (propagatingFrames.length > 0) {
    for (const frame of propagatingFrames) {
      if (!deepestFailing || frame.depth >= deepestFailing.depth) {
        deepestFailing = frame;
      }
    }
  } else {
    const uncertainFrames = flattened.filter((f) => f.propagatedToParent && f.causalityStatus === 'CAUSALITY_UNCERTAIN');
    if (uncertainFrames.length > 0) {
      for (const frame of uncertainFrames) {
        if (!deepestFailing || frame.depth >= deepestFailing.depth) {
          deepestFailing = frame;
        }
      }
    } else {
      deepestFailing = flattened.find((f) => !f.parentFrameId && (f.error || f.revertReason)) || null;
    }
  }

  if (deepestFailing) {
    deepestFailing.isDeepestFailingFrame = true;
  }

  return {
    rawTree,
    flattenedFrames: flattened,
    totalFrames: flattened.length,
    maxDepth,
    deepestFailingFrame: deepestFailing,
    isTruncated
  };
}
