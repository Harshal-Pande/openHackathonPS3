# RevertLens — Master Forensic Engine Audit
**Document Version:** 1.0.0  
**Core Domain:** EVM Tracing, ABI Revert Decoding & Failure Propagation  
**Evaluation Standard:** Architecture Decision AD-009 & `FORENSIC_GOLDEN_CASES.md`  

---

## 1. Forensic Pipeline Overview

The RevertLens forensic engine transforms raw EVM execution traces into structured, verifiable forensic evidence. It is strictly deterministic, executing without probabilistic heuristics or unverified assumptions.

```text
Raw JSON-RPC Trace Tree (callTracer)
  │
  ├──> Trace Parser & Flattening (100-depth / 1000-frame caps)
  │      └── Frame Relationships (isLastCall, hasSubsequentCalls, ancestorsReverted)
  │
  ├──> Revert Payload Decoder (Error / Panic / Custom Selectors)
  │      └── ABI parameter extraction & error classification
  │
  ├──> Causality Classifier (5 Tiers)
  │      └── Distinction between Caught vs. Propagated Reverts
  │
  ├──> Atomic Evidence Ledger Builder
  │      └── Deterministic SHA-256 Content Hashes (E-01 .. E-05)
  │
  └──> Deterministic Explanation Engine
         └── Natural language narrative with evidence citations & limitations
```

---

## 2. Revert Payload Decoding Verification

The revert decoder (`src/server/forensics/revertDecoder.ts`) handles standard and non-standard EVM failure signals:

1. **Solidity `Error(string)` (`0x08c379a0`):**
   - Parses the 32-byte string offset, length, and UTF-8 string payload.
   - Tested on `"Swap reverted"`, `"TransferHelper: TRANSFER_FAILED"`, and multiline messages.
2. **Solidity `Panic(uint256)` (`0x4e487b71`):**
   - Decodes integer panic codes into canonical explanations:
     - `0x01`: Assert evaluated to false.
     - `0x11`: Arithmetic operation underflow or overflow.
     - `0x12`: Division or modulo by zero.
     - `0x21`: Converted value out of enum bounds.
     - `0x22`: Storage byte array incorrectly encoded.
     - `0x31`: `.pop()` called on empty array.
     - `0x32`: Array access out of bounds.
     - `0x41`: Too much memory allocated or array too large.
     - `0x51`: Zero-initialized variable of internal function type called.
3. **Custom Contract Errors:**
   - Extracts the 4-byte selector (`0x........`) for unindexed custom Solidity errors (e.g., `InsufficientBalance()`, `Unauthorized()`).
4. **Resilience & Edge Cases:**
   - Handles empty `0x` outputs, odd-length hex strings, truncated ABI buffers, and non-hex ascii strings without throwing unhandled exceptions.

---

## 3. EVM Causality & Failure Propagation Invariants

Under Architecture Decision **AD-009**, RevertLens eliminates the common EVM forensic defect of false root-cause attribution:

### The False Attribution Trap
In modern smart contract architectures (e.g., DEX aggregators, account abstraction, meta-transactions), contracts frequently use low-level `.call()` or `try/catch` to probe liquidity pools or execute optional logic. When an internal sub-call reverts, but the calling contract handles the error and proceeds with alternative execution, that reverted sub-call is **NOT** the cause of the top-level failure.

### RevertLens 5-Tier Causality Model
Every execution frame is classified into one of five mutually exclusive states:
1. **`NO_FAILURE`:** The frame returned cleanly without error.
2. **`OBSERVED_FAILURE`:** The root call reverted directly without any child sub-calls.
3. **`CAUGHT_CHILD_REVERT`:** A child sub-call reverted, but the parent contract caught the error and executed subsequent operations or returned cleanly.
4. **`PROPAGATION_SUPPORTED`:** A child sub-call reverted, and the error propagated continuously up the call stack to cause the top-level failure.
5. **`CAUSALITY_UNCERTAIN`:** Multiple sibling branches reverted, or conflicting error messages were emitted by parent and child contracts.

---

## 4. Evidence Ledger & Cryptographic Provenance

Every factual claim in RevertLens is bound to an atomic evidence item:

| Evidence ID | Kind | Source Method | Description | Content Hash (SHA-256) |
|:---:|:---|:---|:---|:---:|
| **E-01** | `TRANSACTION_FACT` | `eth_getTransactionByHash` | Sender, recipient, gas limit, nonce, input | Deterministic hash |
| **E-02** | `RECEIPT_FACT` | `eth_getTransactionReceipt` | Block number, status code, gas consumed | Deterministic hash |
| **E-03** | `REVERT_DATA` | `debug_traceTransaction` | Decoded revert reason, panic code, selector | Deterministic hash |
| **E-04** | `TRACE_FRAME` | `debug_traceTransaction` | Deepest failing frame, contract address, depth | Deterministic hash |
| **E-05** | `FAILURE_PROPAGATION` | `debug_traceTransaction` | Continuous revert chain from leaf to root | Deterministic hash |

---

## 5. Golden Cases Benchmark Evaluation

All 11 golden cases evaluated in `FORENSIC_GOLDEN_CASES.md` pass with 100% agreement:

| Case ID | Scenario | Trace Classification | Expected Category | Pass? |
|:---|:---|:---|:---|:---:|
| **GC-01** | Live Failed Swap | `PROPAGATION_SUPPORTED` | `PROPAGATED_CHILD_REVERT` | **PASS** |
| **GC-02** | Simple Root Revert | `OBSERVED_FAILURE` | `EXPLICIT_REVERT` | **PASS** |
| **GC-03** | 3-Tier Nested Propagation | `PROPAGATION_SUPPORTED` | `PROPAGATED_CHILD_REVERT` | **PASS** |
| **GC-04** | Caught Sub-call (try/catch) | `CAUGHT_CHILD_REVERT` | `CAUGHT_CHILD_REVERT` | **PASS** |
| **GC-05** | Ambiguous Multi-Branch Revert | `CAUSALITY_UNCERTAIN` | `CAUSALITY_UNCERTAIN` | **PASS** |
| **GC-06** | Out of Gas Sub-call | `PROPAGATION_SUPPORTED` | `OUT_OF_GAS` | **PASS** |
| **GC-07** | Empty Revert Hex Data | `OBSERVED_FAILURE` | `UNKNOWN_REVERT` | **PASS** |
| **GC-08** | Unsupported Trace (-32601) | `UNSUPPORTED` | `UNSUPPORTED_OR_MISSING_TRACE` | **PASS** |
| **GC-09** | Deep Recursion (> 100 frames) | `PROPAGATION_SUPPORTED` | `PROPAGATED_CHILD_REVERT` | **PASS** |
| **GC-10** | Unmined Pending Transaction | `NO_FAILURE` | `PENDING_TRANSACTION` | **PASS** |
| **GC-11** | Gateway Timeout (504) | `TIMEOUT` | `UNSUPPORTED_OR_MISSING_TRACE` | **PASS** |
