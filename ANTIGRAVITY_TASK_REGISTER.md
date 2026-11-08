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
| **AGY-09** | Mod 4 | **P1** | `READY_FOR_IMPLEMENTATION` | Audit & Re-verify ERC-8021 Attribution Suffix Construction | `src/server/services/celoAttributionService.ts` | None |
| **AGY-10** | Mod 5 | **P1** | `USER_INPUT_REQUIRED` | Update Public Base URL in ERC-8004 Metadata Generation | `src/server/config.ts`, `src/server/services/celoAttributionService.ts` | USR-05 |
| **AGY-11** | Mod 5 | **P1** | `USER_INPUT_REQUIRED` | Verify Broadcasted ERC-8004 Registration Receipt & Token ID | `PROOF.md`, `GATE0_RESULTS.md` | USR-07 |
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
