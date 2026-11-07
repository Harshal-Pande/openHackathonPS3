import { NormalizedTransaction, NormalizedReceipt } from '../providers/chainstack.js';
import { FailureDiagnosis, DecodedRevert, EvidenceItem } from './types.js';
import { ParsedTraceResult } from './traceParser.js';
import { classifyFailure } from './classifier.js';

export interface FormattedExplanation {
  diagnosis: FailureDiagnosis;
  summaryParagraph: string;
  annotatedFacts: string[];
  limitations: string[];
}

export function generateDeterministicExplanation(
  tx: NormalizedTransaction | null,
  receipt: NormalizedReceipt | null,
  trace: ParsedTraceResult | null,
  revert: DecodedRevert | null,
  evidenceLedger: EvidenceItem[]
): FormattedExplanation {
  const diagnosis = classifyFailure(tx, receipt, trace, revert, evidenceLedger);

  // Link facts directly to Evidence IDs
  const txFactId = evidenceLedger.find((e) => e.kind === 'TRANSACTION_FACT')?.id || 'E-01';
  const receiptFactId = evidenceLedger.find((e) => e.kind === 'RECEIPT_FACT')?.id || 'E-02';
  const revertFactId = evidenceLedger.find((e) => e.kind === 'REVERT_DATA')?.id;
  const propagationFactId = evidenceLedger.find((e) => e.kind === 'FAILURE_PROPAGATION')?.id;

  const annotatedFacts: string[] = [];

  if (tx) {
    annotatedFacts.push(`[${txFactId}] Sender ${tx.from} submitted transaction to ${tx.to || 'contract creation'} with gas limit ${tx.gas}.`);
  }

  if (receipt) {
    annotatedFacts.push(`[${receiptFactId}] Transaction mined in block ${receipt.blockNumber} with execution status ${receipt.status} (consumed ${receipt.gasUsed} gas).`);
  }

  if (revert && revertFactId) {
    if (revert.type === 'ERROR_STRING') {
      annotatedFacts.push(`[${revertFactId}] Execution reverted with explicit message: "${revert.reason}".`);
    } else if (revert.type === 'PANIC') {
      annotatedFacts.push(`[${revertFactId}] Execution reverted with Solidity Panic: ${revert.panicExplanation} (code 0x${revert.panicCode?.toString(16)}).`);
    } else if (revert.type === 'CUSTOM_ERROR') {
      annotatedFacts.push(`[${revertFactId}] Execution reverted with custom error selector ${revert.selector}.`);
    }
  }

  if (trace && propagationFactId && trace.deepestFailingFrame) {
    annotatedFacts.push(`[${propagationFactId}] Deepest failing call frame: ${trace.deepestFailingFrame.type} call to ${trace.deepestFailingFrame.to} at depth ${trace.deepestFailingFrame.depth} failed and propagated.`);
  }

  const limitations: string[] = [
    'Forensic claims are bounded strictly by observed on-chain receipts and JSON-RPC trace data.',
    'RevertLens does not execute smart-contract bytecode decompilation or simulate unmined states.',
    'Off-chain oracle values and private mempool conditions at the moment of mining remain unknown.'
  ];

  if (!trace) {
    limitations.push('Detailed internal call tree was not provided by the RPC node; nested contract calls could not be evaluated.');
  }

  const summaryParagraph = `${diagnosis.headline} — ${diagnosis.narrative} Every claim is backed by atomic evidence records in the evidence ledger.`;

  return {
    diagnosis,
    summaryParagraph,
    annotatedFacts,
    limitations
  };
}
