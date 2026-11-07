# 04 — Security, privacy and abuse model

## 1. Assets to protect

- Buy wallet/keychain signing authority.
- Stablecoin balance.
- Payment authorisations and settlement metadata.
- Operator credentials and sessions.
- User-submitted transaction hashes and context.
- Investigation reports.
- Provider responses and trace data.
- Deployment secrets and database.

## 2. Trust boundaries

Untrusted:
- public visitor;
- transaction calldata and revert strings;
- logs and events;
- contract metadata;
- external pages;
- provider responses;
- model output;
- browser request body.

Trusted only after verification:
- server-side configuration;
- authenticated operator session;
- exact quote record;
- approved immutable request hash;
- verified settlement receipt;
- schema-validated evidence.

## 3. Wallet and payment threats

### Threat: public user manipulates spend amount
Mitigation: public endpoints cannot approve spending. Operator approval references server-generated quote ID and exact body hash.

### Threat: quote changes after approval
Mitigation: immutable quote record; body hash, URL, method, token, amount and recipient bound to approval. Any change invalidates approval.

### Threat: replay or duplicate purchase
Mitigation: unique idempotency key, one-time quote consumption, durable purchase attempt before invocation.

### Threat: concurrent requests overspend
Mitigation: database transaction reserves budget atomically. Recheck global, daily, investigation and per-call caps at execution.

### Threat: ambiguous timeout causes second charge
Mitigation: mark `SETTLEMENT_UNKNOWN`; no retry. Resolve receipt and Buy status before any new attempt.

### Threat: wrong recipient/token
Mitigation: route and payee allowlists, token contract allowlist, verify quote against settlement.

### Threat: CLI injection
Mitigation: no shell; fixed executable; argv array; only allowlisted URLs and validated body; bounded output and timeout.

## 4. Operator authentication

- No default credentials.
- Operator secret configured outside repository.
- Use a password hashing algorithm such as Argon2id if local password login is implemented.
- Rate-limit login attempts.
- Session cookies: HttpOnly, Secure in production, SameSite=Lax or stricter.
- CSRF protection for state-changing requests.
- Short session lifetime and explicit logout.
- No operator secrets in frontend build.
- Do not expose admin routes through CORS to arbitrary origins.

## 5. Prompt injection and model integrity

- LLM receives only bounded structured evidence.
- LLM has no tools, no Buy adapter and no wallet authority.
- Revert strings and metadata are quoted as untrusted content.
- Ask the model for structured claims with evidence IDs.
- Reject unknown evidence IDs.
- Reject claims with values absent from evidence.
- Causal claims require deterministic propagation evidence, not just matching strings.
- Use deterministic template if validation fails.

## 6. Privacy

- Public reports are unlisted by default with high-entropy IDs.
- Do not publish user address or identity unless the user explicitly consents.
- Transaction hash is public chain data, but user association and submitted context may be sensitive.
- Store minimum data necessary.
- Define retention and deletion behaviour before public launch.
- Cencori receives only the minimum structured evidence needed.
- Verify current provider retention and privacy terms before sending user-specific context.
- Never send operator credentials, payment authorisation, or private wallet data to Cencori.

## 7. Web application security

- Validate all request bodies with Zod.
- Limit body size and trace output.
- Parameterize SQL queries.
- Configure strict CORS.
- Add CSP and security headers.
- Rate-limit public analysis creation and operator login.
- Avoid detailed stack traces in public errors.
- Prevent report ID enumeration.
- Ensure CSV export escapes spreadsheet formula injection.
- Use HTTPS in production.
- Do not allow arbitrary URLs or server-side request forgery.

## 8. Release security checklist

- [ ] No secrets in Git tree or history.
- [ ] `.env` ignored.
- [ ] Operator auth enabled.
- [ ] CSRF protection enabled.
- [ ] Quote-bound approval tested.
- [ ] Spend caps tested under concurrency.
- [ ] Ambiguous payment no-retry tested.
- [ ] Settlement proof verified.
- [ ] Public report sanitized.
- [ ] Retention policy documented.
- [ ] Cencori payload minimised.
- [ ] Kill switch tested.
