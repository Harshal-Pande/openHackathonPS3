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
5. **Strict Capability Registry & Parameter Binding:** Only approved capability IDs (`cencori.v1.chat.completions`), approved payee addresses (`0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`), and approved token contracts on Celo Mainnet (`42220`) can receive payments. Legacy Chainstack Buy capabilities are removed under AD-008.
6. **Atomic Budget Reservation & Concurrency Safety:** Budget checks and reservations occur atomically in SQLite immediate database transactions prior to invoking the payment CLI to prevent race-condition overages. Duplicate executions are rejected via conditional state updates.
7. **Evidence-Backed On-Chain Settlement Verification:** Proof of settlement requires parsing on-chain transaction receipt logs for ERC-20 Transfer events matching quoted token, recipient, and exact atomic amount. Candidate matching by recipient address alone is strictly forbidden.
8. **LLM Truthfulness Guardrails:** Cencori receives structured facts only. An independent deterministic validator verifies that every causal claim and address cited in the model response matches an existing, verified `EvidenceItem`.

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
4. **Login Brute-Force Rate Limiting & Fail-Closed Capacity (MOD-02.1 through MOD-02.4 / DEF-20 & DEF-22):**
   - Enforces a maximum of 5 failed login attempts per client IP within a rolling 15-minute sliding window.
   - Subsequent attempts receive HTTP 429 (`RATE_LIMITED`) with a standard `Retry-After` header indicating remaining wait time in seconds.
   - Successful authentication resets the failed-attempt counter for that IP.
   - Fail-Closed Tracker Capacity & Concurrency Protection (DEF-20 & DEF-22A):
     - Maximum tracked identities is capped at 5,000 (`maxTrackedIps = 5000`).
     - In-flight capacity reservations (`pendingReservations: Map<string, number>`) ensure that new identities arriving concurrently cannot exceed the 5,000 threshold while asynchronous scrypt verification is in progress.
     - `acquireReservation()` executes synchronously before awaiting scrypt. Distinct identity capacity is calculated as the cardinality of `union(failedAttempts.keys, pendingReservations.keys)`. If capacity is exhausted, expired entries are pruned; if still full, excess concurrent requests immediately fail closed with HTTP 503 `LOGIN_RATE_LIMITER_CAPACITY_EXCEEDED`.
     - In-flight reservations are released via `finally` blocks on all paths (success, failure, or unexpected exception).
   - Atomic Failed-Attempt Accounting (DEF-22B):
     - Counter increments upon verification failure are atomic. `recordFailure()` fetches the freshest counter from `failedAttempts` at the moment of recording, preventing concurrent failures from the same IP from overwriting increments.
     - 5 concurrent failed requests from the same IP will strictly increment the counter to 5, immediately placing the IP into the 15-minute lockout without race conditions.
   - Same-IP Mixed-Outcome Reservation Safety (DEF-22C):
     - Every admitted request acquires exactly one in-flight reference in `pendingReservations`.
     - `recordFailure()` updates `failedAttempts` without deleting shared in-flight reservations of concurrent requests from the same IP.
     - Successful authentication clears `failedAttempts` for that IP without altering in-flight reservations, preventing other requests from becoming untracked prematurely.
     - Distinct-identity union calculation prevents double-counting an IP present in both maps while guaranteeing that an identity remains tracked as long as at least one request is in flight.
   - Active failed-attempt records and lockouts are never evicted or deleted to make room for new callers.
   - Locked-out identities remain locked out for their full window even when capacity is full.
   - Process-Local Operational Limitation:
     - Session, reservation, and lockout registries are process-local in memory. In multi-replica cloud deployments, a shared store (such as Redis) is required for cluster-wide synchronization.

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

---

## 9. Buy Payment Adapter Security & On-Chain Settlement Verification (MOD-03)

