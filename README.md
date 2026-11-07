# RevertLens

**Celo transaction failure investigation with evidence and transparent service-payment proof.**

RevertLens is an evidence-based forensic application for Celo Mainnet (`eip155:42220`). It investigates reverted blockchain transactions, parses nested execution call trees via `debug_traceTransaction` with `callTracer`, decodes Solidity reverts and panics, tracks continuous failure propagation to isolate caught sub-calls, builds an atomic SHA-256 evidence ledger, and provides clear causal explanations with full round-trip SQLite persistence.

## Architecture & Technology

- **Runtime & Language:** Node.js 22 LTS, TypeScript with strict mode.
- **Backend API:** Fastify with standard JSON envelope (`data`, `error`, `requestId`), CORS, and strict Zod boundary validation.
- **RPC Provider:** Direct Elastic Global Node via Chainstack (OP Geth client, Celo Mainnet 42220, debug & trace namespaces, rate-limit backoff, URL redaction).
- **Payment & Discovery:** `@celo/buy` CLI integration for capability discovery and x402-v2 quotes.
- **Forensics Pipeline:** Revert decoder (Solidity `Error(string)` & `Panic(uint256)`), EVM call trace tree parser with causality classification (`NO_FAILURE`, `OBSERVED_FAILURE`, `CAUGHT_CHILD_REVERT`, `PROPAGATION_SUPPORTED`, `CAUSALITY_UNCERTAIN`), atomic evidence ledger builder (`[E-01]`, `[E-02]`), and deterministic classifier.
- **Persistence:** Native Node 22 SQLite (`node:sqlite`) with schema migrations.
- **Frontend Dashboard:** React 19 + Vite dark blockchain forensics dashboard with interactive call trace viewer, root failure badges, honest stage progression, and JSON report export.
- **Testing:** 110 unit and integration tests passing in Vitest across 14 suites (100% pass rate), plus custom headless Google Chrome browser automation.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure local environment:
   Copy `.env.example` to `.env` and set `CHAINSTACK_CELO_MAINNET_RPC_URL` to your Celo Mainnet node endpoint.
3. Run tests and typecheck:
   ```bash
   npm run typecheck
   npm test
   ```
4. Build and run locally:
   ```bash
   npm run build
   npm start
   ```

## Authoritative documents

Read in this order:

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

## Non-negotiable truth rule

A task is not complete because an agent says it is complete. It is complete only when the relevant command was executed, its exit code and output were inspected, and evidence was saved. Every result must be labelled `LIVE_MAINNET`, `LOCAL`, `MOCKED`, or `NOT_TESTED`.

Never commit wallet secrets, seed phrases, bearer tokens, private payment authorisations, or real user personal information.

## Current status

- Product specification: prepared and locked.
- Architecture and contracts: fully specified in `docs/`.
- Workspace rules and instructions: active in `AGENTS.md` and `.agents/rules/`.
- Technical foundation: complete (Node 22, Fastify, React 19, TypeScript strict mode, Vitest, native SQLite `node:sqlite`).
- Automated tests: 110 passed across 14 test suites (100% pass rate).
- Production build: clean (`tsc` server compile + Vite client bundle).
- Direct Chainstack Elastic Global Node: integrated (`src/server/providers/chainstack.ts`) for zero-cost high-throughput Celo Mainnet RPC with OP Geth client, native `debug`/`trace` namespaces, backoff, and URL redaction.
- Live RPC execution: verified against live Celo Mainnet 42220 (`eth_chainId`, block number, candidate transaction `0xb90bcca5...`, receipt, and 4-frame execution trace).
- Forensic investigation engine: complete (`revertDecoder` for `Error(string)` & `Panic(uint256)`, `traceParser` with EVM causality taxonomy, recursion depth and frame count capping, `evidenceBuilder` with SHA-256 digests, `classifier`, and evidence-citing `explanationEngine`).
- SQLite persistence: complete with full round-trip reload restoring `rawTree`, `decodedRevert`, `flattenedFrames`, and `description`.
- Frontend dashboard: complete (`src/client/App.tsx`) with dark forensics UI, call trace viewer, root failure highlights, honest stage progression without fake timers, evidence ledger, distinct three-tier architecture cards (`DETERMINISTIC ANALYSIS`, `AI ENHANCED EXPLANATION`, and `BUY PAYMENT STATUS`), and JSON report export. Fastify serves static SPA index and assets directly.
- Buy live catalogue: inspected (170 capabilities active; `chainstack.celo` and `cencori.v1.chat.completions` 402 quotes verified).
- Cencori AI integration: complete (`CencoriProvider`, bounded evidence input, strict Zod output validation enforcing evidence citations and rejecting invented addresses, safe deterministic fallback).
- Buy payment architecture: complete (11-state lifecycle in SQLite, cryptographic quote-to-approval binding via SHA-256, operator auth gate, emergency kill switch; stopped at approval stage with $0.00 spent; live settlement NOT executed).
- Zero-cost funding research: complete (`ZERO_COST_FUNDING_RESEARCH.md` details Google Cloud Web3 USA₮ faucet eligibility).
- Official Hackathon Attribution Tag: integrated (`celo_235f6ef56f5b` via `@celo/attribution-tags` ERC-8021 data suffix).
- Official Agent Wallet: identified and audited (`0x3e1bef07824cd0E076F4907641F0A0EF27898e52`).
- ERC-8004 identity: registration transaction prepared with pre-computed tagged payload calling `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`; on-chain signing pending operator action.
- Independent users: not yet recruited or verified.
- Deployment: local production runtime verified on port 3009; cloud deployment pending.
- Docker: multi-stage Dockerfile statically audited; host runtime execution not tested (Docker engine unavailable on host).

Do not change these statuses without evidence.
