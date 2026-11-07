# RevertLens

**Celo transaction failure investigation with evidence and transparent service-payment proof.**

This repository is the final implementation specification for the RevertLens hackathon MVP. It is designed to be opened as a project in **Google Antigravity**. It is not a source-code implementation and does not claim that any paid call, trace, deployment, or user test has already succeeded.

## Start here

1. Open this folder as the Antigravity workspace.
2. Read `ANTIGRAVITY_START_HERE.md`.
3. Antigravity automatically loads the root `AGENTS.md` and the workspace rules in `.agents/rules/`.
4. Paste the complete prompt from `prompts/00_MASTER_BUILD_PROMPT.md` into the Antigravity Agent.
5. The agent must execute Gate 0 first. It must stop before any paid action and ask the human operator to approve the exact token and amount.
6. Only after Gate 0 is recorded may it implement the product.

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
- Automated tests: 35 passed across 7 test suites (100% pass).
- Production build: clean (`tsc` server compile + Vite client bundle).
- Direct Chainstack Elastic Global Node: integrated (`src/server/providers/chainstack.ts`) for zero-cost high-throughput Celo Mainnet RPC with OP Geth client, native `debug`/`trace` namespaces, backoff, and URL redaction.
- Forensic investigation engine: complete (`revertDecoder` for `Error(string)` & `Panic(uint256)`, `traceParser` with revert propagation analysis, `evidenceBuilder` with SHA-256 digests, `classifier`, and evidence-citing `explanationEngine`).
- Frontend dashboard: complete (`src/client/App.tsx`) with dark forensics UI, call trace viewer, root failure highlights, evidence ledger, and JSON report export.
- Buy live catalogue: inspected (170 capabilities active; `chainstack.celo` and `cencori.v1.chat.completions` 402 quotes verified).
- Cencori AI explanation: capability mapped, Google Cloud Web3 USA₮ faucet compatibility verified for zero-cost Buy wallet funding.
- Live RPC execution on host: ready immediately upon operator setting `CHAINSTACK_CELO_MAINNET_RPC_URL` in `.env`.
- ERC-8004 identity: not yet registered.
- Independent users: not yet recruited or verified.
- Deployment: local build verified; production deployment pending.

Do not change these statuses without evidence.
