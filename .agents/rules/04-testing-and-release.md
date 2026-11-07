---
trigger: always_on
description: "Testing, release evidence, deployment and honest status reporting."
---
# Test and release rules

- Use mocked fixtures for deterministic unit tests; label them `MOCKED`.
- Live mainnet tests require explicit operator approval and a small approved spend.
- Never use a real paid endpoint in ordinary CI.
- Required commands should be documented in package scripts and executed before claiming success.
- Test adverse cases: malformed provider payload, RPC error, reordered batch, unsupported trace, timeout, truncated trace, caught nested revert, propagated revert, payment ambiguity, duplicate request, concurrent spend, payee mismatch and invalid operator session.
- Keep `TEST_RESULTS.md`, `GATE0_RESULTS.md`, `PROOF.md` and `DECISIONS.md` current.
- Public deployment requires a separate human approval. Run a post-deploy smoke test.
- Never commit `.env`, local database, logs, payment auth, browser session tokens or wallet material.
