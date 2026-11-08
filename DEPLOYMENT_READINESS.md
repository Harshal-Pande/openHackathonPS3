# RevertLens — Production Container & Cloud Deployment Readiness Guide

**Document Version:** 2.1.0 (MOD-06.1 Docker & Container Runtime Verification)
**Hackathon:** Agents on Open Rails 2026 | Track PS3 — Build with Buy
**Target Blockchain:** Celo Mainnet (`eip155:42220` / `0xa4ec`)
**Deployment Target:** Local Container Runtime / Cloud Container (Render, Railway, or Fly.io Docker Web Service)
**Current Milestone:** `MOD-06.1 — DOCKER AND RUNTIME READINESS`
**Downstream Milestone:** `MOD-06.2 — PUBLIC DEPLOYMENT AND LIVE ENDPOINT VERIFICATION`

---

## 1. Container Architecture & Multi-Stage Build

RevertLens is packaged as a single, multi-stage, production-hardened container:

- **Base Image:** Node.js 22 LTS Alpine (`node:22-alpine`) providing a minimal attack surface and lightweight image footprint (~180 MB).
- **Builder Stage:**
  - Installs full dependencies via `npm ci` strictly pinned to `package-lock.json`.
  - Compiles TypeScript Fastify backend (`tsc -p tsconfig.server.json` -> `dist/server`).
  - Bundles React 19 frontend (`vite build` -> `dist/client`).
- **Runner Stage:**
  - Fresh `node:22-alpine` container with development dependencies and source code excluded.
  - Installs production-only dependencies using `npm ci --omit=dev`.
  - Copies compiled artifacts (`dist/`) from the builder stage.
  - Creates persistent volume directory `/app/data` owned by `node:node`.
  - Runs strictly as unprivileged user `USER node` (UID non-zero).
  - Binds to `0.0.0.0:3000`.
  - Includes a native Node.js 22 health check probe (no `curl` or `wget` dependencies).
  - Handles `SIGTERM` and `SIGINT` signals with graceful Fastify request draining and SQLite WAL flush.

```dockerfile
# RevertLens Production Containerfile
# Single multi-stage container build for Node 22 LTS

FROM node:22-alpine AS builder
WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source files
COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src

# Build server and client
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

# Copy compiled artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Create persistent data volume mountpoint
RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/index.js"]
```

---

## 2. Local Docker Commands & Volume Management

The following commands operate RevertLens locally using Docker and a persistent named volume:

### 2.1 Build Production Image
```bash
docker build -t revertlens:mod06-1 .
```

### 2.2 Create Persistent Named Volume
```bash
docker volume create revertlens-data
```

### 2.3 Run Production Container (Local Verification Mode)
> [!NOTE]
> Pass strong secrets via environment variables. `BUY_ENABLED=false` ensures zero-spend operation.
```bash
docker run -d \
  --name revertlens \
  -p 3000:3000 \
  -v revertlens-data:/app/data \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e HOST=0.0.0.0 \
  -e DATABASE_PATH=/app/data/revertlens.sqlite \
  -e SESSION_SECRET="example_random_session_secret_32_chars_minimum" \
  -e OPERATOR_PASSWORD_HASH="scrypt$v=1$N=16384$r=8$p=1$MTIzNDU2Nzg5MDEyMzQ1Ng==$lz+/lmHQGUWcL7lg4806U5pUvi6ksAUVulQc8tB+0Mw=" \
  -e CORS_ORIGIN="http://localhost:3000" \
  -e PUBLIC_BASE_URL="https://revertlens.net" \
  -e CHAINSTACK_CELO_MAINNET_RPC_URL="https://celo-mainnet.core.chainstack.com/your-endpoint-key" \
  -e BUY_ENABLED=false \
  -e CENCORI_ENABLED=false \
  revertlens:mod06-1
```

### 2.4 Verify Container Health & Status
```bash
# Check container status and Docker health check status
docker ps --filter "name=revertlens"

# Probe health endpoint from host
curl -s http://127.0.0.1:3000/api/health | jq

# View container runtime logs
docker logs revertlens
```

### 2.5 Stop and Restart (Verifying SQLite Persistence)
```bash
# Graceful stop (triggers SIGTERM, Fastify close, and SQLite WAL checkpoint)
docker stop revertlens

# Restart container using existing persistent volume
docker start revertlens

# Inspect persistent volume contents
docker run --rm -v revertlens-data:/data alpine ls -la /data
```

