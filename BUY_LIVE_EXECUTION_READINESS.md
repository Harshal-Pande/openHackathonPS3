# BUY Live Execution & Settlement Readiness
**Track:** Agents on Open Rails | Track PS3 — Build with Buy  
**Status:** READY FOR OPERATOR FUNDING & AUTHORIZED EXECUTION (ZERO SPEND INCURRED TO DATE)  
**Date:** November 7, 2026

---

## 1. Explicit Financial Statement

> **CRITICAL INVARIANT:**  
> **NO REAL PERSONAL MONEY HAS BEEN SPENT.**  
> Total expenditure to date: **$0.00**.  
> No wallet private keys or funds have been accepted, transferred, or signed by the application or automated agents. All execution paths have been validated using live read-only 402 payment challenge quotes and deterministic test fixtures.

---

## 2. Service Capability & Pricing Authority

The service capability targeted for Buy marketplace execution is Cencori's LLM inference engine:

| Attribute | Verified Value |
|:---|:---|
| **Capability ID** | `cencori.v1.chat.completions` |
| **Provider** | Cencori (`https://cencori.com`) via Buy Gateway |
| **Gateway Endpoint** | `https://gateway.usebuy.ai/cencori/v1/chat/completions` |
| **HTTP Method** | `POST` |
| **Model** | `maximo-atlas-1.3` |
| **Max Tokens** | 1,024 |
| **Quoted Price** | `10,000` atomic units ($0.01 USD at 6 token decimals) |
| **Payee Address** | `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B` |
| **Accepted Assets (Celo Mainnet 42220)** | • USDC (`0xcebA9300f2b948710d2653dD7B07f33A8B32118C`)<br>• USDT (`0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`)<br>• USA₮ (`0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771`) |
| **Payment Protocol** | x402-v1 / x402-v2 |

---

## 3. Cryptographic Quote-to-Body Binding

Every paid invocation requires an exact SHA-256 hash of the JSON payload:
- The backend constructs a bounded prompt payload from verified evidence ledger items (`[E-01]`, `[E-02]`, etc.).
- Computes `SHA-256(canonicalPayload)` and generates a durable `quote_records` entry in SQLite.
- The operator reviews the quote ID, amount, and exact hash.
- The approval packet must match the stored body SHA-256. If a single character changes, the approval is rejected.

---

## 4. Execution & Settlement Verification Procedure

When the operator decides to fund the wallet (e.g. via the Google Cloud Web3 USA₮ faucet or a personal wallet), the execution workflow is as follows:

```
[ Operator Session Authenticated ]
               │
               ▼
[ Request Quote: POST /api/investigations/:id/quote ]
               │ (Returns Quote ID, Amount: $0.01, Body SHA-256)
               ▼
[ Operator Approval: POST /api/operator/quotes/:id/approve ]
               │ (Locks atomic budget reservation in SQLite)
               ▼
[ Execute CLI: buy curl -X POST https://gateway.usebuy.ai/... ]
               │ (Spawns isolated child process, no shell string interpolation)
               ▼
[ Settlement Verification: buy receipts ]
               │ (Validates on-chain settlement tx hash on Celo 42220)
               ▼
[ Update State: SETTLED ]
```

---

## 5. Settlement Invariants & Anti-Retry Safeguards

1. **Non-Retry Invariant:** If the network drops or returns ambiguous HTTP 500 / `settle_uncertain`, RevertLens **never** retries automatically. The quote moves to `SETTLE_UNCERTAIN` and requires manual operator inspection.
2. **Atomic Budget Reservation:** The spending cap is reserved in SQLite before spawning the CLI. If insufficient funds or budget cap reached, invocation is aborted before any external request.
3. **Emergency Kill Switch:** A global kill switch flag in `system_settings` immediately rejects all payment approvals when engaged.
4. **Public Visitor Isolation:** Unauthenticated public requests cannot access `/api/operator/*` routes (rejected with HTTP 401).

---

## 6. Exact Remaining Operator Prerequisites for Live Execution

1. **Claim Faucet or Fund Wallet:** The operator must claim test tokens (e.g., from the Google Cloud Web3 Celo USA₮ faucet) into the `@celo/buy` CLI OS keychain.
2. **Verify Wallet Balance:** Run `npx @celo/buy@latest whoami` to confirm the balance is >= 10,000 atomic units ($0.01).
3. **Enable Features in `.env`:**
   ```bash
   BUY_ENABLED=true
   CENCORI_ENABLED=true
   BUY_DAILY_BUDGET_ATOMIC=5000000
   BUY_PER_CALL_CAP_ATOMIC=500000
   ```
4. **Approve Single Quote:** Perform a single operator login and quote approval through the UI or API.
