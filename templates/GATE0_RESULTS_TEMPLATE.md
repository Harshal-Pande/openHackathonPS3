# Gate 0 results

Date/time UTC:
Operator:
Machine/OS:
Node:
npm:
Buy CLI version:
Deployment target:

| Check | Status | Test class | Evidence path | Notes |
|---|---|---|---|---|
| Current Buy CLI help inspected | NOT_TESTED | LOCAL | | |
| Live catalogue fetched | NOT_TESTED | LIVE_MAINNET_READ_ONLY | | |
| Chainstack capability available | NOT_TESTED | LIVE_MAINNET_READ_ONLY | | |
| Initial RPC quote obtained | NOT_TESTED | LIVE_MAINNET_READ_ONLY | | |
| RPC purchase settled | NOT_TESTED | LIVE_MAINNET | | |
| Transaction/receipt validated | NOT_TESTED | LIVE_MAINNET | | |
| Trace quote obtained | NOT_TESTED | LIVE_MAINNET_READ_ONLY | | |
| Trace call accepted | NOT_TESTED | LIVE_MAINNET | | |
| Usable call tree parsed | NOT_TESTED | LIVE_MAINNET | | |
| Cencori capability available | NOT_TESTED | LIVE_MAINNET_READ_ONLY | | |
| Cencori quote obtained | NOT_TESTED | LIVE_MAINNET_READ_ONLY | | |
| Cencori purchase settled | NOT_TESTED | LIVE_MAINNET | | |
| Cencori output validated | NOT_TESTED | LIVE_MAINNET | | |
| Intended host supports CLI/keychain | NOT_TESTED | LOCAL | | |

## Exact quote evidence

For every quote include capability, method, URL, exact body hash, token contract, decimals, atomic amount, display amount, recipient, quote time and expiry. Redact payment authorisation.

## Payment evidence

Include actual settlement hash, receipt, token, amount, payee, payer/authorizer if recoverable, tx sender, correlation ID and response outcome.

## Decision

- [ ] PRIMARY GO: trace path proven.
- [ ] RECEIPT-ONLY FALLBACK: paid RPC works, trace unavailable.
- [ ] STOP: paid Chainstack RPC unavailable.
- [ ] BLOCKED: no human spend approval.

Reason and evidence:
