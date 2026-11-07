# PHASE 2 PROMPT — FRONTEND AND OPERATOR CONSOLE

Execute only after backend tests and Gate 0 decisions are documented. Read docs 01, 05 and 06.

## Product surfaces

Build two distinct experiences:

A. Public user:
- no wallet connection required for core investigation;
- one transaction hash input;
- read-only plan/status;
- report page;
- optional wallet ownership proof only if implementing user eligibility tracking.

B. Protected operator:
- login;
- quote review;
- exact spend approval;
- payment execution status;
- budget/kill switch status;
- proof ledger;
- never expose wallet secret or signing material.

## Required public pages

1. Landing page:
   - headline: "Your Celo transaction failed. Find out why."
   - short explanation of what evidence can/cannot establish;
   - transaction hash input;
   - visible Celo Mainnet label and chain ID 42220;
   - sample hash must be explicitly labelled sample/mock.
2. Investigation status:
   - persisted state timeline only;
   - show whether operator approval is pending;
   - no fake live progress.
3. Report:
   - overall status;
   - short summary;
   - transaction facts;
   - failure location only if supported;
   - decoded revert information only if validated;
   - what chain evidence proves;
   - what remains unknown;
   - safe next checks;
   - service/payment ledger;
   - evidence IDs and source links;
   - disclaimer.
4. Technical details:
   - raw selector;
   - bounded call tree;
   - call path;
   - frame errors;
   - truncation and provider limitations.

## Operator pages

1. Login page.
2. Quote review page showing exact capability, URL, method, body preview, request hash, token, contract, decimals, amount, payee, expiry and reason.
3. Explicit approve/deny action for that quote only.
4. Purchase state page with settled / not settled / unknown states.
5. Daily budget, per-investigation cap and kill switch.
6. Proof ledger with verified transaction hashes only.

## UX rules

- Do not use the phrase "root cause found" unless deterministic evidence establishes the propagated failure and the claim is reviewed by the evidence validator.
- Use labels: `FACT`, `INFERENCE`, `UNKNOWN`, `NOT AVAILABLE`.
- Distinguish original transaction status from Buy settlement status.
- Never display a quote as a completed payment.
- Never show a green success indicator for an unverified payment.
- Do not show fake usage charts or counters.
- Responsive from 360px width upwards.
- Keyboard accessible, semantic HTML, visible focus, labels for all fields.
- Show validation errors next to the input.
- Keep report text copyable.
- Public report URLs must use unguessable IDs and be unlisted by default.

## Acceptance

Run frontend tests, backend tests, typecheck and production build. Test the public flow and operator flow in a browser. Save screenshots or Antigravity browser artifacts only if they are real outputs of the running app. Do not use mock screenshots as proof of live Buy integration.
