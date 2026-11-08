# RevertLens — Master Backend & API Audit
**Document Version:** 1.0.0  
**Framework:** Fastify 5.x with Node 22 LTS  
**Audit Standard:** `docs/04_SECURITY_AND_PRIVACY.md` & `docs/05_API_CONTRACT.md`  

---

## 1. Backend Server Architecture

The RevertLens backend is implemented in `src/server/app.ts` using Fastify 5.x. It delivers both the JSON REST API and the compiled React SPA frontend from a single lightweight HTTP process.

### Core Server Lifecycle & Hooks
1. **Request Tracking:** Every incoming request is assigned a unique UUID request ID via `genReqId: () => randomUUID()`.
2. **CORS Middleware:** Configured with `@fastify/cors` using `appConfig.CORS_ORIGIN`. Production invariants strictly prohibit wildcard origins (`*`).
3. **Response Envelope Hook:** An `onSend` hook automatically formats all outgoing JSON responses into the standard API contract envelope:
   ```json
   {
     "data": { ... },
     "error": null,
     "requestId": "uuid"
   }
   ```
4. **Global Error Handler:** An error interceptor maps all exceptions to stable error codes (`INVALID_INPUT`, `NOT_FOUND`, `PROVIDER_UNAVAILABLE`, `GATEWAY_TIMEOUT`, `UNAUTHORIZED`, `INTERNAL_SERVER_ERROR`), redacts all URLs/endpoints to prevent secret leakage, and formats the response:
   ```json
   {
     "data": null,
     "error": {
       "code": "PROVIDER_UNAVAILABLE",
       "message": "Chainstack HTTP error: 503 Service Unavailable"
     },
     "requestId": "uuid"
   }
   ```

---

## 2. API Route Inventory & Verification

| Route | Method | Access Level | Description | Validation Schema | Status |
|:---|:---:|:---:|:---|:---|:---:|
| `/healthz` | `GET` | Public | Kubernetes/Docker liveness probe. Returns HTTP 200 `{ status: "ok" }`. | None | **VERIFIED** |
| `/readyz` | `GET` | Public | Kubernetes/Docker readiness probe. Asserts node configuration and DB connectivity. | None | **VERIFIED** |
| `/api/health` | `GET` | Public | Standard health check conforming to `docs/05_API_CONTRACT.md`. Reports chain ID, feature flags, version. | None | **VERIFIED** |
| `/api/investigations` | `POST` | Public | Submits transaction hash for forensic analysis. | `InvestigateBodySchema` (regex `^0x[0-9a-fA-F]{64}$`) | **VERIFIED** |
| `/api/investigations/:id` | `GET` | Public | Retrieves past forensic report by investigation UUID. | UUID regex validator | **VERIFIED** |
| `/api/investigations` | `GET` | Public | Lists recent investigations with configurable limit (1..100). | Query param `limit` (int, 1..100) | **VERIFIED** |
| `/api/investigations/:id/quote` | `POST` | Public | Generates a Buy quote for Cencori AI inference without spending. | UUID regex validator | **VERIFIED** |
| `/api/operator/login` | `POST` | Public / Operator | Authenticates operator using timing-safe password hash verification. | `LoginBodySchema` (`password` string) | **VERIFIED** |
| `/api/operator/logout` | `POST` | Operator | Invalidates the operator session token. | Bearer or `x-operator-token` | **VERIFIED** |
| `/api/operator/quotes` | `GET` | Operator Only | Lists pending and processed quote records. | Requires valid operator session | **VERIFIED** |
| `/api/operator/quotes/:id/approve` | `POST` | Operator Only | Approves quote bound to exact body SHA-256 hash. | `ApproveQuoteBodySchema` (`expectedBodySha256`) | **VERIFIED** |
| `/api/operator/kill-switch` | `POST` | Operator Only | Engages or disengages emergency spending kill switch. | `KillSwitchBodySchema` (`{ enabled: boolean }`) | **VERIFIED** |
| `/` | `GET` | Public | Serves production SPA HTML (`dist/client/index.html`). | Path resolution | **VERIFIED** |
| `/assets/*` | `GET` | Public | Serves compiled static assets (JS, CSS, SVGs, Favicon). | Path traversal security guard | **VERIFIED** |

---

## 3. Configuration & Production Invariants

Environment configuration is parsed in `src/server/config.ts` via Zod. In addition to type coercion and defaults, the following strict production invariants are enforced:

1. **Rejection of Placeholder Secrets:**
   - In `production`, `SESSION_SECRET` must not match `REPLACE_WITH_RANDOM_32_BYTE_OR_LONGER_SECRET` and must be at least 32 characters long.
   - In `production`, `OPERATOR_PASSWORD_HASH` must not match `REPLACE_WITH_ARGON2ID_HASH` and must not be empty.
2. **Rejection of In-Memory Database:**
   - In `production`, `DATABASE_PATH` cannot be `:memory:`. A persistent filesystem path is strictly required to prevent catastrophic state loss on restart.
3. **Rejection of Wildcard CORS:**
   - In `production`, `CORS_ORIGIN` cannot be `*`. A specific domain or origin array is required to prevent unauthorized cross-origin access.
4. **Secret Redaction:**
   - All network errors and error logs pass through regular expression sanitization `replace(/https?:\/\/[^\s]+/g, '[REDACTED_RPC_ENDPOINT]')`, preventing credentials in the RPC URL from ever surfacing in API error responses or terminal logs.

---

## 4. Test Results

- All backend routes, auth middleware, and configuration invariants are covered by automated unit and integration tests:
  - `tests/health.test.ts` (4/4 tests pass)
  - `tests/config.test.ts` (16/16 tests pass)
  - `tests/investigations.test.ts` (6/6 tests pass)
  - `tests/buySecurity.test.ts` (4/4 tests pass)
  - `tests/userJourneyE2E.test.ts` (10/10 tests pass)
