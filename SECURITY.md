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
- `OPERATOR_PASSWORD_HASH` must not match the placeholder sentinel and must be an Argon2id hash.
- `BUY_ENABLED=true` requires positive non-zero values for `BUY_DAILY_BUDGET_ATOMIC` and `BUY_PER_CALL_CAP_ATOMIC`.
- Startup immediately crashes if any production safeguard fails.

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

