// lib/types.ts — All shared types for RevertLens client
// Moved verbatim from App.tsx; re-exported from App.tsx for compatibility.

export type TransactionStatus = 'SUCCESS' | 'REVERTED' | 'PENDING' | 'NOT_FOUND' | 'UNKNOWN';

export type TraceStatus =
  | 'AVAILABLE'
  | 'UNSUPPORTED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'NOT_REQUESTED';

export type FrameCausalityStatus =
  | 'NO_FAILURE'
  | 'OBSERVED_FAILURE'
  | 'CAUGHT_CHILD_REVERT'
  | 'PROPAGATION_SUPPORTED'
  | 'CAUSALITY_UNCERTAIN';

export interface EvidenceItem {
  id: string;
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
  causalityStatus?: FrameCausalityStatus;
  orderIndex?: number;
  isLastCallInParent?: boolean;
  hasSubsequentCallsInParent?: boolean;
  ancestorsReverted?: boolean;
}

export interface FailureDiagnosis {
  category:
    | 'EXPLICIT_REVERT'
    | 'PANIC'
    | 'OUT_OF_GAS'
    | 'PROPAGATED_CHILD_REVERT'
    | 'CAUGHT_CHILD_REVERT'
    | 'CAUSALITY_UNCERTAIN'
    | 'UNSUPPORTED_OR_MISSING_TRACE'
    | 'UNKNOWN_REVERT'
    | 'PENDING_TRANSACTION'
    | 'SUCCESSFUL_TRANSACTION'
    | 'UNCONFIRMED_RECEIPT'
    | 'UNKNOWN_STATUS';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  headline: string;
  narrative: string;
  evidenceCitations: string[];
  provenFacts: string[];
  likelyExplanations: string[];
  unknowns: string[];
  safeNextSteps: string[];
  rootRevertReason?: string;
  nestedFailureReason?: string;
  causalityCategory?: FrameCausalityStatus;
}

export interface AiExplanation {
  status: 'DISABLED' | 'UNAVAILABLE' | 'AWAITING_APPROVAL' | 'SUCCESS' | 'VALIDATION_FAILED' | 'ERROR';
  provider: 'cencori';
  model?: string;
  summary?: string;
  technicalExplanation?: string;
  provenFacts?: string[];
  likelyExplanations?: string[];
  unknowns?: string[];
  safeNextSteps?: string[];
  evidenceReferences?: string[];
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  limitations?: string[];
  validationErrors?: string[];
  rawResponseHash?: string;
  generatedAt?: string;
}

export interface BuyQuoteSummary {
  quoteId: string;
  capabilityId: string;
  status:
    | 'QUOTE_REQUESTED'
    | 'QUOTE_RECEIVED'
    | 'QUOTE_INVALID'
    | 'AWAITING_OPERATOR_APPROVAL'
    | 'APPROVED'
    | 'EXECUTION_PENDING'
    | 'SETTLEMENT_UNKNOWN'
    | 'SETTLED'
    | 'FAILED'
    | 'EXPIRED'
    | 'CANCELLED';
  url: string;
  method: string;
  bodySha256: string;
  tokenSymbol: string;
  tokenContract: string;
  amountAtomic: string;
  amountDisplay: string;
  recipient: string;
  chainId: number;
  expiry?: string | null;
  reason?: string | null;
}

export interface InvestigationReport {
  investigationId: string;
  txHash: string;
  chainId: number;
  status: TransactionStatus;
  traceStatus: TraceStatus;
  transaction: {
    hash: string;
    blockNumber: number | null;
    transactionIndex: number | null;
    from: string;
    to: string | null;
    value: string;
    gas: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    input: string;
    nonce: number;
    isPending: boolean;
  } | null;
  receipt: {
    transactionHash: string;
    blockNumber: number | null;
    status: 'SUCCESS' | 'REVERTED' | 'UNKNOWN';
    rawStatus: number | null;
    gasUsed: string;
    effectiveGasPrice?: string;
    contractAddress?: string | null;
    logsCount: number;
  } | null;
  executionTrace: {
    rawTree: Record<string, unknown> | null;
    flattenedFrames: FlattenedCallFrame[];
    totalFrames: number;
    maxDepth: number;
    deepestFailingFrame: FlattenedCallFrame | null;
  } | null;
  decodedRevert: DecodedRevert | null;
  evidenceLedger: EvidenceItem[];
  diagnosis: FailureDiagnosis;
  limitations: string[];
  aiExplanation?: AiExplanation | null;
  buyQuote?: BuyQuoteSummary | null;
  createdAt: string;
  completedAt: string;
}

export interface ApiEnvelope<T> {
  data: T;
  error?: null;
  requestId: string;
}

export interface ApiError {
  code: string;
  message: string;
  status?: number;
  requestId?: string;
}

export class AppError extends Error {
  code: string;
  status: number;
  requestId?: string;

  constructor(code: string, message: string, status = 500, requestId?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export type RecentInvestigation = {
  id: string;
  txHash: string;
  status: string;
  createdAt: string;
};

export type RecentInvestigationItem = RecentInvestigation;

export interface OperatorQuote {
  id: string;
  quoteId: string;
  capabilityId: string;
  status: string;
  amountDisplay: string;
  amountAtomic: string;
  tokenSymbol: string;
  tokenContract: string;
  recipient: string;
  url: string;
  method: string;
  bodySha256: string;
  chainId: number;
  expiry?: string | null;
  createdAt: string;
  updatedAt: string;
  paidExecutionTriggered?: boolean;
}

export interface HealthResponse {
  status: string;
  version: string;
  chainId: number;
  featureFlags: {
    buyEnabled: boolean;
    cencoriEnabled: boolean;
    chainstackConfigured: boolean;
  };
  buyReady: boolean;
  rpcConfigured?: boolean;
}

export interface AgentMetadata {
  name: string;
  network: string;
  chainId: number;
  walletAddress: string;
  attributionTag: string;
  endpoints: Record<string, string>;
}
