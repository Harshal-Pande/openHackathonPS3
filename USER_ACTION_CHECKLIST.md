# RevertLens — User Action Checklist (Category A: Human-Owned Tasks)
**Document Version:** 1.0.0  
**Generated:** 2026-11-08  
**Audience:** Non-Technical Project Owner / Operator  
**Rule:** Only tasks strictly requiring human authorization, account access, external funding, or physical execution are listed here. Antigravity cannot and will not execute these on your behalf.  

---

## Quick Reference Summary

| Task ID | Action Summary | Money Involved? | Prerequisite | Est. Human Time |
|:---:|:---|:---:|:---|:---:|
| **USR-01** | Confirm Hackathon & Wallet Attribution Identity | **$0.00** | None | 3 mins |
| **USR-02** | Select & Create Free Cloud Hosting Account (Render/Railway/Fly.io) | **$0.00** (Free Tier) | None | 10 mins |
| **USR-03** | Provide Production Deployment Environment Variables | **$0.00** | USR-02 | 5 mins |
| **USR-04** | Authorize Git Push to GitHub Repository | **$0.00** | Antigravity Audit | 2 mins |
| **USR-05** | Deploy Application & Provide Live Public URL | **$0.00** | USR-03, USR-04 | 10 mins |
| **USR-06** | Fund Agent Wallet with Gas (~0.05 CELO / ~$0.02) | **~$0.02 USD** | USR-01 | 5 mins |
| **USR-07** | Approve & Broadcast Tagged ERC-8004 Registration Transaction | Gas Only (< $0.01) | USR-05, USR-06 | 5 mins |
| **USR-08** | Setup Buy CLI & Execute 1 Live Cencori AI Quote Settlement | **$0.01 USDC** | USR-06 | 10 mins |
| **USR-09** | Record 3-Minute Video Walkthrough Using Demo Script | **$0.00** | USR-05, USR-08 | 20 mins |
| **USR-10** | Submit Final Hackathon Form on DoraHacks / Hackathon Portal | **$0.00** | USR-09 | 10 mins |

---

## Detailed Step-by-Step Task Guides

### TASK USR-01: Confirm Hackathon & Wallet Attribution Identity
- **Why it is necessary:** The hackathon rules strictly associate submissions with an assigned wallet and attribution tag. If either changes, attribution tracking and judging verification will fail.
- **Action to perform:** Verify and confirm that the intended wallet address and attribution tag match your hackathon registration details:
  - Intended Agent Wallet: `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`
  - Assigned Event Attribution Tag: `celo_235f6ef56f5b`
  - Target Network: Celo Mainnet (Chain ID 42220)
  - Track: PS3 — Build with Buy
- **Website/App:** Your hackathon registration email / portal dashboard.
- **Cost:** **$0.00**.
- **Security Precaution:** Never post your private keys or seed phrase. Only confirm public addresses.
- **Successful Completion:** Confirming in chat: *"Confirmed: Wallet and attribution tag match hackathon registration."*
- **Evidence for Antigravity:** Written confirmation in chat.

---

### TASK USR-02: Select & Create Cloud Hosting Account
- **Why it is necessary:** RevertLens must be deployed to a publicly accessible HTTPS domain so judges, evaluators, and the ERC-8004 metadata registry can access it.
- **Action to perform:** Create an account on any standard cloud application platform with persistent disk support (e.g., Render, Railway, or Fly.io).
  - *Recommendation:* **Render** (Web Service, Docker environment) or **Railway**. Both offer free/low-cost tiers with automated GitHub deployment and persistent volume mounts for SQLite.
- **Website/App:** https://render.com or https://railway.app
- **Cost:** **$0.00** (Free starter tiers available).
- **Security Precaution:** Do not share your cloud account password. You will deploy via your own GitHub connection.
- **Successful Completion:** Cloud project created and ready to receive deployment.
- **Evidence for Antigravity:** Tell Antigravity which platform you chose (e.g., *"I have created a Render account"*).

---

