# Buy Payment Architecture & Lifecycle Specification

**Date:** 2026-11-07  
**Status:** `IMPLEMENTED` | `READINESS_CONFIRMED` | `ZERO_PERSONAL_SPEND`  

---

## 1. Overview & Security Philosophy

The Buy payment architecture in RevertLens allows the application to purchase verified services (such as Chainstack RPC tracing and Cencori LLM completions) through the official Celo Buy API Gateway (`@celo/buy` v0.8.5, protocol `x402-v2`) on Celo Mainnet (`eip155:42220`).

To protect project funds, prevent runaway spending, and eliminate prompt injection exploits, the payment system is governed by three non-negotiable principles:
1. **Public Visitors Cannot Spend Project Funds:** Public users can request investigations and view deterministic reports, but cannot trigger wallet disbursements.
2. **Cryptographic Quote-to-Approval Binding:** Every purchase requires an immutable quote record and an authenticated operator approval bound to the exact SHA-256 hash of the serialized request body.
3. **No Automatic Retries:** Ambiguous payment outcomes (`SETTLEMENT_UNKNOWN`, network timeouts) never trigger blind retries.

---

## 2. Complete Payment State Machine

The SQLite persistence layer and `BuyQuoteService` manage the complete lifecycle across 11 discrete states:

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
3. `QUOTE_INVALID`: Quote failed parameter checks (wrong chain, unapproved token, unapproved payee, or body SHA-256 mismatch).
4. `AWAITING_OPERATOR_APPROVAL`: Immutable quote stored in SQLite; awaiting human operator authorization.
5. `APPROVED`: Authenticated operator authorized the exact quote ID and body hash.
6. `EXECUTION_PENDING`: Purchase command submitted to `@celo/buy` CLI.
7. `SETTLEMENT_UNKNOWN`: CLI or network timed out; status uncertain. Automatic retries prohibited.
8. `SETTLED`: Payment transaction confirmed and settled on Celo Mainnet.
9. `FAILED`: Gateway or blockchain rejected the transaction.
10. `EXPIRED`: Quote TTL lapsed without operator approval.
11. `CANCELLED`: Operator manually revoked the quote or engaged the emergency kill-switch.

---

## 3. Cryptographic Quote-to-Approval Binding

An approval packet is valid **only if** the operator signs off on the exact tuple:
`Tuple = (quoteId, bodySha256, maxAmountAtomic, payeeAddress, tokenContract, network, expiry)`

- The outbound payload is serialized canonically and hashed via SHA-256.
- The approval endpoint (`POST /api/operator/quotes/:id/approve`) requires the client to supply `expectedBodySha256`.
- If a single character in the request body, target URL, recipient, or token changes between quote review and approval, the transaction is immediately rejected and marked `QUOTE_INVALID`.

---

## 4. Spending Caps & Budget Controls

Implemented deterministically in `src/server/services/buyQuoteService.ts`:
- **Per-Call Spending Cap (`BUY_PER_CALL_CAP_ATOMIC`):** Quotes requesting more than the configured atomic cap are rejected immediately.
- **Daily Budget Cap (`BUY_DAILY_BUDGET_ATOMIC`):** Tracks rolling 24-hour spend in SQLite; halts quote creation when the budget threshold is reached.
- **Emergency Kill-Switch:** Stored in `system_settings` table. When engaged via `POST /api/operator/kill-switch`, all pending approvals and new quotes are instantaneously blocked with HTTP 503.

---

## 5. Phase 6 Execution Invariant: Stop at Approval

In strict accordance with Phase 6 instructions:
- **Quote Creation & Approval Verification:** Implemented and tested with 100% test coverage.
- **Paid Execution:** **HALTED.** No paid CLI execution endpoint was invoked during Phase 6.
- **Personal Spending:** **$0.00 spent.**
- **Wallet Readiness:** Buy CLI OS keychain architecture preserved for future authorized deployment.
