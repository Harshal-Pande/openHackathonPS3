# GATE 0 — Formal Spend Approval Request
## Operation: Chainstack Celo Live Trace Verification (`debug_traceTransaction`)

> **HISTORICAL NOTICE (Architecture Decision AD-008):**
> This approval request was prepared during Phase 3 before the operator provisioned a direct Chainstack Celo Mainnet Elastic Global Node (`ND-801-666-498`) with OP Geth and native debug/trace namespaces. Under AD-008, live RPC tracing is performed directly at zero cost, and paid Buy execution was superseded for RPC queries and redirected to Cencori LLM inference (`cencori.v1.chat.completions`). This document is preserved as an immutable historical record of the pre-AD-008 verification process.

**Document Status:** SUPERSEDED BY DIRECT GROWTH NODE (AD-008) — HISTORICAL RECORD
**Generated At:** 2026-11-07 06:26:00 UTC (Preflight Verified)
**Target Environment:** Celo Mainnet (`eip155:42220`)
**Proposed Spend:** Exactly 10,000 atomic units ($0.01) in USDC or USDT (NOT EXECUTED)

---

### A. Purpose

This single paid request is the definitive technical verification gate ("Gate 0") for RevertLens. 

RevertLens is designed to provide trace-backed transaction forensics for failed Celo transactions. While read-only discovery confirmed that `chainstack.celo` is available on the Buy gateway and serves 402 payment challenges, **only a real paid request can verify whether the Chainstack RPC node supports `debug_traceTransaction` with `callTracer` and returns an actual nested call tree.**

- **If this call returns a usable call tree:** The project achieves a **GO** decision and proceeds with the Primary Trace-Capable Architecture.
- **If this call reveals `debug_traceTransaction` is unsupported or disabled by Chainstack:** The project achieves a **FALLBACK** decision, pivoting to the Receipt-Only Explainer model without fabricating trace capabilities.
- **If the paid RPC gateway fails completely:** The project achieves a **STOP** decision, halting rather than substituting unverified free RPC endpoints.

---

### B. Exact Operation

- **Gateway URL:** `https://gateway.usebuy.ai/chainstack/celo`
- **HTTP Method:** `POST`
- **Headers:** `Content-Type: application/json`
- **Capability Identifier:** `chainstack.celo`
- **Target Transaction Hash:** `0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445` (verified failed on Celo Mainnet at block 52460432)
- **Primary RPC Method:** `debug_traceTransaction`
- **Tracer Parameter:** `{"tracer": "callTracer"}`
- **Exact Serialized Request Body:**
```json
{"jsonrpc":"2.0","id":1,"method":"debug_traceTransaction","params":["0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445",{"tracer":"callTracer"}]}
```
- **Request Body SHA-256 Digest:**
  `35406284f1673b329e88e9b2d7e162c4e515123aec7237ef8aea1acba23b7882`

---

### C. Live Payment Details (From Official 402 Quote)

Obtained via `npx @celo/buy@latest quote`:

| Parameter | Quoted Value |
|---|---|
| **Payment Protocol** | `x402-v1` / `x402-v2` (`exact` scheme) |
| **Network** | Celo Mainnet (`celo` / `eip155:42220`) |
| **Payee Address (`payTo`)** | `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B` |
| **Atomic Amount (`maxAmountRequired`)** | `10000` |
| **Token Decimals** | 6 |
| **Human-Readable Amount** | **$0.01 USD** |
| **Allowed Assets (Choose One):** | |
| 1. **USDC** | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` |
| 2. **USDT** | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` |
| 3. **USAT** | `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771` |
| **Gateway Timeout** | 60 seconds (`maxTimeoutSeconds: 60`) |

---

### D. Security Verification Checklist

- [x] **Quote Freshness:** Verified directly against `gateway.usebuy.ai` on 2026-11-07.
- [x] **Exact Request Binding:** Serialized body hash matches `35406284f1673b329e88e9b2d7e162c4e515123aec7237ef8aea1acba23b7882`. Any change to payload invalidates approval.
- [x] **Budget Verification:** Amount ($0.01) is strictly within standard test parameters and does not exceed the single-call cap.
- [x] **Payee Verification:** Payee `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B` is the official Buy Gateway treasury address on Celo.
- [x] **Network Verification:** Target network is strictly Celo Mainnet (`42220`).
- [x] **Zero Secret Leakage:** No private keys or seed phrases are requested, stored, or processed by the agent. Wallet custody remains in the OS keychain.
- [x] **No Shell String Interpolation:** Execution command uses fixed argv array with `shell: false`.

---

### E. Expected Result & Acceptance Criteria

A successful Gate 0 execution requires:
1. **Settlement Proof:** An on-chain transaction hash for the 0.01 USDC transfer to `0x20faAca5...` with status `SUCCESS` verified via `buy receipts --resolve`.
2. **Valid JSON-RPC Response:** HTTP 200 containing `result` matching JSON-RPC ID 1.
3. **Usable Trace Evaluation:**
   - The response must contain a call tree object with `type` (e.g. `CALL`, `DELEGATECALL`), `from`, `to`, `gas`, `gasUsed`, and `error` / `revertReason`.
   - The trace must locate the frame that executed the failed swap.
   - If `callTracer` returns empty or `method not supported`, trace support is declared **UNSUPPORTED** and Gate 0 transitions to **FALLBACK**.

---

### F. Failure Handling & Adverse Conditions

- **Quote Expiry:** If the gateway rejects the challenge, a fresh quote is obtained and must be re-verified against the immutable body hash before execution.
- **Method Unsupported (HTTP 200 with JSON-RPC error e.g. `-32601`):** Log as `UNSUPPORTED_TRACE_METHOD`. Do NOT retry. Record outcome as **FALLBACK: RECEIPT EXPLAINER**.
- **Network Timeout / Gateway Interruption:** Mark attempt as `SETTLEMENT_UNKNOWN`. **NEVER retry automatically.** Immediately run `buy receipts --resolve` to determine whether the facilitator broadcasted the payment.
- **Payment Settlement Ambiguity:** If `buy receipts` cannot confirm settlement, do not re-execute. Halt and present findings for human review.
- **HTTP 500 / Provider Crash:** Durable purchase record is preserved with error code; budget reservation is released only if on-chain verification proves no settlement occurred.

---

### G. Operator Action Required Before Execution

To proceed with this verification, the human operator must:

1. **Provision Wallet (in local terminal):**
   ```bash
   npx @celo/buy@latest setup --network mainnet
   ```
   *(This securely generates a Celo key and stores it in the local OS Keychain / Windows Credential Manager. Note the public address displayed.)*

2. **Verify Account & Balances:**
   ```bash
   npx @celo/buy@latest whoami
   ```

3. **Fund Account:**
   Send a small amount (~0.10 to 0.50 USDC or USDT, plus a fraction of a cent of CELO for gas if required) on **Celo Mainnet** to the address displayed by `whoami`.

4. **Grant Explicit In-Chat Spend Authorization:**
   Reply in the chat confirming:
   > *"I approve the Gate 0 test call for request hash 35406284f1673b329e88e9b2d7e162c4e515123aec7237ef8aea1acba23b7882 up to 0.01 USDC."*
