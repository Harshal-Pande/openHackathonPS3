# RevertLens — Build with Buy Payment Readiness & Settlement Verification

**Document Version:** 1.0.0 (Phase 11.5 Authoritative Guide)  
**Hackathon:** Agents on Open Rails 2026 | Track PS3 — Build with Buy  
**Target Network:** Celo Mainnet (`eip155:42220`)  
**Payment Gateway:** Buy Protocol Gateway (`https://gateway.usebuy.ai`)  
**Target Capability:** `cencori.v1.chat.completions`  
**Current Financial Status:** **`QUOTE_ONLY_NO_SETTLEMENT`** ($0.00 Spent)  

---

## 1. Executive Summary

RevertLens integrates the official Celo Buy marketplace (`@celo/buy`) to purchase AI-enhanced post-mortem summaries from Cencori's `maximo-atlas-1.3` LLM.

In strict adherence to the non-negotiable zero-spend policy ($0.00 spent), live on-chain settlement has not been executed. However, the complete 11-state payment lifecycle, quote challenge inspection, request-body SHA-256 binding, budget caps, and emergency kill-switches are fully implemented, tested, and ready.

---

## 2. Fresh Live Quote Details (Read-Only 402 Challenge)

The following quote parameters were verified through read-only challenge queries to the live Buy gateway:

| Parameter | Authoritative Value | Verification & Integrity |
|:---|:---|:---|
| **Capability ID** | `cencori.v1.chat.completions` | Discovered from live Buy catalogue |
| **Gateway Endpoint** | `https://gateway.usebuy.ai/cencori/v1/chat/completions` | Official Celo Buy Gateway |
| **HTTP Method** | `POST` | Standard inference request |
| **Model** | `maximo-atlas-1.3` | Cencori AI LLM |
| **Request Body SHA-256** | `7fc100510f4b04337c64fdcc7250b88fc30c1fc331837ecf2c5f42fe77c38431` | Cryptographically bound in SQLite |
| **Quoted Amount** | `$0.01` | Human display |
| **Atomic Amount** | `10000` | 6 decimals (`0.010000`) |
| **Accepted Token** | `USDC` (`0xceba9300f2b948710d2653dd7b07f33a8b32118c`) | Also accepts USDT & USA₮ |
| **Payee Recipient** | `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B` | Official Cencori Payee |
| **Network** | Celo Mainnet (`42220`) | EIP-155 Chain ID 42220 |
| **Quote TTL** | `900` seconds (15 minutes) | Auto-expires in database |

---

## 3. Strict Truth Distinction: What is NOT a Payment

To prevent misleading claims, RevertLens explicitly enforces the following truth distinctions:
1. **An HTTP 402 Challenge is NOT a Payment:** It is merely a pricing quote stating what the service costs.
2. **A Stored Quote Record is NOT a Payment:** A row in SQLite with status `AWAITING_OPERATOR_APPROVAL` is an unapproved pre-flight estimate.
3. **An Operator Approval is NOT a Payment:** Setting status to `APPROVED` authorizes execution, but does not move tokens.
4. **An API Response Alone is NOT Proof of Settlement:** Only a confirmed on-chain transaction receipt proves that value transferred on Celo Mainnet.

---

## 4. End-to-End Settlement Verification Protocol

When the human operator authorizes live paid execution (`BUY_ENABLED=true`):
1. **Pre-Invocation State:**
   - Server creates a durable quote record in SQLite with status `PENDING_SETTLEMENT`.
   - Budget reservation is atomically subtracted from `BUY_DAILY_BUDGET_ATOMIC`.
2. **Invocation via Official Buy CLI:**
   - Server executes `@celo/buy curl` via `child_process.spawn` (no shell interpolation).
   - The CLI authorizes payment using the OS keychain and communicates with the Celo facilitator.
3. **Receipt & Settlement Extraction:**
   - The CLI outputs the settlement transaction hash (e.g. `0xabc...123`).
   - Server parses the receipt details and queries Celo Mainnet archive RPC (`eth_getTransactionReceipt`).
4. **Independent On-Chain Verification:**
   - Server verifies that receipt status is `1` (Success).
   - Server verifies token transfer event to `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B` for `10000` atomic units.
5. **Database Finalization:**
   - Quote status updates to `SETTLED`.
   - Settlement transaction hash and block number are permanently linked to the investigation report.

---

## 5. Current Read-Only State & Next Step

- **Current Status:** `QUOTE_ONLY_NO_SETTLEMENT`.
- **Funds Expended:** `$0.00 USD`.
- **Pre-Flight Testing:** 13 unit tests pass in `tests/buyQuote.test.ts` and 4 security tests in `tests/buySecurity.test.ts`.
- **Execution Prerequisite:** To execute a live settlement, the operator can claim free USA₮ tokens from the Google Cloud Web3 faucet per [`ZERO_COST_FUNDING_RESEARCH.md`](file:///d:/Blockchain/BuildWithBuy/ZERO_COST_FUNDING_RESEARCH.md) and enable `BUY_ENABLED=true`.
