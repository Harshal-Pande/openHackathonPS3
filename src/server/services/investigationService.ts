import { randomUUID } from 'node:crypto';
import { ChainstackProvider } from '../providers/chainstack.js';
import { Database } from '../db/database.js';
import { InvestigationReport, DecodedRevert } from '../forensics/types.js';
import { parseCallTrace, ParsedTraceResult } from '../forensics/traceParser.js';
import { decodeRevertData } from '../forensics/revertDecoder.js';
import { buildEvidenceLedger } from '../forensics/evidenceBuilder.js';
import { generateDeterministicExplanation } from '../forensics/explanationEngine.js';

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export class InvestigationService {
  constructor(
    private provider: ChainstackProvider,
    private db: Database
  ) {}

  public async investigate(txHash: string): Promise<InvestigationReport> {
    const trimmed = txHash.trim();
    if (!TX_HASH_REGEX.test(trimmed)) {
      throw new Error('Invalid transaction hash format. Must be a 0x-prefixed 64-character hexadecimal string.');
    }

    const cleanHash = trimmed.toLowerCase();
    const now = new Date().toISOString();

    // Check if endpoint is configured
    if (!this.provider.isConfigured()) {
      throw new Error(
        'Chainstack Celo RPC endpoint is not configured. Set CHAINSTACK_CELO_MAINNET_RPC_URL in your local .env file.'
      );
    }

    // 1. Verify Celo Mainnet chain ID
    const chainId = await this.provider.getChainId();

    // 2. Fetch Transaction
    const tx = await this.provider.getTransaction(cleanHash);
    if (!tx) {
      throw new Error(`Transaction ${cleanHash} not found on Celo Mainnet.`);
    }

    // 3. Fetch Receipt
    const receipt = await this.provider.getTransactionReceipt(cleanHash);

    // 4. Fetch Trace if failed
    let parsedTrace: ParsedTraceResult | null = null;
    let traceStatus: InvestigationReport['traceStatus'] = 'NOT_REQUESTED';

    if (receipt && receipt.status === 'REVERTED') {
      try {
        const rawTrace = await this.provider.getCallTrace(cleanHash);
        if (rawTrace) {
          parsedTrace = parseCallTrace(rawTrace);
          traceStatus = 'AVAILABLE';
        } else {
          traceStatus = 'UNSUPPORTED';
        }
      } catch {
        traceStatus = 'UNSUPPORTED';
      }
    }

    // 5. Decode Revert Data
    let decodedRevert: DecodedRevert | null = null;
    if (parsedTrace?.deepestFailingFrame?.decodedRevert) {
      decodedRevert = parsedTrace.deepestFailingFrame.decodedRevert;
    } else if (parsedTrace?.rawTree?.error || parsedTrace?.rawTree?.revertReason) {
      decodedRevert = decodeRevertData(
        parsedTrace.rawTree.output,
        parsedTrace.rawTree.error || parsedTrace.rawTree.revertReason
      );
    }

    // 6. Build Evidence Ledger
    const evidenceLedger = buildEvidenceLedger(tx, receipt, parsedTrace, decodedRevert);

    // 7. Classify & Generate Explanation
    const explanation = generateDeterministicExplanation(tx, receipt, parsedTrace, decodedRevert, evidenceLedger);

    const investigationId = randomUUID();
    const status: InvestigationReport['status'] = receipt ? receipt.status : 'NOT_FOUND';

    const report: InvestigationReport = {
      investigationId,
      txHash: cleanHash,
      chainId,
      status,
      traceStatus,
      transaction: tx,
      receipt,
      executionTrace: parsedTrace
        ? {
            rawTree: parsedTrace.rawTree,
            flattenedFrames: parsedTrace.flattenedFrames,
            totalFrames: parsedTrace.totalFrames,
            maxDepth: parsedTrace.maxDepth,
            deepestFailingFrame: parsedTrace.deepestFailingFrame
          }
        : null,
      decodedRevert,
      evidenceLedger,
      diagnosis: explanation.diagnosis,
      limitations: explanation.limitations,
      createdAt: now,
      completedAt: new Date().toISOString()
    };

    // 8. Persist in SQLite
    this.db.saveInvestigation({
      id: investigationId,
      tx_hash: cleanHash,
      chain_id: chainId,
      status,
      trace_status: traceStatus,
      raw_tx: JSON.stringify(tx),
      raw_receipt: JSON.stringify(receipt),
      normalized_trace: parsedTrace ? JSON.stringify(parsedTrace.flattenedFrames) : null,
      diagnosis: JSON.stringify(explanation.diagnosis),
      limitations: JSON.stringify(explanation.limitations),
      created_at: now,
      updated_at: now
    });

    this.db.saveEvidenceItems(
      evidenceLedger.map((e) => ({
        id: randomUUID(),
        investigation_id: investigationId,
        evidence_id: e.id,
        kind: e.kind,
        source_method: e.sourceMethod,
        value: JSON.stringify(e.value),
        content_hash: e.contentHash,
        created_at: e.observedAt
      }))
    );

    return report;
  }

  public getInvestigation(id: string): InvestigationReport | null {
    const row = this.db.getInvestigation(id);
    if (!row) return null;

    const evidenceRows = this.db.getEvidenceByInvestigationId(id);
    const evidenceLedger = evidenceRows.map((e) => ({
      id: e.evidence_id,
      kind: e.kind as any,
      sourceMethod: e.source_method,
      description: e.kind.replace(/_/g, ' '),
      value: JSON.parse(e.value),
      contentHash: e.content_hash,
      observedAt: e.created_at
    }));

    const tx = row.raw_tx ? JSON.parse(row.raw_tx) : null;
    const receipt = row.raw_receipt ? JSON.parse(row.raw_receipt) : null;
    const flattenedFrames = row.normalized_trace ? JSON.parse(row.normalized_trace) : [];
    const diagnosis = row.diagnosis ? JSON.parse(row.diagnosis) : null;
    const limitations = row.limitations ? JSON.parse(row.limitations) : [];

    return {
      investigationId: row.id,
      txHash: row.tx_hash,
      chainId: row.chain_id,
      status: row.status as any,
      traceStatus: row.trace_status as any,
      transaction: tx,
      receipt,
      executionTrace: flattenedFrames.length > 0
        ? {
            rawTree: null,
            flattenedFrames,
            totalFrames: flattenedFrames.length,
            maxDepth: Math.max(...flattenedFrames.map((f: any) => f.depth || 0)),
            deepestFailingFrame: flattenedFrames.find((f: any) => f.isDeepestFailingFrame) || null
          }
        : null,
      decodedRevert: null,
      evidenceLedger,
      diagnosis,
      limitations,
      createdAt: row.created_at,
      completedAt: row.updated_at
    };
  }

  public listRecent(limit: number = 20): Array<{ id: string; txHash: string; status: string; createdAt: string }> {
    const rows = this.db.listInvestigations(limit);
    return rows.map((r) => ({
      id: r.id,
      txHash: r.tx_hash,
      status: r.status,
      createdAt: r.created_at
    }));
  }
}
