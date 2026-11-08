# REVERTLENS — MOD-03.3 SETTLEMENT INTEGRITY & AMBIGUOUS PAYMENT FAILURE AUDIT
**Date:** 2026-11-08  
**Scope:** Payment Integrity, On-Chain Receipt Validation, RPC Fail-Closed Security, Ambiguous Dispatch Classification, and Atomic Settlement State Consistency  
**Network:** Celo Mainnet (`eip155:42220`), Chain ID `42220`  
**Workspace:** `D:\Blockchain\BuildWithBuy`  
**Baseline Git Commit:** `b1bfeabb3b2166635bb37e7a5c7f8976f966b96e` (`b1bfeab`)  
**Status:** IMPLEMENTATION & VERIFICATION

---

## 1. Executive Summary & Defect Taxonomy

An independent audit of the MOD-03.2 release snapshot identified 6 high-severity payment-integrity weaknesses in receipt verification, RPC interaction, error classification, and state persistence:

| Defect ID | Severity | File & Function | Root Cause | Impact | Corrective Architecture |
|:---|:---|:---|:---|:---|:---|
| **MOD03.3-01** | **P0 Critical** | `src/server/adapters/buyAdapter.ts`<br>`verifyOnChainSettlement()` | `eth_chainId` was checked only when `chainRes.ok === true`. Any RPC HTTP 500/429/503 or malformed JSON fell through to receipt retrieval. `verifyReceiptTransferLogs` accepted `expectedChainId` but never used it. | Fail-open RPC interaction: receipt checks could execute against wrong network, unverified RPC, or corrupted endpoints. | Make chain verification mandatory and strictly fail-closed. Validate HTTP status, JSON-RPC ID, lack of error object, and exact chain ID `0xa4ec` (42220). Abort receipt retrieval immediately on failure. |
| **MOD03.3-02** | **P0 Critical** | `src/server/adapters/buyAdapter.ts`<br>`verifyReceiptTransferLogs()` | Receipt `transactionHash` was checked for format but never compared against the requested transaction hash. | A receipt for a completely different transaction on Celo could be accepted as settlement proof for the requested purchase attempt. | Pass `expectedTxHash` into `verifyReceiptTransferLogs()`. Enforce strict case-insensitive equality between receipt `transactionHash` and requested `expectedTxHash`. |
| **MOD03.3-03** | **P0 Critical** | `src/server/adapters/buyAdapter.ts`<br>`verifyReceiptTransferLogs()` | Payer decoding allowed undefined fallback. Settlement persistence fell back to hardcoded agent wallet `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`. | Fabricated payer evidence: settlement proofs could record the agent wallet as payer even when event logs showed a different sender or no sender. | Require ERC-20 `Transfer` to have valid indexed sender in `topics[1]`. Validate sender against expected payer (`this.payingAddress`). Reject receipts with payer mismatch. Remove all fallback assignments. |
| **MOD03.3-04** | **P0 Critical** | `src/server/adapters/buyAdapter.ts`<br>`verifyReceiptTransferLogs()` | Parser stopped at first matching `Transfer` event. Ignored split transfers or multiple transfers in the same receipt. | Incorrect accounting: a transaction transferring 2x the quote amount would be accepted, or split transfers would be rejected. | Parse ALL logs in receipt. For logs matching quoted token and quoted recipient, sum transferred amounts using `BigInt`. Require aggregate sum to strictly equal quoted atomic amount. Reject `>=` or `>`. |
| **MOD03.3-05** | **P0 Critical** | `src/server/adapters/buyAdapter.ts`<br>`executeApprovedRequest()` | Non-zero CLI exits were classified as ambiguous only on timeout text heuristics. Other non-zero exits released reservation and marked `FAILED`. | Budget leak / premature release: post-dispatch failures (e.g. connection reset, HTTP 500, process kill after payment broadcast) released budget, risking double spend. | Explicit classification: only proven pre-dispatch failures release reservations. All post-dispatch errors transition to `SETTLEMENT_UNKNOWN` and preserve budget reservations. |
| **MOD03.3-06** | **P1 High** | `src/server/adapters/buyAdapter.ts`<br>`resolveSettlement()` | Used `.find()` to select the first matching candidate receipt. | Ambiguous settlement: if multiple receipts matched, the first was selected arbitrarily without uniqueness validation. | Collect all matching candidates. Require exactly one unique match. Reject zero or multiple distinct matches as unresolved. |

---

## 2. Detailed Technical Analysis & Fix Specifications

### Defect MOD03.3-01: RPC Chain Verification Fail-Closed Specification
Before executing `eth_getTransactionReceipt`:
1. Send `eth_chainId` with `id: 1`.
2. Assert `chainRes.ok === true`.
3. Assert JSON response parses without exception.
4. Assert `chainJson.id === 1`.
5. Assert `!chainJson.error`.
6. Assert `typeof chainJson.result === 'string'` and matches `/^0x[0-9a-fA-F]+$/`.
7. Assert `parseInt(chainJson.result, 16) === 42220`.
8. Any deviation returns `{ verified: false, reason: '...' }` immediately. Do NOT proceed to `eth_getTransactionReceipt`.

