# Test Results

**Date/time:** 2026-11-07 06:09:00 UTC  
**Commit:** f3e9430 (session 1) + uncommitted changes (session 2)  
**Node:** v22.17.0  
**npm:** 11.6.1  

| Command | Exit code | Result | Notes |
|---|---:|---|---|
| `npm install` | 0 | PASS | 250 packages; no audit errors affecting test execution |
| `npm run typecheck` | 0 | PASS | Server and client TypeScript strict; 0 errors |
| `npm test` | 0 | PASS | 2 test files, **16/16 tests** passed |
| `npm run build` | 0 | PASS | Server: `dist/server/`; Client: `dist/client/` via Vite 6.4.5 |

## Test breakdown by file

### `tests/config.test.ts` — 14 tests PASS  
_(Expanded from 4 in session 1)_

| Test | Class | Result |
|---|---|---|
| Loads valid default config | LOCAL | PASS |
| Defaults to `npx @celo/buy@latest` as Buy CLI | LOCAL | PASS |
| Correctly parses boolean flag transforms | LOCAL | PASS |
| Rejects invalid NODE_ENV values | LOCAL | PASS |
| Parses comma-separated allowlists into arrays | LOCAL | PASS |
| Rejects placeholder SESSION_SECRET in production | LOCAL | PASS |
| Rejects SESSION_SECRET < 32 chars in production | LOCAL | PASS |
| Rejects placeholder OPERATOR_PASSWORD_HASH in production | LOCAL | PASS |
| Allows valid production config with all required fields | LOCAL | PASS |
| Rejects production with BUY_ENABLED=true + zero daily budget | LOCAL | PASS |
| Rejects production with BUY_ENABLED=true + zero per-call cap | LOCAL | PASS |
| BUY_ENABLED defaults to false in all environments | LOCAL | PASS |
| CENCORI_ENABLED defaults to false in all environments | LOCAL | PASS |
| All spending limits default to zero | LOCAL | PASS |

### `tests/health.test.ts` — 2 tests PASS

| Test | Class | Result |
|---|---|---|
| GET /api/health returns 200 with API envelope | LOCAL | PASS |
| CORS headers set correctly for configured origin | LOCAL | PASS |

## Test class breakdown

- **LOCAL:** 16 passed  
- **MOCKED:** 0  
- **LIVE_MAINNET_PAID:** 0 (not permitted without operator approval)  
- **NOT_TESTED:** Database migrations, E2E browser tests, Buy paid call integration  