---

## 3. Production Environment Configuration Specification

The container configuration is strictly validated by `enforceProductionInvariants()` in `src/server/config.ts`. Insecure or placeholder configurations fail fast on boot:

### 3.1 Required Production Variables
| Variable | Validation Rule | Purpose |
|:---|:---|:---|
| `NODE_ENV` | Must equal `'production'`. | Enables production security invariants. |
| `PORT` | Number (default `3000`). | Container HTTP port. |
| `HOST` | Must be `'0.0.0.0'` in container. | Ingress network binding. |
| `DATABASE_PATH` | Non-empty persistent path. Cannot be `:memory:`. | SQLite database location. |
| `PUBLIC_BASE_URL` | Valid absolute HTTPS URL. No loopback, link-local, or private RFC 1918 IPs. | Canonical agent origin for metadata. |
| `SESSION_SECRET` | String >= 32 chars. Cannot be placeholder. | Signs operator session tokens. |
| `OPERATOR_PASSWORD_HASH` | Valid scrypt format string. Cannot match `SESSION_SECRET`. | Authenticates operator operations. |
| `CORS_ORIGIN` | Explicit URL allowlist. Wildcard `*` rejected. | Cross-origin resource sharing. |
| `CHAINSTACK_CELO_MAINNET_RPC_URL` | HTTPS RPC endpoint to Celo Mainnet node. | Node RPC for forensic analysis. |

### 3.2 Fixed Product Identifiers (Immutable)
| Variable | Value | Purpose |
|:---|:---|:---|
| `CELO_ATTRIBUTION_TAG` | `celo_235f6ef56f5b` | ERC-8021 ecosystem attribution tag. |
| `AGENT_WALLET_ADDRESS` | `0x3e1bef07824cd0E076F4907641F0A0EF27898e52` | Intended agent operator wallet. |

### 3.3 Buy Marketplace Integration (Disabled by Default)
| Variable | Default Value | Notes |
|:---|:---:|:---|
| `BUY_ENABLED` | `false` | Disabled for MOD-06.1 container runtime. Zero spend. |
| `CENCORI_ENABLED` | `false` | Disabled. Uses deterministic heuristic classifier. |
| `BUY_DAILY_BUDGET_ATOMIC` | `'0'` | Enforced in deterministic server code. |
| `BUY_PER_CALL_CAP_ATOMIC` | `'0'` | Atomic cap per transaction. |

---

## 4. SQLite Persistent Storage & WAL Guarantees

RevertLens utilizes Node.js 22 built-in `node:sqlite`:
- **Mount Path:** `/app/data` (mapped to persistent storage volume).
- **Database File:** `/app/data/revertlens.sqlite`.
- **Journal Mode:** Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) allowing concurrent reads while writes are active.
- **Busy Timeout:** `PRAGMA busy_timeout = 5000;` preventing lock starvation.
- **Synchronous Mode:** `PRAGMA synchronous = NORMAL;` optimal for WAL integrity.
- **Persistence Across Restarts:** Investigation reports, evidence items, and payment ledgers remain fully durable across container restarts.

---

## 5. Graceful Shutdown & Signal Handling

The server lifecycle in `src/server/index.ts` and `src/server/app.ts` traps `SIGTERM` and `SIGINT`:
1. `handleSignal(signal)` sets an atomic shutdown flag.
2. Fastify stops accepting new inbound connections and drains existing in-flight HTTP requests.
3. Fastify `onClose` hook cleanly executes `db.close()`, flushing pending SQLite WAL records to disk and closing file descriptors.
4. An unref'd 10-second timeout ensures the process exits cleanly even if external connections hang.
5. Exit code `0` is emitted.

---

## 6. Deployment Limitations & Separation of Concerns

To maintain strict truth-in-reporting and avoid premature claims:

| Milestone / Capability | State | Scope & Boundaries |
|:---|:---:|:---|
| **Local Container Build** | **VERIFIED** | Multi-stage Dockerfile, non-root execution, health check, production dependencies. |
| **Local SQLite Persistence** | **VERIFIED** | WAL mode, 5000ms timeout, persistent volume persistence verified across test suite. |
| **Public Cloud Deployment** | **PENDING (MOD-06.2)** | Requires deploying container to Render or Railway with public HTTPS URL. |
| **ERC-8004 Live Registration** | **BLOCKED (MOD-05B)** | Awaits live public HTTPS metadata endpoint before transaction signing and broadcast. |
| **Paid Buy Settlements** | **DISABLED ($0.00)** | `BUY_ENABLED=false`. All operations run in zero-spend forensic mode. |

