---
trigger: glob
globs: "*.tsx, *.css, *.html"
description: "Frontend implementation, accessibility, state handling and truthful progress rules."
---
# Frontend rules

- Build a clear, responsive, accessible developer tool. Avoid decorative dashboards and invented counters.
- Public visitor flow: submit hash -> inspect read-only plan/quote preview -> see that operator approval is required -> view report when available.
- Operator flow is separate and protected. Never expose the project wallet or operator secret in frontend code.
- Do not show a user-facing button that falsely implies the user is authorising the project wallet's payment.
- Progress UI must display persisted backend states only. Never simulate successful paid steps.
- Show network label `Celo Mainnet` and chain ID.
- Distinguish facts, inference, unknowns and limitations visually.
- Show a transaction link only when the hash is real and verified.
- Use accessible labels, keyboard focus, visible error states and mobile layouts.
- No fake transaction count, user count, payment amount, agent ID or success badge.
