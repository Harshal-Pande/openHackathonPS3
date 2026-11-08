# RevertLens — Cloud Deployment & Production Container Readiness Guide

**Document Version:** 2.0.0 (MOD-05A.1 Pre-Deployment Audit)
**Hackathon:** Agents on Open Rails 2026 | Track PS3 — Build with Buy
**Target Blockchain:** Celo Mainnet (`eip155:42220` / `0xa4ec`)
**Deployment Target:** Cloud Container (Render, Railway, or Fly.io Docker Web Service)
**Current Lifecycle State:** `READY_FOR_PUBLIC_CLOUD_DEPLOYMENT` (Scheduled for Module MOD-06)

---

## 1. Overview & Single-Container Architecture

RevertLens is engineered as a single, self-contained, high-performance containerized application:
- **Fastify 5 Backend:** Serves the REST API (`/api/*`), health probes (`/api/health`), ERC-8004 metadata (`/api/agent/metadata`), and static frontend assets.
- **React 19 + Vite Frontend:** Pre-compiled into `dist/client/` and served directly by Fastify with SPA routing fallback.
- **Native SQLite Persistence:** Operates via Node.js 22 native `node:sqlite` with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and busy timeout (5,000 ms) stored on a persistent volume mounted at `/app/data`.
- **Zero Daemon Dependencies:** Requires no external database daemon (PostgreSQL/Redis); fully self-contained.

---

## 2. Multi-Stage Dockerfile Verification

The project root contains a verified production `Dockerfile`:

```dockerfile
# Multi-stage container build for Node.js 22 LTS
FROM node:22-alpine AS builder
WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source and configurations
COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src

# Compile server and bundle client
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/revertlens.sqlite

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled artifacts from builder
COPY --from=builder /app/dist ./dist

# Create persistent storage mountpoint and set permissions
RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["node", "dist/server/index.js"]
```

### Dockerfile Key Security & Operational Properties:
1. **Node 22 Alpine Base:** Minimal attack surface and lightweight image size (~180 MB).
2. **Deterministic Builds:** Uses `npm ci` strictly pinned to `package-lock.json`.
3. **Non-Root User:** Runs as unprivileged `node` user (`USER node`).
4. **Host Binding:** Binds strictly to `0.0.0.0` for container ingress routing.
5. **Persistent Mountpoint:** Uses `/app/data` with ownership assigned to `node`.

---

## 3. Production Environment Safeguards (`src/server/config.ts`)

When `NODE_ENV=production`, RevertLens automatically runs `enforceProductionInvariants()` on startup, failing fast if security invariants are violated:

| Variable | Requirement in Production | Invariant Enforcement |
|:---|:---:|:---|
| `NODE_ENV` | Mandatory | Must equal `'production'`. |
| `PORT` | Optional | Defaults to `3000`. |
| `HOST` | Mandatory | Set to `0.0.0.0` in container. |
| `DATABASE_PATH` | Mandatory | Must be an absolute path (e.g. `/app/data/revertlens.sqlite`). `:memory:` is rejected. |
| `PUBLIC_BASE_URL` | Mandatory | Must be an absolute HTTPS URL (`https://...`). Embedded credentials, `localhost`, loopback IPs (`127.0.0.0/8`, `::1`), and private RFC 1918 IPs are strictly rejected. |
| `SESSION_SECRET` | Mandatory | High-entropy secret (>= 32 chars). Placeholders like `REPLACE_WITH...` are rejected. |
| `OPERATOR_PASSWORD_HASH` | Mandatory | Versioned scrypt hash (`scrypt$v=1$N=16384$r=8$p=1$...`). Cannot match `SESSION_SECRET`. |
| `CORS_ORIGIN` | Mandatory | Explicit origin (e.g. `https://revertlens.onrender.com`). Wildcard `*` is rejected. |
| `CHAINSTACK_CELO_MAINNET_RPC_URL` | Mandatory | Valid HTTPS RPC URL to Celo Mainnet archive node. |
| `CELO_ATTRIBUTION_TAG` | Immutable | Must match `celo_235f6ef56f5b`. |
| `AGENT_WALLET_ADDRESS` | Immutable | Must match `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`. |

---

## 4. Health Check Probes & Graceful Shutdown

### Health Check Endpoint:
- **Path:** `GET /api/health`
- **Port:** `3000`
- **Expected Status:** `200 OK`
- **Readiness Response:**
  ```json
  {
    "data": {
      "status": "ok",
      "version": "0.1.0",
      "chainId": 42220,
      "featureFlags": {
        "buyEnabled": false,
        "cencoriEnabled": false,
        "chainstackConfigured": true
      },
      "buyReady": false
    },
    "error": null,
    "requestId": "..."
  }
  ```

### Graceful Shutdown:
The Fastify server intercepts `SIGTERM` and `SIGINT` signals:
1. Stops accepting new inbound HTTP requests.
2. Waits for active requests to finish (with 10-second timeout).
3. Safely checkpoints SQLite WAL and closes database connection.
4. Exits with status `0`.

---

## 5. Operator Deployment Runbook (For Module MOD-06)

> [!IMPORTANT]
> The steps below are executed by the human operator during **Module MOD-06**.
> Antigravity does not execute cloud provisioning without operator authorization.

### Option A: Render Deployment (Recommended)
1. Log into [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Connect repository: `https://github.com/Harshal-Pande/openHackathonPS3`.
4. Choose **Docker** runtime environment.
5. In **Disks**, add a persistent volume:
   - **Name:** `revertlens-data`
   - **Mount Path:** `/app/data`
   - **Size:** 1 GB
6. In **Environment Variables**, configure the production variables from Section 3.
7. Click **Create Web Service**.
8. Once deployment is healthy, copy the assigned HTTPS domain (e.g. `https://revertlens.onrender.com`) and update `PUBLIC_BASE_URL` in Render settings.

### Option B: Railway Deployment
1. Log into [Railway Dashboard](https://railway.app).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select `openHackathonPS3`.
4. Add Volume: mount `/app/data`.
5. Configure Environment Variables.
6. Generate public domain under **Settings** -> **Domains**.

---

## 6. Post-Deployment Verification Checklist (MOD-06 Acceptance)

Once deployed to public cloud:
1. `curl https://<DEPLOYED_DOMAIN>/api/health` -> returns `200 OK`.
2. `curl https://<DEPLOYED_DOMAIN>/api/agent/metadata` -> returns valid ERC-8004 JSON metadata with public domain endpoints.
3. `curl https://<DEPLOYED_DOMAIN>/api/agent/erc8004-registration-tx` -> returns `readinessStatus: "READY_FOR_OPERATOR_SIGNATURE"`.
4. Run live investigation in web browser against transaction `0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445`.
5. Proceed to **MOD-05B** for live on-chain ERC-8004 registration transaction broadcast.