### Defect MOD03.3-02: Receipt Transaction Hash Matching Specification
`verifyReceiptTransferLogs(receipt, quote, expectedTxHash, expectedPayer)`:
1. Assert `expectedTxHash` matches `/^0x[0-9a-fA-F]{64}$/`.
2. Extract `receiptTxHash = receipt.transactionHash || receipt.txHash`.
3. Assert `receiptTxHash` matches `/^0x[0-9a-fA-F]{64}$/`.
4. Assert `receiptTxHash.toLowerCase() === expectedTxHash.toLowerCase()`.
5. If mismatched, return `{ verified: false, reason: ... }`.

### Defect MOD03.3-03: Real Payer Identity Verification Specification
1. Assert log is ERC-20 Transfer: `topics[0].toLowerCase() === ERC20_TRANSFER_EVENT_TOPIC`.
2. Assert `Array.isArray(log.topics) && log.topics.length >= 3`.
3. Decode sender from `log.topics[1]`: `sender = decodeAddressFromTopic(log.topics[1])`.
4. Assert `sender` matches `/^0x[0-9a-fA-F]{40}$/`.
5. If `expectedPayer` is specified:
   - Assert `sender.toLowerCase() === expectedPayer.toLowerCase()`.
   - Reject with `{ verified: false, reason: 'Payer mismatch...' }` if different.
6. Remove all fallback assignments in settlement persistence (`settlement.payer || '0x3e1...'` -> `settlement.payer`).

### Defect MOD03.3-04: Aggregate Transfer Amount Verification Specification
1. Initialize `totalMatchingAmount = 0n`.
2. Initialize `matchingLogsCount = 0`.
3. Iterate over ALL logs in `receipt.logs`:
   - If log address matches `quote.token_contract.toLowerCase()`:
     - Check `log.topics[0] === ERC20_TRANSFER_EVENT_TOPIC`.
     - Decode recipient from `topics[2]`.
     - If recipient matches `quote.recipient.toLowerCase()`:
       - Validate sender matches `expectedPayer` (if specified).
       - Decode `logAmount = decodeUint256FromData(log.data)`.
       - If `logAmount === null`, reject immediately as malformed transfer log.
       - `totalMatchingAmount += logAmount`.
       - `matchingLogsCount++`.
4. Assert `matchingLogsCount > 0`.
5. Assert `totalMatchingAmount === BigInt(quote.amount_atomic)`.
6. Reject if `totalMatchingAmount < BigInt(quote.amount_atomic)` or `totalMatchingAmount > BigInt(quote.amount_atomic)`.

### Defect MOD03.3-05: Dispatch Stage Classification & Budget Preservation Specification
Two distinct failure domains:
1. `DEFINITIVE_PRE_DISPATCH_FAILURE`:
   - Request file could not be created before invocation.
   - Pinned CLI executable not found on disk.
   - Local validation failed prior to child process execution.
   - Action: Release budget reservation, mark attempt `FAILED`, mark quote `FAILED`.
2. `SETTLEMENT_UNKNOWN`:
   - Any failure during or after subprocess execution (`child_process.execFile` callback with exit code !== 0, error, or signal).
   - Any non-zero exit code (regardless of stderr message).
   - Any CLI execution where receipt is pending, unconfirmed, or RPC fails.
   - Action: Preserve budget reservation (`RESERVED`), mark attempt `SETTLEMENT_UNKNOWN`, mark quote `SETTLEMENT_UNKNOWN`. Never retry automatically.

### Defect MOD03.3-06: Unique Matching in Settlement Resolution Specification
In `resolveSettlement(attemptId)`:
1. Query `buy receipts --json --resolve`.
2. Filter candidates matching `quote.id`, `attempt.id`, payment reference, or previously recorded `tx_hash` / `settlement_tx_hash`.
3. Collect matching candidate receipts.
4. If candidates count === 0: return `{ resolved: false, message: 'No matching receipt found.' }`.
5. Extract set of unique `txHash`es from candidates.
6. If unique `txHash`es count > 1: return `{ resolved: false, message: 'Ambiguous multiple matching receipts found.' }`.
7. Exactly 1 unique `txHash`: verify on-chain via `verifyOnChainSettlement(uniqueTxHash, quote)`.
8. If on-chain verification passes: commit atomically via `db.commitSettlementAtomic()`.

---

## 3. Database Atomic Settlement Consistency Specification
Add `commitSettlementAtomic(proof: SettlementProofRow, attemptUpdates: Partial<PurchaseAttemptRow>)`:
Enclosed in SQLite `BEGIN IMMEDIATE` transaction:
1. `saveSettlementProof(proof)`
2. `commitBudgetReservation(proof.quote_id)`
3. `updatePurchaseAttemptStatus(proof.purchase_attempt_id, 'SETTLED', attemptUpdates)`
4. `updateQuoteStatus(proof.quote_id, 'SETTLED')`
If any step fails, entire transaction rolls back to preserve database consistency.
