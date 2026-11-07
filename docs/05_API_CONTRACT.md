# 05 — API contract

All endpoints are versioned under `/api`. All JSON responses use a consistent envelope:

```json
{
  "data": {},
  "error": null,
  "requestId": "server-generated-id"
}
```

Errors:
```json
{
  "data": null,
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Safe user-readable message"
  },
  "requestId": "server-generated-id"
}
```

Never include secrets, raw payment authorisations, stack traces or private CLI output in API responses.

## Public endpoints

### GET `/api/health`
Returns basic health only:
- status;
- application version;
- chain ID;
- feature flags;
- Buy adapter readiness boolean (no secret details).

### POST `/api/investigations/plan`
Request:
```json
{ "txHash": "0x..." }
```
Behaviour:
- validate hash;
- create or return a read-only plan;
- discover current allowed capability status;
- quote only if configured and safe;
- does not pay;
- returns a plan ID and quote summary;
- does not expose operator approval credentials.

### POST `/api/investigations`
Request:
```json
{
  "txHash": "0x...",
  "planId": "server-generated-plan-id",
  "idempotencyKey": "client-generated-random-value"
}
```
Behaviour:
- creates an investigation;
- does not spend;
- status is `AWAITING_OPERATOR_APPROVAL` if a paid call is required;
- public caller cannot supply approved amount or token.

### GET `/api/investigations/:id`
Returns sanitized status and timeline.

### GET `/api/investigations/:id/report`
Returns report only when available to the unlisted report capability or authenticated owner/operator.

## Operator endpoints

All require authenticated operator session and CSRF protection for mutations.

### POST `/api/operator/login`
Authenticate operator. Rate-limited. No default password.

### POST `/api/operator/logout`
Invalidate session.

### GET `/api/operator/quotes`
List pending quote records with safe fields.

### GET `/api/operator/quotes/:quoteId`
Return exact quote details for review, including body hash and payee.

### POST `/api/operator/quotes/:quoteId/approve`
Request:
```json
{
  "confirmQuoteId": "same-server-generated-quote-id",
  "confirmBodySha256": "exact-sha256",
  "confirmAmountAtomic": "exact-atomic-amount",
  "confirmTokenContract": "0x..."
}
```
The server verifies all fields against immutable quote, expiry and policy. It records approval against the authenticated session. The frontend must show the exact token, amount, recipient, request and purpose before this action.

### POST `/api/operator/quotes/:quoteId/deny`
Deny a pending quote.

### POST `/api/operator/investigations/:id/execute`
Execute only an approved, unused quote. This route must not accept arbitrary URL/body/amount. The server reads immutable quote and approval from DB.

### GET `/api/operator/ledger`
List purchases and settlement proofs.

### GET `/api/operator/budget`
Return configured caps and current reserved/spent amounts, token-specific.

### POST `/api/operator/kill-switch`
Enable or disable new paid calls. Disabling the kill switch requires an authenticated operator and CSRF protection. Enabling it should be possible immediately.

## API invariants

- No public route can initiate payment.
- No client-provided amount can authorise spending.
- Quote and approval are immutable.
- Paid execution is one-time.
- Ambiguous state cannot be retried automatically.
- Public report never exposes operator session, payment auth or private provider data.
- Every mutation creates an audit event.
