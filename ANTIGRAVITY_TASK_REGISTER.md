# RevertLens — Antigravity Task Register (Category B: Agent-Owned Tasks)
**Document Version:** 1.0.0  
**Generated:** 2026-11-08  
**Governance:** Antigravity Master Audit & Engineering Execution  

---

## 1. Register Overview

This register contains all technical and operational tasks owned and executed directly by Antigravity within the authorized workspace. These tasks require zero manual code writing from the user.

### Priority Scheme:
- **P0:** Critical security or fundamental correctness issue (blocks safe execution).
- **P1:** Mandatory blocker for hackathon completion (attribution, ERC-8004, Buy proof).
- **P2:** Important functionality, concurrency, or production-readiness improvement.
- **P3:** Polish, usability, bundle optimization, or documentation enhancement.

### Status Indicators:
- `READY_FOR_IMPLEMENTATION` — Fully specified, all prerequisites met.
- `USER_INPUT_REQUIRED` — Waiting on human action or approval before execution.
- `BLOCKS_NEXT_MODULE` — Must complete before downstream modules can proceed.
- `CAN_RUN_IN_PARALLEL` — Can be executed concurrently with other tasks.

---

## 2. Complete Antigravity Task Register

| Task ID | Module | Priority | Status | Title & Objective | Affected Files | Dependencies |
|:---:|:---:|:---:|:---:|:---|:---|:---:|
| **AGY-01** | Mod 1 | **P2** | `COMPLETED` | Enable SQLite WAL Mode & Busy Timeout (DEF-15) | `src/server/db/database.ts` | None |
| **AGY-02** | Mod 1 | **P2** | `COMPLETED` | Add Fastify SPA Fallback Route Handler (DEF-16) | `src/server/app.ts` | None |
| **AGY-03** | Mod 1 | **P2** | `COMPLETED` | Add Revert Decoder String Length Bounds Check (DEF-17) | `src/server/forensics/revertDecoder.ts` | None |
| **AGY-04** | Mod 1 | **P3** | `COMPLETED` | Configure Vite Vendor Code-Splitting Chunking (DEF-18) | `vite.config.ts` | None |
| **AGY-05** | Mod 2 | **P1** | `COMPLETED` | Separate Operator Auth Password from Session Secret (DEF-14) | `src/server/auth/operatorAuth.ts`, `src/server/auth/passwordHasher.ts`, `src/server/config.ts` | AGY-01 |
| **AGY-06** | Mod 2 | **P2** | `COMPLETED` | Add Rate Limiting Middleware for Public Forensic Ingestion | `src/server/auth/rateLimiter.ts`, `src/server/app.ts`, `src/server/config.ts` | AGY-05 |
| **AGY-07** | Mod 3 | **P1** | `COMPLETED` | Wire Buy CLI Execution Adapter with Security Invariants | `src/server/adapters/buyAdapter.ts`, `src/server/services/buyQuoteService.ts`, `src/server/app.ts` | None |
| **AGY-07.1** | Mod 3.2 | **P0** | `COMPLETED` | Critical Payment Path Security Remediation (DEF-23 to DEF-30) | `src/server/adapters/buyAdapter.ts`, `src/server/services/buyQuoteService.ts`, `src/server/services/capabilityRegistry.ts`, `src/server/db/database.ts` | AGY-07 |
| **AGY-07.2** | Mod 3.3 | **P0** | `COMPLETED` | Settlement Integrity & Ambiguous Payment Failure Hardening (DEF-31 to DEF-36) | `src/server/adapters/buyAdapter.ts`, `src/server/db/database.ts`, `tests/buySecurity.test.ts` | AGY-07.1 |
| **AGY-08** | Mod 3 | **P1** | `BLOCKED_PENDING_OPERATOR_APPROVAL` | Settle Live Cencori AI Quote via Buy CLI & Verify Receipt | `PROOF.md`, `GATE0_RESULTS.md` | AGY-07, USR-08 (Wallet Funding) |
| **AGY-09** | Mod 4 | **P1** | `COMPLETED` | Official ERC-8021 Attribution Engine & Celo SDK Integration | `src/server/services/celoAttributionService.ts`, `src/server/config/attribution.ts` | None |
| **AGY-04-01** | Mod 4.1 | **P1** | `COMPLETED` | Registration URI Substitution Prevention & Base URL Validation (DEF-49) | `src/server/app.ts`, `src/server/config.ts` | AGY-09 |
| **AGY-04-02** | Mod 4.1 | **P1** | `COMPLETED` | RPC Method Allowlist Classification & State-Changing Isolation (DEF-50) | `src/server/services/celoAttributionService.ts` | AGY-09 |
| **AGY-04-03** | Mod 4.1 | **P1** | `COMPLETED` | Calldata Validation Fail-Closed & Attribution Merge Safety (DEF-51, DEF-54) | `src/server/services/celoAttributionService.ts` | AGY-09 |
| **AGY-04-04** | Mod 4.1 | **P2** | `COMPLETED` | Official Agent Wallet Invariant & Structured Read-Only RPC Guard (DEF-52, DEF-53) | `src/server/config/attribution.ts`, `src/server/providers/chainstack.ts` | AGY-09 |
| **AGY-04-05** | Mod 4.1 | **P2** | `COMPLETED` | Comprehensive Regression Verification & Release Evidence (DEF-55) | Governance docs, `tests/erc8021.test.ts` | AGY-04-01..04 |
| **AGY-05-01** | Mod 5A | **P1** | `COMPLETED` | ERC-8004 Contract ABI & Proxy Verification (`0x8004A169...`, `0x7274e874...`) | `src/server/services/celoAttributionService.ts` | AGY-09 |
| **AGY-05-02** | Mod 5A | **P1** | `COMPLETED` | ERC-8004 Strict Metadata Schema & Generation (`validateErc8004Metadata`) | `src/server/services/celoAttributionService.ts` | AGY-05-01 |
| **AGY-05-03** | Mod 5A | **P1** | `COMPLETED` | Safe Preview Endpoint & Readiness State Logic (`GET /api/agent/erc8004-registration-tx`) | `src/server/app.ts` | AGY-05-02 |
| **AGY-05-04** | Mod 5A | **P1** | `COMPLETED` | Post-Mint Receipt Verification Engine & Test Suite (`verifyErc8004RegistrationReceipt`) | `src/server/services/celoAttributionService.ts`, `tests/erc8004Registration.test.ts` | AGY-05-03 |
| **AGY-10** | Mod 5B | **P1** | `BLOCKED_PENDING_MOD06` | Update Public Base URL in ERC-8004 Metadata Generation | `src/server/config.ts`, `src/server/services/celoAttributionService.ts` | USR-05, AGY-05-04 |
| **AGY-11** | Mod 5B | **P1** | `BLOCKED_PENDING_MOD06` | Verify Broadcasted ERC-8004 Registration Receipt & Token ID | `PROOF.md`, `GATE0_RESULTS.md` | USR-07, AGY-10 |
| **AGY-12** | Mod 6 | **P1** | `READY_FOR_IMPLEMENTATION` | Audit Multi-Stage Dockerfile & Container Readiness | `Dockerfile`, `.dockerignore` | AGY-01 to AGY-05 |
| **AGY-13** | Mod 6 | **P1** | `USER_INPUT_REQUIRED` | Verify Live Public Deployment Endpoints (`/api/health`, `/api/agent/metadata`) | Public URL | USR-05 |
| **AGY-14** | Mod 7 | **P2** | `USER_INPUT_REQUIRED` | Execute Independent User Testing Suite on Live Domain | `INDEPENDENT_USER_EVIDENCE.md` | AGY-13 |
| **AGY-15** | Mod 8 | **P1** | `USER_INPUT_REQUIRED` | Final Pre-Submission Cleanliness Review & Git Push Verification | Git repository | USR-04 |
| **AGY-16** | Mod 8 | **P1** | `USER_INPUT_REQUIRED` | Reconcile All Hackathon Claims in `PROOF.md` & `README.md` | `README.md`, `PROOF.md`, `MASTER_CHANGELOG.md` | AGY-08, AGY-11 |