### TASK USR-03: Configure Production Environment Variables Securely
- **Why it is necessary:** The deployed server needs configuration for RPC access, session encryption, and operator passwords without exposing secrets in Git.
- **Action to perform:** In your cloud hosting dashboard (e.g. Render/Railway Environment Settings), enter the following variables:
  - `NODE_ENV=production`
  - `PORT=3000`
  - `HOST=0.0.0.0`
  - `DATABASE_PATH=/app/data/revertlens.sqlite`
  - `CHAINSTACK_CELO_MAINNET_RPC_URL=<YOUR_CHAINSTACK_HTTPS_ENDPOINT>` (obtain from your Chainstack dashboard)
  - `SESSION_SECRET=<GENERATE_A_RANDOM_32_CHAR_STRING>` (e.g., run `openssl rand -hex 32` or generate 32+ random characters)
  - `OPERATOR_PASSWORD_HASH=<GENERATED_SCRYPT_HASH>` (generate locally via `node scripts/generate_password_hash.mjs`; enter the encoded `scrypt$v=1$...` hash, NEVER the plaintext password)
  - `RATE_LIMIT_INVESTIGATIONS_MAX=10`
  - `RATE_LIMIT_INVESTIGATIONS_WINDOW_MS=60000`
  - `TRUST_PROXY=true` (if deploying behind Render/Railway HTTPS reverse proxy)
  - `CORS_ORIGIN=https://<YOUR_DEPLOYED_APP_DOMAIN>`
  - `PUBLIC_BASE_URL=https://<YOUR_DEPLOYED_APP_DOMAIN>`
  - `BUY_ENABLED=false` (enable after settlement verification)
  - `CENCORI_ENABLED=false` (enable after settlement verification)
- **Website/App:** Cloud Provider Settings -> Environment Variables.
- **Cost:** **$0.00**.
- **Security Precaution:** **NEVER** share `CHAINSTACK_CELO_MAINNET_RPC_URL` or `SESSION_SECRET` in public chats or Git commits.
- **Successful Completion:** All variables saved in the cloud dashboard.
- **Evidence for Antigravity:** Confirm all environment variables are saved in your provider dashboard.

---

### TASK USR-04: Authorize Git Push to GitHub
- **Why it is necessary:** Deployment platforms build directly from your GitHub repository. The repository must contain the cleaned documentation and audited codebase.
- **Action to perform:** Inspect the final git status presented by Antigravity and grant explicit authorization to commit and push to `https://github.com/Harshal-Pande/openHackathonPS3.git`.
- **Command/App:** Terminal command will be run by Antigravity upon your explicit typed approval.
- **Cost:** **$0.00**.
- **Security Precaution:** Antigravity verifies `.gitignore` ensures `.env`, `data/*.sqlite`, and sensitive files are never committed.
- **Successful Completion:** Repository commits pushed to `origin/main` on GitHub.
- **Evidence for Antigravity:** Your typed confirmation: *"I authorize committing and pushing to GitHub."*

---

### TASK USR-05: Trigger Deployment & Verify Public Domain
- **Why it is necessary:** ERC-8004 agent registration requires a permanent public URL serving the metadata file (`/api/agent/metadata`).
- **Action to perform:** 
  1. In Render/Railway, connect your GitHub repo `openHackathonPS3`.
  2. Select "Docker" as the build runtime (or Dockerfile).
  3. Attach a persistent disk/volume mounted at `/app/data` (minimum 1 GB) so the SQLite database persists across reboots.
  4. Click "Deploy".
  5. Once deployment completes, open `https://<YOUR-APP-URL>/api/health` in your browser.
- **Cost:** **$0.00**.
- **Successful Completion:** `https://<YOUR-APP-URL>/api/health` returns `{"status":"ok","version":"0.1.0","chainId":42220}`.
- **Evidence for Antigravity:** Provide the public URL (e.g., `https://revertlens.onrender.com`).

---

### TASK USR-06: Fund Agent Wallet with Gas
- **Why it is necessary:** Broadcasting the on-chain ERC-8004 registration transaction and Buy payment settlement requires a tiny amount of gas on Celo Mainnet.
- **Action to perform:** Send **0.05 CELO** (approximately $0.02 USD) from your personal wallet/exchange to the agent wallet address:
  - Destination Address: `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`
  - Network: **Celo Mainnet** (Chain ID 42220)
- **Cost:** **~$0.02 USD** (0.05 CELO).
- **Security Precaution:** Only send native CELO on Celo Mainnet. Never send more than $1.00. Never export or reveal private keys.
- **Successful Completion:** Celoscan shows balance >= 0.05 CELO at `https://celoscan.io/address/0x3e1bef07824cd0E076F4907641F0A0EF27898e52`.
- **Evidence for Antigravity:** Confirm funding completed; Antigravity will verify via read-only RPC call.

