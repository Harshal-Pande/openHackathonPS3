import { AppConfig } from '../config.js';
import { CencoriProvider } from '../providers/cencori.js';
import { BuyQuoteService } from './buyQuoteService.js';
import {
  InvestigationReport,
  AiExplanation,
  BuyQuoteSummary,
  FailureDiagnosis
} from '../forensics/types.js';
import {
  validateAiExplanation,
  AiValidationContext
} from '../schemas/aiExplanationSchema.js';

export class AiExplanationService {
  constructor(
    private cencoriProvider: CencoriProvider,
    private buyQuoteService: BuyQuoteService,
    private config: AppConfig
  ) {}

  /**
   * Prepares AI explanation for an investigation report.
   * If Cencori is disabled, returns cleanly with status: 'DISABLED'.
   * If enabled, prepares the prompt, checks or requests a quote, and stops at approval.
   */
  public async processExplanation(
    report: InvestigationReport,
    mockAiResponse?: string | Record<string, unknown>
  ): Promise<{
    aiExplanation: AiExplanation;
    buyQuote?: BuyQuoteSummary | null;
  }> {
    // 1. Check if Cencori is enabled in configuration
    if (!this.config.CENCORI_ENABLED || !this.cencoriProvider.isEnabled()) {
      return {
        aiExplanation: {
          status: 'DISABLED',
          provider: 'cencori',
          summary: 'AI enhancement is currently disabled. Deterministic chain evidence is authoritative.',
          limitations: ['Cencori AI explanation is disabled via CENCORI_ENABLED=false.']
        },
        buyQuote: null
      };
    }

    // 2. Build prompt payload strictly bounded by evidence
    const payload = this.cencoriProvider.buildPromptPayload(report);
    const exactBody = JSON.stringify(payload);

    // 3. Collect known addresses and revert strings for strict anti-hallucination validation
    const knownAddresses = new Set<string>();
    if (report.transaction?.from) knownAddresses.add(report.transaction.from.toLowerCase());
    if (report.transaction?.to) knownAddresses.add(report.transaction.to.toLowerCase());
    if (report.executionTrace) {
      for (const f of report.executionTrace.flattenedFrames) {
        if (f.from) knownAddresses.add(f.from.toLowerCase());
        if (f.to) knownAddresses.add(f.to.toLowerCase());
      }
    }

    const knownRevertReasons = new Set<string>();
    if (report.decodedRevert?.reason) knownRevertReasons.add(report.decodedRevert.reason);
    if (report.diagnosis.rootRevertReason) knownRevertReasons.add(report.diagnosis.rootRevertReason);
    if (report.diagnosis.nestedFailureReason) knownRevertReasons.add(report.diagnosis.nestedFailureReason);

    const validationContext: AiValidationContext = {
      evidenceLedger: report.evidenceLedger,
      deterministicStatus: report.status,
      deterministicCategory: report.diagnosis.category,
      deterministicConfidence: report.diagnosis.confidence,
      deterministicLimitations: report.limitations,
      knownAddresses,
      knownRevertReasons,
      rootRevertReason: report.diagnosis.rootRevertReason,
      nestedFailureReason: report.diagnosis.nestedFailureReason,
      causalityCategory: report.diagnosis.causalityCategory
    };

    // 4. If a mock response is provided (e.g. in automated tests), validate directly
    if (mockAiResponse) {
      const validation = validateAiExplanation(mockAiResponse, validationContext);
      if (!validation.valid || !validation.sanitizedResponse) {
        return {
          aiExplanation: {
            status: 'VALIDATION_FAILED',
            provider: 'cencori',
            model: 'maximo-atlas-1.3',
            validationErrors: validation.errors,
            summary: report.diagnosis.likelyExplanations[0] || 'Deterministic failure explanation',
            limitations: [
              ...report.limitations,
              `AI response failed strict validation: ${validation.errors.join('; ')}`
            ]
          },
          buyQuote: null
        };
      }

      return {
        aiExplanation: {
          status: 'SUCCESS',
          provider: 'cencori',
          model: 'maximo-atlas-1.3',
          summary: validation.sanitizedResponse.summary,
          technicalExplanation: validation.sanitizedResponse.technicalExplanation,
          provenFacts: validation.sanitizedResponse.provenFacts,
          likelyExplanations: validation.sanitizedResponse.likelyExplanations,
          unknowns: validation.sanitizedResponse.unknowns,
          safeNextSteps: validation.sanitizedResponse.safeNextSteps,
          evidenceReferences: validation.sanitizedResponse.evidenceReferences,
          confidence: validation.sanitizedResponse.confidence,
          limitations: validation.sanitizedResponse.limitations,
          generatedAt: new Date().toISOString()
        },
        buyQuote: null
      };
    }

    // 5. In live zero-spend mode: Request a read-only quote and stop at AWAITING_APPROVAL
    try {
      const quoteInfo = await this.cencoriProvider.getQuote(payload);
      const quoteSummary = await this.buyQuoteService.createQuote({
        investigationId: report.investigationId,
        capabilityId: quoteInfo.capabilityId,
        url: quoteInfo.url,
        method: quoteInfo.method,
        exactBody: quoteInfo.exactBody,
        tokenSymbol: quoteInfo.tokenSymbol,
        tokenContract: quoteInfo.tokenContract,
        amountAtomic: quoteInfo.amountAtomic,
        amountDisplay: quoteInfo.amountDisplay,
        recipient: quoteInfo.recipient,
        chainId: quoteInfo.chainId,
        ttlSeconds: quoteInfo.maxTimeoutSeconds,
        reason: 'Cencori maximo-atlas-1.3 AI explanation'
      });

      return {
        aiExplanation: {
          status: 'AWAITING_APPROVAL',
          provider: 'cencori',
          model: 'maximo-atlas-1.3',
          summary: 'Awaiting operator quote approval. No personal funds spent.',
          limitations: [
            'Paid Cencori inference requires explicit operator approval and wallet funding.'
          ]
        },
        buyQuote: quoteSummary
      };
    } catch (err: unknown) {
      return {
        aiExplanation: {
          status: 'UNAVAILABLE',
          provider: 'cencori',
          summary: 'AI explanation is currently unavailable.',
          limitations: [(err as Error).message || 'Unable to retrieve Buy quote for Cencori.']
        },
        buyQuote: null
      };
    }
  }
}