---

## 3. Detailed Task Specifications

### TASK AGY-01: Enable SQLite WAL Mode & Busy Timeout (DEF-15)
- **Objective:** Prevent `SQLITE_BUSY` database locking under concurrent HTTP requests by switching SQLite journal mode from default `DELETE` to Write-Ahead Logging (`WAL`), and setting a 5000ms busy timeout.
- **Files Involved:** `src/server/db/database.ts`
- **Implementation Requirement:** In `Database` constructor, execute `this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");` immediately after opening connection.
- **Security Considerations:** Ensure WAL mode works with file permissions across Docker container volume mounts.
- **Required Tests:** Run `npm test`, verify `tests/investigations.test.ts` passes with multiple concurrent reads and writes.
- **Acceptance Criteria:** `PRAGMA journal_mode` returns `wal`; concurrent requests succeed without locking.
- **Evidence:** Terminal output from test suite and verified database pragma inspection.

### TASK AGY-02: Add Fastify SPA Fallback Route Handler (DEF-16)
- **Objective:** Ensure direct browser navigation or refreshing on clean URLs (e.g. `/investigation/:id`, `/history`, `/about`, `/operator`) serves the SPA `index.html` shell instead of HTTP 404.
- **Files Involved:** `src/server/app.ts`
- **Implementation Requirement:** Register a Fastify `setNotFoundHandler` that serves `dist/client/index.html` for GET requests when `Accept: text/html` is requested and the URL does not begin with `/api/` or `/assets/`.
- **Security Considerations:** Never serve `index.html` for missing `/api/*` endpoints; API endpoints must return standard JSON 404. Guard against path traversal.
- **Required Tests:** Add route test in `verify_all_routes.mjs` for `GET /history` and `GET /investigation/some-uuid` returning status 200 with HTML content type.
- **Acceptance Criteria:** Direct browser navigation to any client route reloads the application cleanly.
- **Evidence:** Route verification output showing 200 on deep SPA routes.