---

## 7. Cloud Hosting Provider Evaluation Matrix (MOD-06.2)

To satisfy the **$0 spend mandate** while providing a live public HTTPS endpoint and evaluating persistent storage options:

| Hosting Provider | Docker Build | Persistent Disk on Free Tier | Automatic HTTPS | Free Tier Policy & Ceilings | Payment Card Required? | Risk of Charges | Recommendation Status |
|:---|:---:|:---:|:---:|:---|:---:|:---:|:---:|
| **Railway** | **Yes** | **Yes (0.5 GB Volume)** | **Yes** (`.up.railway.app`) | 30-day free trial ($5 credit), 0.5 GB RAM, 1 vCPU | **No (Trial)** | None during trial | **RECOMMENDED (Persistence)** |
| **Render** | **Yes** | **No (Ephemeral only)** | **Yes** (`.onrender.com`) | Free Web Service (0.5 CPU, 512 MB RAM), spins down after 15m | **No** | None ($0 permanent) | **RECOMMENDED (Zero-Card Permanent)** |
| **Fly.io** | Yes | No ($0.15/GB/mo) | Yes | Trial only; perpetual free tier discontinued | **Yes** | Risk of monthly charges | **DISQUALIFIED ($0 violation)** |
| **Koyeb** | Yes | No (Paid plans only) | Yes | 1 free instance, scales to zero after 1h | **Yes ($29 hold)** | Pre-auth hold required | **DISQUALIFIED ($0 violation)** |

### 7.1 Detailed Provider Analysis

1. **Option A: Railway (Best for True SQLite Persistence)**
   - **How it works:** Railway allows signing up via GitHub with **no credit card required** for a 30-day trial with $5 usage credit.
   - **Persistent Volume:** Allows creating and attaching a `0.5 GB` persistent volume mounted at `/app/data`.
   - **Downtime/Sleep:** Does not sleep during the trial period as long as credits remain.
   - **Trade-off:** After 30 days, the service pauses unless upgraded or re-provisioned.

2. **Option B: Render (Best for Perpetual $0 Free Tier Without Credit Card)**
   - **How it works:** Render allows creating a free Web Service directly from GitHub with **no credit card required**.
   - **Persistent Storage Limitation:** Render's free tier strictly disallows persistent disks. Disk files are stored in the container's ephemeral layer and reset whenever the service spins down (after 15 minutes of idle traffic) or redeploys.
   - **Trade-off:** Ideal for judge demonstrations and live testing, but forensic report history is cleared upon container sleep/reboot.

---

## 8. Operator Cloud Deployment Runbook

### Step 1: Choose Provider
- If persistent SQLite volume across restarts without a credit card is desired for the 30-day hackathon window: Select **Railway**.
- If a permanent free URL without credit card is preferred (with ephemeral SQLite): Select **Render**.

### Step 2: Configure Environment Variables in Provider Dashboard
In the provider dashboard settings, configure:
```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_PATH=/app/data/revertlens.sqlite
PUBLIC_BASE_URL=https://<YOUR_ASSIGNED_DOMAIN>
SESSION_SECRET=<GENERATE_RANDOM_32_CHAR_STRING>
OPERATOR_PASSWORD_HASH=scrypt$v=1$N=16384$r=8$p=1$MTIzNDU2Nzg5MDEyMzQ1Ng==$lz+/lmHQGUWcL7lg4806U5pUvi6ksAUVulQc8tB+0Mw=
CORS_ORIGIN=https://<YOUR_ASSIGNED_DOMAIN>
CHAINSTACK_CELO_MAINNET_RPC_URL=https://celo-mainnet.core.chainstack.com/<YOUR_KEY>
BUY_ENABLED=false
CENCORI_ENABLED=false
```

### Step 3: Attach Volume (If using Railway)
- Add Volume -> Mount Path: `/app/data` -> Size: `0.5 GB`.

### Step 4: Deploy and Verify
Once deployed, provide the assigned domain to Antigravity to run the live verification suite:
- `GET https://<YOUR_ASSIGNED_DOMAIN>/api/health`
- `GET https://<YOUR_ASSIGNED_DOMAIN>/api/agent/metadata`
- `GET https://<YOUR_ASSIGNED_DOMAIN>/`
