# RevertLens — Master Project Roadmap

This document serves as the authoritative 10-phase roadmap (Phases 0 through 9) for RevertLens.

---

## Phase Summary Matrix

| Phase | Title | Status | Primary Dependencies | Target Deliverables |
|---|---|---|---|---|
| **Phase 0** | Product Definition & Architecture | **VERIFIED_COMPLETE** | None | 10 architectural docs, threat models, API contracts |
| **Phase 1** | Workspace & Foundation | **VERIFIED_COMPLETE** | Phase 0 | Fastify server, React shell, TS strict, Vitest, CI scripts |
| **Phase 2** | Buy Discovery & Readiness | **VERIFIED_COMPLETE** | Phase 1 | Buy CLI v0.8.5 verification, 402 quotes, config hardening |
| **Phase 3** | Gate 0: Live Buy & Chainstack Verification | **VERIFIED_READINESS** (Live Trace Quoted; Paid Execution Deferred) | Phase 2, Operator Wallet | Quoted candidate trace bound to SHA-256 hash, formal approval packet in `GATE0_APPROVAL_REQUEST.md` |
| **Phase 4** | Free Chainstack Growth Node & Persistence | **VERIFIED_COMPLETE** | Phase 3, Chainstack Node | Direct Elastic Global Node integration (OP Geth, 250 RPS), SQLite migrations, backoff & redaction |
| **Phase 5** | Celo Transaction Forensics Pipeline | **VERIFIED_COMPLETE** | Phase 4 | Call trace parser, revert decoder (`Error`, `Panic`), EVM causality taxonomy, atomic evidence ledger, deterministic classifier |
| **Phase 6** | Cencori AI Explanation (Optional/Buy) | **READINESS_CONFIRMED** | Phase 5, USA₮ Faucet | Buy Cencori capability identified; USA₮ faucet documented (UNVERIFIED / UNFUNDED); deterministic fallback engine active |
| **Phase 7** | Frontend Forensic Dashboard | **VERIFIED_COMPLETE** | Phase 5 | Interactive dark UI, call trace tree viewer, error badges, evidence ledger, honest stage tracking, report JSON export |
| **Phase 8** | Testing, Hardening & Security | **VERIFIED_COMPLETE** | Phase 7 | 53 automated tests in Vitest (100% pass), production invariants, URL redaction, UUID & query validations |
| **Phase 9** | Deployment & Hackathon Submission | **IN_PROGRESS** | Phase 8 | Final documentation, live test evidence, hackathon compliance check |

---

## Detailed Phase Breakdown

### Phase 0 — Product Definition and Architecture
- **Deliverables:**
  - `docs/01_PRODUCT_REQUIREMENTS.md` through `docs/10_DECISIONS_AND_NON_GOALS.md`.
  - Non-negotiable security rules in `AGENTS.md` and `.agents/rules/`.
- **Status:** `VERIFIED_COMPLETE`
- **Acceptance Criteria:** All product boundaries locked; out-of-scope items defined; threat model documented.

### Phase 1 — Workspace and Foundation
- **Deliverables:**
  - TypeScript strict configuration (`tsconfig.*.json`).
  - Fastify backend entry point with standard JSON envelope (`data`, `error`, `requestId`).
  - Basic health check endpoint `GET /api/health` returning chainId 42220 and feature flags.
  - React 19 + Vite frontend shell with transaction hash input.
  - Automated test runner setup with Vitest.
- **Status:** `VERIFIED_COMPLETE`
- **Acceptance Criteria:** `npm run typecheck`, `npm test`, and `npm run build` pass with 0 errors.

### Phase 2 — Buy Discovery and Configuration Readiness
- **Deliverables:**
  - Identification of official `@celo/buy` npm package (v0.8.5).
  - Live Buy catalog inspection (`https://gateway.usebuy.ai/v1/catalog`) discovering `chainstack.celo` and `cencori.v1.chat.completions`.
  - Live HTTP 402 challenge verification and price extraction (10,000 atomic units = $0.01 USDC/USDT).
  - Live execution of `buy quote` without wallet.
  - Verification of real candidate failed transaction on Celo Mainnet (`0xb90bcca5...`).
  - Production security configuration guardrails rejecting placeholder secrets and unbudgeted active Buy configurations.
- **Status:** `VERIFIED_COMPLETE`
- **Acceptance Criteria:** Tests pass; zero funds spent; no private keys in source.