### TASK AGY-03: Revert Decoder String Length Bounds Check (DEF-17)
- **Objective:** Protect `decodeRevertData` against integer overflow or unbounded string allocations when parsing malformed or adversarial revert bytes.
- **Files Involved:** `src/server/forensics/revertDecoder.ts`
- **Implementation Requirement:** In `decodeRevertData`, validate `strLen`:
  ```ts
  const strLen = parseInt(lengthHex, 16);
  if (isNaN(strLen) || strLen < 0 || strLen > 4096) {
    return { type: 'ERROR_STRING', selector, reason: fallbackReason || 'Execution reverted', rawBytes: rawHex };
  }
  ```
- **Security Considerations:** Prevents DoS from crafted revert bytes with extreme length values.
- **Required Tests:** Add unit test in `tests/revertDecoder.test.ts` with a malicious 64-char length prefix.
- **Acceptance Criteria:** Malformed length prefix gracefully falls back to safe error representation without crashing.
- **Evidence:** Passing unit test output in `tests/revertDecoder.test.ts`.

### TASK AGY-04: Configure Vite Vendor Code-Splitting (DEF-18)
- **Objective:** Eliminate Vite build warning: `(!) Some chunks are larger than 500 kB after minification`.
- **Files Involved:** `vite.config.ts`
- **Implementation Requirement:** Configure `build.rollupOptions.output.manualChunks` to split vendor dependencies:
  - `vendor-react`: `['react', 'react-dom']`
  - `vendor-viem`: `['viem']`
  - `vendor-icons`: `['lucide-react']`
- **Security Considerations:** Ensure chunk hashes remain immutable with proper cache busting.
- **Required Tests:** Run `npm run build`, inspect chunk outputs in terminal.
- **Acceptance Criteria:** All individual JS chunks are below 350 kB; no build chunk warnings.
- **Evidence:** Build terminal output showing chunks < 350 kB.

### TASK AGY-05: Separate Operator Auth Password from Session Secret (DEF-14, MOD-02.1, MOD-02.2, MOD-02.3 & MOD-02.4 Hardening)
- **Objective:** Resolve DEF-14, DEF-19, DEF-20, DEF-21, and DEF-22 (DEF-22A, DEF-22B, DEF-22C) by ensuring `OperatorAuthService` verifies passwords against `OPERATOR_PASSWORD_HASH` using asynchronous salted scrypt, completely separating password verification from HMAC session signing with `SESSION_SECRET`, enforcing hard session capacity limits, fail-closed rate-limiter trackers, combined scrypt memory bounds, and atomic concurrency safety across mixed login outcomes.
- **Files Involved:** `src/server/auth/operatorAuth.ts`, `src/server/auth/passwordHasher.ts`, `src/server/config.ts`, `scripts/generate_password_hash.mjs`
- **Implementation & Hardening:** Implemented `hashPassword` and `verifyPassword` using Node.js built-in `crypto.scrypt` with OWASP-standard parameters ($N=16384, r=8, p=1$, random 16-byte salt, constant-time `timingSafeEqual`). Hardened in MOD-02.1 through MOD-02.4:
  - Per-request reservation reference counting (`pendingReservations: Map<string, number>`) ensuring every in-flight verification owns exactly one reference, released exclusively in its own `finally` block (DEF-22C).
  - Union-cardinality distinct identity capacity tracking (`getTotalTrackedCount()`) strictly bounding distinct callers by `maxTrackedIps = 5000` at every intermediate state without double-counting (DEF-22A & DEF-22C).
  - Decoupled `recordFailure()` from `pendingReservations`: failures update `failedAttempts` without deleting shared in-flight reservations of concurrent requests (DEF-22C).
  - Successful authentication clears `failedAttempts` for that IP without altering in-flight reservations, preventing other requests from becoming untracked prematurely (DEF-22C).
  - Atomic failed-attempt counter increments upon asynchronous verification failure, preventing concurrent requests from overwriting increments and bypassing the 5-attempt lockout (DEF-22B).
  - Hard session limit (`maxTrackedSessions = 5000`) rejecting new sessions with HTTP 503 `SESSION_CAPACITY_EXCEEDED` without evicting active sessions (DEF-19).
  - Fail-closed login attempt tracker (`maxTrackedIps = 5000`) rejecting new identities with HTTP 503 `LOGIN_RATE_LIMITER_CAPACITY_EXCEEDED` when full of active entries without evicting active records or resetting lockouts (DEF-20).
  - Combined scrypt memory validation ($128 \times N \times r + 128 \times r \times p + \text{safetyOverhead} \le 64 \text{ MiB}$) rejecting dangerous parameter combinations before invoking scrypt (DEF-21).
  - `parseStrictDecimal` rejecting signs and trailing junk, canonical Base64 verification, exact 16-byte salt / 32-byte key checks.
