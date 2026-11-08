# RevertLens — Master Defect Register
**Document Version:** 2.0.0 (Master Audit & Reconciled)  
**Last Updated:** 2026-11-08  
**Audit Standard:** Comprehensive defect discovery, root cause analysis, classification, and remediation planning  

---

## 1. Defect Classification Standard

- **Critical (P0):** Data corruption, secret exposure, unauthorized financial spending, core pipeline failure, total outage.
- **High (P1):** Major functional defect, authentication/security vulnerability, incorrect forensic root-cause attribution, blocking hackathon completion.
- **Medium (P2):** Important functionality failure, edge case defect, concurrency/locking vulnerability, lack of SPA route handling.
- **Low (P3):** Minor display/bundle issue, non-blocking warning, performance optimization opportunity, usability inconvenience.
- **Informational:** Architectural clarification, operational dependency advisory, accepted experimental runtime flag.

---

## 2. Master Defect Ledger

| Defect ID | Severity | Category | Description | Root Cause | Status | Remediation & Verifying Evidence |
|:---:|:---:|:---|:---|:---|:---:|:---|
| **DEF-01** | **High** | Forensics | False root-cause attribution on caught internal sub-calls (`try/catch`). | Naive classifier blamed deepest frame with an error, ignoring whether parent handled it. | **RESOLVED** | Implemented 5-tier causality classifier in `classifier.ts`. Tested in `tests/forensics.test.ts` and Golden Case GC-04. |
| **DEF-02** | **High** | Security | Side-channel timing attack risk on operator login password comparison. | Standard `===` string equality had variable execution time proportional to matching prefix. | **RESOLVED** | Upgraded `OperatorAuthService` to constant-time SHA-256 comparison via `crypto.timingSafeEqual`. Tested in `tests/buySecurity.test.ts`. |
| **DEF-03** | **Medium** | Security | In-memory database allowed in production configuration. | `config.ts` allowed `DATABASE_PATH=":memory:"` in all environments, risking data loss on restart. | **RESOLVED** | Added production security invariant in `config.ts` rejecting `:memory:` with immediate process failure. Tested in `tests/config.test.ts`. |
| **DEF-04** | **Medium** | Security | Wildcard CORS allowed in production configuration. | `config.ts` allowed `CORS_ORIGIN="*"` in production. | **RESOLVED** | Added production security invariant in `config.ts` rejecting `*` in production mode. Tested in `tests/config.test.ts`. |
| **DEF-05** | **Medium** | Forensics / DoS | Deeply nested recursive call traces could cause memory exhaustion or stack overflow. | Unbounded recursive tree traversal in `traceParser.ts`. | **RESOLVED** | Enforced `MAX_TRACE_DEPTH = 100` and `MAX_FRAME_COUNT = 1000` with graceful truncation. Tested in `tests/traceParser.test.ts`. |
| **DEF-06** | **Medium** | Runtime | Static SPA frontend returned HTTP 404 when served from single Fastify process. | Fastify only registered `/api/*` routes; static files were not mounted. | **RESOLVED** | Added static SPA index and asset handlers (`GET /`, `GET /assets/*`) with path traversal guards in `app.ts`. Verified by `scripts/browser_e2e_cdp.mjs`. |
| **DEF-07** | **Medium** | E2E Tests | `userJourneyE2E.test.ts` parameter order inversion in `ChainstackProviderError`. | Constructor expected `(message, code, statusCode)` but was called with `(message, statusCode, code)`. | **RESOLVED** | Corrected argument order in Scenarios E and F. Tested in `tests/userJourneyE2E.test.ts`. |
| **DEF-08** | **Medium** | AI Validation | Test scenario H failed Zod validation before checking unverified address guardrail. | Mock response was missing required fields `technicalExplanation` and `evidenceReferences`. | **RESOLVED** | Populated required schema fields to isolate address validation. Tested in `tests/userJourneyE2E.test.ts`. |
| **DEF-09** | **Low** | Code Style | Trailing whitespaces in markdown headers caused `git diff --check` warnings. | Editor trailing spaces in markdown files. | **RESOLVED** | Stripped all trailing whitespaces across all project files; `git diff --check` exits with 0. |
| **DEF-10** | **Low** | Browser E2E | Chrome `--dump-dom` executed before async recent investigations fetch resolved. | Initial synchronous DOM dump lacked async data. | **RESOLVED** | Replaced synchronous CLI dump with asynchronous CDP WebSocket automation in `scripts/browser_e2e_cdp.mjs`. |
| **DEF-11** | **Low** | Browser E2E | Button label mismatch in E2E test script (`"Investigate Failure"` vs `"Inspect Transaction"`). | Test assertion looked for old button label. | **RESOLVED** | Aligned test assertion with actual UI button label in `App.tsx`. Verified by CDP test. |
| **DEF-12** | **Informational** | Database | Node.js emits `ExperimentalWarning: SQLite is an experimental feature`. | `node:sqlite` is marked experimental in Node 22 LTS. | **DOCUMENTED / ACCEPTED** | The native SQLite module functions with 100% stability across all 130 tests; no crashes or memory leaks observed. |
| **DEF-13** | **Medium** | Buy Payments | `BuyQuoteService.createQuote` threw `TypeError` if allowlist arrays were omitted in partial configs. | Direct `.length` lookup on optional/undefined config arrays (`BUY_ALLOWED_CAPABILITY_IDS`, etc.). | **RESOLVED** | Added existence guard `this.config.BUY_ALLOWED_CAPABILITY_IDS && ...` before length check in `src/server/services/buyQuoteService.ts`. Verified by `scripts/verify_all_routes.mjs`. |
| **DEF-14** | **High** | Security / Auth | Operator authentication compares input against `SESSION_SECRET` rather than `OPERATOR_PASSWORD_HASH`. | In `src/server/auth/operatorAuth.ts:36`, `expectedHash` hashed `this.config.SESSION_SECRET`. `config.ts` required `OPERATOR_PASSWORD_HASH` in production and mentioned Argon2id, but no Argon2 dependency was installed, creating a security mismatch. | **RESOLVED** | Decoupled password verification from session signing in `src/server/auth/operatorAuth.ts` and `src/server/auth/passwordHasher.ts`. Implemented salted asynchronous scrypt hashing (OWASP standard: $N=16384, r=8, p=1$, random 16-byte salt, constant-time `timingSafeEqual`). Replaced plain token storage with HMAC-SHA256 signed session tokens keyed by `SESSION_SECRET` with 2-hour hard expiry and revocable logout. Added IP brute-force limiter (max 5 failed attempts per 15 min returning HTTP 429 with `Retry-After`). Added `scripts/generate_password_hash.mjs`. Verified by 15 tests in `tests/operatorAuth.test.ts` and route test 11 in `scripts/verify_all_routes.mjs`. |
| **DEF-15** | **Medium** | Database / Concurrency | SQLite database lacks Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and busy timeout. | Default SQLite journal mode is `DELETE`, causing entire database locking during write transactions. Under concurrent HTTP requests, queries fail with `SQLITE_BUSY`. | **RESOLVED** | Configured `PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;` on database initialization in `src/server/db/database.ts`. Tested in `tests/databaseReliability.test.ts` (4/4 tests pass with 25 concurrent writers/readers). |
| **DEF-16** | **Medium** | Usability / Routing | Direct navigation or refresh on deep URLs without hash returns HTTP 404. | In `src/server/app.ts:398-405`, only `GET /` served `index.html`. Direct browser loads on `/history`, `/about`, `/operator`, `/investigation/:id` returned 404. | **RESOLVED** | Added 302 redirects from clean client URLs to hash SPA equivalents, and configured `setNotFoundHandler` preserving standard JSON 404 envelope for `/api/*`. Tested in `scripts/verify_all_routes.mjs` (27/27 pass). |
| **DEF-17** | **Medium** | Security / Robustness | Revert decoder `decodeRevertData` parses length prefix without explicit bounds clamping. | In `src/server/forensics/revertDecoder.ts:46`, `parseInt(lengthHex, 16)` was unconstrained. If an attacker submits an astronomical length, parsing could lead to unexpected behavior. | **RESOLVED** | Clamped `strLen` to `MAX_REVERT_STRING_BYTES = 4096`, verified high-order zero padding, safe offset parsing, and truncated data handling in `src/server/forensics/revertDecoder.ts`. Tested in `tests/revertDecoder.test.ts` (12/12 pass). |
| **DEF-18** | **Low** | Build / Performance | Client JS chunk size (624 kB) exceeded recommended 500 kB threshold. | Vite bundled all pages, Lucide icons, and React into single chunk `index-CPzjZ2ir.js`. | **RESOLVED** | Configured `manualChunks` in `vite.config.ts` separating `vendor-react` (430 kB), `vendor-icons` (14.8 kB), and `index` (178 kB). Clean build with 0 warnings. Verified via `npm run build` and `scripts/browser_e2e_cdp.mjs`. |
| **DEF-19** | **Informational** | Buy Payments | Buy CLI live payment settlement (`npx @celo/buy@latest ... curl`) has not been executed on-chain. | Agent wallet has 0 CELO balance and human operator has not authorized spend or executed CLI setup. Quote generation and x402 challenge parsing are fully verified. | **OPERATIONAL / DOCUMENTED** | Scheduled for Module 3 (Build with Buy & AI). Settlement requires funded wallet (< $0.05) and operator approval. |
| **DEF-20** | **Informational** | ERC-8004 | Tagged ERC-8004 agent registration transaction is encoded and verified, but not broadcast on-chain. | Agent wallet balance is 0 CELO; public deployment URL is required to serve public metadata before registration. | **OPERATIONAL / DOCUMENTED** | Scheduled for Module 5 (ERC-8004 Agent Identity). Sequence: Deploy -> Public URL -> Fund Gas (< 0.05 CELO) -> Broadcast. |

---

## 3. Defect Statistics & Release Posture

- **Total Historical Defects Tracked:** 20
- **Total Resolved Defects:** 18 (DEF-01 through DEF-18)
- **Total Open Defects:** 2 (DEF-19, DEF-20)
  - Critical (P0): **0**
  - High (P1): **0** (DEF-14 resolved in Module 2)
  - Medium (P2): **0** (All resolved in Module 1)
  - Low (P3): **0** (All resolved in Module 1)
  - Informational / Operational: **2** (DEF-19: Buy live settlement; DEF-20: ERC-8004 broadcast)

### Immediate Engineering Action Plan:
1. **Module 1:** COMPLETED (DEF-15, DEF-16, DEF-17, DEF-18 resolved with 100% test verification).
2. **Module 2:** COMPLETED (DEF-14 resolved via scrypt password hashing, session signing separation, and rate limiting).
3. **Module 3:** Authorize and execute Buy live payment workflow (DEF-19).
4. **Module 5:** Authorize and broadcast ERC-8004 registration transaction (DEF-20).
