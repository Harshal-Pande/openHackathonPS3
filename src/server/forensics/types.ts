import { NormalizedTransaction, NormalizedReceipt, RawCallFrame } from '../providers/chainstack.js';

export interface EvidenceItem {
  id: string; // E.g., 'E-01', 'E-02'
  kind: 'TRANSACTION_FACT' | 'RECEIPT_FACT' | 'TRACE_FRAME' | 'REVERT_DATA' | 'FAILURE_PROPAGATION';
  sourceMethod: string;
  description: string;
  value: Record<string, unknown>;
  contentHash: string;
  observedAt: string;
}

export interface DecodedRevert {
  type: 'ERROR_STRING' | 'PANIC' | 'CUSTOM_ERROR' | 'UNKNOWN';
  selector?: string;
  reason?: string;
  panicCode?: number;
  panicExplanation?: string;
  rawBytes?: string;
}

export interface FlattenedCallFrame {
  id: string;
  depth: number;
  parentFrameId: string | null;
  type: string;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasUsed: string;
  input: string;
  output?: string;
  error?: string;
  revertReason?: string;
  decodedRevert?: DecodedRevert;
  propagatedToParent: boolean;
  isDeepestFailingFrame: boolean;
}

export interface FailureDiagnosis {
  category:
    | 'EXPLICIT_REVERT'
    | 'PANIC'
    | 'OUT_OF_GAS'
    | 'PROPAGATED_CHILD_REVERT'
    | 'CAUGHT_CHILD_REVERT'
    | 'UNSUPPORTED_OR_MISSING_TRACE'
    | 'UNKNOWN_REVERT'
    | 'PENDING_TRANSACTION'
    | 'SUCCESSFUL_TRANSACTION'
    | 'UNCONFIRMED_RECEIPT'
    | 'UNKNOWN_STATUS';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  headline: string;
  narrative: string;
  evidenceCitations: string[]; // E.g. ['E-01', 'E-03']
  provenFacts: string[];
  likelyExplanations: string[];
  unknowns: string[];
  safeNextSteps: string[];
}

export interface InvestigationReport {
  investigationId: string;
  txHash: string;
  chainId: number;
  status: 'SUCCESS' | 'REVERTED' | 'PENDING' | 'NOT_FOUND' | 'UNKNOWN';
  traceStatus:
    | 'AVAILABLE'
    | 'UNSUPPORTED'
    | 'RATE_LIMITED'
    | 'TIMEOUT'
    | 'PROVIDER_ERROR'
    | 'INVALID_RESPONSE'
    | 'NOT_REQUESTED';
  transaction: NormalizedTransaction | null;
  receipt: NormalizedReceipt | null;
  executionTrace: {
    rawTree: RawCallFrame | null;
    flattenedFrames: FlattenedCallFrame[];
    totalFrames: number;
    maxDepth: number;
    deepestFailingFrame: FlattenedCallFrame | null;
  } | null;
  decodedRevert: DecodedRevert | null;
  evidenceLedger: EvidenceItem[];
  diagnosis: FailureDiagnosis;
  limitations: string[];
  createdAt: string;
  completedAt: string;
}
