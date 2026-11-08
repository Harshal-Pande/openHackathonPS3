# Phase 9 — Cloud Deployment Readiness & Checklist
**Audit Date:** November 7, 2026  
**Deployment Status:** `NOT DEPLOYED` (Awaiting Human Operator Authorization)  
**Target Hosts Evaluated:** Railway (Primary Recommended) / Render / Fly.io

---

## 1. Cloud Readiness Evaluation Matrix

| Architectural Dimension | Verification Level | Evaluation & Concrete Implementation |
|:---|:---:|:---|
| **1. Persistent Volume Mount** | `CONFIGURATION_VERIFIED` | SQLite requires persistent storage across restarts. Mount persistent volume at `/app/data` to ensure `revertlens.sqlite` persists. |
| **2. Production Invariants** | `LOCALLY_VERIFIED` | Server refuses to start if `DATABASE_PATH` is `:memory:` or if `CORS_ORIGIN` is `*`. Hardened in `src/server/config.ts`. |
| **3. Session Secrets** | `CONFIGURATION_VERIFIED` | `SESSION_SECRET` must be a high-entropy string (>= 32 characters) generated via `openssl rand -hex 32`. Placeholder rejected on startup. |
| **4. CORS & Cookie Flags** | `LOCALLY_VERIFIED` | Production CORS requires explicit domain allowlist (`https://revertlens.app`). Operator cookies enforce `HttpOnly; SameSite=Strict; Path=/`. |
| **5. Health Check Monitoring** | `LOCALLY_VERIFIED` | Endpoint `GET /api/health` returns HTTP 200 with standard API envelope and chain ID 42220 verification. |
| **6. Static Frontend Routing** | `LOCALLY_VERIFIED` | Single deployable Fastify process serves both REST API (`/api/*`) and React 19 SPA (`/` and `/assets/*`) with directory traversal protection. |
| **7. Secret Redaction** | `LOCALLY_VERIFIED` | Error handlers replace all occurrences of `https?://...` with `[REDACTED_RPC_ENDPOINT]`, preventing RPC token leaks in logs. |
| **8. Rate Limiting & Auth** | `LOCALLY_VERIFIED` | Operator login rate-limited (max 5 failed attempts per 15 minutes per IP); timing-safe SHA-256 password comparison. |
| **9. Graceful Shutdown** | `LOCALLY_VERIFIED` | Handles `SIGTERM` / `SIGINT` signals, closes HTTP listeners and flushes SQLite WAL buffers. |
| **10. Cloud Host Verification** | `NOT_VERIFIED_IN_CLOUD` | Application has run in local production mode on Node 22, but has **not** been launched on public cloud infrastructure. |

---

## 2. Platform-Specific Deployment Checklist: Railway (Recommended)

Railway is recommended because it provides Dockerfile auto-detection, persistent volume attachments, and automated HTTPS certificates.

### Step 1: Pre-Deployment Preparation
- [ ] Operator opens Railway Dashboard (`https://railway.app`).
- [ ] Create New Project -> "Deploy from GitHub repo".
- [ ] Select repository `Harshal-Pande/openHackathonPS3` (branch `main`).

### Step 2: Storage Volume Attachment (CRITICAL)
- [ ] Add a **Persistent Volume** in Railway service settings.
- [ ] Set Mount Path strictly to: `/app/data`.
- [ ] Set Volume Size: 1 GB (sufficient for ~50,000 investigations).

### Step 3: Environment Variables Configuration
Set the following environment variables in the Railway dashboard:
```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_PATH=/app/data/revertlens.sqlite
CORS_ORIGIN=https://<your-railway-domain>.up.railway.app
SESSION_SECRET=<generate_32_byte_random_hex_string>
OPERATOR_PASSWORD_HASH=<argon2id_hash_of_operator_password>
CHAINSTACK_CELO_MAINNET_RPC_URL=<your_confidential_chainstack_growth_endpoint>
BUY_ENABLED=false
CENCORI_ENABLED=false
```

### Step 4: Health Check Configuration
- [ ] Configure Health Check Path: `/api/health`.
- [ ] Health Check Timeout: 15 seconds.

### Step 5: Post-Deployment Smoke Test
- [ ] Visit `https://<your-railway-domain>.up.railway.app/`. Confirm homepage renders.
- [ ] Visit `https://<your-railway-domain>.up.railway.app/api/health`. Confirm `status: "ok"`, `chainId: 42220`.
- [ ] Submit candidate transaction `0xb90bcca5...`. Confirm forensic diagnosis renders.
- [ ] Test JSON export download. Confirm downloaded report parses validly.

---

## 3. Explicit Cloud Deployment Status
> **CURRENT CLOUD STATUS:** **`NOT DEPLOYED`**  
> All preparation is complete. Execution requires human operator action and secret provisioning.
