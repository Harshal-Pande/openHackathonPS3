# RevertLens Release Notes — v0.1.0-rc1 (Release Candidate 1)
**Release Date:** November 7, 2026  
**Target Network:** Celo Mainnet (`eip155:42220`)  
**Track:** Agents on Open Rails | Track PS3 — Build with Buy

---

## What is RevertLens?

RevertLens is an evidence-backed transaction failure forensics engine for Celo Mainnet. Standard block explorers frequently display unhelpful `"execution reverted"` messages when transactions fail. RevertLens reconstructs the internal EVM execution tree via archive RPC call tracing, decodes Solidity custom errors and Panic codes, isolates handled sub-calls from true root-cause failures, and provides a clear, verifiable failure diagnosis.

---

## Key Features & Capabilities

### 1. Direct High-Throughput Celo Archive Tracing (AD-008)
- Integrates directly with an Elastic Global Chainstack Celo Mainnet Node running OP Geth (250 RPS).
- Supports `eth_getTransactionByHash`, `eth_getTransactionReceipt`, and `debug_traceTransaction` with `callTracer`.
- Strict chain ID enforcement (rejects non-42220 endpoints).
- Automatic URL and credential redaction across error messages and logs.

### 2. 5-Tier EVM Causality Classification
- Replaces naive "blame deepest error" heuristics with a mathematically sound failure propagation model:
  - `NO_FAILURE`: All frames succeeded.
  - `OBSERVED_FAILURE`: Revert occurred at root frame.
  - `CAUGHT_CHILD_REVERT`: Child call failed, but parent caught it and continued execution.
  - `PROPAGATION_SUPPORTED`: Continuous unbroken chain of error frames connecting leaf failure to top-level transaction.
  - `CAUSALITY_UNCERTAIN`: Multiple branches failed or ambiguous error messages.
- Preserves both `rootRevertReason` and `nestedFailureReason` distinctly.

### 3. Solidity Revert & Panic Decoder
- Decodes standard `Error(string)` (`0x08c379a0`).
- Decodes `Panic(uint256)` (`0x4e487b71`) with human-readable explanations (e.g. arithmetic overflow, array out of bounds, division by zero).
- Custom 4-byte error selector extraction and hex data preservation.

### 4. Cryptographic Evidence Ledger
- Generates structured, immutable evidence items (`[E-01]` through `[E-05]`).
- Binds each fact with a SHA-256 content-integrity hash.
- Authoritative deterministic narrative strictly cites evidence items.

### 5. Cencori AI Explanation with Anti-Hallucination Guardrails
- Integrates Cencori's `maximo-atlas-1.3` model via the Celo Buy marketplace (`cencori.v1.chat.completions`).
- Bounded prompt payload feeds only verified on-chain evidence items.
- 10-rule Zod validator strictly rejects invented addresses, uncited claims, or phantom liquidity pools.
- 100% deterministic fallback operates seamlessly when AI is disabled.

### 6. Transparent Buy Payment Architecture
- 11-state payment lifecycle in SQLite (`QUOTE_REQUESTED` to `SETTLED`/`CANCELLED`).
- Cryptographic binding to exact request body SHA-256 digest.
- Strict budget ceilings ($0.50/call, $5.00/day, $25.00 global project cap).
- Operator authentication gate and emergency kill switch.
- Preserved under zero-personal-spend compliance ($0.00 spent).

### 7. Modern Dark Forensics Dashboard
- Fastify server serving both the REST API and the Vite React 19 SPA.
- Three-tier visual architecture cards: `DETERMINISTIC ANALYSIS`, `AI EXPLANATION`, and `BUY PAYMENT STATUS`.
- Interactive call trace tree visualizer with error highlighting.
- One-click copy buttons for hashes and addresses with checkmark feedback.
- One-click JSON report export downloading complete evidentiary data.

---

## Verification & Quality Metrics

- **Automated Tests:** **93 passed across 13 test suites (100% pass rate)**.
- **Browser E2E Testing:** Verified in headless Google Chrome across desktop (1280x800) and mobile (375x812) viewports.
- **Production Runtime Testing:** Verified on port 3009 with static assets, persistent SQLite storage, and server restart durability.
- **TypeScript Typecheck:** 0 errors across server and client configs.
- **Security Audit:** 0 Critical, 0 High, 0 Medium, 0 Low vulnerabilities.
