# 10 — Final decisions and non-goals

## Locked decisions

1. Product name: RevertLens (working name; check name/repository availability before public branding).
2. Chain: Celo mainnet only.
3. Input: one transaction hash.
4. Primary service: Chainstack Celo RPC through Buy.
5. Secondary service: Cencori inference through Buy, conditional on live availability and useful output.
6. Trace support is a hard Gate 0 requirement for the primary product positioning.
7. Receipt-only fallback must be renamed/repositioned and re-scored.
8. If paid Chainstack RPC itself fails, stop this concept rather than quietly using a free RPC.
9. No customer x402 flow in the MVP.
10. No public user can authorise project wallet spending.
11. Operator approval is quote-bound and authenticated.
12. No automatic retry after ambiguous payment.
13. No user private key collection or transaction signing.
14. Deterministic rules control purchases and evidence classification.
15. LLM explains normalized facts only.
16. Public reports unlisted by default.
17. Independent-user eligibility is evidence-based and never manufactured.
18. Use Google Antigravity as the development environment.
19. Use Fastify, React/Vite, TypeScript, Zod, viem, SQLite and Vitest.
20. Build Gate 0 first; UI polish last.

## Rejected options

- Preflight token due-diligence agent: weaker differentiation and existing free alternatives.
- General blockchain chatbot: generic and hard to prove.
- Customer x402 payments: unnecessary second payment flow.
- Arbitrary RPC URL: security and payment scope expansion.
- Optional browser/social providers: unnecessary for MVP.
- Free RPC fallback presented as Buy integration: dishonest competition claim.
- LLM-only root cause: not defensible.
- Automatic transaction retry: unsafe.
- User-supplied spend amount as approval: unsafe.
- Treating deepest child revert as root cause: logically invalid without propagation evidence.

## Change control

Only change these decisions if:
- Gate 0 reveals a technical impossibility;
- the official hackathon rules require a change;
- a real security issue requires a change;
- user testing reveals a material product flaw.

Every change must be added to `DECISIONS.md` with date, evidence, impact and approval.