- **Security Considerations:** Protects against side-channel timing attacks, brute force, secret reuse, parameter DoS, memory exhaustion, token tampering, and concurrent rate-limiter bypasses.
- **Required Tests:** `tests/operatorAuth.test.ts` (40/40 passed), `tests/config.test.ts` (22/22 passed), `tests/buySecurity.test.ts` (4/4 passed).
- **Acceptance Criteria:** Supplying `SESSION_SECRET` as password returns HTTP 401. Supplying valid password returns signed session token. Token tampering is rejected. Strict decimal parsing and Base64 round-trip verified. Hard capacity bounds and fail-closed behaviors proven with zero eviction of active records. Concurrent login requests strictly adhere to capacity bounds, preserve reservations across mixed success/failure outcomes, and atomically increment lockout counters.
- **Evidence:** 40 passing tests in `tests/operatorAuth.test.ts` and route test 11 in `scripts/verify_all_routes.mjs`.

### TASK AGY-06: Public Forensic Ingestion Rate Limiting (MOD-02.1 Hardening)
- **Objective:** Protect `POST /api/investigations` against abusive automated volume and upstream Chainstack RPC quota exhaustion without external infrastructure dependencies.
- **Files Involved:** `src/server/auth/rateLimiter.ts`, `src/server/app.ts`, `src/server/config.ts`
- **Implementation & Hardening:** Built genuine sliding window in-memory rate limiter `RateLimiter` recording timestamp arrays per client IP. Configured with defaults `RATE_LIMIT_INVESTIGATIONS_MAX=10` and `RATE_LIMIT_INVESTIGATIONS_WINDOW_MS=60000`. Returns HTTP 429 `RATE_LIMITED` with `Retry-After` header and standard JSON API envelope. Hardened in MOD-02.1 with Fastify native `trustProxy` integration, `net.isIP()` address validation, clock injection, dynamic roll-off calculation, and fail-closed capacity limits (`maxEntries=10,000`).
- **Security Considerations:** Memory is strictly bounded with automated pruning of expired timestamps. Excludes health checks, static assets, and operator controls. Rejects spoofed forwarding headers from untrusted socket peers.
- **Required Tests:** `tests/rateLimiter.test.ts` (10/10 passed).
- **Acceptance Criteria:** Requests 1-10 succeed; request 11 receives HTTP 429 with `Retry-After` and standard envelope. Independent limits per IP. Sliding window rolls off dynamically. Capacity exhaustion fails closed.
- **Evidence:** 10 passing tests in `tests/rateLimiter.test.ts`.

