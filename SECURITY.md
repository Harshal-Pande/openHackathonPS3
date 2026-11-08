# RevertLens — Security, Privacy and Abuse Model

This document specifies the mandatory security model, threat mitigations, and architectural invariants for RevertLens.

---

## 1. Assets to Protect

1. **Buy Wallet Authority & Signing Material:** Zero private keys, seed phrases, or raw keystores stored in code, `.env`, SQLite, logs, or frontend.
2. **Stablecoin Balances:** Strict budget limits (per-call, per-investigation, daily, and global kill switch).
3. **Operator Credentials & Sessions:** High-entropy session secrets, rate-limited login, HttpOnly cookies, CSRF protection.
4. **User Transaction Context & Privacy:** Reports are unlisted by default with high-entropy IDs; public user IPs/hashes sanitized.
5. **Forensic Integrity:** Evidence cannot be fabricated or modified; LLMs cannot hallucinate execution traces or causality.

---

## 2. Non-Negotiable Invariants

1. **No Custodial Wallet Secrets:** The application never collects or stores private keys or seed phrases. Buy CLI wallet custody is delegated to the host OS keychain (via `buy setup`).
2. **Operator-Only Spend Authorization:** Public users cannot initiate or authorize spending from the project wallet. Every purchase requires an authenticated operator session bound to an immutable quote record and exact request body SHA-256.
3. **Safe CLI Execution:** Spawning the Buy CLI must always use fixed executable paths and argument arrays (`shell: false`), strict timeouts, and bounded stdout/stderr with credential redaction. Shell string interpolation is strictly prohibited.
4. **No Blind Retries:** Ambiguous payment outcomes (`SETTLEMENT_UNKNOWN`, timeouts, HTTP 500s) never trigger automatic retries. The system must verify settlement on-chain via `buy receipts --resolve` before any state transition.
5. **Strict Allowlisting:** Only approved capability IDs (`chainstack.celo`, `cencori.v1.chat.completions`), approved payee addresses (`0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`), and approved token contracts on Celo Mainnet (`42220`) can receive payments.
6. **Atomic Budget Reservation:** Budget checks and reservations occur atomically in database transactions prior to invoking the payment CLI to prevent race-condition overages.
7. **LLM Truthfulness Guardrails:** Cencori receives structured facts only. An independent deterministic validator verifies that every causal claim and address cited in the model response matches an existing, verified `EvidenceItem`.

---

## 3. Cryptographic Quote-to-Approval Binding Model

Implemented via formal approval records (e.g. `GATE0_APPROVAL_REQUEST.md`):
- The exact outbound payload is serialized to normalized JSON and hashed via SHA-256 before quote creation.
- The operator approves the tuple: `(quoteId, bodySha256, maxAmountAtomic, payeeAddress, tokenContract, network)`.
- If any byte of the body, URL, recipient, or token changes between quote review and execution, the approval is permanently invalidated and execution is blocked.

---

## 4. Production Configuration Safeguards

Implemented in `src/server/config.ts` via `enforceProductionInvariants()`:
- `SESSION_SECRET` must not match the placeholder sentinel and must be >= 32 characters.
- `OPERATOR_PASSWORD_HASH` must not match the placeholder sentinel and must be a valid, versioned scrypt hash (`scrypt$v=1$N=16384$r=8$p=1$...`).
- `OPERATOR_PASSWORD_HASH` must not match or reuse `SESSION_SECRET` (enforcing strict separation of concerns).
- `RATE_LIMIT_INVESTIGATIONS_MAX` and `RATE_LIMIT_INVESTIGATIONS_WINDOW_MS` must be positive integers.
- `DATABASE_PATH` must be a persistent file path (cannot be `:memory:` or empty).
- `CORS_ORIGIN` must be an explicit origin allowlist (cannot be wildcard `*` or empty).
- `BUY_ENABLED=true` requires positive non-zero values for `BUY_DAILY_BUDGET_ATOMIC` and `BUY_PER_CALL_CAP_ATOMIC`.
- Startup immediately crashes if any production safeguard fails.

---

## 4.1 Operator Authentication Architecture & Password Hashing (AGY-05 / DEF-14 / MOD-02.1)

Operator access controls are strictly decoupled between authentication and session authorization:

1. **Independent Secrets:**
   - `OPERATOR_PASSWORD_HASH`: Stores the salted, computationally expensive scrypt password hash. Used exclusively for verifying operator passwords during login. Supplying `SESSION_SECRET` or the raw hash string as a password will fail authentication.
   - `SESSION_SECRET`: Used exclusively for HMAC-SHA256 signing and verifying session tokens. Never used as a password or password hash substitute.
