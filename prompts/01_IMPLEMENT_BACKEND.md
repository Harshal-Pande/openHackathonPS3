# PHASE 1 PROMPT — BACKEND AND PAYMENT-SAFE DOMAIN

Execute only after Gate 0 has been documented. Read `AGENTS.md` and docs 01–05 first.

## Objective

Implement the backend foundation, persistence, typed state machine, payment safety controls and Celo evidence pipeline. Do not build the frontend in this phase.

## Step A — inspect and scaffold

1. Inspect the current workspace and Git status.
2. Preserve existing work.
3. Create a single-app TypeScript project using npm.
4. Configure strict TypeScript, Fastify, Zod, viem, SQLite and Vitest.
5. Add scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `db:migrate`.
6. Add `.gitignore` before creating local configuration.
7. Add `.env.example` with names and safe placeholders only. Never put real values in it.
8. Add `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `DECISIONS.md`, `TEST_RESULTS.md`, `GATE0_RESULTS.md`, `PROOF.md`.

## Step B — domain model

Implement types and Zod schemas for:
- TransactionInput;
- TransactionFacts;
- ReceiptFacts;
- RpcRequest and RpcResponse;
- TraceFrame and NormalizedTrace;
- EvidenceItem;
- Diagnosis;
- Claim;
- Investigation;
- QuoteRecord;
- OperatorApproval;
- PurchaseAttempt;
- SettlementProof;
- Report.

Use `bigint` for chain quantities and convert to decimal strings at JSON/database boundaries. Never use JavaScript floating-point numbers for token atomic amounts, gas fees or balances.

## Step C — database

Use SQLite migrations. Minimum tables:
- investigations;
- evidence_items;
- quote_records;
- operator_approvals;
- purchase_attempts;
- settlement_proofs;
- report_records;
- operator_sessions;
- audit_events;
- user_verifications (optional, consented only).

Requirements:
- unique investigation id;
- unique idempotency key per user/session and operation;
- unique quote id;
- quote immutable after creation;
- approval references quote ID and exact request hash;
- purchase attempt persisted before calling Buy;
- separate original transaction status and Buy settlement status;
- atomic budget reservation in a database transaction;
- timestamps stored UTC ISO 8601;
- raw secrets never persisted.

## Step D — operator authentication and spending

Implement a protected operator session:
- password comes from a server-side environment secret;
- store only a strong password hash if password setup is supported;
- use secure, httpOnly, sameSite cookies in production;
- CSRF protection for state-changing operator routes;
- rate-limit login;
- short session lifetime;
- no default password;
- refuse startup in production if required operator auth configuration is missing.

Do not build a public endpoint that accepts `approvedMaxSpend` as proof of approval.

Quote/approval workflow:
1. Backend creates quote from exact current catalogue and request.
2. Persist exact method, URL, exact body bytes/hash, capability, token contract, decimals, atomic amount, display amount, recipient and expiry.
3. Operator sees the quote in a protected screen.
4. Operator approves a specific quote ID and confirms its exact amount.
5. Approval record stores operator identity/session, quote ID, request hash, amount, token and timestamp.
6. Paid execution checks the quote is unexpired, unused, not altered, below every configured cap, and approved.
7. Mark approval consumed atomically before paid invocation.
8. On ambiguous outcome, mark `SETTLEMENT_UNKNOWN`; never auto-retry.
9. Resolve receipt through the documented Buy status/receipt procedure before any new attempt.

## Step E — Buy adapter

Create a narrow interface:
- `discoverCapabilities()`
- `quoteExactRequest(request)`
- `executeApprovedRequest(quoteId, approvalId)`
- `resolveSettlement(attemptId)`
- `getHealth()`

Do not expose a generic arbitrary URL proxy.

Implementation requirements:
- allowlisted capability IDs and URLs from Gate 0 evidence;
- validate request body against the live capability schema;
- fixed CLI executable and argument array; no shell;
- strict timeout and output size cap;
- redact payment headers, tokens and credentials;
- capture correlation ID and transaction hash;
- no automatic retry;
- parse only the actual observed CLI output format; add fixture tests from redacted Gate 0 evidence;
- if current CLI cannot safely expose the needed receipt details, stop and document the blocker rather than guessing.

## Step F — RPC and forensic pipeline

Implement:
- Celo chain ID validation;
- hash validation;
- `eth_chainId`, transaction and receipt fetch;
- JSON-RPC batch response matching by `id`;
- response schema validation;
- failed/success/pending/not-found states;
- `debug_traceTransaction` only if Gate 0 passed;
- call-tree normalizer with depth/node/byte limits;
- propagation-aware failure analysis;
- standard error and panic decoding;
- custom errors unknown unless exact historical implementation ABI is verified;
- evidence IDs and provenance.

## Step G — Cencori

Implement only after live route schema and quote were verified:
- one bounded inference call;
- structured input only;
- no tools/function calling;
- no ability to change spend decisions;
- schema-constrained response;
- validate each claim against evidence IDs and exact source values;
- reject unsupported causal claims;
- deterministic fallback template.

## Step H — tests and exit criteria

At minimum test:
- valid/invalid hash;
- non-Celo chain;
- not found/pending/success/failed receipt;
- malformed RPC;
- reordered JSON-RPC batch;
- unsupported trace;
- timeout/truncation;
- caught nested failure;
- propagated nested failure;
- Error(string);
- Panic(uint256);
- unknown custom selector;
- quote tampering;
- expired quote;
- wrong token/payee;
- approval replay;
- duplicate idempotency key;
- concurrent budget reservation;
- ambiguous payment no retry;
- secret redaction;
- LLM unsupported claim rejected.

Run `npm test`, `npm run typecheck`, `npm run build` and lint if configured. Fix failures. Record exact output in `TEST_RESULTS.md`.

Do not start frontend until backend exit criteria pass.