### TASK AGY-07.2: Settlement Integrity & Ambiguous Payment Failure Hardening (DEF-31 to DEF-36)
- **Objective:** Fix payment-integrity vulnerabilities in receipt verification, RPC interaction, payer identity verification, transfer amount summation, CLI dispatch-stage error classification, and settlement resolution uniqueness.
- **Files Involved:** `src/server/adapters/buyAdapter.ts`, `src/server/db/database.ts`, `tests/buySecurity.test.ts`, `tests/buyAdapter.test.ts`
- **Implementation & Hardening:**
  - DEF-31 (Fail-Closed RPC Chain Verification): Made chain ID verification mandatory before receipt retrieval. Requires HTTP 200, valid JSON, matching request ID 1, absence of error object, and exact chain ID `0xa4ec` (42220). Aborts receipt retrieval on failure.
  - DEF-32 (Receipt Hash Matching): Passed `expectedTxHash` into `verifyReceiptTransferLogs()`. Enforces strict case-insensitive equality against receipt `transactionHash`.
  - DEF-33 (Real Payer Identity Verification): Enforces indexed sender decoding from `topics[1]` with minimum 3 topics and valid 20-byte address. Compares sender against `this.payingAddress`. Removed all hardcoded fallback assignments in settlement persistence.
  - DEF-34 (Total Aggregate Transfer Amount Verification): Iterates over ALL logs in receipt. Validates event signature, token contract, recipient, and sender. Sums matching transfer amounts using BigInt. Requires aggregate sum to strictly equal quoted atomic amount.
  - DEF-35 (Dispatch Stage Classification & Budget Preservation): Only proven pre-dispatch failures release reservations and set `FAILED`. All post-dispatch errors preserve budget reservations (`RESERVED`) and set `SETTLEMENT_UNKNOWN`.
  - DEF-36 (Settlement Resolution Unique Matching & Atomic Consistency): Collects all matching candidate receipts in `resolveSettlement()`. Requires exactly one unique candidate transaction hash. Implemented atomic settlement commits via `db.commitSettlementAtomic()`.
- **Required Tests:** `tests/buySecurity.test.ts` (64/64 passed), `tests/buyAdapter.test.ts` (9/9 passed).
- **Acceptance Criteria:** 100% test pass rate across all new fail-closed chain checks, hash matching, payer verification, aggregate transfer amounts, ambiguous error preservation, unique receipt resolution, and atomic SQLite rollback tests.
- **Evidence:** Passing test output in `tests/buySecurity.test.ts` and `tests/buyAdapter.test.ts`.

### TASK AGY-07.3: Final Payment-Proof Integrity Remediation (DEF-37 to DEF-41)
- **Objective:** Close remaining payment-proof identity, strict ABI parsing, settlement persistence override vulnerabilities, and CLI evidence-association defects.
- **Files Involved:** `src/server/adapters/buyAdapter.ts`, `src/server/db/database.ts`, `src/server/forensics/types.ts`, `tests/buySecurity.test.ts`
- **Implementation & Hardening:**
  - DEF-37 (Hardened Payer Identity Configuration & Health): Required explicitly configured, validated `AGENT_WALLET_ADDRESS` (`/^0x[0-9a-fA-F]{40}$/`). Fails closed on missing or malformed configuration before querying receipts. `getHealth()` reports `UNCONFIGURED` / `UNAVAILABLE` without fabricating identity. Exposes `payerMismatch` when CLI account differs from configured address.
  - DEF-38 (Strict ABI Indexed Address Topic Validation): Enforces exact 32-byte hex topic format (`/^0x[0-9a-fA-F]{64}$/`) and strict 12-byte zero padding (`000000000000000000000000`) for sender and recipient topics. Fails verification explicitly on malformed topics claiming to be payment token transfers while cleanly ignoring valid unrelated logs.
  - DEF-39 (Prevent Settlement Proof Field Overrides): Enforced strict allowlist in `commitSettlementAtomic()`. Forbids overrides on `purchase_attempt_id`, `quote_id`, `token_contract`, `amount_atomic`, `payer_address`, `payee_address`, and `settlement_tx_hash`. Validates proof existence, quote existence, cross-quote matching, token, recipient, amount, chain ID (42220), and receipt status (1) within atomic `BEGIN IMMEDIATE` transaction with all-or-nothing rollback.
  - DEF-40 (Elimination of Arbitrary CLI Stdout Hash Extraction): Removed stdout regex matching for transaction hashes. Parses only documented structured `paymentResponse.txHash` and `settlementTxHash` validated against `/^0x[0-9a-fA-F]{64}$/`. Transitions to `SETTLEMENT_UNKNOWN` and preserves budget reservation when valid structured references are absent.
  - DEF-41 (Strict CLI Receipt-Resolution Execution & Validation): Required `exitCode === 0` before parsing receipts stdout. Safely catches timeouts and execution errors, returning unresolved and retaining budget reservation. Validates stdout strictly as JSON array and validates candidate schemas and strong unique associations.
