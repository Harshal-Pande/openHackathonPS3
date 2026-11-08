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
