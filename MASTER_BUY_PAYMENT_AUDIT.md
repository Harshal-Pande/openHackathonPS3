# RevertLens — Master Buy Payment Integration Audit
**Document Version:** 1.0.0  
**Technology:** Celo Buy Marketplace (`@celo/buy` v0.8.5 via `npx`)  
**Evaluation Standard:** Architecture Decisions AD-002, AD-003, AD-004, AD-012 & `docs/04_SECURITY_AND_PRIVACY.md`  

---

## 1. Buy Payment Architecture Overview

RevertLens integrates the official Celo Buy marketplace mechanism to facilitate subsidized service procurement (specifically Cencori AI inference). The architecture enforces uncompromising financial security boundaries: public users can submit investigations and view reports, but **only an authenticated operator** can authorize spending from the project wallet.

```text
Service Request (e.g. Cencori Prompt)
  │
  ├──> Buy Quote Service (src/server/services/buyQuoteService.ts)
  │      ├── Generates immutable quote record in SQLite
  │      ├── Computes exact prompt payload SHA-256 digest
  │      └── Enforces capability, recipient, and token allowlists
  │
  ├──> Operator Review Gate (POST /api/operator/quotes/:id/approve)
  │      ├── Requires authenticated operator bearer token
  │      ├── Validates expectedBodySha256 against stored quote
  │      └── Verifies daily and per-call spending limits
  │
  ├──> Atomic Budget Reservation
  │      └── Prevents race conditions or double-spending
  │
  ├──> Official Buy CLI Execution (npx @celo/buy@latest curl)
  │      └── Safe child_process spawn (no shell interpolation)
  │
  └──> Settlement Verification & Ledgering
         ├── Independent verification of on-chain tx receipt
         └── Separate recording of HTTP success vs. payment settlement
```

---

## 2. Eleven-State Payment Lifecycle

Every quote and payment transition is tracked in SQLite table `quotes`:

| State | Definition | Transition Triggers |
|:---|:---|:---|
| **`QUOTE_REQUESTED`** | Service payload generated; awaiting HTTP 402 challenge | Request initiated |
| **`QUOTE_RECEIVED`** | Valid HTTP 402 challenge returned with pricing | Provider challenge parsed |
| **`QUOTE_INVALID`** | Pricing or parameters violate security policy | Reject invalid params |
| **`AWAITING_OPERATOR_APPROVAL`**| Immutable quote stored; pending operator review | Quote saved to DB |
| **`APPROVED`** | Authenticated operator signed off on exact body SHA-256 | Valid operator signature |
| **`EXECUTION_PENDING`** | CLI call dispatched to Buy Gateway | Process spawned |
| **`SETTLEMENT_UNKNOWN`** | Gateway returned ambiguous status or network timed out | Unconfirmed status |
| **`SETTLED`** | On-chain settlement transaction verified on Celo | Mined receipt verified |
| **`FAILED`** | Provider error or CLI execution failed | Process non-zero exit |
| **`EXPIRED`** | Quote TTL elapsed before operator approval | Current time > expiry |
| **`CANCELLED`** | Operator denied quote or engaged emergency kill switch | Operator cancellation |

---

## 3. Security Boundaries & Guardrails

1. **Strict Public Isolation:** Public endpoints (`POST /api/investigations`, `POST /api/investigations/:id/quote`) cannot initiate CLI payments. Any attempt by an unauthenticated user to access `POST /api/operator/*` immediately returns HTTP 401 `UNAUTHORIZED`.
2. **Cryptographic Quote-to-Approval Binding:** Approvals must provide `expectedBodySha256` matching the exact 64-character SHA-256 hash of the payload serialized at quote creation time. If the payload is tampered with by even 1 byte, approval fails immediately.
3. **Allowlist Enforcement:**
   - **Allowed Capabilities:** `cencori.v1.chat.completions` (and `chainstack.celo` for legacy compatibility).
   - **Allowed Token Contracts:** Official Celo cUSD (`0x765de816845861e75a25fca122bb6898b8b1282a`), USDC (`0xceba9300f2b948710d2653dd7b07f33a8b32118c`), and USDT (`0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e`).
   - **Allowed Payee Addresses:** Validated against known provider registry.
4. **Spending Caps & Budgets:**
   - Per-Call Cap: Enforced in deterministic server logic.
   - Daily Budget Cap: Sum of settled and reserved funds within 24 hours cannot exceed cap.
5. **Emergency Kill Switch:** The operator can toggle `POST /api/operator/kill-switch` to immediately halt all quote approvals and CLI executions.
6. **No Shell Interpolation:** Spawning `npx @celo/buy@latest` uses `child_process.spawn` with explicit argument arrays, preventing command injection.

---

## 4. Financial & Audit Evidence

- **Total Live Funds Expended:** **$0.00 USD**
- **Test Coverage:** All quote states, security boundaries, and allowlists are tested in `tests/buyQuote.test.ts` and `tests/buySecurity.test.ts`.
- **Truthful Status:** The Buy payment architecture is 100% complete, hardened, and verified under mocked conditions. No live personal funds were expended.
