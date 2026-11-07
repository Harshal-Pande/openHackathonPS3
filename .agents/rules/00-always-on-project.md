---
trigger: always_on
description: "Always-active RevertLens product scope, engineering defaults and truthfulness requirements."
---
# RevertLens always-on rules

- Product scope is fixed by `docs/01_PRODUCT_REQUIREMENTS.md`; do not add features outside it without recording a decision.
- Read `AGENTS.md` and the relevant docs before coding.
- Use TypeScript strict mode, Fastify, React/Vite, Zod, viem, SQLite and Vitest unless a documented blocker requires a change.
- Build Gate 0 before UI polish.
- Do not invent live results, users, transaction hashes, ERC-8004 IDs, prices, quotes, or payment receipts.
- Label evidence `LIVE_MAINNET`, `LOCAL`, `MOCKED`, or `NOT_TESTED`.
- Do not ask routine questions. Make safe assumptions and document them.
- Ask for human approval before payment, wallet signing, public publishing, deployment or other irreversible/external actions.
- Keep implementation simple. No microservices, no agent framework, no arbitrary endpoint feature.
