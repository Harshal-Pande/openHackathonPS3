import { randomUUID } from 'node:crypto';
import { ChainstackProvider, ChainstackProviderError } from '../providers/chainstack.js';
import { Database } from '../db/database.js';
import { InvestigationReport, DecodedRevert, AiExplanation, BuyQuoteSummary } from '../forensics/types.js';
import { parseCallTrace, ParsedTraceResult } from '../forensics/traceParser.js';
import { decodeRevertData } from '../forensics/revertDecoder.js';
import { buildEvidenceLedger } from '../forensics/evidenceBuilder.js';
import { generateDeterministicExplanation } from '../forensics/explanationEngine.js';
import { AiExplanationService } from './aiExplanationService.js';

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export class InvestigationServiceError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INVESTIGATION_ERROR') {
    super(message);
    this.name = 'InvestigationServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class InvestigationService {
  constructor(
    private provider: ChainstackProvider,
    private db: Database,
    private aiExplanationService?: AiExplanationService
  ) {}

  public async investigate(txHash: string): Promise<InvestigationReport> {
    const trimmed = txHash.trim();
    if (!TX_HASH_REGEX.test(trimmed)) {
      throw new InvestigationServiceError(
        'Invalid transaction hash format. Must be a 0x-prefixed 64-character hexadecimal string.',
        400,
        'INVALID_INPUT'
      );
    }

    const cleanHash = trimmed.toLowerCase();
    const now = new Date().toISOString();

    // Check if endpoint is configured
    if (!this.provider.isConfigured()) {
      throw new InvestigationServiceError(
        'Chainstack Celo RPC endpoint is not configured. Set CHAINSTACK_CELO_MAINNET_RPC_URL in your local .env file.',
        503,
        'ENDPOINT_NOT_CONFIGURED'
      );
    }

    // 1. Verify Celo Mainnet chain ID
    let chainId: number;
    try {
      chainId = await this.provider.getChainId();
    } catch (err: unknown) {
      if (err instanceof ChainstackProviderError) {
        throw new InvestigationServiceError(err.message, err.statusCode || 502, err.code);
      }
      throw new InvestigationServiceError((err as Error).message, 502, 'PROVIDER_UNAVAILABLE');
    }

    // 2. Fetch Transaction
    let tx;
    try {
      tx = await this.provider.getTransaction(cleanHash);
    } catch (err: unknown) {
      if (err instanceof ChainstackProviderError) {
        throw new InvestigationServiceError(err.message, err.statusCode || 502, err.code);
      }
      throw new InvestigationServiceError((err as Error).message, 502, 'PROVIDER_UNAVAILABLE');
    }

    if (!tx) {
      throw new InvestigationServiceError(
        `Transaction ${cleanHash} not found on Celo Mainnet. Verify the hash or check if it was re-orged.`,
        404,
        'TRANSACTION_NOT_FOUND'
      );
    }

    // 3. Fetch Receipt
    let receipt = null;
    if (!tx.isPending) {
      try {
        receipt = await this.provider.getTransactionReceipt(cleanHash);
      } catch (err: unknown) {
        if (err instanceof ChainstackProviderError) {
          throw new InvestigationServiceError(err.message, err.statusCode || 502, err.code);
        }
        throw new InvestigationServiceError((err as Error).message, 502, 'PROVIDER_UNAVAILABLE');
      }
    }

    // 4. Fetch Trace if reverted
    let parsedTrace: ParsedTraceResult | null = null;
    let traceStatus: InvestigationReport['traceStatus'] = 'NOT_REQUESTED';
    let traceErrorMsg: string | null = null;

    if (receipt && receipt.status === 'REVERTED') {
      try {
        const rawTrace = await this.provider.getCallTrace(cleanHash);
        if (rawTrace && typeof rawTrace === 'object' && ('type' in rawTrace || 'calls' in rawTrace || 'error' in rawTrace)) {
          parsedTrace = parseCallTrace(rawTrace);
          traceStatus = 'AVAILABLE';
        } else if (rawTrace === null) {
          traceStatus = 'UNSUPPORTED';
        } else {
          traceStatus = 'INVALID_RESPONSE';
        }
      } catch (err: unknown) {
        if (err instanceof ChainstackProviderError) {
          if (err.code === 'METHOD_NOT_SUPPORTED') {
            traceStatus = 'UNSUPPORTED';
          } else if (err.code === 'RATE_LIMITED') {
            traceStatus = 'RATE_LIMITED';
          } else if (err.code === 'TIMEOUT') {
            traceStatus = 'TIMEOUT';
          } else {
            traceStatus = 'PROVIDER_ERROR';
          }
          traceErrorMsg = err.message;
        } else {
          traceStatus = 'PROVIDER_ERROR';
          traceErrorMsg = (err as Error).message;
        }
      }
    } else {
      traceStatus = 'NOT_REQUESTED';
    }

    // 5. Decode Revert Data
    let decodedRevert: DecodedRevert | null = null;
    if (parsedTrace?.deepestFailingFrame?.decodedRevert) {
      decodedRevert = parsedTrace.deepestFailingFrame.decodedRevert;
    } else if (parsedTrace?.rawTree?.error || parsedTrace?.rawTree?.revertReason) {
      decodedRevert = decodeRevertData(
        parsedTrace.rawTree.output,
        parsedTrace.rawTree.revertReason || parsedTrace.rawTree.error
      );
    }

    // 6. Build Evidence Ledger
    const evidenceLedger = buildEvidenceLedger(tx, receipt, parsedTrace, decodedRevert);

    // 7. Classify & Generate Explanation
    const explanation = generateDeterministicExplanation(tx, receipt, parsedTrace, decodedRevert, evidenceLedger);

    // Add traceStatus-specific limitations if trace was requested but unavailable
    if (receipt && receipt.status === 'REVERTED' && traceStatus !== 'AVAILABLE') {
      if (traceStatus === 'UNSUPPORTED') {
        explanation.limitations.push('The node does not support debug_traceTransaction with callTracer (RPC error -32601). Detailed call tree was unavailable.');
      } else if (traceStatus === 'TIMEOUT') {
        explanation.limitations.push('The execution trace request timed out from the provider (504). Analysis is based on receipt and parameters.');
      } else if (traceStatus === 'RATE_LIMITED') {
        explanation.limitations.push('Rate limit (HTTP 429) was reached while fetching execution trace. Analysis was limited to on-chain receipt.');
      } else if (traceStatus === 'INVALID_RESPONSE') {
        explanation.limitations.push('The node returned an unparseable or malformed trace payload.');
      } else if (traceStatus === 'PROVIDER_ERROR') {
        explanation.limitations.push(`Trace retrieval failed due to a provider error${traceErrorMsg ? `: ${traceErrorMsg}` : ''}.`);
      }
    }

    const investigationId = randomUUID();
    let status: InvestigationReport['status'] = 'UNKNOWN';
    if (tx.isPending) {
      status = 'PENDING';
    } else if (receipt) {
      status = receipt.status;
    } else {
      status = 'UNKNOWN';
    }

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
      aiExplanation: null,
      buyQuote: null,
      createdAt: now,
      completedAt: new Date().toISOString()
    };

    // 8. Process AI Explanation (if service provided)
    if (this.aiExplanationService) {
      const aiResult = await this.aiExplanationService.processExplanation(report);
      report.aiExplanation = aiResult.aiExplanation;
      report.buyQuote = aiResult.buyQuote || null;
    } else {
      report.aiExplanation = {
        status: 'DISABLED',
        provider: 'cencori',
        summary: 'AI enhancement is currently disabled. Deterministic chain evidence is authoritative.',
        limitations: ['Cencori AI explanation is disabled via CENCORI_ENABLED=false.']
      };
    }

    // 9. Persist in SQLite
    this.db.saveInvestigation({
      id: investigationId,
      tx_hash: cleanHash,
      chain_id: chainId,
      status,
      trace_status: traceStatus,
      raw_tx: JSON.stringify(tx),
      raw_receipt: JSON.stringify(receipt),
      raw_trace: parsedTrace?.rawTree ? JSON.stringify(parsedTrace.rawTree) : null,
      normalized_trace: parsedTrace ? JSON.stringify(parsedTrace.flattenedFrames) : null,
      decoded_revert: decodedRevert ? JSON.stringify(decodedRevert) : null,
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
        description: e.description,
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
      description: e.description || e.kind.replace(/_/g, ' '),
      value: JSON.parse(e.value),
      contentHash: e.content_hash,
      observedAt: e.created_at
    }));

    const tx = row.raw_tx ? JSON.parse(row.raw_tx) : null;
    const receipt = row.raw_receipt ? JSON.parse(row.raw_receipt) : null;
    const rawTree = row.raw_trace ? JSON.parse(row.raw_trace) : null;
    const flattenedFrames = row.normalized_trace ? JSON.parse(row.normalized_trace) : [];
    const decodedRevert = row.decoded_revert ? JSON.parse(row.decoded_revert) : null;
    const diagnosis = row.diagnosis ? JSON.parse(row.diagnosis) : null;
    const limitations = row.limitations ? JSON.parse(row.limitations) : [];

    const quoteRows = this.db.getQuotesByInvestigationId(id);
    const primaryQuote = quoteRows.length > 0 ? quoteRows[0] : null;
    const buyQuote: BuyQuoteSummary | null = primaryQuote
      ? {
          quoteId: primaryQuote.id,
          capabilityId: primaryQuote.capability_id,
          status: primaryQuote.status as any,
          url: primaryQuote.url,
          method: primaryQuote.method,
          bodySha256: primaryQuote.body_sha256,
          tokenSymbol: primaryQuote.token_symbol,
          tokenContract: primaryQuote.token_contract,
          amountAtomic: primaryQuote.amount_atomic,
          amountDisplay: primaryQuote.amount_display,
          recipient: primaryQuote.recipient,
          chainId: primaryQuote.chain_id || 42220,
          expiry: primaryQuote.expiry,
          reason: primaryQuote.reason,
          approvalId: primaryQuote.approval_id,
          approvedAt: primaryQuote.approved_at,
          approvedBy: primaryQuote.approved_by
        }
      : null;

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
            rawTree,
            flattenedFrames,
            totalFrames: flattenedFrames.length,
            maxDepth: Math.max(...flattenedFrames.map((f: any) => f.depth || 0)),
            deepestFailingFrame: flattenedFrames.find((f: any) => f.isDeepestFailingFrame) || null
          }
        : null,
      decodedRevert,
      evidenceLedger,
      diagnosis,
      limitations,
      aiExplanation: null,
      buyQuote,
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
