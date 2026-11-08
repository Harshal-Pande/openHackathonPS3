# Buy Payment Architecture, Security & Lifecycle Specification

**Module:** MOD-03 (Buy CLI Integration, Cencori AI Procurement & Live Settlement Verification)
**Date:** 2026-11-08
**Status:** `IMPLEMENTED` | `VERIFIED` | `ZERO_PERSONAL_SPEND` | `STOP_AT_APPROVAL_ENFORCED`
**Network:** Celo Mainnet (`eip155:42220`)
**Paying Wallet Address:** `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`
**Attribution Tag:** `celo_235f6ef56f5b`

---

## 1. Overview & Security Philosophy

The Buy payment architecture in RevertLens enables the application to procure paid services (specifically Cencori AI inference completions via `cencori.v1.chat.completions`) through the official Celo Buy marketplace (`@celo/buy@latest` v0.8.5, protocol `x402-v2`) on Celo Mainnet (`eip155:42220`).

To protect project funds, prevent runaway spending, and eliminate prompt injection exploits, the payment system is governed by strict, non-negotiable security invariants:

1. **Public Visitors Cannot Spend Project Funds:** Public visitors can request investigations and view deterministic reports, but cannot trigger project-wallet spending.
2. **Cryptographic Quote-to-Approval Binding:** Every purchase requires an immutable quote record and an authenticated operator approval strictly bound to the exact SHA-256 hash of the serialized request body.
3. **Atomic Budget Reservation:** Budget is atomically reserved in SQLite before invoking the paid CLI. A concurrent request cannot exceed daily or per-call caps.
4. **No Automatic Retries:** Ambiguous payment outcomes (`SETTLEMENT_UNKNOWN`, network timeouts, CLI exit code 1) never trigger blind retries. Budget remains reserved until explicit settlement resolution.
5. **Independent Settlement Verification:** HTTP 200 from the provider or Buy CLI is not payment proof. The system verifies on-chain receipt status (`receipt.status === 1`), recipient allowlist, and chain ID `42220` before marking `SETTLED`.
6. **Zero Stored Wallet Secrets:** The project never stores private keys, seed phrases, or raw tokens. `@celo/buy` manages wallet signing via local encrypted keystore.
7. **Strict CLI Execution Safety:** The Buy adapter executes via `child_process.execFile` with `shell: false`, argument array (no string interpolation), strict timeouts (60s), maxBuffer limits (512 KiB), and automatic redaction of sensitive credentials.

---

## 2. Complete 11-State Payment State Machine

The SQLite persistence layer and `BuyQuoteService` enforce valid transitions across 11 discrete states:

```
               [ Capability Discovery ]
                          │
                          ▼
                  QUOTE_REQUESTED
                          │
                          ▼
                   QUOTE_RECEIVED
                          │
            ┌─────────────┴─────────────┐
            │                           │
   (Invalid Params)             (Valid & Budget OK)
            ▼                           ▼
      QUOTE_INVALID         AWAITING_OPERATOR_APPROVAL
                                        │
                         ┌──────────────┴──────────────┐
                         │                             │
                 (Operator Approved)           (Expired / Cancelled)
                         │                             │
                         ▼                             ▼
                      APPROVED                  EXPIRED / CANCELLED
                         │
                         ▼
                 EXECUTION_PENDING
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
         SETTLED       FAILED    SETTLEMENT_UNKNOWN
```

### State Definitions:
1. `QUOTE_REQUESTED`: System initiated a read-only quote request to the gateway.
2. `QUOTE_RECEIVED`: Gateway returned an HTTP 402 challenge with valid price and payee.
3. `QUOTE_INVALID`: Quote failed parameter checks (wrong chain, unapproved token, unapproved payee, or body SHA-256 mismatch). Terminal.
4. `AWAITING_OPERATOR_APPROVAL`: Immutable quote stored in SQLite; awaiting human operator authorization.
5. `APPROVED`: Authenticated operator authorized the exact quote ID and body SHA-256 hash.
6. `EXECUTION_PENDING`: Budget reserved; purchase command submitted to `@celo/buy` CLI.
7. `SETTLEMENT_UNKNOWN`: CLI or network timed out / interrupted; status uncertain. Automatic retries prohibited. Budget remains reserved until settlement resolution.
8. `SETTLED`: Payment transaction confirmed and verified on Celo Mainnet (`receipt.status === 1`).
9. `FAILED`: Definitive pre-settlement failure. Budget reservation released immediately.
10. `EXPIRED`: Quote TTL lapsed without operator approval. Terminal.
11. `CANCELLED`: Operator manually revoked the quote or engaged emergency kill-switch. Terminal.

