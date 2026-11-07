# RevertLens — Master Requirements Traceability Matrix
**Document Version:** 1.1.0 (Reconciled)  
**Baseline Documentation:** `docs/01_PRODUCT_REQUIREMENTS.md` through `docs/10_DECISIONS_AND_NON_GOALS.md`  
**Architectural Baseline:** Architecture Decision Log (`DECISIONS.md`, AD-001 through AD-012)  

---

## 1. Traceability Methodology & Classifications

Requirements are traced from the original product specifications, evaluated against actual source code implementations in `src/`, and mapped to automated test suites in `tests/`, live Mainnet execution, and real browser CDP automation.

Classifications Used:
- **`VERIFIED`**: Implemented in code and verified through passing live or local automated tests.
- **`PARTIALLY_VERIFIED`**: Core structures or templates implemented, but external testing or human trial is pending.
- **`IMPLEMENTED_NOT_LIVE_TESTED`**: Full code implementation and unit test coverage exist, but live execution was intentionally stopped to maintain zero-spend policy or due to local host environment limits.
- **`NOT_IMPLEMENTED`**: Intentionally deferred or requires external human wallet signing.
- **`NOT_TESTED`**: Code or workflow exists but was not executed.

---

## 2. Master Requirements Matrix

| Requirement ID | Original Requirement | Implementation File | Verifying Test Name | Execution Class | Final Classification | Notes / Gap |
|:---|:---|:---|:---|:---:|:---:|:---|
| **REQ-01: Scope & Network** | Celo Mainnet Only (Chain ID 42220) | `src/server/providers/chainstack.ts` | `chainstackProvider.test.ts` / `scripts/verify_live_investigation.mjs` | `LIVE_MAINNET_READ_ONLY` | **`VERIFIED`** | Node returned 42220 (`0xa4ec`). Rejects all other chains. |
| **REQ-02: Single Input** | 32-Byte Tx Hash Input | `src/server/app.ts` (`InvestigateBodySchema`), `src/client/App.tsx` | `investigations.test.ts` / `scripts/browser_e2e_cdp.mjs` | `LOCAL` | **`VERIFIED`** | Rejects non-hex/malformed hashes with HTTP 400. |
| **REQ-03: On-Chain Facts** | Transaction & Receipt Evidence | `src/server/providers/chainstack.ts` | `chainstackProvider.test.ts` / `scripts/verify_live_investigation.mjs` | `LIVE_MAINNET_READ_ONLY` | **`VERIFIED`** | Extracts block 52460432, status 0, gas 54232, addresses. |
| **REQ-04: Trace Retrieval** | OP Geth Tracing (`callTracer`) | `src/server/providers/chainstack.ts` | `scripts/verify_live_investigation.mjs` / `tests/traceParser.test.ts` | `LIVE_MAINNET_READ_ONLY` | **`VERIFIED`** | 4 frames retrieved; child call at depth 1 identified. Reconciled under AD-008. |
| **REQ-05: Revert Decoding** | Solidity Error, Panic, Custom Errors | `src/server/forensics/revertDecoder.ts` | `tests/revertDecoder.test.ts` (5 tests) | `LOCAL` | **`VERIFIED`** | Decodes Error(string), Panics (0x11, 0x12), and custom selectors. |
| **REQ-06: EVM Causality Engine** | 5-Tier Failure Propagation | `src/server/forensics/classifier.ts`, `traceParser.ts` | `tests/forensics.test.ts`, Golden Cases GC-01..11 | `LOCAL` | **`VERIFIED`** | Distinguishes caught vs propagated reverts; deepest frame marked. |
| **REQ-07: Evidence Ledger** | Atomic Evidence Items & SHA-256 | `src/server/forensics/evidenceBuilder.ts` | `tests/forensics.test.ts` / `scripts/verify_live_investigation.mjs` | `LOCAL` | **`VERIFIED`** | Stable IDs E-01..E-05 with deterministic content hashes. |
| **REQ-08: Deterministic Engine** | Fact-Checked Plain Narrative | `src/server/forensics/explanationEngine.ts` | `tests/forensics.test.ts` / `scripts/verify_live_investigation.mjs` | `LOCAL` | **`VERIFIED`** | Synthesizes narrative explicitly citing atomic evidence IDs. |
| **REQ-09: Cencori AI Integration** | Readability Layer via Buy | `src/server/providers/cencori.ts`, `schemas/aiExplanationSchema.ts` | `tests/aiValidation.test.ts`, `cencoriProvider.test.ts` | `MOCKED` | **`IMPLEMENTED_NOT_LIVE_TESTED`** | Code complete; mock validated; live paid inference stopped ($0 spend). |
| **REQ-10: Operator Spend Control** | Public Users Cannot Spend | `src/server/app.ts`, `auth/operatorAuth.ts` | `tests/buySecurity.test.ts` / `scripts/verify_all_routes.mjs` | `LOCAL` | **`VERIFIED`** | Timing-safe auth; unauthenticated spend returns HTTP 401. |
| **REQ-11: Buy Quote Binding** | Immutable Quote-to-Body SHA-256 | `src/server/services/buyQuoteService.ts` | `tests/buyQuote.test.ts` / `scripts/verify_all_routes.mjs` | `LOCAL` | **`VERIFIED`** | Quote bound to exact SHA-256; altered request rejects approval. |
| **REQ-12: Spending Caps & Kill Switch** | Financial Guardrails | `src/server/services/buyQuoteService.ts` | `tests/buyQuote.test.ts`, `tests/buySecurity.test.ts` | `LOCAL` | **`VERIFIED`** | Enforces per-call cap, daily cap, token allowlist, kill switch. |
| **REQ-13: Settlement Proof** | Verification of Settlement | `src/server/services/buyQuoteService.ts` | `tests/buyQuote.test.ts` | `MOCKED` | **`IMPLEMENTED_NOT_LIVE_TESTED`** | Architecture supports verification; live settlement unexecuted ($0 spend). |
| **REQ-14: Persistence** | SQLite Round-Trip Storage | `src/server/db/database.ts`, `investigationService.ts` | `scripts/verify_live_investigation.mjs`, `tests/investigations.test.ts`| `LOCAL` | **`VERIFIED`** | Full raw trace, decoded revert, and facts hydrated after process restart. |
| **REQ-15: Unlisted Report View** | Public Forensic Report Sharing | `src/server/app.ts` (`GET /api/investigations/:id`) | `scripts/verify_all_routes.mjs`, `tests/investigations.test.ts` | `LOCAL` | **`VERIFIED`** | Sanitized report accessible via UUID without exposing secrets. |
| **REQ-16: Honest Product Messaging** | Truthful UI & Attribution | `src/client/App.tsx` | `scripts/browser_e2e_cdp.mjs` (Chrome CDP) | `LOCAL` | **`VERIFIED`** | Renders provider attribution, confidence scores, and limitations. |
| **REQ-17: Single Deployable Process** | Fastify + React SPA Delivery | `src/server/app.ts` | `scripts/browser_e2e_cdp.mjs`, `scripts/verify_all_routes.mjs` | `LOCAL` | **`VERIFIED`** | Fastify serves `/`, `/assets/*`, and `/api/*` on a single port. |
| **REQ-18: Containerization** | Multi-Stage Dockerfile | `Dockerfile`, `.dockerignore` | Static Containerfile Audit | `STATIC_ONLY` | **`IMPLEMENTED_NOT_LIVE_TESTED`** | Multi-stage build passes static review; local Docker engine unavailable. |
| **REQ-19: ERC-8004 Identity** | On-Chain Agent Registration | None (Requires Human Wallet) | None | `NOT_TESTED` | **`NOT_IMPLEMENTED`** | Deferred until operator signs registration transaction on Celo. |
| **REQ-20: Independent User Cohort** | User Qualification Evidence | `USER_TESTING_GUIDE.md`, `USER_TEST_LOG.csv` | Template Review | `NOT_TESTED` | **`PARTIALLY_VERIFIED`** | Framework and survey templates prepared; external human testing pending. |

---

## 3. Recalculated Traceability Statistics

- **`VERIFIED` (Implemented & Tested Live/Locally):** **15 / 20 (75.0%)**
- **`IMPLEMENTED_NOT_LIVE_TESTED` (Code Complete & Unit Tested; Live Unexecuted):** **3 / 20 (15.0%)** (REQ-09 Cencori inference, REQ-13 Settlement verification, REQ-18 Docker runtime)
- **`PARTIALLY_VERIFIED` (Framework / Templates Prepared):** **1 / 20 (5.0%)** (REQ-20 Independent User Cohort)
- **`NOT_IMPLEMENTED` (Awaiting Operator On-Chain Signing):** **1 / 20 (5.0%)** (REQ-19 ERC-8004 On-Chain Identity)

**Total Functional Implementation Completeness:** **19 / 20 (95.0%)**
