import crypto from 'node:crypto';
import { NormalizedTransaction, NormalizedReceipt } from '../providers/chainstack.js';
import { EvidenceItem, DecodedRevert } from './types.js';
import { ParsedTraceResult } from './traceParser.js';

/**
 * Builds the deterministic forensic evidence ledger for a transaction investigation.
 *
 * EVIDENCE INTEGRITY SPECIFICATION:
 * Each evidence item includes a `contentHash` computed as a SHA-256 digest over the canonical
 * JSON-serialized representation of the observed evidence payload (`value`).
 *
 * IMPORTANT CAVEATS & SCOPE OF GUARANTEE:
 * 1. Content-Integrity Checksum: The `contentHash` validates that the in-memory or persisted
 *    evidence representation matches what was observed and parsed by RevertLens at ingestion time.
 * 2. No RPC Honesty Guarantee: The hash does NOT prove that the upstream RPC provider (e.g. Chainstack)
 *    behaved honestly, returned untampered state, or was free from node-level bugs.
 * 3. No On-Chain Anchoring: The hash is an internal integrity check; it is NOT anchored on-chain
 *    or notarized by a blockchain timestamping service.
 * 4. No Database Immutability Guarantee: While SQLite stores these items durably, local database
 *    storage does not prevent tampering by an operator with direct write access to the SQLite file.
 */
export function buildEvidenceLedger(
  tx: NormalizedTransaction | null,
  receipt: NormalizedReceipt | null,
  trace: ParsedTraceResult | null,
  decodedRevert: DecodedRevert | null
): EvidenceItem[] {
  const ledger: EvidenceItem[] = [];
  const now = new Date().toISOString();
  let count = 1;

  function addEvidence(
    kind: EvidenceItem['kind'],
    sourceMethod: string,
    description: string,
    value: Record<string, unknown>
  ): string {
    const evidenceId = `E-${String(count).padStart(2, '0')}`;
    count++;

    const serialized = JSON.stringify(value);
    const contentHash = crypto.createHash('sha256').update(serialized).digest('hex');

    ledger.push({
      id: evidenceId,
      kind,
      sourceMethod,
      description,
      value,
      contentHash,
      observedAt: now
    });

    return evidenceId;
  }

  // 1. Transaction Facts
  if (tx) {
    addEvidence('TRANSACTION_FACT', 'eth_getTransactionByHash', 'Transaction Submission & Sender Details', {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      gasLimit: tx.gas,
      nonce: tx.nonce,
      blockNumber: tx.blockNumber,
      isPending: tx.isPending
    });
  }

  // 2. Receipt Facts
  if (receipt) {
    addEvidence('RECEIPT_FACT', 'eth_getTransactionReceipt', 'Transaction Execution Status & Gas Consumption', {
      status: receipt.status,
      rawStatus: receipt.rawStatus,
      gasUsed: receipt.gasUsed,
      logsCount: receipt.logsCount,
      blockNumber: receipt.blockNumber
    });
  }

  // 3. Decoded Revert Data
  if (decodedRevert) {
    addEvidence('REVERT_DATA', 'debug_traceTransaction / eth_call', 'Decoded Revert Reason or Panic Error', {
      type: decodedRevert.type,
      selector: decodedRevert.selector,
      reason: decodedRevert.reason,
      panicCode: decodedRevert.panicCode,
      panicExplanation: decodedRevert.panicExplanation
    });
  }

  // 4. Trace Frames & Propagation Evidence
  if (trace) {
    addEvidence('TRACE_FRAME', 'debug_traceTransaction (callTracer)', 'Execution Call Tree Summary', {
      totalFrames: trace.totalFrames,
      maxDepth: trace.maxDepth,
      hasFailure: Boolean(trace.deepestFailingFrame)
    });

    if (trace.deepestFailingFrame) {
      addEvidence('FAILURE_PROPAGATION', 'debug_traceTransaction (callTracer)', 'Deepest Propagated Failing Call Frame', {
        frameId: trace.deepestFailingFrame.id,
        depth: trace.deepestFailingFrame.depth,
        type: trace.deepestFailingFrame.type,
        from: trace.deepestFailingFrame.from,
        to: trace.deepestFailingFrame.to,
        gasUsed: trace.deepestFailingFrame.gasUsed,
        error: trace.deepestFailingFrame.error,
        revertReason: trace.deepestFailingFrame.revertReason,
        propagatedToParent: trace.deepestFailingFrame.propagatedToParent
      });
    }
  }

  return ledger;
}
