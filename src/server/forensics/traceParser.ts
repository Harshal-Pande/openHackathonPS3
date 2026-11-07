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
    const revertBytes = rawError && frame.output && frame.output.startsWith('0x') && frame.output.length >= 10 ? frame.output : undefined;
    const decoded = rawError ? decodeRevertData(revertBytes, rawError) : undefined;

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

  // Helper to check if error propagates continuously all the way up to the root frame
  function propagatesToRoot(frame: FlattenedCallFrame): boolean {
    const hasError = Boolean(frame.error || frame.decodedRevert || frame.revertReason);
    if (!hasError) return false;
    let curr: FlattenedCallFrame | undefined = frame;
    while (curr) {
      const currError = Boolean(curr.error || curr.decodedRevert || curr.revertReason);
      if (!currError) return false;
      if (!curr.parentFrameId) return true; // Reached root and root also has error
      curr = frameMap.get(curr.parentFrameId);
    }
    return false;
  }

  // Second pass: Evaluate Failure Propagation
  for (const frame of flattened) {
    frame.propagatedToParent = propagatesToRoot(frame);
  }

  // Third pass: Identify the Deepest Failing Frame along the continuous propagated path
  let deepestFailing: FlattenedCallFrame | null = null;
  for (const frame of flattened) {
    if (frame.propagatedToParent) {
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
