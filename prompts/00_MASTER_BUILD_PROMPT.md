# MASTER PROMPT — BUILD REVERTLENS IN GOOGLE ANTIGRAVITY

You are working in Google Antigravity inside the RevertLens project workspace. This is a detailed execution contract. Follow it literally. Do not ask the operator routine questions. Do not skip steps. Do not claim success without evidence.

## 1. First inspect, do not edit

1. Print the current working directory.
2. List all files and folders in the workspace.
3. Read `AGENTS.md`.
4. Read every `.agents/rules/*.md` file.
5. Read all ten documents in `docs/` in numerical order.
6. Confirm the workspace is the extracted RevertLens package.
7. Check Git status if this is already a Git repository. Do not overwrite existing user work.
8. Check whether `.gitignore` exists and inspect it.
9. Create a concise `WORKSPACE_AUDIT.md` with:
   - files found;
   - current Git status;
   - Node/npm versions;
   - whether source code already exists;
   - whether secrets or `.env` files are present (report only filenames, never values);
   - any conflicting project files.
10. Do not delete or replace any existing file without first explaining the reason and asking approval.

## 2. Understand the fixed product

RevertLens accepts a Celo mainnet transaction hash. It fetches transaction and receipt evidence through the paid Chainstack Celo RPC capability in Buy. For failed transactions it attempts `debug_traceTransaction` with a call tracer only if Gate 0 proves the live Buy route supports it. It normalizes the trace, decodes supported revert data, uses Cencori through Buy for a bounded explanation, validates every generated claim, and produces a report plus a payment proof ledger.

No customer wallet connection is required for the core analysis. The project wallet pays the Buy service costs. Only an authenticated operator can approve those project-wallet payments. The product does not sign user transactions, repair transactions, simulate transactions, or guarantee root cause.

## 3. Do Gate 0 before building the product

Read `docs/03_BUY_GATE0_RUNBOOK.md` fully.

Perform read-only checks first:
- Node and npm versions;
- Buy CLI availability and version;
- `buy --help`, relevant subcommand help;
- current Buy skill documentation;
- live Buy catalogue;
- exact capability IDs, URLs, methods, input schemas and accepted token options.

Do not assume the prior Buy skill version, route ID, endpoint, model name, amount, token decimals or CLI output schema is still current.

Prepare exact request bodies for:
- `eth_chainId`;
- `eth_getTransactionByHash`;
- `eth_getTransactionReceipt`;
- `debug_traceTransaction` using the known candidate transaction in the runbook, after verifying that it is a real failed Celo mainnet transaction;
- minimal Cencori inference request.

Obtain exact quotes. For every quote, display to the operator:
- provider/capability;
- HTTP method and exact URL;
- exact request body or its readable representation;
- SHA-256 of exact serialized body;
- token symbol and contract address;
- decimals;
- atomic amount;
- human-readable amount;
- recipient/payee;
- quote expiry if supplied;
- reason the call is necessary;
- maximum amount the operator is being asked to approve.

STOP. Do not make a paid call until the operator explicitly approves that exact call and amount in the current conversation. A broad instruction to build the app is not payment approval.

After approval:
- invoke the official Buy CLI/MCP mechanism;
- use a strict maximum equal to or lower than the approved amount;
- do not change body, route, token or recipient after approval;
- save redacted stdout/stderr and raw response evidence;
- resolve the settlement receipt;
- verify token, amount, recipient, payer/authorizer if available, transaction sender, transaction hash and receipt status;
- record whether the service response was useful.

Never retry an ambiguous paid attempt. Resolve its settlement status first.

Update `GATE0_RESULTS.md`. Every line starts `NOT_TESTED`; change it only after the exact action is performed. Use statuses `PASS`, `FAIL`, `BLOCKED`, `NOT_TESTED`. Include evidence path and test class (`LIVE_MAINNET`, `LOCAL`, `MOCKED`).

### Gate 0 decision

- If Chainstack transaction and receipt calls work, continue to assess trace.
- If trace works and returns a usable call tree for the failed transaction, primary product path may proceed.
- If trace is unsupported, stop and present the receipt-only fallback decision. Do not silently substitute free RPC.
- If Chainstack paid RPC itself is unavailable, stop this product path and report a blocker. Do not claim Buy integration.
- If Cencori is unavailable, a deterministic explanation fallback may proceed only if the trace path remains useful. Record that the LLM integration is not live.
- If operator approval is not provided, do not spend. Continue only with mocked local implementation if explicitly safe and label all such work.

## 4. Architecture choices are fixed

Use:
- Node.js 22+;
- npm;
- TypeScript strict;
- Fastify;
- React + Vite;
- Zod;
- viem;
- SQLite;
- Vitest;
- Playwright for a small E2E suite if practical.

Do not add microservices, LangChain/agent frameworks, arbitrary RPC URLs, customer x402, browser sessions, X, Reddit, or token scanning.

If a required library is unavailable or incompatible, explain the exact error and choose the smallest compatible replacement. Record it in `DECISIONS.md`.

## 5. Build in this order

1. Project scaffold and scripts.
2. Configuration validation and `.env.example`.
3. Database schema and migrations.
4. Typed domain models and evidence schema.
5. Buy adapter behind a narrow interface.
6. Payment quote/approval/ledger safety.
7. Celo RPC adapter and JSON-RPC batch matching.
8. Trace parser and propagation analysis.
9. Revert decoders.
10. Deterministic evidence assessment.
11. Cencori adapter and claim validator.
12. Report builder.
13. Public read-only frontend.
14. Protected operator console.
15. Tests and security hardening.
16. Deployment configuration and documentation.

Do not build frontend mock data as if it were live. Demo fixtures must have a visible `MOCKED DEMO` label.

## 6. Before every edit

- Identify which specification section governs the change.
- Inspect existing code before replacing it.
- Make a small coherent change.
- Run relevant tests and type checks.
- Record the command and exact outcome.
- Keep the app runnable at each phase.

## 7. Human approval gates

Stop and request approval before:
- any Buy payment;
- funding or changing the project wallet;
- signing/registering ERC-8004;
- creating/publishing/changing a GitHub repository;
- publishing user reports or personal data;
- deploying to a public host;
- changing DNS or production secrets;
- submitting the hackathon entry.

For approval requests, show exact action, target, amount (if money), risks and rollback limits. Do not bundle multiple approvals into one vague request.

## 8. Final quality gate

Before saying implementation is complete, verify:
- all tests and type checks pass;
- no secrets are tracked by Git;
- no `TODO` remains in a critical payment/security path;
- all payment states are handled;
- public reports are unlisted and sanitized;
- the deployed app works in a fresh browser session;
- Gate 0 evidence is real;
- PROOF.md contains only verified hashes;
- `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `TEST_RESULTS.md`, `GATE0_RESULTS.md`, `PROOF.md`, and `DECISIONS.md` reflect actual implementation.

At the end provide:
1. files created/changed;
2. exact commands run;
3. exact test results;
4. live/mainnet vs local vs mocked vs untested;
5. verified payment hashes only;
6. unresolved blockers;
7. whether the app is safe for a real user;
8. next action requiring human approval, if any.

Start now with section 1 only. Do not jump to coding.