Implemented in `src/server/adapters/buyAdapter.ts`:
- **Subprocess Isolation:** The Buy adapter executes via `node:child_process.execFile` with `shell: false` using direct `process.execPath` running pinned `@celo/buy@0.8.5` (`node_modules/@celo/buy/dist/main.js`), eliminating shell interpolation and command-injection vulnerabilities.
- **Credential & Key Redaction:** All subprocess stdout and stderr streams pass through `redactSensitiveOutput()`, which scrubs private keys (`0x[0-9a-fA-F]{64}`), Bearer tokens, and HTTP authorization headers before storage in SQLite or return to callers.
- **Temporary Payload Security:** Outbound request bodies are written to dedicated temporary files with restricted POSIX mode `0600` and unlinked immediately in a `finally` block.
- **Atomic Budget Reservation:** SQLite transactions check current daily spend, investigation caps, and emergency kill-switch status, reserving the atomic amount before invoking the CLI. If execution fails, the reservation is released; if confirmed, it is committed.
- **Fail-Safe Ambiguity Handling:** Any timeout, network interruption, or ambiguous CLI failure transitions the purchase and quote to `SETTLEMENT_UNKNOWN`. Automatic retries are strictly prohibited, and reserved budget is retained until manual settlement resolution.
- **Independent On-Chain Receipt Verification:** Successful HTTP status from the CLI or provider is insufficient. The adapter performs direct RPC calls to query the on-chain receipt, verifying `receipt.status === 1`, payee allowlist compliance, and chain ID `42220`.

---

## 10. Settlement Integrity & Payment Ambiguity Defenses (MOD-03.3)

Engineered to resolve DEF-31 through DEF-36:
- **Mandatory Chain ID Fail-Closed RPC Check (DEF-31):** Every on-chain settlement verification queries `eth_chainId` directly from the RPC before receipt retrieval. Rejects non-200 responses, malformed JSON, JSON-RPC errors, mismatched request IDs, non-hex integers, and wrong chain IDs.
- **Strict Receipt Hash Verification (DEF-32):** Asserts case-insensitive equality between receipt `transactionHash` and `expectedTxHash`. Receipts with missing or mismatched hashes are rejected immediately.
- **Proven Payer Address Verification (DEF-33):** Decodes indexed sender from log `topics[1]`, enforces valid 20-byte address format, and matches it against `payingAddress`. Eliminates all hardcoded fallback addresses.
- **Exact BigInt Transfer Summation (DEF-34):** Aggregates all matching ERC-20 `Transfer` logs using BigInt summation and asserts exact equality (`totalTransferred === expectedAmountAtomic`), rejecting both underpayments and overpayments. Validates 32-byte hex payload length on `log.data`.
- **Dispatch Boundary Protection & Reservation Retention (DEF-35):** Only pre-dispatch failures (before CLI spawn) release budget reservations and transition to `FAILED`. Post-dispatch errors preserve budget reservations as `RESERVED` and transition to `SETTLEMENT_UNKNOWN` to prevent budget leakage during in-flight on-chain transactions.
- **Unique Candidate Settlement Resolution (DEF-36):** `resolveSettlement()` collects candidate transaction hashes and strictly requires exactly 1 unique candidate. Ambiguous multi-candidate or zero-candidate states are rejected.
- **Atomic State Consistency:** Settlement recording, purchase attempt status update, quote transition, and budget commitment are executed within a single SQLite `BEGIN IMMEDIATE` transaction via `db.commitSettlementAtomic()`, guaranteeing all-or-nothing rollback.

---

## 11. Final Payment-Proof Integrity Hardening (MOD-03.4)

Engineered to resolve DEF-37 through DEF-41:
- **Zero Payer Identity Fallbacks (DEF-37):** Payer address verification strictly requires a valid, configured `AGENT_WALLET_ADDRESS` (`/^0x[0-9a-fA-F]{40}$/`). Normalized to lowercase without fallbacks. Settlement verification fails closed if address is missing or malformed. `getHealth()` reports `UNCONFIGURED` / `UNAVAILABLE` and flags `payerMismatch` when CLI account differs from configured address.
- **Strict ABI Word & Address Padding Validation (DEF-38):** Indexed address topics in ERC-20 `Transfer` events must be exactly 32 bytes (64 hex characters) with strict 12-byte zero padding (`000000000000000000000000`). Both sender (`topics[1]`) and recipient (`topics[2]`) topics are verified. Fails verification explicitly on malformed payment token topics while cleanly ignoring valid unrelated logs.
- **Settlement Proof Field Override Defense (DEF-39):** `commitSettlementAtomic()` enforces an immutable field allowlist forbidding callers from overriding `purchase_attempt_id`, `quote_id`, `token_contract`, `amount_atomic`, `payer_address`, `payee_address`, and `settlement_tx_hash`. Validates cross-quote matching, token contract, recipient, amount, chain ID (42220), and receipt status (1) within atomic `BEGIN IMMEDIATE` transaction with all-or-nothing rollback.
- **Removal of Arbitrary CLI Stdout Hash Extraction (DEF-40):** Eliminates unconstrained stdout regex fallback searching for 32-byte hex strings. Parses only documented structured `paymentResponse.txHash` and `settlementTxHash` validated against `/^0x[0-9a-fA-F]{64}$/`. Transitions to `SETTLEMENT_UNKNOWN` and preserves budget reservation when valid structured references are absent.
- **Strict CLI Receipt-Resolution Execution & Validation (DEF-41):** `resolveSettlement()` requires `exitCode === 0` before parsing CLI stdout. Catches timeouts and errors, returning unresolved and preserving budget reservation. Validates output strictly as JSON array and requires strong unique associations, forbidding recipient-only matching.

