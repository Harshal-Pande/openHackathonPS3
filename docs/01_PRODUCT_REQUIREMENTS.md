# 01 — Product requirements

## 1. Product statement

**RevertLens — Celo transaction failure investigation with evidence and transparent service-payment proof.**

A user submits one Celo mainnet transaction hash. RevertLens retrieves transaction and receipt evidence through the paid Chainstack Celo RPC capability on Buy. For a failed transaction, it attempts `debug_traceTransaction` only if the live Buy-routed provider supports it. It normalizes the trace, identifies a failure path only when evidence supports propagation to the top-level failure, decodes supported revert payloads, and optionally purchases a Cencori explanation. The report distinguishes facts, inferences and unknowns and links every paid service to verifiable payment proof.

## 2. User and job

Primary user: a Celo wallet user, dApp support operator or developer who has a mined failed transaction and wants to understand what happened without manually reading raw RPC and trace data.

Job statement: "This transaction failed. What does the chain prove, what remains unknown, and what should I check next?"

Do not assume all user groups have the same needs. The MVP prioritizes the developer/support workflow while keeping a simple explanation view.

## 3. MVP user journey

1. User opens RevertLens.
2. User pastes a 32-byte transaction hash.
3. Backend validates format and Celo mainnet context.
4. Backend creates an investigation plan and retrieves the current Buy quote(s) required by the approved product policy.
5. Public user sees that service costs are subsidized by the project during the hackathon. They do not approve spending from the project wallet.
6. Authenticated operator reviews exact quote and approves or denies.
7. Backend executes the approved request once.
8. Backend verifies settlement independently.
9. Backend retrieves transaction and receipt. If receipt status is failed and Gate 0 proved support, it requests the trace.
10. Backend normalizes evidence and determines whether the trace proves a propagated failure.
11. Cencori receives only bounded structured evidence if it is available and justified.
12. Validator rejects unsupported model claims.
13. Report is created and made available through an unlisted URL.
14. Ledger shows quote, payment state, provider result and whether that result contributed to the report.

## 4. In scope

- Celo mainnet only (chain ID 42220).
- One input: transaction hash.
- Transaction and receipt facts.
- Trace-backed failure location only if live capability is proven.
- Standard Solidity Error(string) and Panic(uint256) decoding.
- Custom error decoding only with exact trusted ABI and historical implementation verification.
- Basic call-tree view.
- Evidence IDs and provenance.
- Bounded Cencori explanation if paid route is live.
- Deterministic explanation fallback.
- Operator-only spend approval.
- Verified Buy payment ledger.
- Public unlisted report.
- Internal user testing and optional wallet ownership proof for eligibility evidence.

## 5. Explicitly out of scope

- User wallet private key collection.
- User transaction signing or sending.
- Automatic transaction retry, cancellation or repair.
- Transaction simulation.
- Arbitrary RPC URL input.
- Arbitrary paid endpoint input.
- General chatbot.
- Token scam detection or investment recommendations.
- Smart-contract security audit.
- Contract decompilation.
- Customer x402 payment flow.
- Browser rental, X, Reddit or other optional Buy services.
- Cross-chain support.
- Full account system for ordinary users.
- Automatic claim that a user qualifies as independent without evidence.

## 6. Product language

Allowed:
- "The receipt confirms the transaction failed."
- "The trace shows a call to X returned an error."
- "The trace indicates this error propagated to the top-level transaction."
- "The available evidence is insufficient to determine the exact cause."
- "A possible explanation is..."

Forbidden unless independently established:
- "We found the root cause."
- "This contract is malicious."
- "Your funds are safe."
- "Retry with higher slippage/gas/approval."
- "This transaction will succeed next time."
- "100% accurate."

## 7. Measurable success

A completed investigation means:
- input hash validated;
- correct Celo chain established;
- transaction/receipt response validated;
- if failure trace is claimed, trace was actually returned and parsed;
- each conclusion links to evidence;
- payment states are independently verified;
- report includes limitations;
- user can understand what is proven and what remains unknown.

A paid HTTP response alone is not a successful investigation.

## 8. Product modes

### Primary: trace-capable mode
Requires Gate 0 proof of Buy-routed Chainstack trace support and useful call tree.

### Fallback: receipt explainer
Only if Chainstack transaction/receipt paid calls work but trace is unavailable. Product must be renamed/repositioned in UI as a receipt explainer, not a transaction debugger. It must not claim nested failure location or root cause. Reassess competition value before continuing.

### Stop
If paid Chainstack RPC itself is unavailable, do not use free RPC and claim Buy is central. Stop and re-plan.
