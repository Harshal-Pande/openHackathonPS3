# REVERTLENS — MOD-03.2 SECURITY REMEDIATION AUDIT
## Critical Payment Path Security Remediation Baseline & Audit

**Date:** 2026-11-08  
**Workspace:** `D:\Blockchain\BuildWithBuy`  
**Git Baseline Commit:** `bb9670438cf480838153b8fe70979fa4bb6bfa9e`  
**Remote:** `https://github.com/Harshal-Pande/openHackathonPS3.git` (`origin/main`)  
**Network:** Celo Mainnet (`eip155:42220`)  
**Agent Wallet:** `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`  
**Audit Scope:** In-depth source audit of MOD-03 payment execution, quote binding, settlement verification, amount normalization, concurrency safety, and CLI execution.

---

## 1. Baseline Verification

- Git status: Clean working tree at `bb96704` synchronized with `origin/main`.
- Pinned dependency verification: Installed `@celo/buy@0.8.5` in devDependencies; entrypoint located at `node_modules/@celo/buy/dist/main.js`. Direct execution via `process.execPath` verified with exit code 0.
- Mandatory safety invariant: ZERO paid requests executed, ZERO tokens transferred, wallet unfunded (`0 CELO, 0 USDC`).

---

## 2. Identified Defect Analysis & Root Causes

### Defect MOD03-SEC-01: Settlement Verification Is Incomplete
- **Root Cause 1:** `verifyOnChainSettlement()` checked only `receipt.status === '0x1' || receipt.status === 1`. It did not parse the on-chain ERC-20 `Transfer(address,address,uint256)` event logs to prove that:
  - The emitting contract address matches `quote.token_contract`.
  - The `to` address matches `quote.recipient`.
  - The `value` (uint256) matches `quote.amount_atomic`.
- **Root Cause 2:** In `resolveSettlement()`, candidate receipts from `buy receipts --json --resolve` were matched using `r.recipient?.toLowerCase() === quote.recipient.toLowerCase()`. This was unsafe: an unrelated transaction from another user or script to the same recipient could be erroneously matched to this purchase attempt.
- **Required Fix:**
  1. Parse receipt logs for ERC-20 Transfer topic `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`.
  2. Verify exact log emitter address equals `quote.token_contract` (case-insensitive).
  3. Verify `topics[2]` (indexed recipient) decoded as address equals `quote.recipient`.
  4. Verify `data` decoded as uint256 equals `BigInt(quote.amount_atomic)`.
  5. Extract `topics[1]` as payer and verify.
  6. In `resolveSettlement()`, strictly forbid recipient-only matching. Only match by unique quote ID, purchase attempt ID, or exact known transaction hash previously persisted for that attempt. If no unique match is found, return unresolved.

### Defect MOD03-SEC-02: Capability, URL and Method Are Not Fully Bound
- **Root Cause:** `BuyQuoteService.createQuote()` validated only `capabilityId` against an allowlist. Client callers could pass arbitrary URLs or HTTP methods. Furthermore, legacy `chainstack.celo` was still listed in `DEFAULT_ALLOWED_CAPABILITIES` and `discoverCapabilities()`, conflicting with Architecture Decision AD-008 (direct RPC path).
- **Required Fix:**
  1. Establish an authoritative server-side Capability Registry (`CAPABILITY_REGISTRY`).
  2. For RevertLens, register `cencori.v1.chat.completions` as the ONLY active paid Buy capability.
  3. Remove `chainstack.celo` from active Buy capabilities (Chainstack stays on direct RPC under AD-008).
  4. Bind capability ID, provider, exact service URL, HTTP method, supported tokens, decimals, recipient, model, and body schema.
  5. At quote creation: Reject any URL, method, query param, token, or recipient not exactly matching the registry. Enforce strict request body validation.
  6. At execution: Revalidate stored quote against registry before execution.

### Defect MOD03-SEC-03: Display Amount and Atomic Amount Must Match
- **Root Cause:** `amount_atomic` and `amount_display` were stored separately without mathematical equivalence enforcement. Floating-point arithmetic could introduce precision errors.
- **Required Fix:**
  1. Validate `amount_atomic` as a strict positive base-10 integer string (`/^[1-9][0-9]*$/`).
  2. Normalize atomic amount to display amount using exact `bigint` arithmetic and token decimals (no floating point).
  3. Compare computed display amount against supplied display amount (stripping currency symbols/whitespace).
  4. Reject any discrepancy or unsupported precision.
  5. Pass canonical display amount to Buy CLI `--max-amount`.

### Defect MOD03-SEC-04: Quote Expiry Must Be Rechecked at Execution
- **Root Cause:** Expiry was checked during `approveQuote()`, but `executeApprovedRequest()` did not verify whether the quote had expired between operator approval and purchase execution.
- **Required Fix:**
  1. Reload quote from SQLite inside `executeApprovedRequest()`.
  2. Check `quote.expiry`. If `new Date(quote.expiry).getTime() < Date.now()`, transition quote to `EXPIRED` and abort execution.

### Defect MOD03-SEC-05: Atomic Approval Consumption
- **Root Cause:** Quote status check, budget reservation, purchase attempt creation, and quote transition were performed sequentially without an atomic SQLite transaction lock. Concurrent execution requests could race.
- **Required Fix:**
  1. Use atomic conditional updates (`UPDATE quote_records SET status = 'EXECUTION_PENDING' WHERE id = ? AND status = 'APPROVED'`).
  2. Wrap reservation, purchase attempt insertion, and state transition in a single immediate SQLite transaction (`db.transaction(...)`).
  3. If status transition fails or another execution request won the race, abort immediately with 409 Conflict.
  4. Similarly, ensure `approveQuote()` uses conditional atomic transition from `AWAITING_OPERATOR_APPROVAL` to `APPROVED`.

### Defect MOD03-SEC-06: Windows CLI Execution Must Be Real, Not Mock-Only
- **Root Cause:** Windows execution relied on `npx.cmd` and unpinned `@latest` package downloads.
- **Required Fix:**
  1. Pinned `@celo/buy@0.8.5` in project dependencies.
  2. Adapter directly executes local entrypoint `node_modules/@celo/buy/dist/main.js` using `process.execPath` (`node.exe` on Windows / `node` on POSIX) with `shell: false`.
  3. Add a real local integration test verifying harmless CLI execution (`-V` and `whoami`) without mocks.

### Defect MOD03-SEC-07: Capability Discovery Must Not Be Static Claims
- **Root Cause:** `discoverCapabilities()` returned hardcoded data disguised as live discovery, including obsolete Chainstack Buy capabilities.
- **Required Fix:**
  1. Explicitly separate Live Catalogue Discovery from the Verified Capability Registry.
  2. Registry has version, timestamp, and expiry policy.
  3. Only active sanctioned capability (`cencori/inference`) is returned.

### Defect MOD03-SEC-08: Reservation and Failure Recovery
- **Root Cause:** Ensure all budget reservation and attempt records are durably committed inside transactions. Ensure daily/investigation caps properly calculate `RESERVED`, `COMMITTED`, `EXECUTION_PENDING`, and `SETTLEMENT_UNKNOWN`.
- **Required Fix:**
  1. Verify budget queries and atomic reservations.
  2. Retain reservations for `SETTLEMENT_UNKNOWN`.
  3. Release reservation only on verified no-settlement outcomes.
