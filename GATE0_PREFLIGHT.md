# GATE 0 — Preflight Readiness & Wallet Verification Report

> **HISTORICAL NOTICE (Architecture Decision AD-008):**
> This preflight check was captured prior to the adoption of direct Chainstack Growth node integration (`AD-008`). It is preserved as historical evidence of initial discovery and quote capture. Live RPC execution now uses the direct Growth node, and Buy payment architecture is preserved for Cencori LLM inference.

**Preflight Execution Timestamp:** 2026-11-07 06:26:00 UTC
**Evaluation Phase:** Phase 3 — Gate 0 Live Trace Verification Preflight (HISTORICAL)
**Operator Action Status:** Superseded for RPC by Direct Node; Preserved for Cencori AI Inference

---

## 1. Buy Account & Wallet Status

| Dimension | Verification Method | Observed Result | Status |
|---|---|---|---|
| **CLI Availability** | `npx @celo/buy@latest --version` | `@celo/buy` v0.8.5 executable | **READY** |
| **Account Provisioning** | `npx @celo/buy@latest whoami --json` | `{"error":{"code":"no_account","message":"No account configured. Run buy setup first."}}` | **UNPROVISIONED** |
| **Public Wallet Address** | `buy whoami` | None (no account configured) | **PENDING SETUP** |
| **Active Network Config** | CLI default / `--network mainnet` | Celo Mainnet (`eip155:42220`) | **CONFIGURED** |
| **USDC Balance** | `buy whoami` | 0 / unprovisioned | **UNFUNDED** |
| **USDT Balance** | `buy whoami` | 0 / unprovisioned | **UNFUNDED** |
| **Gas / CELO Balance** | `buy whoami` | 0 / unprovisioned | **UNFUNDED** |

---

## 2. Fresh Payment Requirements & Quote Details

Fresh live 402 challenge retrieved from `https://gateway.usebuy.ai/chainstack/celo` at `2026-11-07 06:25:53 GMT`:

- **Target Service:** Chainstack Celo Mainnet JSON-RPC (`chainstack.celo`)
- **Gateway Endpoint:** `https://gateway.usebuy.ai/chainstack/celo`
- **HTTP Method:** `POST`
- **Protocol:** `x402-v1` / `x402-v2` (`exact` scheme)
- **Target Network:** Celo Mainnet (`eip155:42220`)
- **Payee Address (`payTo`):** `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`
- **Atomic Required Amount:** `10000` (6 decimals)
- **Human-Readable Cost:** **$0.01 USD**
- **Gateway Timeout:** 60 seconds (`maxTimeoutSeconds: 60`)
- **Accepted Token Options on Celo Mainnet:**
  1. **USDC:** Contract `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`
  2. **USDT:** Contract `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`
  3. **USAT:** Contract `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771`
- **Additional Fees / Gas:** The facilitator settles the stablecoin transfer; however, having a small amount of native CELO (~$0.01) in the wallet ensures no fallback gas fee rejections occur.

---

## 3. Request Body Integrity & Hash Verification

- **Target Transaction Hash:** `0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445` (verified failed on Celo Mainnet at block 52460432)
- **RPC Method:** `debug_traceTransaction`
- **Tracer Option:** `{"tracer": "callTracer"}`
- **Exact Serialized Body:**
  ```json
  {"jsonrpc":"2.0","id":1,"method":"debug_traceTransaction","params":["0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445",{"tracer":"callTracer"}]}
  ```
- **Recalculated SHA-256 Digest:**
  `35406284f1673b329e88e9b2d7e162c4e515123aec7237ef8aea1acba23b7882`
- **Integrity Check:** Hash matches historical quote registration with zero deviation.

---

## 4. Funding Requirements for Operator

To execute this single test call, the operator must fund the wallet with:
- **Primary Token:** At least **0.05 to 0.50 USDC** (or USDT) on **Celo Mainnet** (the call costs exactly 0.01 USDC).
- **Native Gas Buffer (Optional best practice):** A fraction of a cent of **CELO** (~0.01 CELO).
- **Deposit Network:** Strictly **Celo Mainnet** (Chain ID `42220`). Do NOT deposit on Ethereum, Polygon, or Arbitrum.

---

## 5. Remaining Risks & Mitigations

1. **RPC Method Capability Unknown:** It remains unproven whether the Chainstack endpoint has `debug_traceTransaction` enabled. If it returns `-32601 Method not found`, RevertLens immediately transitions to the **Receipt-Only Explainer Fallback**.
2. **Ambiguous Settlement:** If the payment command times out, automatic retry is forbidden. On-chain settlement will be independently queried via `buy receipts --resolve`.
3. **Key Custody:** The agent never handles private keys. Keys remain safely inside the host OS keychain.

---

## 6. Readiness for Explicit Human Approval

- **Readiness Verdict:** **STAGED — AWAITING OPERATOR WALLET SETUP & FUNDING**.
- The approval packet [`GATE0_APPROVAL_REQUEST.md`](file:///D:/Blockchain/BuildWithBuy/GATE0_APPROVAL_REQUEST.md) is fully prepared and bound to SHA-256 digest `35406284f1673b329e88e9b2d7e162c4e515123aec7237ef8aea1acba23b7882`.
- As soon as the operator provisions the wallet via `npx @celo/buy@latest setup --network mainnet` and deposits ~$0.10 USDC, the operator can provide explicit in-chat approval for immediate execution.