- **Required Tests:** `tests/buySecurity.test.ts` (109/109 passed; +45 new tests), `tests/buyAdapter.test.ts` (9/9 passed).
- **Acceptance Criteria:** 100% test pass rate across all 5 defect categories; zero hardcoded payer fallbacks, zero arbitrary stdout regex extraction, all-or-nothing database rollbacks, and preserved budget reservations.
- **Evidence:** 319/319 passing tests across all 20 test files in `npm test`.

### TASK AGY-07.4: Final Readiness and Malformed Receipt Guard (DEF-42 to DEF-43)
- **Objective:** Make payer configuration strictly mandatory for readiness and pre-dispatch guard, and eliminate silent skipping of malformed ERC-20 Transfer logs.
- **Files Involved:** `src/server/adapters/buyAdapter.ts`, `tests/buySecurity.test.ts`
- **Implementation & Hardening:**
  - DEF-42 (Mandatory Payer Configuration for Readiness & Dispatch Guard): Enforced in `getHealth()` that `ready: true` is strictly conditional on explicit, valid `AGENT_WALLET_ADDRESS` (`/^0x[0-9a-fA-F]{40}$/`), successful CLI `whoami` (`exitCode === 0`), valid CLI-reported paying address, case-insensitive match between CLI account and configured payer, and absence of emergency kill switch. Configured payer is never substituted for the CLI account. Reports `UNAVAILABLE` or `UNKNOWN` for CLI identity and `UNCONFIGURED` for missing or invalid payer configuration. `ready` is false for every missing, malformed, unknown, or mismatched identity. Added immediate pre-dispatch payer validation in `executeApprovedRequest()` releasing budget reservations and marking quotes `FAILED` before subprocess dispatch.
  - DEF-43 (Strict Rejection of Malformed ERC-20 Transfer Logs): Enforced in `verifyReceiptTransferLogs()` that every log on the quoted token identifying as ERC-20 Transfer (`topics[0] === ERC20_TRANSFER_EVENT_TOPIC`) must have exactly 3 topics, 32-byte hex format and 12-byte zero padding on sender and recipient topics, and exactly one 32-byte uint256 hex word data field. Rejects immediately on any malformed Transfer event on the quoted token so that adjacent valid transfers cannot conceal defects, while continuing to cleanly ignore unrelated valid event types (e.g. Approval) and logs from unrelated token contracts.
- **Required Tests:** `tests/buySecurity.test.ts` (131/131 passed; +22 new tests covering DEF-42 and DEF-43), `tests/buyAdapter.test.ts` (9/9 passed).
- **Acceptance Criteria:** 100% test pass rate; zero paid dispatches with invalid payer configuration; strict receipt rejection on malformed Transfer logs; zero silent skipping.
- **Evidence:** 341/341 passing tests across all 20 test files in `npm test`.

### TASK AGY-07.5: Final Payer Identity Contract Hardening (DEF-44 to DEF-45)
- **Objective:** Enforce mandatory expected payer identity in receipt verification contract and eliminate loose text-regex scanning in CLI whoami identity resolution.
- **Files Involved:** `src/server/adapters/buyAdapter.ts`, `tests/buySecurity.test.ts`
- **Implementation & Hardening:**
  - DEF-44 (Mandatory Expected Payer Parameter in Receipt Verification): Changed `expectedPayer?: string` to mandatory `expectedPayer: string` in `verifyReceiptTransferLogs()`. Added strict validation requiring a 20-byte EVM address format (`/^0[xX][0-9a-fA-F]{40}$/`). Rejects missing, empty, or malformed payer configuration immediately (`{ verified: false, reason: 'Invalid or missing expected payer address' }`). Enforced strict comparison between decoded Transfer log sender and expected payer in all matching log iterations. Updated all call sites with explicit payer addresses.
  - DEF-45 (Strict CLI whoami Identity Parsing): Eliminated loose fallback regex scanning across arbitrary stdout lines in `getHealth()`. Identity is extracted strictly from authoritative JSON fields (`parsed.payingAddress` or `parsed.account`) validated against `/^0[xX][0-9a-fA-F]{40}$/`. Malformed JSON, missing field, or invalid format sets `account: 'UNKNOWN'` and `ready: false`. Non-zero CLI exits set `account: 'UNAVAILABLE'`. Preserves case-insensitive comparison against configured `AGENT_WALLET_ADDRESS`.
- **Required Tests:** `tests/buySecurity.test.ts` (147/147 passed; +16 new tests covering DEF-44 and DEF-45), `tests/buyAdapter.test.ts` (9/9 passed).
- **Acceptance Criteria:** 100% test pass rate across 357 tests in 20 suites; zero silent omission of payer checks in receipt logs; zero arbitrary text regex extraction from CLI output.
- **Evidence:** 357/357 passing tests across all 20 test files in `npm test`.

