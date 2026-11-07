# RevertLens — Master Deployment & Infrastructure Audit
**Document Version:** 1.0.0  
**Target Container:** Node 22 LTS Alpine Multi-Stage Container  
**Evaluation Standard:** `DEPLOYMENT_READINESS.md` & `Dockerfile`  

---

## 1. Containerization & Dockerfile Audit

The application defines a production-ready container build in `Dockerfile`:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/revertlens.sqlite
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
```

### Static Inspection Checklist
- **Base Image:** `node:22-alpine` (minimal attack surface, ~50MB base).
- **Multi-Stage Build:** Build tools (`vite`, `tsc`) discarded in builder stage; runner image contains only production dependencies (`npm ci --omit=dev`).
- **Security:** Runs under unprivileged user `USER node` instead of `root`.
- **Persistent Volume:** Declares persistent directory `/app/data` with ownership assigned to `node:node`.
- **Single Process:** Fastify serves both the REST API and the compiled React SPA bundle on port 3000.
- **Docker Ignore:** `.dockerignore` excludes `node_modules`, `.env`, `*.sqlite`, `coverage`, and `.git`.

---

## 2. Host Docker Runtime Status

- **Host Environment:** Windows 10/11 x64.
- **Docker Daemon Status:** Not installed on the local host machine (`docker: The term 'docker' is not recognized`).
- **Categorization:** `NOT_TESTED / HOST_ENGINE_UNAVAILABLE`.
- **Audit Decision:** The Dockerfile and `.dockerignore` pass complete static analysis. In accordance with zero-assumptions policy, container runtime execution is explicitly marked `NOT_TESTED` locally.

---

## 3. Cloud Deployment Readiness

RevertLens is architected to deploy seamlessly to modern cloud platforms without code changes:

### A. Render (Web Service + Persistent Disk)
- **Runtime:** Node.js or Docker.
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm start`
- **Disk Mount:** Mount persistent disk at `/app/data` (or `data/`).

### B. Railway (Nixpacks / Dockerfile)
- **Automatic Detection:** Railway detects Node 22 and runs `npm run build` and `npm start`.
- **Volume Mount:** Attach volume to `/app/data`.

### C. Fly.io
- **Config:** `fly launch` generates `fly.toml` deploying the multi-stage `Dockerfile`.
- **Volume Mount:** `fly volumes create revertlens_data --size 1` mounted at `/app/data`.

---

## 4. Environment Variables Required for Production

| Variable | Required? | Production Value / Description |
|:---|:---:|:---|
| `NODE_ENV` | **YES** | Must be `production` |
| `PORT` | Optional | Defaults to `3000` |
| `HOST` | Optional | Defaults to `0.0.0.0` |
| `DATABASE_PATH` | **YES** | Must be persistent path (e.g. `/app/data/revertlens.sqlite`), cannot be `:memory:` |
| `CORS_ORIGIN` | **YES** | Specific production domain (cannot be `*`) |
| `CHAINSTACK_CELO_MAINNET_RPC_URL` | **YES** | HTTPS URL for Chainstack Celo Growth Node |
| `SESSION_SECRET` | **YES** | Random 32+ character secret |
| `OPERATOR_PASSWORD_HASH` | **YES** | Argon2id hash or SHA-256 operator password hash |
| `BUY_ENABLED` | Optional | Set to `true` when Buy CLI inference is subsidized |
| `CENCORI_ENABLED` | Optional | Set to `true` when Cencori AI is activated |
