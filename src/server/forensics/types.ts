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

export type FrameCausalityStatus =
  | 'NO_FAILURE'
  | 'OBSERVED_FAILURE'
  | 'CAUGHT_CHILD_REVERT'
  | 'PROPAGATION_SUPPORTED'
  | 'CAUSALITY_UNCERTAIN';

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
  causalityStatus: FrameCausalityStatus;
  orderIndex: number;
  isLastCallInParent: boolean;
  hasSubsequentCallsInParent: boolean;
  ancestorsReverted: boolean;
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
  evidenceCitations: string[]; // E.g. ['E-01', 'E-03']
  provenFacts: string[];
  likelyExplanations: string[];
  unknowns: string[];
  safeNextSteps: string[];
  rootRevertReason?: string;
  nestedFailureReason?: string;
  causalityCategory?: FrameCausalityStatus;
}

export type QuoteStatus =
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

export interface BuyQuoteSummary {
  quoteId: string;
  investigationId?: string | null;
  capabilityId: string;
  status: QuoteStatus;
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
  approvalId?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
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
  aiExplanation?: AiExplanation | null;
  buyQuote?: BuyQuoteSummary | null;
  createdAt: string;
  completedAt: string;
}

export type PurchaseStatus =
  | 'EXECUTION_PENDING'
  | 'SETTLED'
  | 'SETTLEMENT_UNKNOWN'
  | 'FAILED'
  | 'CANCELLED';

export interface PurchaseAttemptRecord {
  id: string;
  quoteId: string;
  approvalId: string;
  investigationId?: string | null;
  capabilityId: string;
  url: string;
  bodySha256: string;
  tokenContract: string;
  amountAtomic: string;
  status: PurchaseStatus;
  txHash?: string | null;
  settlementTxHash?: string | null;
  payerAddress?: string | null;
  payeeAddress?: string | null;
  errorMessage?: string | null;
  rawStdoutRedacted?: string | null;
  rawStderrRedacted?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementProofRecord {
  id: string;
  purchaseAttemptId: string;
  quoteId: string;
  txHash: string;
  chainId: number;
  blockNumber?: number | null;
  tokenContract: string;
  payer: string;
  recipient: string;
  amountAtomic: string;
  receiptStatus: number;
  verifiedAt: string;
}

export interface BudgetReservationRecord {
  id: string;
  quoteId: string;
  investigationId?: string | null;
  amountAtomic: string;
  status: 'RESERVED' | 'COMMITTED' | 'RELEASED';
  reservedAt: string;
  settledAt?: string | null;
}

export interface PaymentAuditEvent {
  id?: number;
  entityType: 'QUOTE' | 'APPROVAL' | 'PURCHASE' | 'SETTLEMENT' | 'BUDGET' | 'KILL_SWITCH';
  entityId: string;
  fromStatus?: string | null;
  toStatus: string;
  operatorUsername?: string | null;
  details?: string | null;
  createdAt: string;
}

export interface DiscoveredCapability {
  id?: string;
  capabilityId: string;
  name: string;
  category: string;
  serviceUrl: string;
  method?: string;
  priceDisplay: string;
  tokenSymbol: string;
  recipient: string;
  supportedModels?: string[];
}

export interface BuyHealthStatus {
  ready: boolean;
  cliVersion: string;
  account: string;
  network: string;
  funded?: boolean;
  balances: Record<string, string>;
  killSwitchActive: boolean;
  timestamp: string;
}
