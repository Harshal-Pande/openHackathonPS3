# 02 — Architecture and data model

## 1. Fixed stack

- Node.js 22+.
- npm.
- TypeScript strict mode.
- Fastify backend.
- React + Vite frontend.
- Zod boundary validation.
- viem for EVM utilities.
- SQLite for MVP persistence.
- Vitest; Playwright for minimal browser E2E.
- Single deployable application. No microservices.

## 2. High-level architecture

```text
Browser
  ├── Public user UI
  └── Protected operator UI
          |
          v
Fastify API
  ├── Input and chain validation
  ├── Investigation state machine
  ├── Quote and operator approval service
  ├── Spend policy / kill switch
  ├── Buy adapter (official CLI/MCP interface)
  ├── Celo RPC response normalizer
  ├── Trace parser + revert decoder
  ├── Evidence and claim validator
  ├── Cencori adapter (optional, through Buy)
  ├── Report builder
  └── SQLite repository
```

## 3. Investigation state machine

`CREATED`
→ `VALIDATING_INPUT`
→ `DISCOVERING_CAPABILITIES`
→ `QUOTING`
→ `AWAITING_OPERATOR_APPROVAL`
→ `APPROVED`
→ `PURCHASE_PENDING`
→ `SETTLEMENT_UNKNOWN | SETTLED | NOT_SETTLED`
→ `FETCHING_TRANSACTION`
→ `FETCHING_RECEIPT`
→ `FETCHING_TRACE` (only if failed and supported)
→ `NORMALIZING_EVIDENCE`
→ `REQUESTING_EXPLANATION` (optional)
→ `VALIDATING_CLAIMS`
→ `COMPLETE | PARTIAL | INCONCLUSIVE | FAILED`

No state may automatically repeat a paid purchase stage. An ambiguous state requires receipt resolution, not a retry.

## 4. Service boundaries

### Buy adapter
A narrow adapter for exact approved capabilities. No generic proxy endpoint. It must use current live catalogue schemas and the exact quote/body approved by the operator.

### Chainstack adapter
Sends only JSON-RPC methods validated against the current Chainstack capability. Match batch response by JSON-RPC ID. A provider response is untrusted until schema-validated.

### Trace normalizer
Normalizes only the observed provider trace format. Apply byte, node and depth limits. Record truncation. Do not assume every client uses identical callTracer fields.

### Failure propagation analyser
A frame error is not automatically a transaction-level cause. Model parent-child call relationships and whether a parent returned/handled the child error. The report can state the deepest failing frame, but causal attribution requires proof that failure propagated to the root transaction.

### Cencori adapter
Sends structured facts, not raw unbounded traces or user-controlled instructions. No tools. No purchase authority. Response must match a strict schema and each claim must cite evidence IDs.

## 5. Core domain entities

### Investigation
- `id` UUID/ULID;
- `txHash`;
- `chainId`;
- `status`;
- `createdAt`, `updatedAt`, `completedAt`;
- `evidenceCompleteness`;
- `reportId`.

### EvidenceItem
- `id`;
- `investigationId`;
- `kind`;
- `source` (`CHAINSTACK_RPC`, `TRACE`, `RECEIPT`, `DECODER`, `CENCORI`);
- `value` JSON;
- `observedAt`;
- `sourceRequestId`;
- `confidence`;
- `limitations`;
- `contentHash`.

### QuoteRecord
- `id`;
- `capabilityId`;
- `method`;
- `url`;
- `exactBody`;
- `bodySha256`;
- `tokenSymbol`;
- `tokenContract`;
- `tokenDecimals`;
- `amountAtomic` string;
- `amountDisplay` string;
- `recipient`;
- `quotedAt`;
- `expiresAt`;
- `status`.

### OperatorApproval
- `id`;
- `quoteId`;
- `bodySha256`;
- `tokenContract`;
- `amountAtomic`;
- `recipient`;
- `operatorSessionId`;
- `approvedAt`;
- `consumedAt`;
- `status`.

Approval is immutable. A changed quote or body requires a new approval.

### PurchaseAttempt
- `id`;
- `quoteId`;
- `approvalId`;
- `startedAt`;
- `finishedAt`;
- `status`;
- `httpStatus`;
- `correlationId`;
- `redactedOutputRef`;
- `errorCode`.

### SettlementProof
- `id`;
- `purchaseAttemptId`;
- `chainId`;
- `txHash`;
- `receiptStatus`;
- `txSender`;
- `payerOrAuthorizer`;
- `recipient`;
- `tokenContract`;
- `amountAtomic`;
- `verifiedAt`;
- `verificationMethod`.

### Report
- `id`;
- `investigationId`;
- `summary`;
- `facts`;
- `inferences`;
- `unknowns`;
- `nextChecks`;
- `evidenceRefs`;
- `serviceLedgerRefs`;
- `visibility` (`UNLISTED` by default);
- `createdAt`.

## 6. Accounting rules

- Store atomic amounts as decimal strings, never JS floating-point numbers.
- Keep token contract and decimals with every amount.
- Never sum raw atomic amounts across different tokens.
- Separate original transaction status from Buy settlement status.
- Distinguish quote, attempt, settlement, service response and evidence contribution.
- A paid request with an error response may still be settled.
- An HTTP success without verified settlement is not a verified paid call.

## 7. Persistence and concurrency

Use SQLite transactions for:
- quote consumption;
- approval consumption;
- budget reservation;
- idempotency key insertion;
- purchase attempt creation.

Enforce unique idempotency keys and unique quote consumption. Use a single-writer strategy or SQLite locking appropriate for the deployment. Do not rely on in-memory counters for spending limits.

## 8. Deployment architecture

The Buy CLI depends on its supported local wallet/keychain mechanism. Do not assume serverless hosting or an arbitrary VPS can access it. Before selecting hosting:
1. verify the supported keychain environment;
2. run a smoke test on the exact host;
3. confirm persistent storage;
4. confirm restart behaviour;
5. confirm wallet secrets are not copied into environment dumps or logs.

If the only working environment is a local machine, use it for the demo with a secure tunnel only after assessing exposure. Never expose an unauthenticated admin endpoint.
