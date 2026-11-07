# Cencori AI Integration & Forensic Guardrails

**Date:** 2026-11-07  
**Status:** `IMPLEMENTED` | `DISABLED_BY_DEFAULT` | `DETERMINISTIC_GROUND_TRUTH`  

---

## 1. Architectural Philosophy

RevertLens is a blockchain forensics application, not an ungrounded chatbot. In RevertLens, **blockchain evidence is the sole authority of truth**.

The role of Cencori (`maximo-atlas-1.3`) is strictly to improve the human readability, educational clarity, and troubleshooting guidance of the investigation for non-technical users. It does NOT discover new blockchain facts, invent call frames, or override on-chain data.

```
       Chainstack OP Geth Node (Celo Mainnet 42220)
                          │
         eth_getTransactionByHash + eth_getTransactionReceipt
                  + debug_traceTransaction (callTracer)
                          │
                          ▼
            Deterministic Forensic Engine
       (revertDecoder + traceParser + classifier)
                          │
                          ▼
             Deterministic Evidence Ledger
           [E-01], [E-02], [E-03] (SHA-256)
                          │
                          ▼
             Bounded Cencori Input Contract
        (Strict evidence context; NO secrets or URLs)
                          │
                          ▼
             Cencori Provider (Buy Gateway)
               (x402-v2 Quote & Challenge)
                          │
                          ▼
              Strict AI Response Validator
       (Anti-hallucination, address & citation check)
                          │
                          ▼
             Final Investigation Report
   (Deterministic ground truth + Optional AI enhancement)
```

If Cencori is disabled (`CENCORI_ENABLED=false`), times out, or returns invalid content, the deterministic explanation continues to serve users with zero interruption.

---

## 2. Live Capability Specification

Verified live via the official Buy Gateway (`https://gateway.usebuy.ai/v1/catalog` and HTTP 402 challenge on 2026-11-07):
- **Capability ID:** `cencori.v1.chat.completions`
- **Model:** `maximo-atlas-1.3`
- **URL:** `https://gateway.usebuy.ai/cencori/v1/chat/completions`
- **Method:** `POST`
- **Protocols:** `x402-v1`, `x402-v2`
- **Max Timeout:** 60 seconds
- **Price:** $0.01 USD (10,000 atomic units at 6 token decimals)
- **Accepted Tokens on Celo Mainnet (`42220`):**
  - USDC (`0xcebA9300f2b948710d2653dD7B07f33A8B32118C`)
  - USDT (`0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`)
  - USA₮ (`0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771`)
- **Payee Address:** `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`

---

## 3. Strict Input Bounding Contract

The AI prompt is generated deterministically in `src/server/providers/cencori.ts`.

### Explicitly Excluded:
- `CHAINSTACK_CELO_MAINNET_RPC_URL` or any node credentials.
- Buy wallet private keys, seed phrases, or OS keychain paths.
- Operator passwords or session tokens.
- Internal database paths or server environment variables.

### Strictly Included:
- Transaction hash, block number, sender, recipient, gas used.
- Decoded revert data (`Error(string)` or `Panic(uint256)`).
- Execution trace summary (total frames, max depth, deepest failing frame).
- The atomic `evidenceLedger` (`[E-01]`, `[E-02]`, etc.) with descriptions.
- Deterministic diagnosis (proven facts, likely explanations, known unknowns).
- Documented analysis limitations.

### System Instructions:
```
You are explaining an existing deterministic blockchain forensic investigation for RevertLens on Celo Mainnet.
You are NOT performing a new blockchain investigation. Use only the supplied evidence.
Never invent facts, addresses, call frames, revert messages, transaction status, or evidence references.
If evidence is insufficient, explicitly say so. Do not convert an uncertain causal relationship into a proven fact.
Respond ONLY with valid JSON conforming to the requested schema.
```

---

## 4. Strict Output Validation Rules

Implemented in `src/server/schemas/aiExplanationSchema.ts`. Every response must pass:

1. **Schema Validation:** Must conform to Zod schema (`summary`, `technicalExplanation`, `provenFacts`, `likelyExplanations`, `unknowns`, `safeNextSteps`, `evidenceReferences`, `confidence`, `limitations`).
2. **Evidence Reference Integrity:** Every item in `evidenceReferences` must match an existing ID in the input `evidenceLedger`.
3. **Fact Citation Enforcement:** Every entry in `provenFacts` must cite at least one verified evidence ID (e.g. `[E-01]`). Uncited claims are rejected.
4. **No Confidence Elevation:** AI confidence cannot exceed the deterministic confidence score. If deterministic confidence is `MEDIUM`, AI cannot output `HIGH`.
5. **Preservation of Limitations:** All deterministic limitations must remain present in the output.
6. **Anti-Hallucination Address Check:** Any EVM address (`0x[a-fA-F0-9]{40}`) in the response must belong to the observed set of on-chain addresses (`knownAddresses`). Invented addresses cause immediate validation rejection.
7. **Anti-Hallucination Revert Check:** Quoted revert messages must match observed revert strings or errors.
8. **Prompt Injection Quarantine:** Scanned for adversarial patterns (`ignore previous instructions`, `export private key`, etc.).
9. **Length Bounds:** Rejects responses exceeding 50,000 characters or empty strings.
10. **Graceful Fallback:** If validation fails, `AiExplanationService` captures the errors and falls back to the deterministic explanation without throwing or crashing.
