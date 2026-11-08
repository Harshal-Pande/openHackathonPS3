// lib/causality.ts — Frame causality label and meaning sentences
import type { FrameCausalityStatus } from './types.js';

export interface CausalityInfo {
  label: string;
  meaning: string;
  tone: 'fail' | 'warn' | 'ok' | 'info' | 'neutral';
}

export const CAUSALITY_MAP: Record<FrameCausalityStatus, CausalityInfo> = {
  NO_FAILURE: {
    label: 'No failure',
    meaning: 'This call completed without an error.',
    tone: 'neutral',
  },
  OBSERVED_FAILURE: {
    label: 'Failed (top level)',
    meaning: 'The top-level call failed. No nested call is proven to be the cause.',
    tone: 'fail',
  },
  CAUGHT_CHILD_REVERT: {
    label: 'Reverted · caught',
    meaning: 'This call failed, but a parent handled it and continued (or an ancestor did not fail). It did not cause the top-level failure.',
    tone: 'info',
  },
  PROPAGATION_SUPPORTED: {
    label: 'Failure propagated',
    meaning: 'This call failed and every ancestor up to the root also failed with no later calls in the parent. The trace supports that this failure propagated to the top level.',
    tone: 'fail',
  },
  CAUSALITY_UNCERTAIN: {
    label: 'Cause uncertain',
    meaning: 'This call failed, but the trace cannot prove it caused the top-level failure (multiple failing branches or a different parent reason).',
    tone: 'warn',
  },
};

export function getCausalityInfo(status: FrameCausalityStatus | string | undefined): CausalityInfo {
  if (status && status in CAUSALITY_MAP) {
    return CAUSALITY_MAP[status as FrameCausalityStatus];
  }
  return { label: 'Unknown', meaning: 'Causality status not available.', tone: 'neutral' };
}

export const CAUSALITY_LEGEND: Array<{ status: FrameCausalityStatus; info: CausalityInfo }> = [
  { status: 'NO_FAILURE', info: CAUSALITY_MAP['NO_FAILURE'] },
  { status: 'OBSERVED_FAILURE', info: CAUSALITY_MAP['OBSERVED_FAILURE'] },
  { status: 'CAUGHT_CHILD_REVERT', info: CAUSALITY_MAP['CAUGHT_CHILD_REVERT'] },
  { status: 'PROPAGATION_SUPPORTED', info: CAUSALITY_MAP['PROPAGATION_SUPPORTED'] },
  { status: 'CAUSALITY_UNCERTAIN', info: CAUSALITY_MAP['CAUSALITY_UNCERTAIN'] },
];
