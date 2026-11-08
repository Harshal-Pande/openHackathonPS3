# RevertLens — On-Chain Evidence and Payment Proof

This document records real, verified blockchain transactions, live RPC trace results, and Buy service settlement proofs.  
**Strict Rule:** Only real, verified transactions and live RPC results are recorded here. No placeholders or synthetic hashes are ever presented as live proof.

---

## 1. Verified Target Transactions on Celo Mainnet

The following transactions have been independently verified on Celo Mainnet (`eip155:42220`) for testing and demonstration purposes:

| Transaction Hash | Block | Status | From | To | Revert Data / Reason | Verification & Explorer Links |
|---|---|---|---|---|---|---|
| `0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445` | 52460432 | Execution Reverted | `0x6bFc49bAd93465d272E9EF2aFb4960245B62b5Ea` | `0xd0Bebd199e4a115C4Ddd04351e57913B2fE9b6a0` | `Error(string)`: `"Swap reverted"` | [Celoscan Tx](https://celoscan.io/tx/0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445) / [Blockscout Tx](https://explorer.celo.org/mainnet/tx/0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445) |

---

## 2. Live Chainstack Execution & Trace Verification (Phase 5.5)

- **Date/Time UTC:** 2026-11-07 07:03:00 UTC
- **Provider:** Chainstack Celo Mainnet Growth Node (Elastic Global Node `ND-801-666-498`)
- **Network Verified:** `eth_chainId` -> `0xa4ec` (Chain ID 42220, Celo Mainnet)
- **Node Latest Block:** `0x4e544d1` (Block 82,134,225)
- **Target Transaction:** `0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445`
- **Execution Receipt:**
  - Status: `REVERTED` (`rawStatus: 0`)
  - Gas Used: `0xd3d8` (54,232 units)
  - Block: `52460432`
- **`debug_traceTransaction` with `callTracer` Result:**
  - **Trace Status:** `AVAILABLE`
  - **Total Frames:** `4`
  - **Max Depth:** `2`
  - **Frame 0 (Depth 0):** `CALL` to `0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0` — `error: "execution reverted"`, `revertReason: "Swap reverted"`
  - **Frame 0.0 (Depth 1):** `STATICCALL` to `0x765de816845861e75a25fca122bb6898b8b1282a` (`balanceOf`) — `status: SUCCESS`
  - **Frame 0.0.0 (Depth 2):** `DELEGATECALL` to `0x434563b0604be100f04b7ae485bcafe3c9d8850e` — `status: SUCCESS`
  - **Frame 0.1 (Depth 1):** `CALL` to `0xe3d8bd6aed4f159bc8000a9cd47cffdb95f96121` (`swapExactETHForTokens`) — `error: "execution reverted"` (Root failing cause!)
- **Investigation Report ID:** `88f7e14d-eb85-48c1-93ae-73d139ab60a9` (and Phase 5.6 re-verification `9807fda7-565c-4529-ae1b-7fb58883dc15`)
- **Diagnosis Category:** `PROPAGATED_CHILD_REVERT` (Confidence: `HIGH`)
- **Causality Classification:** `PROPAGATION_SUPPORTED`
- **Headline:** `"Nested Call Failure at Depth 1: execution reverted"`
- **Narrative:** `"The transaction failed because a nested sub-call to contract 0xe3d8bd6aed4f159bc8000a9cd47cffdb95f96121 reverted with error "execution reverted". The trace confirms this error was not handled by parent contracts and propagated to cause the root transaction failure."`
- **Frame-by-Frame Causality Status:**
  - Frame 0 (depth 0, CALL to `0xd0be...`): `OBSERVED_FAILURE`
  - Frame 0.0 (depth 1, STATICCALL to `0x765d...`): `NO_FAILURE`
  - Frame 0.0.0 (depth 2, DELEGATECALL to `0x4345...`): `NO_FAILURE`
  - Frame 0.1 (depth 1, CALL to `0xe3d8...`): `PROPAGATION_SUPPORTED`
- **Evidence Ledger:**
  - `[E-01]` `TRANSACTION_FACT`: Sender `0x6bfc...` to router `0xd0be...`, gas limit `5,000,000` (SHA-256: `ec86ad05ca717b45...`)
  - `[E-02]` `RECEIPT_FACT`: Mined at block 52460432, status REVERTED, gas used 54,232 (SHA-256: `accf64947ca82b1f...`)
  - `[E-03]` `REVERT_DATA`: Decoded `Error(string)` selector `0x08c379a0`, message `"Swap reverted"` (SHA-256: `5cd2940a128b04a5...`)
  - `[E-04]` `TRACE_FRAME`: 4 call frames, max depth 2 (SHA-256: `45c516da40649545...`)
  - `[E-05]` `FAILURE_PROPAGATION`: Deepest failing frame at depth 1 to `0xe3d8bd6aed4f159bc8000a9cd47cffdb95f96121` (SHA-256: `e96683a867ee2a32...`)
- **Database Persistence:** Confirmed durable in `data/revertlens.sqlite` across server restarts; round-trip reload restores `rawTree`, `decodedRevert`, `evidenceLedger`, and all `flattenedFrames`.

---

## 3. Buy Service Payment Proofs

| Capability | Provider | Token | Quoted Amount | Quoted Payee | Body SHA-256 Bound | Settlement Tx Hash | Phase Status | Spend Incurred |
|---|---|---|---|---|---|---|---|---|
| `chainstack.celo` | Chainstack | USDC | 10000 | `0x20fa...333B` | `35406284f1...` | N/A (Direct Node used) | Quoted / Free Node Active | $0.00 |
| `cencori.v1.chat.completions` | Cencori | USDC / USA₮ | 10000 | `0x20fa...333B` | Verified per-request | `NOT_EXECUTED` | Stopped at Approval Stage | $0.00 |

*Strict Zero-Spend Invariant:* Phase 6 completed full quote generation and cryptographic approval verification without executing paid CLI transactions. Zero personal funds have been spent ($0.00 spent). On-chain settlement will be recorded only if authorized by the operator with verified wallet funding.

---

## 4. User Cohort Breakdown

Per hackathon rules in `docs/09_HACKATHON_COMPLIANCE.md`, users and investigations are strictly partitioned across cohorts:

- **Internal Test Investigations:** 1 (`0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445`, verified live on Chainstack Celo Mainnet node).
- **Project-Subsidized External Investigations:** 0.
- **Independent Verified Qualifying Users:** 0 (Recruitment and verification in Phase 9).
- **Unverified Users:** 0.

*Note: These cohorts will never be combined or misrepresented as organic volume.*

---

## 5. Verified Celo Protocol Addresses & Verification Links

| Entity | Address | Network | Explorer Link |
|---|---|---|---|
| **Canonical ERC-8004 Identity Registry** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | Celo Mainnet (`42220`) | [Celoscan Contract](https://celoscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) |
| **ERC-1967 Proxy Implementation** | `0x7274e874ca62410a93bd8bf61c69d8045e399c02` | Celo Mainnet (`42220`) | [Celoscan Implementation](https://celoscan.io/address/0x7274e874ca62410a93bd8bf61c69d8045e399c02) |
| **Official Agent Wallet** | `0x3e1bef07824cd0E076F4907641F0A0EF27898e52` | Celo Mainnet (`42220`) | [Celoscan Address](https://celoscan.io/address/0x3e1bef07824cd0E076F4907641F0A0EF27898e52) |
| **Official Attribution Tag** | `celo_235f6ef56f5b` | ERC-8021 Schema 0 | Verified in automated tests |