---

## 12. Final Readiness and Malformed Receipt Guard (MOD-03.5)

Engineered to resolve DEF-42 and DEF-43:
- **Mandatory Payer Readiness & Pre-Dispatch Guard (DEF-42):**
  - `getHealth()` strictly requires an explicitly configured, valid `AGENT_WALLET_ADDRESS` (`/^0x[0-9a-fA-F]{40}$/`), successful Buy CLI `whoami` (`exitCode === 0`), valid CLI-reported paying address, case-insensitive match, and inactive kill switch to return `ready: true`.
  - Configured payer is never used as a substitute for the CLI account.
  - Reports `UNAVAILABLE` or `UNKNOWN` for CLI account and `UNCONFIGURED` for missing or invalid payer configuration.
  - `ready` is false for every missing, malformed, unknown, or mismatched identity.
  - Pre-dispatch guard in `executeApprovedRequest()` validates payer configuration before dispatch, releasing budget reservation and setting quote `FAILED` before subprocess invocation.
- **Strict Rejection of Malformed ERC-20 Transfer Logs (DEF-43):**
  - Requires exactly 3 topics for every ERC-20 Transfer event on the quoted token contract; never silently skips malformed Transfer logs.
  - Rejects missing or malformed sender and recipient topics, non-hex characters, invalid lengths, and non-zero high 12-byte address padding.
  - Rejects malformed Transfer event data unless it is exactly one 32-byte uint256 hex word.
  - Fails closed immediately on any malformed Transfer event on the quoted token so that valid adjacent transfers cannot conceal defects.
  - Continues cleanly ignoring unrelated valid event types (e.g. Approval) and logs from unrelated token contracts.
  - Preserves exact BigInt mathematical aggregate equality (`totalTransferred === expectedAmount`).

## 13. Final Payer Identity Contract Hardening (MOD-03.6 / DEF-44 & DEF-45)

- **Mandatory Expected Payer in Receipt Verification (DEF-44):**
  - Parameter `expectedPayer: string` is made strictly mandatory in `verifyReceiptTransferLogs()`.
  - Format is validated strictly as a 20-byte EVM address (`/^0[xX][0-9a-fA-F]{40}$/`).
  - Rejects missing, empty, or malformed payer addresses immediately.
  - Decoded sender from log `topics[1]` is strictly compared against `expectedPayer` (case-insensitively).
  - Receipts cannot be accepted based on token, recipient, and amount alone without cryptographic sender verification.
  - Zero default or hardcoded payer fallback across all callers.
- **Authoritative JSON-Only CLI whoami Identity Resolution (DEF-45):**
  - Eliminated arbitrary text regex fallback scanning across stdout lines.
  - CLI identity is resolved strictly from authoritative JSON fields (`parsed.payingAddress` or `parsed.account`) matching `/^0[xX][0-9a-fA-F]{40}$/`.
  - Malformed JSON, missing paying-address field, or invalid address format sets `account: 'UNKNOWN'` and `ready: false`.
  - CLI execution failures set `account: 'UNAVAILABLE'` and `ready: false`.
  - Prevents incidental addresses in warning messages, diagnostics, or unrelated properties from being adopted as the paying account.
  - Preserves strict case-insensitive equality check between CLI identity and configured `AGENT_WALLET_ADDRESS`.

---

## 14. Attribution & Registration Payload Security Hardening (MOD-04.1 / DEF-49 through DEF-55)

