// lib/status.ts — Tone/label/icon maps for status values
import type { TransactionStatus, TraceStatus, FrameCausalityStatus } from './types.js';

export type Tone = 'fail' | 'warn' | 'ok' | 'info' | 'neutral';

export function txStatusTone(status: TransactionStatus | string): Tone {
  switch (status) {
    case 'REVERTED': return 'fail';
    case 'SUCCESS': return 'ok';
    case 'PENDING': return 'warn';
    default: return 'neutral';
  }
}

export function txStatusLabel(status: TransactionStatus | string): string {
  switch (status) {
    case 'REVERTED': return 'Reverted';
    case 'SUCCESS': return 'Succeeded';
    case 'PENDING': return 'Pending';
    case 'NOT_FOUND': return 'Not found';
    default: return 'Unknown';
  }
}

export function traceStatusTone(status: TraceStatus | string): Tone {
  switch (status) {
    case 'AVAILABLE': return 'ok';
    case 'UNSUPPORTED': return 'info';
    case 'RATE_LIMITED':
    case 'TIMEOUT': return 'warn';
    case 'PROVIDER_ERROR':
    case 'INVALID_RESPONSE': return 'fail';
    default: return 'neutral';
  }
}

export function traceStatusLabel(status: TraceStatus | string): string {
  switch (status) {
    case 'AVAILABLE': return 'Trace available';
    case 'UNSUPPORTED': return 'Trace unsupported';
    case 'RATE_LIMITED': return 'Rate limited';
    case 'TIMEOUT': return 'Trace timeout';
    case 'PROVIDER_ERROR': return 'Provider error';
    case 'INVALID_RESPONSE': return 'Invalid response';
    case 'NOT_REQUESTED': return 'Not requested';
    default: return status;
  }
}

export function causalityTone(status: FrameCausalityStatus | string | undefined): Tone {
  switch (status) {
    case 'OBSERVED_FAILURE': return 'fail';
    case 'PROPAGATION_SUPPORTED': return 'fail';
    case 'CAUGHT_CHILD_REVERT': return 'info';
    case 'CAUSALITY_UNCERTAIN': return 'warn';
    case 'NO_FAILURE': return 'neutral';
    default: return 'neutral';
  }
}

export function causalityLabel(status: FrameCausalityStatus | string | undefined): string {
  switch (status) {
    case 'NO_FAILURE': return 'No failure';
    case 'OBSERVED_FAILURE': return 'Failed (top level)';
    case 'CAUGHT_CHILD_REVERT': return 'Reverted · caught';
    case 'PROPAGATION_SUPPORTED': return 'Failure propagated';
    case 'CAUSALITY_UNCERTAIN': return 'Cause uncertain';
    default: return 'Unknown';
  }
}

export function quoteStatusTone(status: string): Tone {
  switch (status) {
    case 'SETTLED': return 'ok';
    case 'APPROVED': return 'info';
    case 'AWAITING_OPERATOR_APPROVAL': return 'warn';
    case 'SETTLEMENT_UNKNOWN': return 'warn';
    case 'FAILED':
    case 'EXPIRED':
    case 'CANCELLED':
    case 'QUOTE_INVALID': return 'fail';
    default: return 'neutral';
  }
}

export function aiStatusTone(status: string | undefined): Tone {
  switch (status) {
    case 'SUCCESS': return 'ok';
    case 'AWAITING_APPROVAL': return 'warn';
    case 'UNAVAILABLE':
    case 'ERROR': return 'warn';
    case 'VALIDATION_FAILED': return 'fail';
    default: return 'neutral';
  }
}

export function diagnosisTone(txStatus: TransactionStatus | string): Tone {
  switch (txStatus) {
    case 'REVERTED': return 'fail';
    case 'SUCCESS': return 'ok';
    case 'PENDING': return 'warn';
    default: return 'neutral';
  }
}
