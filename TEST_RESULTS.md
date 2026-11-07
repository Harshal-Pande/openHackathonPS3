# Test Results

**Date/time:** 2026-11-07 06:00:00 UTC  
**Commit:** Working directory uncommitted  
**Node:** v22.17.0  
**npm:** 11.6.1  

| Command | Exit code | Result | Evidence |
|---|---:|---|---|
| `npm install` | 0 | PASS | 250 packages installed cleanly |
| `npm run typecheck` | 0 | PASS | `tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.client.json --noEmit` exited 0 |
| `npm test` | 0 | PASS | Vitest 6/6 tests passed (config.test.ts, health.test.ts) |
| `npm run build` | 0 | PASS | Backend compiled to `dist/server`, frontend built via Vite to `dist/client` |

## Test Class Breakdown

- **LOCAL:** 6 passed (Environment validation, boolean transforms, comma-separated lists, health check 200 envelope, CORS headers).
- **MOCKED:** 0.
- **LIVE_MAINNET:** Read-only live catalogue inspection & candidate transaction verification; no paid calls executed.
- **NOT_TESTED:** Database migrations (`npm run db:migrate`) and E2E browser tests (`npm run test:e2e`).