---

## MODULE 4 — Official Attribution Engine & Celo SDK Integration (MOD-04)

### TASK AGY-09: Official Specification, SDK Integration & Request Classification
- **Objective:** Complete source audit of `@celo/attribution-tags`, ERC-8021 specification, assigned tag `celo_235f6ef56f5b`, centralized attribution configuration, and request classification.
- **Files Involved:** `src/server/config/attribution.ts`, `src/server/services/celoAttributionService.ts`, `tests/erc8021.test.ts`.
- **Implementation:**
  - Pinned SDK: `@celo/attribution-tags@0.5.0`.
  - Assigned tag: `celo_235f6ef56f5b` strictly authoritative.
  - Implemented `CeloAttributionService`, `appendAttribution()`, `classifyOperation()`, and viem extensions.
  - Resolved DEF-46, DEF-47, DEF-48.
- **Status:** `IMPLEMENTED_PENDING_REMEDIATION_ACCEPTANCE`.

---

## MODULE 4.1 — Security Remediation & Release Gate (MOD-04.1)

### TASK AGY-04-01: Registration URI Hardening & Base URL Validation (DEF-49)
- **Objective:** Eliminate arbitrary `agentURI` public query overrides and enforce canonical metadata URL validation.
- **Files Involved:** `src/server/app.ts`, `src/server/config.ts`, `tests/erc8021.test.ts`.
- **Implementation:** Removed public `query.agentURI` parameter; derived metadata URI strictly from validated configuration (`${PUBLIC_BASE_URL}/api/agent/metadata`). Added `validatePublicBaseUrl()` requiring HTTPS and rejecting credentials, localhost, loopback, and private IPv4/IPv6 ranges in production.
- **Status:** `COMPLETED_PENDING_REVIEW`.

### TASK AGY-04-02: RPC Method Allowlist Classification & State-Changing Isolation (DEF-50)
- **Objective:** Eliminate broad prefix matching (`eth_*`, `debug_*`) and explicitly classify state-mutating transaction methods.
- **Files Involved:** `src/server/services/celoAttributionService.ts`, `tests/erc8021.test.ts`.
- **Implementation:** Replaced prefix matching with explicit allowlists for Category A (`eth_sendTransaction`, `eth_sendRawTransaction`, `wallet_sendCalls`, `writeContract`, etc.), Category B (read-only RPC queries), Category C (HTTP payment), and Category D (internal). Unrecognized methods fail closed to `CATEGORY_UNKNOWN`.
- **Status:** `COMPLETED_PENDING_REVIEW`.

### TASK AGY-04-03: Calldata Validation Fail-Closed & Attribution Merge Safety (DEF-51, DEF-54)
- **Objective:** Fail closed on malformed calldata and prevent silent omission of official hackathon attribution.
- **Files Involved:** `src/server/services/celoAttributionService.ts`, `tests/erc8021.test.ts`.
- **Implementation:** Validates calldata hex format strictly (even length, `0x` prefix, hex characters). Merging fails closed on errors. Schema 2 role-based calldata lacking the hackathon tag throws typed `SCHEMA_2_MERGE_PROHIBITED` rather than silently omitting attribution.
- **Status:** `COMPLETED_PENDING_REVIEW`.

### TASK AGY-04-04: Official Agent Wallet Invariant & Structured Read-Only RPC Guard (DEF-52, DEF-53)
- **Objective:** Prevent wallet address drift in production and enforce recursive payload inspection on read-only RPC methods.
- **Files Involved:** `src/server/config/attribution.ts`, `src/server/config.ts`, `src/server/providers/chainstack.ts`, `tests/erc8021.test.ts`.
- **Implementation:** Added `validateAgentWalletAddress()` strictly matching `0x3e1bef07824cd0E076F4907641F0A0EF27898e52` in production. Upgraded `assertReadOnlyRpcUntagged()` with bounded recursive traversal (depth 10, nodes 500) and circular reference detection. Integrated guard directly into `ChainstackProvider.callRpc()`.
- **Status:** `COMPLETED_PENDING_REVIEW`.