---

## 3. SQLite Persistence Architecture

Four dedicated tables manage the payment and audit lifecycle:

### `quote_records`
- `id`: UUID primary key.
- `investigation_id`: Bound investigation ID (if applicable).
- `capability_id`: Approved capability (e.g. `cencori.v1.chat.completions`).
- `url`: Target service gateway URL.
- `method`: HTTP method (`POST`).
- `exact_body`: Exact serialized JSON body.
- `body_sha256`: SHA-256 hash of `exact_body`.
- `token_symbol`: Quoted token symbol (`USDC`).
- `token_contract`: Quoted ERC-20 token address.
- `amount_atomic`: Quoted atomic price (`10000`).
- `amount_display`: Formatted display price (`$0.01`).
- `recipient`: Quoted payee address (`0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`).
- `chain_id`: `42220`.
- `status`: One of the 11 valid quote states.
- `expiry`: ISO-8601 expiry timestamp.
- `approval_id`: Bound operator approval ID.
- `approved_at`, `approved_by`: Operator audit metadata.

### `purchase_attempts`
- `id`: UUID primary key.
- `quote_id`: Foreign key referencing `quote_records(id)`.
- `approval_id`: Operator approval ID bound to this purchase.
- `status`: `EXECUTION_PENDING` | `SETTLED` | `SETTLEMENT_UNKNOWN` | `FAILED` | `CANCELLED`.
- `tx_hash`: Transaction hash (if generated).
- `settlement_tx_hash`: On-chain payment settlement hash.
- `raw_stdout_redacted`: Sanitized CLI stdout.
- `raw_stderr_redacted`: Sanitized CLI stderr.

### `settlement_records`
- `id`: UUID primary key.
- `purchase_attempt_id`: Unique foreign key to `purchase_attempts(id)`.
- `quote_id`: Reference to quote.
- `tx_hash`: Settlement transaction hash.
- `chain_id`: `42220`.
- `block_number`: Confirmed block number.
- `token_contract`: Token contract address.
- `payer`: Paying wallet address (`0x3e1bef07824cd0e076f4907641f0a0ef27898e52`).
- `recipient`: Payee address.
- `amount_atomic`: Settled atomic amount.
- `receipt_status`: `1` (verified successful execution).
- `verified_at`: ISO timestamp of verification.

### `budget_reservations`
- `id`: UUID primary key.
- `quote_id`: Reference to quote.
- `amount_atomic`: Reserved amount.
- `status`: `RESERVED` | `COMMITTED` | `RELEASED`.
- `reserved_at`, `settled_at`: Timestamps.

### `payment_audit_events`
- `id`: Autoincrement integer primary key.
- `entity_type`: `QUOTE` | `APPROVAL` | `PURCHASE` | `SETTLEMENT` | `BUDGET` | `KILL_SWITCH`.
- `entity_id`: Entity UUID.
- `from_status`, `to_status`: State transition.
- `operator_username`: Username of operator.
- `details`: Human-readable audit context.
- `created_at`: Immutable creation timestamp.

---

## 4. Operator API Endpoints

