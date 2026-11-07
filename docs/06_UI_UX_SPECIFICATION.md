# 06 — UI/UX specification

## Design direction

Build a calm, trustworthy technical product. Avoid crypto casino visuals, fake dashboards, neon overload and decorative charts. Use restrained dark navy/charcoal or light neutral surfaces, strong typography, clear evidence labels and accessible contrast.

## Public landing page

Hierarchy:
1. Brand: RevertLens.
2. Headline: "Your Celo transaction failed. Find out why."
3. One-sentence description.
4. Network label: Celo Mainnet · Chain ID 42220.
5. Transaction hash field.
6. Inspect button.
7. Short trust statement: "No wallet connection or private key required."
8. Limitations link: "What RevertLens can and cannot prove."

Input:
- trim whitespace;
- accept only `0x` + 64 hex chars;
- show inline error;
- disable submit while request is pending;
- never auto-submit a sample hash.

## Plan state

Show:
- submitted hash;
- chain verification state;
- proposed service/capability;
- why this service is needed;
- current quote or quote unavailable;
- exact amount and token only if actual quote exists;
- message that project operator must approve subsidized service purchase;
- no misleading user payment approval button.

## Investigation progress

Use real persisted states:
- validating hash;
- waiting for operator approval;
- paid request started;
- settlement verified / not settled / unknown;
- transaction and receipt fetched;
- trace available / unavailable;
- evidence normalized;
- explanation validated;
- report ready.

Do not animate a step to completion before backend confirms it.

## Report page

Top:
- status: SUCCESS / FAILED / PENDING / NOT FOUND / INCONCLUSIVE;
- evidence completeness: COMPLETE / PARTIAL / LOW;
- chain and transaction link;
- generated timestamp.

Sections:
1. What happened.
2. Transaction facts.
3. Failure location (only if proven).
4. Revert data and decoding.
5. What the chain proves.
6. What remains unknown.
7. Safe next checks.
8. Services used and why.
9. Payment proof ledger.
10. Disclaimer.

Every factual statement should display an evidence reference such as `E-03`. Clicking it opens the supporting data in a safe bounded detail view.

## Technical view

Show:
- call tree;
- call depth;
- frame type;
- from/to;
- selector;
- gas/gasUsed where present;
- error/revert bytes;
- propagation status;
- truncation and provider limitations.

Never label a child frame as root cause unless propagation analysis supports it.

## Operator console

Protected and visually separate:
- operator login;
- pending quotes;
- quote detail;
- exact approve/deny;
- payment attempt status;
- verified settlement;
- daily budget;
- kill switch;
- proof ledger.

Approval must require an explicit checkbox or confirmation control displaying exact amount/token/payee/body hash. Do not use a vague "Approve all" action.

## Accessibility and responsiveness

- Minimum 360px viewport.
- Semantic headings and landmarks.
- Label all inputs.
- Keyboard navigable.
- Visible focus states.
- Contrast at WCAG AA where practical.
- Avoid color-only status communication.
- Respect reduced motion.
- Use copy buttons with accessible labels.
- Error messages announced to screen readers.