### TASK AGY-04-05: Comprehensive Regression Verification & Release Evidence (DEF-55)
- **Objective:** Execute full verification matrix, update governance documents without task ID collisions, and produce release evidence.
- **Files Involved:** `MASTER_DEFECT_REGISTER.md`, `ANTIGRAVITY_TASK_REGISTER.md`, `MASTER_EXECUTION_ROADMAP.md`, `MASTER_CHANGELOG.md`, `TEST_RESULTS.md`, `README.md`, `SECURITY.md`.
- **Results:** 458/458 tests passing across all 21 test files (100% green). Full typecheck and build green. Route verification (36/36 scenarios) and CDP E2E passing.
- **Status:** `COMPLETED_PENDING_REVIEW`.

---

## MODULE 4.2 — Read-Only Provider Enforcement & Final Attribution Hardening (MOD-04.2)

### TASK AGY-04-06: Strict Read-Only Chainstack Provider Allowlist (DEF-56)
- **Objective:** Enforce strict read-only RPC method allowlist inside `ChainstackProvider.callRpc()` before URL checks, payload construction, or network `fetch`.
- **Files Involved:** `src/server/providers/chainstack.ts`, `tests/chainstackProvider.test.ts`.
- **Implementation:** Defined `ALLOWED_READ_ONLY_RPC_METHODS` with 20 approved methods (`eth_chainId`, `eth_blockNumber`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_call`, `eth_getBalance`, `eth_getCode`, `eth_getStorageAt`, `eth_getLogs`, `eth_getTransactionCount`, `eth_getBlockByNumber`, `eth_getBlockByHash`, `eth_estimateGas`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_feeHistory`, `debug_traceTransaction`, `debug_traceCall`, `debug_traceBlockByNumber`, `debug_traceBlockByHash`). `callRpc()` checks allowlist first; rejects state-changing (`eth_sendTransaction`, `eth_sendRawTransaction`, `personal_sendTransaction`, `wallet_sendCalls`, `eth_signTransaction`, `personal_sign`), unapproved, or unknown methods with typed `ChainstackProviderError('READ_ONLY_METHOD_REQUIRED', 400)`. Tested with mocked fetch asserting `fetchMock` was never called.
- **Status:** `COMPLETED_PENDING_REVIEW`.

### TASK AGY-04-07: Robust Non-Public IP URL Validation (DEF-57)
- **Objective:** Prevent non-public, loopback, private-network, link-local, and reserved IPv4 and IPv6 URLs in production configuration.
- **Files Involved:** `src/server/config.ts`, `tests/config.test.ts`.
- **Implementation:** Upgraded `validatePublicBaseUrl()` with `node:net.isIP`, IPv6 bracket stripping, and word expansion (`parseIpv6ToWords`, `isNonPublicIpv4`, `isNonPublicIpv6`). Rejects loopback `127.0.0.0/8`, private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `0.0.0.0`), bracketed IPv6 (`[::1]`, `[fc00::1]`, `[fd00::1]`, `[fe80::1]`), and IPv4-mapped IPv6 literals (`[::ffff:127.0.0.1]`). Permits valid public HTTPS domains, public IPv4, and public IPv6.
- **Status:** `COMPLETED_PENDING_REVIEW`.

### TASK AGY-04-08: Unknown Operations Fail-Closed Policy & Decision Architecture (DEF-58)
- **Objective:** Eliminate ambiguous `CATEGORY_UNKNOWN -> shouldAddAttribution: false` and enforce explicit dispatchability decisions.
- **Files Involved:** `src/server/services/celoAttributionService.ts`, `tests/erc8021.test.ts`.
- **Implementation:** Added `ClassificationDecision = 'REQUIRES_ATTRIBUTION' | 'MUST_REMAIN_UNTAGGED' | 'REJECT_UNKNOWN'`. Category A yields `REQUIRES_ATTRIBUTION`; Categories B, C, D yield `MUST_REMAIN_UNTAGGED`; Category Unknown yields `REJECT_UNKNOWN`. Added `assertOperationDispatchable()` throwing typed `AttributionError('UNRECOGNIZED_OPERATION_REJECTED')` when encountering unknown operations.
- **Status:** `COMPLETED_PENDING_REVIEW`.

### TASK AGY-04-09: Strict Calldata Input & Whitespace Rejection (DEF-59)
- **Objective:** Eliminate permissive `.trim()` in `appendAttribution()` and fail closed on invalid whitespace.
- **Files Involved:** `src/server/services/celoAttributionService.ts`, `tests/erc8021.test.ts`.
- **Implementation:** Replaced `.trim()` in `appendAttribution()` with strict whitespace regex validation (`/\s/.test(calldata)`). Rejects leading, trailing, and embedded whitespace with typed `AttributionError('INVALID_CALLDATA')` without mutating inputs.
- **Status:** `COMPLETED_PENDING_REVIEW`.