---

### TASK USR-07: Broadcast Tagged ERC-8004 Registration Transaction
- **Why it is necessary:** Establishes on-chain ERC-8004 Agent Identity registered on Celo Mainnet with the official attribution tag `celo_235f6ef56f5b`.
- **Action to perform:**
  1. Open your browser to `https://<YOUR-APP-URL>/api/agent/erc8004-registration-tx`.
  2. Copy the generated `taggedTransaction` payload.
  3. Using your wallet (e.g. MetaMask connected to `0x3e1bef...` or Cast/CLI), broadcast the transaction to the Celo Identity Registry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`).
  4. Note the transaction hash and the minted ERC-721 Agent ID from the event logs.
- **Cost:** Gas fee only (< $0.005 USD).
- **Security Precaution:** Verify destination address is exactly `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.
- **Successful Completion:** Transaction confirmed on Celoscan with status `Success`.
- **Evidence for Antigravity:** Provide the transaction hash (e.g. `0xabc...`).

---

### TASK USR-08: Setup Buy CLI & Settle 1 Live Cencori AI Inference
- **Why it is necessary:** Track PS3 ("Build with Buy") requires proof of a paid Buy marketplace transaction using `@celo/buy`.
- **Action to perform:**
  1. On your local machine terminal, run: `npx @celo/buy@latest setup` (configures local Buy keychain wallet).
  2. Send 0.10 USDC on Celo Mainnet to the Buy wallet address displayed by `buy setup`.
  3. Execute one live forensic AI explanation via the RevertLens UI or Buy CLI.
  4. Verify the settlement receipt and transaction hash on Celoscan.
- **Cost:** **$0.01 USDC** (Cencori API fee per query).
- **Security Precaution:** Never share the Buy CLI mnemonic or seed. The CLI stores keys in your OS keychain.
- **Successful Completion:** Valid settlement transaction hash on Celoscan showing payment of 0.01 USDC to payee `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`.
- **Evidence for Antigravity:** Provide the settlement transaction hash for inclusion in `PROOF.md`.

---

### TASK USR-09: Record 3-Minute Demo Video
- **Why it is necessary:** Hackathon evaluation requires a working demonstration video (< 3 minutes) proving the product works live on Celo Mainnet.
- **Action to perform:**
  1. Open `DEMO_SCRIPT.md` in the project root.
  2. Follow the 180-second timed teleprompter script exactly:
     - 0:00-0:30: The Problem (opaque reverts on Celo).
     - 0:30-1:15: Live Investigation of candidate reverted tx (`0xb90bcca5...`).
     - 1:15-1:50: Forensic Workbench walk-through (call tree, deepest failing frame, causality classification, evidence ledger SHA-256).
     - 1:50-2:25: Build with Buy paid Cencori AI explanation & attribution tag (`celo_235f6ef56f5b`).
     - 2:25-3:00: ERC-8004 identity on Celoscan & closing verdict.
  3. Record your screen and voice using Loom, OBS, or Zoom.
  4. Upload video to YouTube (Unlisted or Public) or Loom.
- **Cost:** **$0.00**.
- **Successful Completion:** Public video link generated.
- **Evidence for Antigravity:** Provide the video URL.

---

### TASK USR-10: Submit Final Hackathon Form
- **Why it is necessary:** Closes the hackathon entry before the deadline.
- **Action to perform:** Fill out the hackathon submission form on DoraHacks / Hackathon portal:
  - Project Name: `RevertLens`
  - Tagline: `Your Celo transaction failed. Find out why.`
  - Track: `PS3 — Build with Buy`
  - GitHub URL: `https://github.com/Harshal-Pande/openHackathonPS3.git`
  - Live Demo URL: `https://<YOUR-DEPLOYED-APP-DOMAIN>`
  - Video URL: `https://youtu.be/...`
  - Agent Wallet: `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`
  - Attribution Tag: `celo_235f6ef56f5b`
  - ERC-8004 Agent ID: `<YOUR_AGENT_ID>`
  - Paid Settlement Tx Hash: `<YOUR_SETTLEMENT_TX_HASH>`
- **Cost:** **$0.00**.
- **Successful Completion:** Hackathon portal confirms: "Submission Received".
- **Evidence for Antigravity:** Written confirmation in chat.
