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

- Product specification: prepared.
- Architecture and contracts: specified.
- Workspace rules and instructions: active.
- Minimal technical foundation: established (Node 22, Fastify, React 19, TypeScript strict, Vitest).
- Automated tests: 6 passed (config validation, health endpoint envelope).
- Buy live catalogue: inspected (Chainstack Celo and Cencori endpoints active).
- Chainstack Celo trace capability through Buy: unverified (awaiting operator approval and wallet setup).
- Cencori paid call through Buy: unverified (awaiting operator approval).
- ERC-8004 identity: not yet registered.
- Independent users: not yet recruited or verified.
- Deployment: not yet performed.

Do not change these statuses without evidence.
