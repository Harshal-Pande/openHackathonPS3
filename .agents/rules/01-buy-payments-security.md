---
trigger: always_on
description: "Mandatory Buy payment, wallet custody, operator approval, idempotency and no-retry safety rules."
---
# Buy and payment rules

1. Read the current official Buy skill and live catalogue. Never assume old route IDs, schema, prices, token decimals, CLI version or flags.
2. The live 402 quote for the exact method, URL and exact serialized request body is the price authority.
3. Public users never approve project-wallet spending. Only an authenticated operator may approve.
4. Store immutable quote fields: quote ID, capability, method, URL, exact body SHA-256, token address, token symbol, decimals, atomic amount, display amount, recipient, created time and expiry.
5. Approval must bind to the immutable quote ID and hash. Any changed request requires a new quote and approval.
6. Enforce route allowlist, token allowlist, payee allowlist, per-call cap, per-investigation cap, daily cap and global kill switch.
7. Atomically reserve budget before invoking the paid CLI. Release reservation only after a verified no-settlement outcome.
8. Use the documented Buy CLI/MCP interface only. Inspect `buy --help` and the current skill before coding the adapter. Never guess flags.
9. Never use `shell: true`; use a fixed executable and argv array. Do not pass user-controlled URL, method or body outside a validated allowlisted request.
10. Never automatically retry a paid call after timeout, interruption, ambiguous 500, `settle_uncertain`, or unknown settlement.
11. A successful HTTP response is not payment proof. Verify the settlement transaction and record the receipt details.
12. Separate original transaction status from Buy settlement status.
13. Never store private keys, seed phrases, payment authorisation headers, Buy bearer tokens, or CLI secrets.
14. Every paid attempt gets a durable state record before invocation. Persist stdout/stderr only after redaction.
15. If the CLI output format is unclear, stop and inspect current help/docs. Do not parse guessed output formats.