- **Registration URI Substitution Prevention (DEF-49):**
  - Public arbitrary `agentURI` query overrides are eliminated on `GET /api/agent/erc8004-registration-tx`.
  - Canonical metadata URI is strictly constructed from validated configuration: `${PUBLIC_BASE_URL}/api/agent/metadata`.
  - Public base URL is strictly validated via `validatePublicBaseUrl()`: requires absolute HTTPS protocol in production, rejects embedded credentials, and rejects `localhost`, loopback, and private network IPv4/IPv6 ranges in production.
- **Explicit JSON-RPC Method Classification (DEF-50):**
  - Broad prefix checking (`op.startsWith('eth_')`) is eliminated.
  - Explicit allowlists classify state-changing EVM transactions (`eth_sendTransaction`, `eth_sendRawTransaction`, `wallet_sendCalls`, `writeContract`, etc.) into `CATEGORY_A_OUTGOING_TX` with `shouldAddAttribution: true`.
  - Read-only RPC queries (`eth_call`, `eth_getTransactionReceipt`, `debug_traceTransaction`, etc.) are explicitly classified into `CATEGORY_B_READ_ONLY_RPC` with `shouldAddAttribution: false`.
  - Unrecognized methods fail closed to `CATEGORY_UNKNOWN` with no assumption of safety.
- **Fail-Closed Calldata Validation (DEF-51):**
  - Calldata input is strictly validated: non-empty strings must start with `0x`, have even hexadecimal length, and contain valid hex characters.
  - Malformed inputs throw typed `AttributionError` (`INVALID_CALLDATA`) without silent normalization or truncation.
- **Recursive Bounded Read-Only RPC Guard (DEF-52):**
  - `assertReadOnlyRpcUntagged()` performs recursive bounded inspection of JSON-RPC parameters up to depth 10 and 500 nodes.
  - Detects `ERC_8021_MARKER` case-insensitively in nested structures, detects circular references, and fails closed.
  - Wired directly into the `ChainstackProvider.callRpc()` boundary.
- **Official Agent Wallet Address Inviolability (DEF-53):**
  - `validateAgentWalletAddress()` validates checksum format and enforces exact case-insensitive equality to `OFFICIAL_AGENT_WALLET_ADDRESS` (`0x3e1bef07824cd0E076F4907641F0A0EF27898e52`) in production mode, preventing silent wallet drift.
- **Strict Attribution Merging & Schema 2 Refusal (DEF-54):**
  - Attribution merge errors are treated as hard failures; never silently returns untagged calldata.
  - If existing calldata contains Schema 2 role-based attribution without the official hackathon tag, `appendAttribution()` throws typed `SCHEMA_2_MERGE_PROHIBITED`, refusing to silently omit the assigned hackathon tag or corrupt the Schema 2 role structure.
  - Verified via `hasExpectedAttribution()` before returning.
- **Governance Task Sequencing Integrity (DEF-55):**
  - Dedicated identifiers `AGY-04-01` through `AGY-04-05` assigned for MOD-04.1 remediation.
  - Strict dependency sequencing enforced: `MOD-04 → MOD-04.1 → MOD-06 → MOD-05 → MOD-07 → MOD-08`.

---

## 15. Read-Only Provider Enforcement & Final Attribution Hardening (MOD-04.2 / DEF-56 through DEF-59)

- **Strict Read-Only RPC Method Allowlist at Gateway Boundary (DEF-56):**
  - Enforced an authoritative `ALLOWED_READ_ONLY_RPC_METHODS` allowlist inside `ChainstackProvider.callRpc()` before endpoint configuration checks, payload construction, or network `fetch`.
  - Allowed methods: `eth_chainId`, `eth_blockNumber`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_call`, `eth_getBalance`, `eth_getCode`, `eth_getStorageAt`, `eth_getLogs`, `eth_getTransactionCount`, `eth_getBlockByNumber`, `eth_getBlockByHash`, `eth_estimateGas`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_feeHistory`, `debug_traceTransaction`, `debug_traceCall`, `debug_traceBlockByNumber`, `debug_traceBlockByHash`.
  - Any state-changing (`eth_sendTransaction`, `eth_sendRawTransaction`, `personal_sendTransaction`, `wallet_sendCalls`, `eth_signTransaction`, `personal_sign`), unapproved, or unknown method immediately throws typed `ChainstackProviderError('READ_ONLY_METHOD_REQUIRED', 400)` before network execution.
  - Tested with mocked fetch asserting that network fetch is never called for unauthorized methods.
- **Robust Non-Public IP URL Validation (DEF-57):**
  - Upgraded `validatePublicBaseUrl()` in `src/server/config.ts` with socket-level IP classification (`net.isIP`), IPv6 bracket stripping, and word expansion algorithms (`parseIpv6ToWords`, `isNonPublicIpv4`, `isNonPublicIpv6`).
  - Evaluates all non-public network blocks in production:
    - IPv4 loopback `127.0.0.0/8` (entire block, including `127.0.0.2`, `127.1.2.3`), current network `0.0.0.0/8`, private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local `169.254.0.0/16`, CGNAT `100.64.0.0/10`, test networks, and multicast/reserved (`224.0.0.0/4`, `240.0.0.0/4`).
    - IPv6 loopback (`::1`), unspecified (`::`), unique local (`fc00::/7`), link-local (`fe80::/10`), multicast (`ff00::/8`), documentation (`2001:db8::/32`), and IPv4-mapped IPv6 literals (`::ffff:0:0/96`).
  - Permits only valid public HTTPS domains, public IPv4, and public IPv6 in production.
- **Request Classification Decision Architecture & Unknown Operation Fail-Closed Policy (DEF-58):**
  - Extended request classification to include explicit `ClassificationDecision`:
    - Category A (Outgoing EVM): `decision: 'REQUIRES_ATTRIBUTION'`.
    - Category B (Read-Only RPC): `decision: 'MUST_REMAIN_UNTAGGED'`.
    - Category C (HTTP 402 Payment): `decision: 'MUST_REMAIN_UNTAGGED'`.
    - Category D (Internal): `decision: 'MUST_REMAIN_UNTAGGED'`.
    - Category Unknown: `decision: 'REJECT_UNKNOWN'`.
  - Eliminates ambiguity where callers could assume `shouldAddAttribution: false` implies untagged execution is permitted.
  - Added `assertOperationDispatchable()` helper throwing typed `AttributionError('UNRECOGNIZED_OPERATION_REJECTED')` when encountering unknown operations.
- **Strict Calldata Input & Whitespace Rejection (DEF-59):**
  - Eliminated `.trim()` sanitization in `appendAttribution()`.
  - Enforced strict regex validation (`/\s/.test(calldata)`); rejects leading, trailing, and embedded whitespace (spaces, tabs, newlines) with typed `AttributionError('INVALID_CALLDATA')` without mutating inputs.


---

## 16. ERC-8004 Identity Registration Preparation & Receipt Integrity (MOD-05A)

- **Strict EIP-8004 Registration Metadata Schema:**
  - Implemented Zod schema with `.strict()` mode (`erc8004AgentMetadataSchema`).
  - Rejects unrecognized or fabricated properties (such as premature `agentId` or unverified `txHash`).
  - Validates `baseUrl` protocol (`http:` or `https:`) preventing malformed or dangerous protocol schemes (`ftp:`, `javascript:`, `data:`).
- **Environment-Aware Safe Preview Endpoint Guard:**
  - Endpoint `GET /api/agent/erc8004-registration-tx` evaluates canonical base URL against production socket IP validator.
  - When hosted on `localhost`, `127.0.0.1`, or private IP ranges, the endpoint explicitly flags `metadataUriStatus: 'BLOCKED_PENDING_PUBLIC_DEPLOYMENT'` and `readinessStatus: 'BLOCKED_PENDING_PUBLIC_DEPLOYMENT'`.
  - Prohibits premature registration with non-public metadata endpoints that would cause un-resolvable on-chain metadata.
  - Transitions to `READY_FOR_OPERATOR_SIGNATURE` only when configured with a public, validated HTTPS domain.
- **Forensic Post-Mint Receipt Verification Engine:**
  - Implemented `verifyErc8004RegistrationReceipt()` to parse on-chain receipts upon operator broadcast in MOD-05B.
  - Enforces receipt status `1` (`SUCCESS`), immediately failing with `REVERTED` if status is `0`.
  - Asserts target contract strictly matches canonical registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.
  - Asserts sender wallet strictly matches official agent wallet `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`.
  - Decodes `Registered` and ERC-721 `Transfer` events, asserting `from == 0x0` for minting and verifying token owner consensus.
  - Rejects ambiguous receipts with conflicting multiple agent IDs (`AMBIGUOUS_EVENTS`).
  - Zero private keys or signing capabilities are held in server memory; broadcast requires external operator approval.
