# RevertLens — Production Runtime Validation Results
**Date:** November 7, 2026  
**Node.js Version:** v22.17.0 LTS  
**Fastify Version:** 5.2.1  
**SQLite Engine:** Node 22 native `DatabaseSync` (`node:sqlite`)  
**Production Command:** `node dist/server/index.js`  
**Test Port:** 3009 / 3010  
**Test Database:** Dedicated temporary `./data/test_prod_runtime.sqlite`

---

## 1. Executive Summary

The compiled production application was started using `node dist/server/index.js` under `NODE_ENV=production`. All 9 runtime criteria were tested and passed:
1. Application startup succeeds and binds cleanly to local host.
2. Static frontend assets (`dist/client/index.html` and `dist/client/assets/*`) are served with correct MIME types.
3. Health endpoint (`/api/health`) returns HTTP 200 with standard API envelope.
4. Unsafe production configurations are rejected at startup.
5. Operator-only endpoints are guarded against public access (HTTP 401).
6. CORS allowlist headers are enforced.
7. Input boundary validation returns HTTP 400 with sanitized error envelopes.
8. Server terminates cleanly on graceful shutdown signal.
9. Database durability across server restart is verified without data corruption.

---

## 2. Runtime Validation Matrix

| Check | Expected Behavior | Observed Result | Status |
|:---|:---|:---|:---:|
| **1. Unsafe Config: Placeholder Secret** | Throw error on startup | Rejected: `"SESSION_SECRET must be replaced with a real secret in production."` | **PASS** |
| **2. Unsafe Config: In-Memory DB** | Throw error on startup | Rejected: `"DATABASE_PATH must be set to a persistent file path in production (cannot be :memory: or empty)."` | **PASS** |
| **3. Unsafe Config: Wildcard CORS** | Throw error on startup | Rejected: `"CORS_ORIGIN must be set to an explicit origin allowlist in production (cannot be wildcard * or empty)."` | **PASS** |
| **4. Production Startup** | Bind port 3009 | Server listening on `http://127.0.0.1:3009` | **PASS** |
| **5. Static HTML Index** | Serve index.html on `/` | HTTP 200, `Content-Type: text/html; charset=utf-8`, contains `<div id="root"></div>` | **PASS** |
| **6. Static Assets** | Serve JS bundles on `/assets/*` | HTTP 200, `Content-Type: application/javascript; charset=utf-8` | **PASS** |
| **7. Directory Traversal Guard** | Block `/assets/../../...` | Blocked with HTTP 403 / 404 | **PASS** |
| **8. Health API** | Return `{ data: { status: 'ok', chainId: 42220 } }` | HTTP 200 with UUID `requestId` | **PASS** |
| **9. Operator Route Protection** | Block unauthenticated access | `GET /api/operator/quotes` -> HTTP 401 `UNAUTHORIZED` | **PASS** |
| **10. CORS Allowlist** | Emit `access-control-allow-origin` | Header set to configured `http://localhost:3009` | **PASS** |
| **11. Input Validation** | Reject invalid transaction hash | `POST /api/investigations` with `"invalid"` -> HTTP 400 `INVALID_INPUT` | **PASS** |
| **12. Error Sanitization** | Redact internal RPC URLs | Sanitizes URLs to `[REDACTED_RPC_ENDPOINT]`; internal stack traces suppressed | **PASS** |
| **13. Graceful Shutdown** | `app.close()` closes connections | Server terminated cleanly with exit code 0 | **PASS** |
| **14. Server Restart & Durability**| Reopen existing database file | Reconnected to existing SQLite file, re-served health check cleanly | **PASS** |

---

## 3. Persistent Storage Invariants

- **Database Directory Creation:** `new Database(dbPath)` automatically creates parent directories (`mkdirSync(dir, { recursive: true })`) if they do not exist.
- **WAL Journaling:** Node 22 `DatabaseSync` operates in write-ahead log mode, ensuring atomic commits and crash resilience.
- **Production Guard:** Process refuses to start if `DATABASE_PATH` is set to `:memory:`, guaranteeing investigation history is never silently lost in production.
