# RevertLens — Multi-Environment Deployment Architecture (R1 & R2)

**Document Version:** 1.0.0  
**Phase:** Master Project Activation & Production Release (`REVERTLENS-MASTER-ACTIVATION-2026-01`)  
**Target Blockchain:** Celo Mainnet (`eip155:42220`)  

---

## 1. Architectural Model & Environment Separation

To satisfy multi-environment reliability, judge evaluation redundancy, and continuous uptime requirements without risking state pollution, RevertLens maintains **two completely independent production environments**:

```
+---------------------------------------------------------------------------------+
|                                 GIT REPOSITORY                                  |
|                 https://github.com/Harshal-Pande/openHackathonPS3.git           |
|                                  Branch: main                                   |
+---------------------------------------+-----------------------------------------+
                                        |
                   +--------------------+--------------------+
                   |                                         |
                   v                                         v
+-------------------------------------+   +-------------------------------------+
|         R1: PRIMARY PRODUCTION      |   |       R2: SECONDARY DEPLOYMENT      |
+-------------------------------------+   +-------------------------------------+
| URL:                                |   | URL:                                |
| https://revertlens-production.      |   | Set per provider (e.g.              |
| onrender.com                        |   | https://revertlens-r2.onrender.com) |
|                                     |   |                                     |
| Database:                           |   | Database:                           |
| Isolated persistent SQLite at       |   | Isolated persistent SQLite at       |
| /app/data/revertlens.sqlite         |   | /app/data/revertlens.sqlite         |
|                                     |   |                                     |
| Secrets:                            |   | Secrets:                            |
| Independent R1 SESSION_SECRET       |   | Independent R2 SESSION_SECRET       |
| Independent R1 OPERATOR_HASH        |   | Independent R2 OPERATOR_HASH        |
|                                     |   |                                     |
| CORS & Public Base URL:             |   | CORS & Public Base URL:             |
| Strictly bound to R1 domain         |   | Strictly bound to R2 domain         |
+-------------------------------------+   +-------------------------------------+
```

### Strict Non-Negotiable Invariants:
1. **Zero Credential Sharing:** `SESSION_SECRET` and `OPERATOR_PASSWORD_HASH` are generated independently for each environment.
2. **Zero Database Overlap:** SQLite databases are stored in isolated volumes and never shared across instances.
3. **Domain Binding:** `PUBLIC_BASE_URL` and `CORS_ORIGIN` must exactly match the host domain of that specific deployment. Cross-origin requests between R1 and R2 are blocked.
4. **Attribution Consistency:** Both environments run with official attribution tag `celo_235f6ef56f5b` and agent wallet `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`.
5. **Zero-Spend Default:** Both environments enforce `BUY_ENABLED=false` and `CENCORI_ENABLED=false` by default.

---

## 2. Environment Verification Protocol

For each deployment (R1 and R2), the following 10 verification steps must be confirmed:

| # | Check | Verification Method | Expected Result |
|:---:|:---|:---|:---|
| 1 | **HTTPS Connectivity** | `curl -Iv https://<domain>` | HTTP 200/302, valid TLS certificate |
| 2 | **Application Health** | `GET /api/health` | HTTP 200, status `ok`, chain ID `42220` |
| 3 | **Agent Metadata** | `GET /api/agent/metadata` | Valid EIP-8004 JSON referencing host domain |
| 4 | **Registration Preview** | `GET /api/agent/erc8004-registration-tx` | Tagged registration calldata generated |
| 5 | **RPC Connectivity** | `GET /api/operator/system-status` | RPC connected, latency < 1000ms |
| 6 | **Database Persistence** | Write investigation, restart, read back | Record survives container lifecycle |
| 7 | **Operator Auth** | `POST /api/operator/login` | Valid credentials unlock session, bad pass returns 401 |
| 8 | **Kill Switch** | `POST /api/operator/kill-switch` | Toggles state without process restart |
| 9 | **Forensic Investigation**| `POST /api/investigations` | Reconstructs trace, classifies revert |
| 10 | **Web UI Assets** | `GET /` and `/assets/*` | Vite bundle loaded, zero console errors |

---

## 3. Render Blueprint Deployment (`render.yaml`)

Both services can be deployed simultaneously on Render via the included [`render.yaml`](../render.yaml) Blueprint:

1. In Render Dashboard, click **New +** -> **Blueprint**.
2. Connect repository `Harshal-Pande/openHackathonPS3`.
3. Render automatically discovers services `revertlens-production` (R1) and `revertlens-r2` (R2).
4. Fill in the non-synced secrets (`OPERATOR_PASSWORD_HASH` and `CHAINSTACK_CELO_MAINNET_RPC_URL`).
5. Click **Apply**.