### Phase 3 — Gate 0: Live Buy and Chainstack Verification
- **Deliverables:**
  - Standardized JSON-RPC payload for `debug_traceTransaction` with `callTracer` on candidate tx.
  - SHA-256 hash binding (`35406284f1673b329e88e9b2d7e162c4e515123aec7237ef8aea1acba23b7882`).
  - Authored formal approval packet `GATE0_APPROVAL_REQUEST.md` detailing price, recipient, and fallback plan.
  - Operator provisioned free Chainstack Growth Elastic Global Node on Celo Mainnet (`ND-801-666-498`) with OP Geth client and native `debug`/`trace` namespaces.
- **Status:** `VERIFIED_READINESS` (Decision AD-008: use free direct Chainstack Growth node for RPC; preserve Buy for optional Cencori inference).

### Phase 4 — Free Chainstack Growth Node & Persistence
- **Deliverables:**
  - `src/server/providers/chainstack.ts`: client with chainId validation (enforces 42220), `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `debug_traceTransaction` with `callTracer`, rate-limit backoff, and secret URL redaction (`[REDACTED_RPC_ENDPOINT]`).
  - `src/server/db/database.ts`: native Node 22 SQLite engine (`DatabaseSync`) with schema migrations (`investigations`, `evidence_items`, `quote_records`).
  - Environment integration via `CHAINSTACK_CELO_MAINNET_RPC_URL` (optional, server-side only).
- **Status:** `VERIFIED_COMPLETE`

### Phase 5 — Celo Transaction Forensics Pipeline
- **Deliverables:**
  - `src/server/forensics/revertDecoder.ts`: decodes `Error(string)`, `Panic(uint256)` with reason codes, custom error fallback.
  - `src/server/forensics/traceParser.ts`: traverses nested call tree, classifies causality (`NO_FAILURE`, `OBSERVED_FAILURE`, `CAUGHT_CHILD_REVERT`, `PROPAGATION_SUPPORTED`, `CAUSALITY_UNCERTAIN`), isolates caught sub-calls, identifies deepest failing frame.
  - `src/server/forensics/evidenceBuilder.ts`: produces structured evidence ledger (`[E-01]`, `[E-02]`) with SHA-256 digests.
  - `src/server/forensics/classifier.ts`: deterministic classification separating facts, likely explanations, unknowns, and safe troubleshooting checks; preserves root and nested error reasons.
  - `src/server/forensics/explanationEngine.ts`: generates clear, human-readable forensic summary citing evidence IDs.
  - `src/server/services/investigationService.ts`: orchestrates pipeline and complete round-trip persistence to SQLite.
- **Status:** `VERIFIED_COMPLETE`

### Phase 6 — Cencori AI Explanation (Optional/Buy)
- **Deliverables:**
  - Buy gateway `cencori.v1.chat.completions` capability identified in catalog.
  - Google Cloud Web3 USA₮ Celo Mainnet faucet reviewed; operator eligibility & wallet funding are UNVERIFIED and UNFUNDED.
  - Zero-spend safeguards in place; deterministic explanation engine serves as reliable default.
- **Status:** `READINESS_CONFIRMED`

### Phase 7 — Frontend Forensic Dashboard
- **Deliverables:**
  - Dark-themed blockchain forensics UI in `src/client/App.tsx`.
  - Transaction hash search with sample candidate button (`0xb90bcca5...`).
  - Forensic status banners, decoded revert cards, call trace tree viewer with error tags and "Root Failure Point" badges.
  - Evidence ledger with expandable SHA-256 hashes and raw JSON inspectors.
  - Honest reactive investigation stages (`IDLE`, `SUBMITTED`, `RUNNING`, `COMPLETED`, `FAILED`) without fake progress intervals.
  - Troubleshooting guidance and downloadable JSON report export.
- **Status:** `VERIFIED_COMPLETE`

### Phase 8 — Testing, Hardening & Security
- **Deliverables:**
  - 53 automated Vitest unit & integration tests covering config, health check, revert decoding, trace parsing, forensics classification, Chainstack provider, regression edge cases, and API persistence round-trip.
  - Production invariants in `src/server/config.ts`.
  - Strict input boundary validations for transaction hash, UUID IDs, and limit parameters.
  - Full TypeScript typecheck and Vite build passing cleanly.
- **Status:** `VERIFIED_COMPLETE`

### Phase 9 — Deployment & Hackathon Submission
- **Deliverables:**
  - Final documentation audit (`PROJECT_STATUS.md`, `PROOF.md`, `SECURITY.md`, `README.md`).
  - Live operator test run with `CHAINSTACK_CELO_MAINNET_RPC_URL` in `.env`.
- **Status:** `IN_PROGRESS`
