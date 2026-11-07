# 09 — Hackathon compliance and evidence

## Important

The rules can change. Before submission, the human operator and agent must re-open the official event page and verify the current text. This document is a project interpretation, not a substitute for the official rules.

Official event page: https://www.loops.house/agents-on-open-rails
Buy skill: https://github.com/celo-org/buy-skill
Buy catalogue: https://gateway.usebuy.ai/v1/catalog

## Project claims

RevertLens should claim:
- it buys Chainstack RPC evidence through Buy only if actual paid calls are verified;
- it buys Cencori inference through Buy only if actual paid calls are verified;
- it provides trace-backed failure analysis only if live trace capability is proven;
- it has an ERC-8004 identity only after registration and verification;
- it has independent users only after each wallet meets the official definition and supporting evidence is recorded.

## Independent-user qualification

The official event definition described in the prior research requires the wallet:
- not to be the builder's wallet;
- not to have been first funded by the builder or main funder;
- to have had its own Celo activity before the hackathon began.

A signed message proves wallet control at the time of verification; it does not by itself prove funding provenance or pre-event activity. Record each dimension separately:
- `CONTROL_PROVEN`;
- `PRE_EVENT_ACTIVITY_VERIFIED`;
- `FUNDING_PROVENANCE_VERIFIED`;
- `ELIGIBILITY_REVIEWED`.

If any required dimension is unknown, cohort must remain `UNVERIFIED`. Never fund a wallet to manufacture eligibility.

## Attribution and payment proof

The prior review found a distinction between the general event attribution-tag language and the Build with Buy FAQ exception. Before submission:
- re-check the current official FAQ;
- implement tags on project-sent transactions where applicable;
- do not claim facilitator-submitted Buy settlement transactions contain a project calldata tag unless verified;
- obtain organiser clarification about how facilitator payments are attributed;
- preserve evidence of payer/authorizer, tx sender, recipient, token, amount, service and settlement hash.

## ERC-8004

- Verify current registration contract and instructions.
- Use Celo mainnet only if the event requires it.
- Human operator must approve and sign registration.
- Read agent ID from the actual registration event/receipt.
- Verify public registration profile.
- Never invent an agent ID or profile URL.

## Sponsored gas

Disclose any sponsored gas or facilitator-paid gas exactly as required by the current event rules.

## Proof package

For each paid call include:
- service/capability;
- why it was used;
- exact quote;
- token and amount;
- settlement hash;
- receipt status;
- payer/authorizer if recoverable;
- result received;
- evidence that the result contributed to the report.

Do not combine internal tests, subsidized use and independent users into one misleading total.