All operator endpoints enforce active operator session validation:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/operator/buy-health` | Real-time wallet identity, balances, CLI version, and readiness |
| `GET` | `/api/operator/quotes` | List payment quotes |
| `POST` | `/api/operator/quotes/:id/approve` | Approve quote bound to exact body SHA-256 |
| `POST` | `/api/operator/quotes/:id/execute` | Execute approved quote via Buy CLI with atomic budget reservation |
| `GET` | `/api/operator/purchases` | List purchase attempt records |
| `GET` | `/api/operator/purchases/:id` | Inspect specific purchase attempt and settlement proofs |
| `POST` | `/api/operator/purchases/:id/resolve` | Query on-chain receipt for ambiguous `SETTLEMENT_UNKNOWN` attempt |
| `GET` | `/api/operator/audit-events` | Query immutable payment audit event ledger |
| `POST` | `/api/operator/kill-switch` | Emergency kill-switch toggle (halts all quotes and purchases) |

---

## 5. Live Mainnet Wallet Readiness Status

As discovered during Phase A of MOD-03:
- Paying Address: `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`
- Network: Celo Mainnet (`eip155:42220`)
- Balances: `0 CELO, 0 USDC, 0 USDT, 0 USAT, 0 USDm`
- Status: **UNFUNDED** (`funded: false`)

**Mandatory Safety Invariant Enforced:**
Because the wallet has zero balances, live on-chain purchases cannot settle. The system explicitly blocks on-chain disbursement and flags wallet status honestly in the Operator Console. All automated unit and integration tests execute with 100% mocked deterministic CLI runners and settlement verifiers, guaranteeing zero personal funds spent.

---

## 6. MOD-03.2 Critical Payment Path Security Remediations

An independent security remediation pass resolved critical payment path defects:

1. **Evidence-Backed On-Chain Settlement Verification (DEF-MOD03-SEC-01):**
   - Transactions are independently verified on Celo Mainnet RPC (`42220`).
   - Receipt logs are parsed for the ERC-20 `Transfer(address,address,uint256)` event signature (`0xddf252ad...`).
   - Verification strictly proves: contract address equals `quote.token_contract`, recipient equals `quote.recipient`, atomic value equals `quote.amount_atomic`, and receipt status equals success (`0x1`).
   - `resolveSettlement()` strictly forbids candidate matching by recipient address alone; requires unique quote ID, purchase attempt ID, or exact known transaction hash.

2. **Authoritative Capability Registry & Parameter Binding (DEF-MOD03-SEC-02 & SEC-07):**
   - Created server-side `CAPABILITY_REGISTRY` binding capability ID (`cencori.v1.chat.completions`), provider, exact URL, HTTP method, supported tokens, decimals, payee, and body size.
   - Legacy Chainstack Buy capability removed from active runtime discovery (direct RPC retained under AD-008).
   - Revalidates stored quote against registry at execution time.

3. **Mathematical Amount Normalization (DEF-MOD03-SEC-03):**
   - Implemented exact BigInt decimal conversion between `amount_atomic` and `amount_display`.
   - Rejects leading zeros, negative values, zero values, precision overflow, and floating-point math.

4. **Quote Expiration Recheck at Execution (DEF-MOD03-SEC-04):**
   - Reloads quote immediately prior to execution and re-evaluates `quote.expiry`.
   - Lapsed approved quotes transition to `EXPIRED` and execution is rejected without CLI dispatch.

5. **Single-Use Atomic Approval & Concurrency Protection (DEF-MOD03-SEC-05 & SEC-08):**
   - Uses SQLite `BEGIN IMMEDIATE` transactions and conditional state updates (`UPDATE ... WHERE id = ? AND status = ?`).
   - Prevents duplicate executions, duplicate budget reservations, and concurrent race conditions.
   - Prevents casual release of `COMMITTED` budget reservations.

6. **Pinned Direct Node CLI Subprocess Execution (DEF-MOD03-SEC-06):**
   - Pinned `@celo/buy@0.8.5` in project dependencies.
   - Spawns local entrypoint `node_modules/@celo/buy/dist/main.js` directly with `process.execPath` and `shell: false`.
   - Verified via harmless read-only CLI tests (`-V` and `whoami`) with zero personal funds spent.

---

## 7. Settlement Integrity & Ambiguous Payment Failure Hardening (MOD-03.3)

Following independent audit of the payment settlement pipeline, 6 critical settlement integrity protections were engineered:

1. **Fail-Closed RPC Chain ID Verification (DEF-31):**
   - Direct on-chain settlement validation queries `eth_chainId` before querying receipts.
   - Fails closed on any non-200 HTTP status, malformed JSON, JSON-RPC error, mismatched request ID, unparseable hex, or chain ID not strictly matching `42220`.
   - Halts settlement processing immediately; refuses receipt queries if chain authority is invalid.

2. **Strict Receipt Transaction Hash Equality (DEF-32):**
   - Enforces exact case-insensitive equality between receipt `transactionHash` and the requested `expectedTxHash`.
   - Rejects mismatched transaction receipts, empty hashes, or missing fields with `Receipt transaction hash mismatch`.

3. **Cryptographically Proven Payer Identity (DEF-33):**
   - Validates that the indexed sender in `topics[1]` decodes to a valid 20-byte address matching the configured agent wallet (`this.payingAddress`).
   - Rejects receipts where `topics.length < 3`, address decoding fails, or payer differs.
   - Eliminates all hardcoded fallback assignments in settlement record persistence.

4. **Exact Aggregate ERC-20 Transfer Summation (DEF-34):**
   - Iterates through all receipt event logs matching ERC-20 `Transfer(address,address,uint256)` topic signature.
   - Validates event `data` payload matches 32-byte hex format (`/^0x[0-9a-fA-F]{64}$/`).
   - Filters logs matching `token_contract`, `payer`, and `recipient`, summing all transfer values using native BigInt.
   - Strictly requires `totalTransferred === expectedAmountAtomic`. Rejects underpayments (`<`), overpayments (`>`), or partial split transactions.

5. **Dispatch Boundary Demarcation & Preserved Budget Reservations (DEF-35):**
   - Pre-dispatch failures (before subprocess invocation: invalid capability, payload disk write error, missing CLI binary) definitively prove zero on-chain activity; atomically transition attempt to `FAILED`, quote to `FAILED`, and release reserved budget (`RELEASED`).
   - Post-dispatch failures (spawn errors, timeouts, network disconnections, non-zero exits, HTTP 500) indicate ambiguous execution; atomically transition attempt to `SETTLEMENT_UNKNOWN`, quote to `SETTLEMENT_UNKNOWN`, and preserve budget reservation as `RESERVED`.

6. **Unambiguous Settlement Resolution Matching (DEF-36):**
   - `resolveSettlement()` queries candidate purchases using specific references (quote ID, purchase attempt ID, or explicit tx hash).
   - Collects all candidate transaction hashes; strictly requires exactly one unique candidate hash.
   - If zero candidates match or multiple distinct candidate hashes exist, resolution halts and returns unresolved/ambiguous status.

7. **Atomic Multi-Entity SQLite Settlement Commit:**
   - Introduced `db.commitSettlementAtomic()` wrapped in a SQLite `BEGIN IMMEDIATE` transaction.
   - Simultaneously writes `settlement_records`, updates `purchase_attempts`, updates `quote_records`, and transitions `budget_reservations` to `COMMITTED`.
   - Guarantees 100% database consistency or complete rollback on write failure.

---

## 8. Final Payment-Proof Integrity Remediation (MOD-03.4 / DEF-37 through DEF-41)

Following an independent source audit of the MOD-03.3 settlement verification pipeline, 5 critical payment-proof integrity protections were engineered:

1. **Elimination of Hardcoded Payer Identity Fallbacks (DEF-37):**
   - Settlement verification strictly requires a valid, explicitly configured `AGENT_WALLET_ADDRESS` (`/^0x[0-9a-fA-F]{40}$/`).
   - Normalizes to lowercase without silent fallbacks. If unconfigured or malformed, settlement verification fails closed immediately before querying receipts.
   - `getHealth()` reports `account: 'UNCONFIGURED'` or `'UNAVAILABLE'` in fallback and catch branches, eliminating all hardcoded wallet constants.
   - Compares configured payer against CLI reported account; mismatches expose `payerMismatch: true` and fail health check (`ready: false`).

2. **Strict ABI Indexed Address Topic Validation (DEF-38):**
   - Address decoder `decodeAddressFromTopic()` strictly requires exactly `0x` followed by 64 hex characters (32 bytes).
   - Validates that the first 12 bytes (24 hex characters) are strictly zero-padded (`000000000000000000000000`).
   - Applies strict validation to both sender (`topics[1]`) and recipient (`topics[2]`).
   - Fails verification explicitly on malformed topics claiming to be payment token transfers while cleanly ignoring valid unrelated logs.

3. **Settlement Proof Field Override Protection & Cross-Quote Validation (DEF-39):**
   - Enforces strict allowlist in `commitSettlementAtomic()`. Forbids callers from overriding `purchase_attempt_id`, `quote_id`, `token_contract`, `amount_atomic`, `payer_address`, `payee_address`, and `settlement_tx_hash`.
   - Validates that the settlement proof references an existing purchase attempt, the purchase attempt belongs to the same quote, and proof parameters (token, recipient, atomic amount, chain ID 42220, receipt status 1) strictly match stored quote records.
   - Executed within a SQLite `BEGIN IMMEDIATE` transaction with all-or-nothing rollback.

4. **Elimination of Arbitrary CLI Stdout Hash Extraction (DEF-40):**
   - Completely removed regular-expression fallback searching arbitrary stdout for 32-byte hex strings.
   - Parses only documented, validated structured `paymentResponse.txHash` and `settlementTxHash` fields (`/^0x[0-9a-fA-F]{64}$/`).
   - If structured settlement references are absent or malformed, execution marks attempt and quote `SETTLEMENT_UNKNOWN`, preserves budget reservation (`RESERVED`), does not retry, and records redacted CLI output for operator inspection.

5. **Strict CLI Receipt-Resolution Execution & Validation (DEF-41):**
   - `resolveSettlement()` requires `exitCode === 0` before parsing CLI stdout for receipt candidates.
   - Catches CLI execution errors or timeouts, returning unresolved and retaining budget reservation.
   - Validates stdout strictly as JSON array, validates candidate schemas, requires strong unique associations (quote ID, purchase attempt ID, or payment reference), strictly forbids recipient-only matching, and requires exactly 1 unique candidate hash.

---

## 9. Final Readiness and Malformed Receipt Guard (MOD-03.5 / DEF-42 & DEF-43)

Following independent audit of the MOD-03.4 snapshot, two final integrity guards were implemented:

1. **Mandatory Payer Configuration for Readiness & Dispatch Guard (DEF-42):**
   - `getHealth()` strictly requires:
     - `AGENT_WALLET_ADDRESS` explicitly configured matching `/^0x[0-9a-fA-F]{40}$/`.
     - Buy CLI `whoami` succeeds with `exitCode === 0`.
     - CLI-reported paying address is valid EVM address format.
     - Case-insensitive equality between CLI paying address and configured payer.
     - Absence of emergency kill switch.
   - Never substitutes configured payer for CLI-reported account.
   - Reports `UNAVAILABLE` or `UNKNOWN` for CLI account and `UNCONFIGURED` for missing/invalid payer configuration.
   - Sets `ready: false` for every missing, malformed, unknown, or mismatched identity.
   - Pre-dispatch guard in `executeApprovedRequest()` validates payer configuration before subprocess dispatch, releasing budget reservation and setting quote `FAILED` immediately if invalid.

2. **Strict Rejection of Malformed ERC-20 Transfer Logs (DEF-43):**
   - For all receipt logs on quoted token identifying as ERC-20 Transfer (`topics[0] === ERC20_TRANSFER_EVENT_TOPIC`):
     - Requires exactly 3 topics (rejects 1, 2, or 4 topics; never silently skips).
     - Rejects missing or malformed sender (`topics[1]`) or recipient (`topics[2]`) topics.
     - Strictly enforces 32-byte hex and 12-byte zero padding (`000000000000000000000000`).
     - Rejects malformed Transfer event data unless it is exactly one 32-byte uint256 hex word.
     - Fails closed immediately on any malformed Transfer event on quoted token so that adjacent valid transfers cannot conceal defects.
     - Continues cleanly ignoring unrelated valid event types (e.g. Approval) and logs from unrelated token contracts.
     - Preserves exact BigInt mathematical aggregate equality (`totalTransferred === expectedAmount`).
