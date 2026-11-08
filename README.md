# RevertLens

**"Your Celo transaction failed. Find out why."**

RevertLens is an evidence-based forensic investigation platform for Celo Mainnet (`eip155:42220`). It investigates reverted blockchain transactions, parses nested execution call trees via `debug_traceTransaction` with `callTracer`, decodes Solidity reverts and panics, tracks continuous failure propagation to isolate caught sub-calls, builds an atomic SHA-256 evidence ledger, and provides clear causal explanations with full round-trip SQLite persistence.

---

## Architecture & Technology

- **Runtime & Language:** Node.js 22 LTS, TypeScript with strict mode.
- **Backend API:** Fastify 5 with standard JSON envelope (`data`, `error`, `requestId`), CORS, and strict Zod boundary validation.
- **RPC Provider:** Direct Elastic Global Node via Chainstack (OP Geth client, Celo Mainnet 42220, debug & trace namespaces, rate-limit backoff, URL redaction).
- **Payment & Marketplace:** `@celo/buy` CLI integration for capability discovery, HTTP 402 challenge handling, and x402-v2 quotes.
- **Forensics Pipeline:** Revert decoder (Solidity `Error(string)` & `Panic(uint256)`), EVM call trace tree parser with causality classification (`NO_FAILURE`, `OBSERVED_FAILURE`, `CAUGHT_CHILD_REVERT`, `PROPAGATION_SUPPORTED`, `CAUSALITY_UNCERTAIN`), atomic evidence ledger builder (`[E-01]` to `[E-05]`), and deterministic classifier.
- **Persistence:** Native Node 22 SQLite (`node:sqlite`) with automated schema migrations.
- **Frontend Workbench ("The Evidence Bench"):** React 19 + Vite modular institutional forensics workbench with interactive call trace viewer, deepest failing frame badges, evidence ledger, WCAG AAA contrast, and JSON report export.
- **Attribution & Identity:** Assigned attribution tag `celo_235f6ef56f5b` enforced via `@celo/attribution-tags` (ERC-8021) with Schema 0 wire format validation, centralized configuration (`src/server/config/attribution.ts`), and request classification; ERC-8004 agent registration calldata prepared for Celo Identity Registry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`).
- **Testing:** 458 unit and integration tests passing in Vitest across 21 suites (100% pass rate), 36/36 API route injection tests, 14/14 live mainnet verification checks, plus real Chrome DevTools Protocol (CDP) automated browser testing on Desktop (1280x800) and Mobile (375x812) viewports.

---

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure local environment:**
   Copy `.env.example` to `.env` and set `CHAINSTACK_CELO_MAINNET_RPC_URL` to your Celo Mainnet node endpoint.
3. **Run tests and typecheck:**
   ```bash
   npm run typecheck
   npm test
   ```
4. **Build and run locally:**
   ```bash
   npm run build
   npm start
   ```

---

## Authoritative Documentation Structure

### Master Governance & Execution Tracking:
- [MASTER_PROJECT_AUDIT.md](file:///D:/Blockchain/BuildWithBuy/MASTER_PROJECT_AUDIT.md) — Definitive technical, architectural, security, and operational audit.
- [MASTER_EXECUTION_ROADMAP.md](file:///D:/Blockchain/BuildWithBuy/MASTER_EXECUTION_ROADMAP.md) — Critical-path module-by-module engineering roadmap (Modules 1 through 8).
- [USER_ACTION_CHECKLIST.md](file:///D:/Blockchain/BuildWithBuy/USER_ACTION_CHECKLIST.md) — Explicit step-by-step instructions for the 10 human-owned tasks (Category A).
- [ANTIGRAVITY_TASK_REGISTER.md](file:///D:/Blockchain/BuildWithBuy/ANTIGRAVITY_TASK_REGISTER.md) — Complete register of 16 agent-owned technical tasks (Category B).
- [MASTER_DEFECT_REGISTER.md](file:///D:/Blockchain/BuildWithBuy/MASTER_DEFECT_REGISTER.md) — Authoritative defect ledger (DEF-01 through DEF-20).
- [DOCUMENTATION_INVENTORY.md](file:///D:/Blockchain/BuildWithBuy/DOCUMENTATION_INVENTORY.md) — Inventory and relocation record of all 106 markdown files.
- [MASTER_CHANGELOG.md](file:///D:/Blockchain/BuildWithBuy/MASTER_CHANGELOG.md) — Unified chronological engineering changelog (Phases 0 through 13).
- [DECISIONS.md](file:///D:/Blockchain/BuildWithBuy/DECISIONS.md) — Architecture decision records (AD-001 through AD-008).
- [PROOF.md](file:///D:/Blockchain/BuildWithBuy/PROOF.md) — Verified on-chain transaction hashes and forensic proof ledger.
- [TEST_RESULTS.md](file:///D:/Blockchain/BuildWithBuy/TEST_RESULTS.md) — Automated verification and test execution ledger.
- [SECURITY.md](file:///D:/Blockchain/BuildWithBuy/SECURITY.md) — Core security policies, key invariants, and threat models.

### Foundational Specifications (`docs/`):
1. `docs/01_PRODUCT_REQUIREMENTS.md`
2. `docs/02_ARCHITECTURE_AND_DATA_MODEL.md`
3. `docs/03_BUY_GATE0_RUNBOOK.md`
4. `docs/04_SECURITY_AND_PRIVACY.md`
5. `docs/05_API_CONTRACT.md`
6. `docs/06_UI_UX_SPECIFICATION.md`
7. `docs/07_TEST_AND_ACCEPTANCE_PLAN.md`
8. `docs/08_IMPLEMENTATION_PLAN.md`
9. `docs/09_HACKATHON_COMPLIANCE.md`
10. `docs/10_DECISIONS_AND_NON_GOALS.md`

### Historical Archive (`docs/archive/`):
All 62 historical phase summaries, completed execution logs, superseded audits, and obsolete prompt documents are safely preserved in:
- `docs/archive/phase-reports/` (30 files: Phase 5 to Phase 12.5 reports, Gate 0 requests)
- `docs/archive/execution-logs/` (6 files: CDP test outputs, runtime logs, blocker logs)
- `docs/archive/superseded-audits/` (21 files: intermediate audits consolidated into Master Audit)
- `docs/archive/obsolete-prompts/` (5 files: initial build orchestration prompts)

---

## Non-Negotiable Truth Rule

A task is not complete because an agent says it is complete. It is complete only when the relevant command was executed, its exit code and output were inspected, and evidence was saved. Every result must be labelled `LIVE_MAINNET`, `LOCAL`, `MOCKED`, or `NOT_TESTED`.

Never commit wallet secrets, seed phrases, bearer tokens, private payment authorisations, or real user personal information.
