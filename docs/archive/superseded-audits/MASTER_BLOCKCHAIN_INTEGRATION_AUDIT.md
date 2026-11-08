# RevertLens — Master Blockchain & Chainstack Integration Audit
**Document Version:** 1.0.0  
**Target Network:** Celo Mainnet (`eip155:42220`)  
**Node Infrastructure:** Dedicated Chainstack Elastic Global Node (`ND-801-666-498`, OP Geth)  
**Execution Class:** `LIVE_MAINNET_READ_ONLY`  
**Evaluation Standard:** Architecture Decision AD-008 & `docs/03_BUY_GATE0_RUNBOOK.md`  

---

## 1. Node Infrastructure & Chain Context

Under Architecture Decision **AD-008**, RevertLens directly queries a dedicated Chainstack Celo Mainnet Growth node for all high-throughput, archive-grade EVM operations. This provides native `debug_` namespace execution with 250 requests per second and zero marginal cost per request.

### Live Node Verification Results

| RPC Method | Parameters | Live Node Response | Verification Status |
|:---|:---|:---|:---:|
| `eth_chainId` | `[]` | `0xa4ec` (Decimal: `42220`) | **PASS (Celo Mainnet)** |
| `eth_blockNumber` | `[]` | `0x4e55a09` (Decimal: `82,139,657`) | **PASS (Synchronized Tip)** |
| `net_version` | `[]` | `"42220"` | **PASS** |

---

## 2. Live Candidate Transaction Analysis

The benchmark failed transaction was re-verified against Celo Mainnet during this master audit:
- **Transaction Hash:** `0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445`
- **Block Height:** `52,460,432` (`0x3207b90`)
- **Sender Address (`from`):** `0x6bfc49bad93465d272e9ef2afb4960245b62b5ea`
- **Recipient Address (`to`):** `0xd0bebd199e4a115c4ddd04351e57913b2fe9b6a0`
- **Value:** `0.0 CELO` (`0x0`)
- **Gas Limit:** `5,000,000` (`0x4c4b40`)
- **Gas Consumed (`gasUsed`):** `54,232` (`0xd3d8`)
- **Receipt Status:** `0x0` (Execution Reverted)
- **Logs Count:** `0` (No state events emitted prior to revert)

### Live EVM Trace Tree (`debug_traceTransaction` via `callTracer`)

The node successfully executed `callTracer`, returning the complete internal execution frames:

```text
[CALL] 0x6bfc49ba... -> 0xd0bebd19... (Gas: 0x4c4b40, GasUsed: 0xd3d8)
 │   Error: "execution reverted"
 │
 ├── [CALL] 0xd0bebd19... -> 0xe3d8bd6aed4f159bc8000a9cd47cffdb95f96121 (Gas: 0x4b7899, GasUsed: 0x61a8)
 │    │   Input: 0x7ff36ab5... (Swap routing)
 │    │   Output: 0x08c379a0... ("Swap reverted")
 │    │   Error: "execution reverted"
 │    └── Status: PROPAGATION_SUPPORTED (Deepest Failing Leaf Frame)
 │
 └── (Execution halts and unwinds to root transaction)
```

Forensic findings derived from live trace:
1. The root contract called child contract `0xe3d8bd6aed4f159bc8000a9cd47cffdb95f96121` at call depth 1.
2. The child call reverted with error payload `0x08c379a0...` decoding to string `"Swap reverted"`.
3. The parent contract did not catch or suppress the failure; the revert propagated unbroken to the root transaction.
4. Total gas consumed was 54,232 units, eliminating Out-Of-Gas as a causal factor.

---

## 3. Negative & Adverse Condition Testing

The integration was subjected to adversarial and edge-case testing in `tests/chainstackProvider.test.ts` and `tests/regressionEdgeCases.test.ts`:

| Adverse Scenario | Injected Condition | System Response | Result |
|:---|:---|:---|:---:|
| **Invalid Hash Format** | String not matching `0x[0-9a-fA-F]{64}` | Client & API immediately reject with HTTP 400 `INVALID_INPUT` without dispatching RPC query. | **PASS** |
| **Non-Existent Tx** | Mined hash does not exist on chain | `getTransaction` returns `null`; report status marked `NOT_FOUND`. | **PASS** |
| **Pending Tx** | Transaction in mempool (`blockNumber: null`) | Receipt & trace skipped; report status marked `PENDING` with mempool advisory. | **PASS** |
| **Provider Timeout** | RPC query exceeds 15,000ms | AbortController triggers; maps to HTTP 504 `TIMEOUT`; receipt facts preserved. | **PASS** |
| **Rate Limiting** | Node returns HTTP 429 | System identifies rate limit; halts retries to prevent ban; sets `RATE_LIMITED`. | **PASS** |
| **Unsupported Trace** | Node lacks `callTracer` (Error -32601) | System halts retries; falls back gracefully to receipt-only explainer (`UNSUPPORTED`). | **PASS** |
| **Empty Trace** | Node returns empty `{}` trace object | Normalizer flags invalid trace structure; sets `INVALID_RESPONSE` without crashing. | **PASS** |
| **Adversarial Recursion** | Trace depth > 100 frames | Parser truncates at depth 100 with limitation note; prevents memory exhaustion. | **PASS** |

---

## 4. Secret & Credential Protection

- **Endpoint Security:** The Chainstack RPC endpoint containing embedded basic auth credentials is read exclusively from `process.env.CHAINSTACK_CELO_MAINNET_RPC_URL`.
- **Zero Leakage:** All error handlers, exception wrappers, and terminal logs sanitize string output with regular expression replacements.
- **Verification:** Inspection of Git history, staging index, and test logs confirms 0 instances of exposed credentials.
