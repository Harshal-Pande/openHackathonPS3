# Phase 9 — Proposed Release File Manifest
**Audit Date:** November 7, 2026  
**Auditor:** Senior Release Engineer

---

## 1. Category: INCLUDE (Required Source, Tests & Documentation)

These files constitute the canonical application, test suites, container setup, and official documentation:

### Core Server & Client Source
- `src/server/app.ts` (Fastify API, static SPA serving, error sanitization)
- `src/server/config.ts` (environment schema and production invariants)
- `src/server/index.ts` (server runtime entrypoint)
- `src/server/db/database.ts` (SQLite schema migrations, models, queries)
- `src/server/auth/operatorAuth.ts` (SHA-256 timing-safe operator auth)
- `src/server/providers/chainstack.ts` (OP Geth RPC client with redaction)
- `src/server/providers/cencori.ts` (Cencori AI client and prompt payload builder)
- `src/server/schemas/aiExplanationSchema.ts` (10-rule anti-hallucination Zod validator)
- `src/server/services/investigationService.ts` (orchestration, persistence, limits)
- `src/server/services/aiExplanationService.ts` (AI processing and fallback)
- `src/server/services/buyQuoteService.ts` (11-state payment lifecycle in SQLite)
- `src/server/forensics/classifier.ts` (5-tier causality categorization)
- `src/server/forensics/evidenceBuilder.ts` (atomic SHA-256 evidence builder)
- `src/server/forensics/explanationEngine.ts` (deterministic narrative builder)
- `src/server/forensics/revertDecoder.ts` (Solidity Error & Panic decoder)
- `src/server/forensics/traceParser.ts` (EVM call tree parser with depth/frame caps)
- `src/server/forensics/types.ts` (forensic and API domain types)
- `src/client/App.tsx` (React 19 dark forensics dashboard)
- `src/client/main.tsx` (Vite DOM mount)
- `index.html` (SPA HTML entrypoint)

### Test Suites (93 Automated Tests across 13 Suites)
- `tests/userJourneyE2E.test.ts` (10 E2E integration scenarios A-J)
- `tests/config.test.ts` (16 configuration & production invariant tests)
- `tests/traceParser.test.ts` (8 trace parsing & depth/frame cap tests)
- `tests/aiValidation.test.ts` (9 anti-hallucination validator tests)
- `tests/buyQuote.test.ts` (9 payment lifecycle & cap tests)
- `tests/buySecurity.test.ts` (4 operator auth & injection tests)
- `tests/investigations.test.ts` (6 API boundary & reload tests)
- `tests/regressionEdgeCases.test.ts` (10 error mapping & edge-case tests)
- `tests/chainstackProvider.test.ts` (6 RPC provider & redaction tests)
- `tests/revertDecoder.test.ts` (5 revert & panic decoder tests)
- `tests/cencoriProvider.test.ts` (3 Cencori quote & prompt tests)
- `tests/health.test.ts` (4 health, static SPA, and traversal guard tests)
- `tests/forensics.test.ts` (3 classification & evidence tests)

### Build, Config & Containerization
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.server.json`
- `tsconfig.client.json`
- `vite.config.ts`
- `vitest.config.ts`
- `Dockerfile` (multi-stage Node 22 Alpine container)
- `.dockerignore`
- `.gitignore`
- `.env.example`

### Official Documentation & Evaluation Records
- `README.md`
- `AGENTS.md`
- `DECISIONS.md`
- `PROJECT_STATUS.md`
- `PROJECT_ROADMAP.md`
- `IMPLEMENTATION_STATUS.md`
- `SECURITY.md`
- `TEST_RESULTS.md`
- `PROOF.md`
- `FILE_MANIFEST.json`
- `FORENSIC_GOLDEN_CASES.md`
- `GOLDEN_CASES.csv`
- `USER_TESTING_GUIDE.md`
- `USER_TEST_LOG.csv` (blank template)
- `INDEPENDENT_USER_EVIDENCE_TEMPLATE.md`
- `DEMO_SCRIPT.md`
- `DEPLOYMENT_READINESS.md`
- `BUY_LIVE_EXECUTION_READINESS.md`
- `BUY_PAYMENT_LIFECYCLE.md`
- `CENCORI_INTEGRATION.md`
- `ZERO_COST_FUNDING_RESEARCH.md`
- `RELEASE_CANDIDATE_STATUS.md`
- `RELEASE_NOTES_RC1.md`
- `BROWSER_E2E_RESULTS.md`
- `PRODUCTION_RUNTIME_RESULTS.md`
- `DOCKER_VALIDATION_RESULTS.md`
- `PHASE_7_RESULTS.md`
- `PHASE_8_INITIAL_AUDIT.md`
- `PHASE_8_SECURITY_REVIEW.md`
- `GIT_RELEASE_REVIEW.md`
- `docs/01_PRODUCT_REQUIREMENTS.md` through `docs/10_DECISIONS_AND_NON_GOALS.md`

---

## 2. Category: EXCLUDE (Do NOT Include in Release)

These files must remain excluded from Git and container contexts:
- `.env` (contains active local secret RPC endpoint)
- `.env.*` (any temporary environment files)
- `data/revertlens.sqlite` (local runtime database)
- `data/*.sqlite` / `data/*.db` (any database files)
- `node_modules/` (dependency directory)
- `dist/` (build artifacts, generated on build)
- `coverage/` (test coverage reports)
- `*.log` (temporary runtime logs)
- Scratch scripts (`scratch_*.js`)

---

## 3. Category: REVIEW (Human Confirmation Required)

These files document phase transitions or internal agent prompts and should be confirmed by the human operator:
- `prompts/00_MASTER_BUILD_PROMPT.md` through `prompts/04_DEPLOY_AND_SUBMIT.md` (historical prompts).
- `templates/*` (original specification templates).
- Historical audit documents (`INDEPENDENT_AUDIT_AND_FULL_PROJECT_REPORT.md`, `PHASE_5_6_RESULTS.md`, `PHASE_6_RESULTS.md`).
- Gate 0 historical records (`GATE0_APPROVAL_REQUEST.md`, `GATE0_PREFLIGHT.md`, `GATE0_RESULTS.md`).
