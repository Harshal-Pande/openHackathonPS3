import { z } from 'zod';
import { EvidenceItem, FailureDiagnosis, FrameCausalityStatus } from '../forensics/types.js';

export const RawAiResponseSchema = z.object({
  summary: z.string().min(1, 'Summary must not be empty').max(5000, 'Summary exceeds max length'),
  technicalExplanation: z.string().min(1, 'Technical explanation must not be empty').max(15000, 'Technical explanation exceeds max length'),
  provenFacts: z.array(z.string().min(1)).min(1, 'Must contain at least one proven fact'),
  likelyExplanations: z.array(z.string()),
  unknowns: z.array(z.string()),
  safeNextSteps: z.array(z.string()),
  evidenceReferences: z.array(z.string().regex(/^E-\d{2}$/, 'Invalid evidence reference format')).min(1, 'Must reference at least one evidence item'),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  limitations: z.array(z.string())
});

export type RawAiResponse = z.infer<typeof RawAiResponseSchema>;

export interface AiValidationContext {
  evidenceLedger: EvidenceItem[];
  deterministicStatus: 'SUCCESS' | 'REVERTED' | 'PENDING' | 'NOT_FOUND' | 'UNKNOWN';
  deterministicCategory: FailureDiagnosis['category'];
  deterministicConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  deterministicLimitations: string[];
  knownAddresses: Set<string>;
  knownRevertReasons: Set<string>;
  rootRevertReason?: string;
  nestedFailureReason?: string;
  causalityCategory?: FrameCausalityStatus;
}

export interface AiValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedResponse?: RawAiResponse;
}

const CONFIDENCE_LEVELS: Record<'LOW' | 'MEDIUM' | 'HIGH', number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3
};

const PROMPT_INJECTION_PATTERNS = [
  /ignore (all )?previous instructions/i,
  /system prompt/i,
  /you are now/i,
  /override (all )?rules/i,
  /act as a/i,
  /transfer funds/i,
  /send (all )?eth/i,
  /export private key/i
];

/**
 * Validates Cencori AI responses against deterministic ground truth.
 *
 * Rules:
 * 1. Schema conformity (Zod)
 * 2. Every evidence reference must exist in the supplied ledger
 * 3. Every proven fact must cite at least one evidence ID (e.g. [E-01]) that exists in the ledger
 * 4. AI cannot elevate confidence above deterministic confidence
 * 5. All deterministic limitations must be preserved
 * 6. No invented addresses (any 0x address must be among known addresses observed on chain)
 * 7. No invented revert reasons (any revert string mentioned must exist in known revert reasons)
 * 8. Prompt injection phrases quarantined / rejected
 * 9. Length bounds (total JSON <= 50,000 chars)
 */
export function validateAiExplanation(
  rawInput: unknown,
  context: AiValidationContext
): AiValidationResult {
  const errors: string[] = [];

  // 1. JSON and Type Guard
  if (typeof rawInput === 'string') {
    if (rawInput.length > 50000) {
      return { valid: false, errors: ['Raw AI response exceeds 50,000 character security boundary.'] };
    }
    if (rawInput.trim().length === 0) {
      return { valid: false, errors: ['Raw AI response is empty.'] };
    }
    try {
      rawInput = JSON.parse(rawInput);
    } catch {
      return { valid: false, errors: ['AI response failed JSON parsing.'] };
    }
  }

  const parsed = RawAiResponseSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.errors.map((e) => `Schema error at ${e.path.join('.')}: ${e.message}`)
    };
  }

  const data = parsed.data;

  // 2. Validate Evidence References exist in ledger
  const validLedgerIds = new Set(context.evidenceLedger.map((e) => e.id));
  for (const ref of data.evidenceReferences) {
    if (!validLedgerIds.has(ref)) {
      errors.push(`AI referenced non-existent evidence ID: ${ref}`);
    }
  }

  // 3. Every proven fact must cite at least one valid evidence reference
  for (const fact of data.provenFacts) {
    const citationsInFact = fact.match(/E-\d{2}/g);
    if (!citationsInFact || citationsInFact.length === 0) {
      errors.push(`Proven fact does not cite an evidence ID: "${fact.slice(0, 60)}..."`);
    } else {
      for (const citation of citationsInFact) {
        if (!validLedgerIds.has(citation)) {
          errors.push(`Proven fact cites non-existent evidence ID "${citation}": "${fact.slice(0, 60)}..."`);
        }
      }
    }
  }

  // 4. AI Confidence cannot exceed deterministic confidence
  const deterministicScore = CONFIDENCE_LEVELS[context.deterministicConfidence] || 1;
  const aiScore = CONFIDENCE_LEVELS[data.confidence] || 1;
  if (aiScore > deterministicScore) {
    errors.push(
      `AI confidence (${data.confidence}) exceeds deterministic confidence (${context.deterministicConfidence}). AI cannot elevate confidence.`
    );
  }

  // 5. AI cannot remove deterministic limitations
  const aiLimitationsSet = new Set(data.limitations.map((l) => l.trim().toLowerCase()));
  for (const dLim of context.deterministicLimitations) {
    const norm = dLim.trim().toLowerCase();
    const exists = Array.from(aiLimitationsSet).some((al) => al.includes(norm) || norm.includes(al));
    if (!exists) {
      // Append missing deterministic limitation rather than hard failing if everything else is fine
      data.limitations.push(dLim);
    }
  }

  // 6. Invented Addresses Check
  const combinedText = `${data.summary} ${data.technicalExplanation} ${data.provenFacts.join(' ')}`;
  const addressMatches = combinedText.match(/0x[a-fA-F0-9]{40}/g) || [];
  for (const addr of addressMatches) {
    const cleanAddr = addr.toLowerCase();
    if (!context.knownAddresses.has(cleanAddr)) {
      errors.push(`AI invented or cited an unverified address: ${addr}`);
    }
  }

  // 7. Prompt Injection / Malicious Instruction Check
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(combinedText)) {
      errors.push(`AI response contains flagged instruction pattern: ${pattern.toString()}`);
    }
  }

  // 8. Invented Revert Reason Check
  if (context.knownRevertReasons.size > 0) {
    // If AI explicitly quotes a revert reason inside quotes, verify it was observed
    const quotedStrings = combinedText.match(/revert(?:ed)? with (?:reason |message )?["']([^"']+)["']/i);
    if (quotedStrings && quotedStrings[1]) {
      const citedRevert = quotedStrings[1].trim().toLowerCase();
      const matchesKnown = Array.from(context.knownRevertReasons).some((r) =>
        r.toLowerCase().includes(citedRevert) || citedRevert.includes(r.toLowerCase())
      );
      if (!matchesKnown) {
        errors.push(`AI invented or hallucinated unobserved revert reason: "${quotedStrings[1]}"`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitizedResponse: data
  };
}