2. **scrypt Hashing Specification & Combined Memory Validation (MOD-02.1 & MOD-02.2 / DEF-21):**
   - Algorithm: Node.js built-in `crypto.scrypt` (asynchronous, non-blocking).
   - Format: `scrypt$v=1$N=<cost>$r=<blockSize>$p=<parallelism>$<salt-base64>$<derived-key-base64>`
   - Strict Parameter Parsing: Implements `parseStrictDecimal()` rejecting signs (`+`, `-`), trailing junk, whitespace, non-integers, and NaN.
   - Combined Memory Requirement & 64 MiB Budget Enforcement (DEF-21):
     - Dominant memory consumed by OpenSSL scrypt is $128 \times N \times r + 128 \times r \times p$ bytes.
     - Implements `calculateScryptMemoryRequirement(cost, blockSize, parallelism)` with a 1 MiB conservative safety overhead.
     - Combined memory validation rejects any parameter combination where $128 \times N \times r + 128 \times r \times p + \text{safetyOverhead} > 64 \text{ MiB}$ (67,108,864 bytes).
     - Parameter sets like $N=65536, r=16$ (128 MiB) and $N=65536, r=8$ (64 MiB + overhead) are rejected before calling `crypto.scrypt`, preventing OpenSSL memory limit RangeErrors.
     - Safe integer overflow protection returns `Infinity` on non-safe integer multiplications.
     - Synchronous `try/catch` wrapper inside the Promise constructor safely intercepts unexpected runtime exceptions without crashing the server.
   - Parameter Policy Limits:
     - Cost factor $N$: must be a power of 2 between $1024$ and $65536$ ($2^{10}$ to $2^{16}$).
     - Block size $r$: integer between $1$ and $16$.
     - Parallelism $p$: integer between $1$ and $4$.
     - Memory ceiling: fixed strict 64 MiB (`maxmem = 67_108_864`).
   - Cryptographic Bounds & Canonical Base64:
     - Salt length: exactly 16 bytes.
     - Key length: exactly 32 bytes.
     - Canonical encoding: Base64 strings must round-trip exactly to their encoded representation, rejecting padded/unpadded discrepancies and non-base64 characters.
   - Verification: Constant-time buffer comparison via `crypto.timingSafeEqual` after buffer length verification.
   - Fault Tolerance: Malformed hashes, unsupported versions, or invalid parameter ranges return `false` gracefully without crashing the server process.
3. **Session Management, Hard Capacity & Dual Delivery Model (MOD-02.1 & MOD-02.2 / DEF-19):**
   - Tokens are formatted as `<sessionId>.<hmacHex>`, where `sessionId` is a strict 64-character lowercase hexadecimal string (32 bytes entropy), and `hmacHex` is a strict 64-character lowercase hexadecimal HMAC-SHA256 signature generated with `SESSION_SECRET`.
   - Expiration Boundary: Enforces hard boundary check `now >= expiresAt`.
   - Hard Session Capacity Upper Bound (DEF-19):
     - Enforces hard maximum of 5,000 active sessions (`maxTrackedSessions = 5000`).
     - Expired sessions are pruned when capacity is reached.
     - If all remaining sessions are active and capacity is exhausted, new session creation is rejected with HTTP 503 `SESSION_CAPACITY_EXCEEDED`.
     - Active sessions are never evicted to make room for new logins.
     - Concurrent login completions execute synchronously during session insertion, preventing capacity overruns.
     - No session identifiers, secrets, or internal data are leaked in capacity error messages.
   - Dual Token Delivery:
     - Login responses set an `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` (in production) cookie for browser session handling.
     - Login responses also return the token in the JSON envelope (`token` field). In the React client, this token is held strictly in transient React component state (`useState`) without persisting to `localStorage` or `sessionStorage`. This provides automated script and CLI compatibility without exposing persistent storage to cross-site script extraction.
4. **Login Brute-Force Rate Limiting & Fail-Closed Capacity (MOD-02.1 & MOD-02.2 / DEF-20):**
   - Enforces a maximum of 5 failed login attempts per client IP within a rolling 15-minute sliding window.
   - Subsequent attempts receive HTTP 429 (`RATE_LIMITED`) with a standard `Retry-After` header indicating remaining wait time in seconds.
   - Successful authentication resets the failed-attempt counter for that IP.
   - Fail-Closed Tracker Capacity (DEF-20):
     - Maximum tracked identities is capped at 5,000 (`maxTrackedIps = 5000`).
     - Expired entries older than 15 minutes are pruned.
     - If all 5,000 tracked entries are active and capacity is exhausted, login attempts from new, untracked identities fail closed with HTTP 503 `LOGIN_RATE_LIMITER_CAPACITY_EXCEEDED`.
     - Active failed-attempt records and lockouts are never evicted or deleted to make room for new callers.
     - Locked-out identities remain locked out for their full window even when capacity is full.
   - Process-Local Operational Limitation:
     - Session and lockout registries are process-local in memory. In multi-replica cloud deployments, a shared store (such as Redis) is required for cluster-wide synchronization.

---

## 4.2 Public Forensic Ingestion Rate Limiting (AGY-06 / MOD-02.1)

To protect the server and upstream Chainstack RPC quotas from abuse, public forensic ingestion is rate-limited:

