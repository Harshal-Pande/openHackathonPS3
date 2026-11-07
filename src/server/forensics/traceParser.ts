import { RawCallFrame } from '../providers/chainstack.js';
import { FlattenedCallFrame } from './types.js';
import { decodeRevertData } from './revertDecoder.js';

export interface ParsedTraceResult {
  rawTree: RawCallFrame;
  flattenedFrames: FlattenedCallFrame[];
  totalFrames: number;
  maxDepth: number;
  deepestFailingFrame: FlattenedCallFrame | null;
}

export function parseCallTrace(rawTree: RawCallFrame): ParsedTraceResult {
  const flattened: FlattenedCallFrame[] = [];
  let maxDepth = 0;

  function traverse(frame: RawCallFrame, depth: number, parentId: string | null, indexInParent: number): string {
    const frameId = parentId ? `${parentId}.${indexInParent}` : '0';
    if (depth > maxDepth) maxDepth = depth;

    const rawError = frame.error || frame.revertReason;
    const revertBytes = frame.output && frame.output.startsWith('0x') && frame.output.length >= 10 ? frame.output : undefined;
    const decoded = decodeRevertData(revertBytes, rawError);

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
      propagatedToParent: false, // Calculated in second pass
      isDeepestFailingFrame: false
    };

    flattened.push(currentFrame);

    if (Array.isArray(frame.calls)) {
      frame.calls.forEach((child, idx) => {
        traverse(child, depth + 1, frameId, idx);
      });
    }

    return frameId;
  }

  traverse(rawTree, 0, null, 0);

  // Map for fast parent lookups
  const frameMap = new Map<string, FlattenedCallFrame>();
  for (const f of flattened) {
    frameMap.set(f.id, f);
  }

  // Second pass: Evaluate Failure Propagation
  // A frame error propagated to parent if parent also has an error or is the top-level reverted tx
  for (const frame of flattened) {
    const hasError = Boolean(frame.error || frame.decodedRevert || frame.revertReason);
    if (!hasError) {
      frame.propagatedToParent = false;
      continue;
    }

    if (!frame.parentFrameId) {
      // Root frame with error is the root revert
      frame.propagatedToParent = true;
      continue;
    }

    const parent = frameMap.get(frame.parentFrameId);
    if (parent && Boolean(parent.error || parent.decodedRevert || parent.revertReason)) {
      frame.propagatedToParent = true;
    } else {
      // Parent did not fail; parent handled or caught child error
      frame.propagatedToParent = false;
    }
  }

  // Third pass: Identify the Deepest Failing Frame along the propagated path
  let deepestFailing: FlattenedCallFrame | null = null;
  for (const frame of flattened) {
    const hasError = Boolean(frame.error || frame.decodedRevert || frame.revertReason);
    if (hasError && frame.propagatedToParent) {
      if (!deepestFailing || frame.depth >= deepestFailing.depth) {
        deepestFailing = frame;
      }
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
    deepestFailingFrame: deepestFailing
  };
}
