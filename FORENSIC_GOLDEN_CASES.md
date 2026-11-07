# RevertLens — Forensic Golden Cases Evaluation Set
**Document Version:** 1.0.0 (Phase 7 Release Candidate)  
**Standard Evaluator:** Lead Forensic Systems Engineer  
**Scope:** Celo Mainnet (`eip155:42220`) EVM Tracing & Causality Classification

---

## 1. Evaluation Methodology

Every transaction diagnosis in RevertLens is evaluated against deterministic on-chain evidence:
- **Receipt Status:** Authoritative execution result (`SUCCESS` or `REVERTED`).
- **Call Trace Tree:** Hierarchical execution frames from OP Geth `debug_traceTransaction` with `callTracer`.
- **Causality Taxonomy:** Five-tier failure propagation model:
  1. `NO_FAILURE`: No revert or panic occurred in this frame.
  2. `OBSERVED_FAILURE`: Revert occurred at the root frame without internal sub-calls.
  3. `CAUGHT_CHILD_REVERT`: An internal sub-call failed, but parent handled it (via `try/catch` or assembly) and made subsequent calls or returned cleanly.
  4. `PROPAGATION_SUPPORTED`: Continuous, unbroken chain of reverts from failing leaf to top-level transaction.
  5. `CAUSALITY_UNCERTAIN`: Multiple branches failed, or parent and child emitted conflicting explicit errors.

---

## 2. Golden Cases Evaluation Matrix

| Case ID | Type | Source | Tx Hash / Identifier | Expected Diagnosis | Actual Diagnosis | Correct? | Notes |
|:---|:---|:---:|:---|:---|:---|:---:|:---|
| **GC-01** | Real Failed Swap | `LIVE_MAINNET` | `0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445` | `PROPAGATED_CHILD_REVERT` (`PROPAGATION_SUPPORTED`) | `PROPAGATED_CHILD_REVERT` (`PROPAGATION_SUPPORTED`) | **YES** | Block 52460432. Frame 0.1 (`0xe3d8...`) emitted `"Swap reverted"`. Continuous propagation to root. |
| **GC-02** | Root-Level Revert | `MOCKED` | `0x00...02` | `EXPLICIT_REVERT` (`OBSERVED_FAILURE`) | `EXPLICIT_REVERT` (`OBSERVED_FAILURE`) | **YES** | Single frame CALL reverting with `Error(string)`. |
| **GC-03** | Propagated 3-tier | `MOCKED` | `0x00...03` | `PROPAGATED_CHILD_REVERT` (`PROPAGATION_SUPPORTED`) | `PROPAGATED_CHILD_REVERT` (`PROPAGATION_SUPPORTED`) | **YES** | Root CALL -> DELEGATECALL -> Grandchild CALL. Deepest failing frame correctly marked. |
| **GC-04** | Caught Sub-call | `MOCKED` | `0x00...04` | `CAUGHT_CHILD_REVERT` (`CAUGHT_CHILD_REVERT`) | `CAUGHT_CHILD_REVERT` (`CAUGHT_CHILD_REVERT`) | **YES** | Parent caught child error, executed sibling sub-call, and handled gracefully. |
| **GC-05** | Multiple Branch Failure | `MOCKED` | `0x00...05` | `CAUSALITY_UNCERTAIN` (`CAUSALITY_UNCERTAIN`) | `CAUSALITY_UNCERTAIN` (`CAUSALITY_UNCERTAIN`) | **YES** | Sibling branches both reverted; isolated ambiguous root failure. |
| **GC-06** | Out of Gas | `MOCKED` | `0x00...06` | `OUT_OF_GAS` (`PROPAGATION_SUPPORTED`) | `OUT_OF_GAS` (`PROPAGATION_SUPPORTED`) | **YES** | Frame consumed all allocated sub-call gas. |
| **GC-07** | Missing Revert Data | `MOCKED` | `0x00...07` | `UNKNOWN_REVERT` (`OBSERVED_FAILURE`) | `UNKNOWN_REVERT` (`OBSERVED_FAILURE`) | **YES** | Empty `0x` output with generic execution reverted. |
| **GC-08** | Unsupported Trace | `MOCKED` | `0x00...08` | `UNSUPPORTED_OR_MISSING_TRACE` (`UNSUPPORTED`) | `UNSUPPORTED_OR_MISSING_TRACE` (`UNSUPPORTED`) | **YES** | Node lacks `callTracer` (-32601). Clear limitation notes added. |
| **GC-09** | Deep / Large Trace | `MOCKED` | `0x00...09` | `PROPAGATED_CHILD_REVERT` (`PROPAGATION_SUPPORTED`) | `PROPAGATED_CHILD_REVERT` (`PROPAGATION_SUPPORTED`) | **YES** | Trace depth > 100 frames; safely capped without process memory exhaustion. |
| **GC-10** | Pending Transaction | `MOCKED` | `0x00...10` | `PENDING_TRANSACTION` (`NO_FAILURE`) | `PENDING_TRANSACTION` (`NO_FAILURE`) | **YES** | Unmined transaction; trace not requested; never falsely labelled reverted. |
| **GC-11** | Provider Timeout | `MOCKED` | `0x00...11` | `UNSUPPORTED_OR_MISSING_TRACE` (`TIMEOUT`) | `UNSUPPORTED_OR_MISSING_TRACE` (`TIMEOUT`) | **YES** | HTTP 504 gateway timeout; analysis falls back to receipt facts. |

---

## 3. Reviewer Certification
- **Total Cases:** 11
- **Passing Cases:** 11 (100% agreement between expected and actual classifications)
- **False Root-Cause Conclusions:** 0
- **Certification Date:** November 7, 2026
