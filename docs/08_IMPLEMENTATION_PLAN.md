# 08 — Implementation plan and sequencing

## Phase 0: workspace audit

Deliver:
- `WORKSPACE_AUDIT.md`;
- Git status;
- runtime versions;
- secrets inventory by filename only;
- current source-code inventory.

Exit: no user work overwritten; workspace identity confirmed.

## Phase 1: Gate 0

Deliver:
- redacted live catalogue;
- current Buy CLI version/help;
- exact capability schema;
- exact quotes;
- real approved payment proof;
- trace result;
- Cencori result;
- `GATE0_RESULTS.md`.

Exit: explicit GO, fallback, or STOP decision.

## Phase 2: backend foundation

Deliver:
- project scaffold;
- config validation;
- SQLite schema/migrations;
- typed domain models;
- API error envelope;
- health route;
- test setup.

Exit: clean install, migrations, typecheck, tests, build.

## Phase 3: payment safety and Buy adapter

Deliver:
- capability allowlist;
- quote creation;
- operator auth;
- immutable quote;
- exact approval;
- atomic budget reservation;
- CLI adapter;
- settlement verification;
- no-retry behaviour;
- payment ledger.

Exit: all payment safety tests pass; live calls only if approved.

## Phase 4: forensic engine

Deliver:
- Celo RPC adapter;
- transaction/receipt normalizer;
- trace normalizer;
- propagation analysis;
- revert decoders;
- evidence IDs;
- deterministic report.

Exit: golden fixture tests and edge cases pass.

## Phase 5: Cencori explanation

Deliver:
- bounded prompt;
- response schema;
- evidence-ID validator;
- causal-claim policy;
- deterministic fallback.

Exit: adversarial prompt tests pass.

## Phase 6: frontend

Deliver:
- landing;
- plan;
- progress;
- report;
- technical view;
- operator console;
- ledger.

Exit: responsive browser tests pass; no fake progress or payment state.

## Phase 7: security and user evaluation

Deliver:
- security review;
- golden transaction evaluation;
- real user feedback log;
- privacy/retention policy;
- release candidate.

Exit: no critical/high blocker; honest metrics.

## Phase 8: deployment and submission

Deliver:
- production deployment;
- post-deploy smoke test;
- ERC-8004 identity evidence;
- README and proof;
- demo recording/script;
- final compliance checklist.

External actions require separate human approval.

## Time management

The agent must not spend time on animations, charts, accounts, optional providers, customer payments, multi-chain support or nonessential abstractions. If the deadline is close, prioritize:
1. live Buy proof;
2. correct paid RPC/trace;
3. payment safety;
4. correct report;
5. working simple UI;
6. genuine users;
7. deployment and submission evidence.
