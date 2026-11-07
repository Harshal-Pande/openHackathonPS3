# RevertLens — Production Deployment Readiness Guide
**Document Version:** 1.0.0 (Phase 7 Release Candidate)  
**Status:** READY FOR PUBLIC CLOUD DEPLOYMENT (CONTAINER & RUNTIME PREPARED)

---

## 1. Overview & Architecture

RevertLens is designed as a single, self-contained, deployable process:
- **Backend:** Fastify HTTP server serving the REST API (`/api/*`) and health probes.
- **Frontend:** Pre-built static SPA (Vite + React) served directly by Fastify or via an edge reverse proxy / CDN.
- **Database:** SQLite (`node:sqlite`) with persistent volume storage for investigation history, evidence items, and quote ledgers.
- **Upstream RPC:** Direct HTTPS connection to an Elastic Global Chainstack Celo Mainnet Archive node.

---

## 2. Runtime & Hardware Requirements

| Requirement | Minimum Specification | Recommended |
|:---|:---|:---|
| **Node.js** | Node.js 22.x LTS (`node:sqlite` enabled) | Node.js 22.17+ |
| **RAM** | 512 MB | 1 GB |
| **vCPU** | 0.5 vCPU | 1 vCPU |
| **Disk Storage** | 1 GB persistent SSD volume | 5 GB SSD volume |
| **Network** | Outbound HTTPS (443) access to Chainstack RPC & Buy Gateway | 100 Mbps |

---

## 3. Environment Variables (Names & Purpose Only)

| Variable Name | Required in Prod? | Description / Value Guidance |
|:---|:---:|:---|
| `NODE_ENV` | **YES** | Set strictly to `production`. |
| `PORT` | Optional | Port for the HTTP listener (default: `3000`). |
| `HOST` | Optional | Binding host IP (default: `0.0.0.0`). |
| `DATABASE_PATH` | **YES** | Persistent file path (e.g. `/app/data/revertlens.sqlite`). Cannot be `:memory:`. |
| `CHAINSTACK_CELO_MAINNET_RPC_URL` | **YES** | Secret HTTPS RPC URL for Celo Mainnet archive node. |
| `SESSION_SECRET` | **YES** | Cryptographically random secret (>= 32 characters). |
| `OPERATOR_PASSWORD_HASH` | **YES** | Argon2id hash of the operator access password. |
| `CORS_ORIGIN` | **YES** | Explicit public frontend origin (e.g. `https://revertlens.app`). Cannot be `*`. |
| `PUBLIC_BASE_URL` | Optional | Public URL of the deployed application. |
| `BUY_ENABLED` | Optional | Boolean flag to enable Buy payments (defaults to `false`). |
| `CENCORI_ENABLED` | Optional | Boolean flag to enable Cencori AI (defaults to `false`). |
| `BUY_DAILY_BUDGET_ATOMIC` | Required if Buy on | Daily spending cap in token atomic units. |
| `BUY_PER_CALL_CAP_ATOMIC` | Required if Buy on | Per-call cap in token atomic units. |

---

## 4. Build & Startup Commands

### Native Linux / Cloud Host
```bash
# 1. Install production dependencies
npm ci

# 2. Typecheck and build
npm run typecheck
npm run build

# 3. Start server
NODE_ENV=production node dist/server/index.js
```

### Docker Container
```bash
# 1. Build container image
docker build -t revertlens:0.1.0 .

# 2. Run container with persistent volume
docker run -d \
  --name revertlens \
  -p 3000:3000 \
  -v revertlens_data:/app/data \
  --env-file .env.production \
  revertlens:0.1.0
```

---

## 5. Health Check & Monitoring

- **Endpoint:** `GET /api/health`
- **Expected Status Code:** `200 OK`
- **Response Format:**
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

---

## 6. Hosting Platform Recommendations

1. **Railway (Recommended for Hackathon Demo):**
   - Supports persistent volume mounts for SQLite (`/app/data`).
   - Built-in GitHub auto-deploy from `Dockerfile`.
   - Free tier / low-cost credits sufficient for demo.
2. **Render:**
   - Supports Web Service with Persistent Disk.
   - Built-in HTTPS SSL certificates.
3. **Fly.io:**
   - Excellent edge SQLite support with Fly Volumes.

---

## 7. Exact Remaining Operator Actions Before Deployment

1. Select hosting provider (e.g. Railway or Render).
2. Create project and attach a persistent storage volume mounted at `/app/data`.
3. Set production environment variables (with non-placeholder secrets and valid Chainstack URL).
4. Run deployment and verify `GET /api/health`.