1. **Scope:** Applies strictly to `POST /api/investigations`. Health checks (`/api/health`, `/healthz`, `/readyz`), static assets, report retrieval (`GET /api/investigations/:id`), history list browsing (`GET /api/investigations`), and operator control endpoints are excluded.
2. **Sliding-Window Tracking Algorithm (MOD-02.1):**
   - Implements a true sliding-window algorithm that records request timestamps per client IP.
   - Bounded timestamps roll off as `now - timestamp > windowMs`.
   - Accurate dynamic calculation of `remaining` and `retryAfterSeconds` (ceiling of milliseconds until the oldest timestamp within the window rolls off).
   - Clock injection support (`clock: () => number`) for deterministic testing.
3. **Capacity Exhaustion & Fail-Closed Guard (MOD-02.1):**
   - Maximum tracked entries is capped at `maxEntries` (default: 10,000).
   - If capacity is reached and no expired entries can be freed, new identities fail closed with HTTP 429 rather than bypassing rate limiting.
4. **Trusted Reverse-Proxy Integration (MOD-02.1):**
   - Fastify's native `trustProxy` setting is configured via `resolveTrustProxy(appConfig.TRUST_PROXY)`.
   - When set to `false`, Fastify ignores `X-Forwarded-For` and uses the immediate TCP socket peer.
   - When configured with trusted CIDRs/proxies, `X-Forwarded-For` is honored only if the immediate socket peer is a verified trusted proxy.
   - Resolved client IPs are strictly validated via `net.isIP()` before tracking.
5. **Policy & Envelope:**
   - Configurable via `RATE_LIMIT_INVESTIGATIONS_MAX` (default: 10 requests) and `RATE_LIMIT_INVESTIGATIONS_WINDOW_MS` (default: 60,000 ms / 1 minute).
   - Requests exceeding the quota receive HTTP 429 with `Retry-After` header and standard JSON envelope:
   ```json
   {
     "data": null,
     "error": {
       "code": "RATE_LIMITED",
       "message": "Too many investigation requests from this IP. Please wait X seconds before trying again."
     },
     "requestId": "<uuid>"
   }
   ```
6. **Operational Limitations:** Enforcement is process-local in memory. For multi-replica horizontally scaled deployments, shared external storage (e.g. Redis) is required for globally synchronized rate limits.

---

## 5. Emergency Kill-Switch

A persisted kill-switch flag in the database immediately halts all pending and new Buy purchase attempts across the application. The kill-switch can be engaged instantaneously by an operator.

---

## 6. Direct RPC Secret Isolation and Redaction

Implemented in Phase 4 for the free Chainstack Growth Elastic Global Node:
- `CHAINSTACK_CELO_MAINNET_RPC_URL` is parsed strictly server-side and never exposed to the frontend, client bundles, or API envelopes.
- Health check endpoints expose only boolean readiness (`chainstackConfigured: boolean`), never URLs or tokens.
- All HTTP error logging, console outputs, and exception traces pass through `redactRpcUrl()` in `src/server/providers/chainstack.ts`, replacing any endpoint substring with `[REDACTED_RPC_ENDPOINT]`.
- `.env` is strictly git-ignored; `.env.example` contains only empty sentinel comments.

---

## 7. Evidence Integrity and Cryptographic Checksum Semantics

Each forensic item in the `EvidenceLedger` is assigned an immutable ID (e.g. `[E-01]`) and a canonical SHA-256 `contentHash` computed over the normalized JSON representation of its observed value:
- **Scope of Guarantee:** The `contentHash` guarantees internal content integrity: it proves that the parsed evidence in memory or retrieved from SQLite has not diverged or suffered accidental data corruption since ingestion.
- **Explicit Limitations & Non-Claims:**
  - *No RPC Node Honesty Proof:* A content checksum over RPC output does not guarantee that the upstream RPC node acted honestly or returned unmanipulated blockchain state.
  - *No On-Chain Notarization:* Hashes are maintained internally in SQLite; they are not anchored or timestamped onto the Celo blockchain.
  - *No Storage Anti-Tamper Guarantee:* While SQLite persists these rows durably, an attacker with filesystem access to the `.sqlite` database file could alter stored entries. Trust is rooted in application process integrity.

---

## 8. Operator-Only Quote Approval & Prompt Injection Defense

Implemented in Phase 6:
- **Public Disconnect:** Public visitors invoking `/api/investigations` have zero ability to approve quotes or authorize project wallet spending.
- **Operator Authentication:** Mutating operations under `/api/operator/*` require a verified operator session, rate-limited against brute force (maximum 5 attempts per 15 minutes per IP).
- **Strict Cryptographic Binding:** Approvals require exact matching between client-submitted `expectedBodySha256` and the stored `body_sha256`. Any change in parameters permanently marks the quote `QUOTE_INVALID`.
- **Anti-Hallucination & Prompt Injection Defense:**
  - AI prompt context contains only sanitized forensic facts, never environment variables, RPC URLs, or secrets.
  - Model responses are scanned for prompt injection phrases (`ignore previous instructions`, `transfer funds`, etc.).
  - Output validation rejects invented addresses (`0x[a-f0-9]{40}`) not observed in on-chain receipts or traces.
  - Output validation rejects invented revert reasons not found in observed trace or decoded revert errors.
  - AI confidence cannot be elevated above the deterministic confidence level.

