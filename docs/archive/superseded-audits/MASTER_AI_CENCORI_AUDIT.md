# RevertLens — Master AI & Cencori Integration Audit
**Document Version:** 1.0.0  
**AI Provider:** Cencori (`cencori.v1.chat.completions` on Buy Gateway)  
**Model Architecture:** `maximo-atlas-1.3`  
**Evaluation Standard:** Architecture Decision AD-011 & `docs/04_SECURITY_AND_PRIVACY.md`  

---

## 1. Role of AI in RevertLens

Under Architecture Decision **AD-011**, Large Language Models are treated as a **non-authoritative readability layer**. LLMs cannot deduce ground truth, override on-chain receipts, modify execution status, or invent causal relationships. 

The deterministic forensic engine remains the authoritative source of truth. Cencori is used strictly to synthesize complex execution traces into developer-friendly narratives, conditioned entirely on verified atomic evidence.

---

## 2. Integration Architecture & Workflow

```text
Deterministic Forensic Report
  │
  ├──> Cencori Provider (src/server/providers/cencori.ts)
  │      ├── Filters and formats verified evidence items
  │      ├── Formulates structured JSON prompt payload
  │      └── Generates HTTP 402 Quote Challenge
  │
  ├──> Operator Review & Approval Gate
  │      └── Cryptographic binding to prompt payload SHA-256
  │
  ├──> Buy Marketplace Execution (npx @celo/buy@latest curl)
  │      └── Subsidized x402 Micropayment Settlement
  │
  └──> Strict Anti-Hallucination Guardrail (src/server/schemas/aiExplanationSchema.ts)
         ├── Enforces citation of verified evidence IDs (E-01 .. E-05)
         ├── Rejects invented Ethereum addresses
         ├── Rejects unverified revert strings
         ├── Caps confidence at deterministic level
         └── Rejects malformed JSON
```

---

## 3. Strict Anti-Hallucination Guardrails

The response validator (`validateAiExplanation`) enforces six uncompromising verification rules:

1. **Evidence ID Citation:** Every factual statement in `provenFacts` must cite a verified evidence ID present in the investigation ledger (e.g., `[E-01]`, `[E-02]`). Responses citing non-existent evidence IDs (e.g., `E-99`) are rejected.
2. **Address Whitelist Enforcement:** The model is prohibited from introducing arbitrary or hallucinated Ethereum addresses. Any address appearing in the explanation must exist within `knownAddresses` (extracted from the transaction, receipt, and execution trace).
3. **Revert String Conformance:** Revert reasons cited by the model must match strings discovered during trace parsing.
4. **Confidence Ceiling:** The model cannot elevate confidence above the deterministic forensic assessment. If the deterministic classifier reports `MEDIUM` or `LOW` confidence due to trace truncation or timeout, the AI explanation cannot claim `HIGH` confidence.
5. **Mandatory Limitations:** The model must preserve all limitations identified by the deterministic engine (e.g., call depth limits, unindexed state).
6. **Strict Schema Conformance:** Output must parse cleanly against the Zod schema `RawAiResponseSchema`.

---

## 4. Adverse Condition & Mock Test Scenarios

The AI validation suite (`tests/aiValidation.test.ts`) verifies the following adverse test scenarios:

| Test Scenario | Injected Model Behavior | Guardrail Action | Test Result |
|:---|:---|:---|:---:|
| **Scenario 1: Conforming Response** | Valid narrative citing `[E-01]` and `[E-02]` | Accepted cleanly; sanitized | **PASS** |
| **Scenario 2: Invented Evidence ID** | Model cites `[E-99]` | Rejected with validation error | **PASS** |
| **Scenario 3: Uncited Claim** | Fact asserts balance drain without citation | Rejected with validation error | **PASS** |
| **Scenario 4: Hallucinated Address** | Model introduces `0x9999...9999` | Rejected with validation error | **PASS** |
| **Scenario 5: Confidence Elevation** | Deterministic `MEDIUM`, model claims `HIGH` | Rejected with validation error | **PASS** |
| **Scenario 6: Invented Revert Reason** | Model claims revert was "Out of Funds" | Rejected with validation error | **PASS** |
| **Scenario 7: Malformed JSON** | Model outputs unparseable text | Zod parsing catches error; falls back | **PASS** |
| **Scenario 8: Missing Required Fields** | Model omits `technicalExplanation` | Zod parsing catches error; falls back | **PASS** |
| **Scenario 9: Prompt Injection Attempt** | Input contains adversarial instruction text | Treated as untrusted string data | **PASS** |

---

## 5. Implementation Status Disclosure

In accordance with strict hackathon truthfulness rules:
- **Code Implementation:** `YES` (`src/server/providers/cencori.ts`, `src/server/schemas/aiExplanationSchema.ts`).
- **Configuration & Allowlisting:** `YES` (`cencori.v1.chat.completions` configured in `src/server/config.ts`).
- **Quote Verification:** `YES` (Verified HTTP 402 challenge against Buy Gateway).
- **Paid Inference Executed:** `NO` (Maintained strict $0.00 zero-personal-spend policy).
- **Live Model Output Validated:** `MOCKED` (Tested thoroughly via synthetic and unit test fixtures).
