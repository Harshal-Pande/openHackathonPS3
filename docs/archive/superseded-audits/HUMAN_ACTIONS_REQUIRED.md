# RevertLens — Comprehensive Human Actions Required Runbook

**Document Version:** 1.0.0 (Phase 11 Authoritative Human Action Plan)  
**Hackathon:** Agents on Open Rails 2026 | Track PS3 — Build with Buy  
**Submission Deadline:** November 9, 2026, 09:00 GMT  
**Official Project Wallet:** `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`  
**Official Attribution Tag:** `celo_235f6ef56f5b`  

---

## 1. Overview for Human Operator

The automated software engineering for RevertLens is **100% complete**. All code, tests (110/110 passing), browser automation, persistence models, attribution tagging, and ERC-8004 preparation are fully verified.

To finalize the hackathon submission before the **November 9, 2026, 09:00 GMT** deadline, the human operator must execute the following external actions.

---

## 2. Action 1: Add Official Agent Wallet to Hackathon Entry Form

- **Platform:** Loops House Hackathon Portal (`https://loops.house`)
- **Required Field:** Agent Wallet Address
- **Exact Information Required:**
  ```text
  0x3e1bef07824cd0E076F4907641F0A0EF27898e52
  ```
- **Importance:** The hackathon explicitly states: *"Add the agent wallet to the hackathon entry. Keep the same agent wallet throughout the event because scoring is tied to that wallet."*
- **Cost / Gas:** $0.00 (No gas required).
- **Approval / Signature:** None.
- **Evidence to Save:** Confirmation screenshot of the portal entry form showing the wallet address.

---

## 3. Action 2: Deploy RevertLens to Cloud Hosting (15 Minutes)

- **Platform:** Render (`https://render.com`), Railway (`https://railway.app`), or Fly.io (`https://fly.io`).
- **Repository:** `https://github.com/Harshal-Pande/openHackathonPS3.git`
- **Steps:**
  1. Log into Render / Railway and click **New Web Service**.
  2. Select GitHub repository: `Harshal-Pande/openHackathonPS3`.
  3. Set Build Command: `npm install && npm run build`
  4. Set Start Command: `npm start`
  5. Configure Environment Variables:
     - `NODE_ENV`: `production`
     - `PORT`: `3000`
     - `HOST`: `0.0.0.0`
     - `CHAINSTACK_CELO_MAINNET_RPC_URL`: `<Your Chainstack Celo Mainnet RPC URL>`
     - `DATABASE_PATH`: `/data/revertlens.sqlite` (Mount persistent disk at `/data`)
     - `SESSION_SECRET`: `<Generate a random 32-character secret>`
     - `OPERATOR_PASSWORD_HASH`: `<Argon2id hash for operator login>`
     - `CORS_ORIGIN`: `https://<your-service-domain>`
     - `PUBLIC_BASE_URL`: `https://<your-service-domain>`
     - `CELO_ATTRIBUTION_TAG`: `celo_235f6ef56f5b`
     - `AGENT_WALLET_ADDRESS`: `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`
     - `BUY_ENABLED`: `false` (Zero-spend default)
     - `CENCORI_ENABLED`: `false` (Zero-spend default)
  6. Click **Deploy**.
  7. Verify: Open `https://<your-service-domain>/api/health` and confirm `{ status: "ok", chainId: 42220 }`.
- **Cost / Gas:** Free tier or minimal host platform credit.
- **Evidence to Save:** Public deployment URL (e.g. `https://revertlens.onrender.com`).

---

## 4. Action 3: Record 2–3 Minute Demo Video (20 Minutes)

- **Software:** Loom (`https://loom.com`), OBS Studio, or screen recorder of choice.
- **Script Guide:** Follow [`DEMO_SCRIPT.md`](file:///d:/Blockchain/BuildWithBuy/DEMO_SCRIPT.md) strictly.
- **Steps:**
  - **Act 1 (0:00–0:35):** Show failed Celo transaction on Celoscan / Blockscout with generic `"execution reverted"`.
  - **Act 2 (0:35–1:15):** Switch to RevertLens dashboard. Paste candidate hash `0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445` (or click *Load Verified Sample Failed Tx*). Click **Inspect Transaction**.
  - **Act 3 (1:15–2:00):** Show deterministic diagnosis banner (`Nested Call Failure at Depth 1: execution reverted`), expand execution call tree, show causality propagation status (`Propagated`), and display atomic SHA-256 evidence items (`[E-01]`..`[E-05]`).
  - **Act 4 (2:00–2:35):** Highlight the three-tier architecture cards (`DETERMINISTIC ANALYSIS`, `AI ENHANCED EXPLANATION`, and `BUY PAYMENT STATUS`). Explain Cencori integration via `@celo/buy` and transparent $0.01 quotes.
  - **Act 5 (2:35–3:00):** Click **Download JSON Report**, display verified evidence JSON file, and conclude with the value proposition.
- **Cost / Gas:** $0.00.
- **Approval / Signature:** None.
- **Evidence to Save:** Public or unlisted video URL (YouTube, Loom, or Vimeo).

---

## 5. Action 4: (Optional) Register ERC-8004 Agent Identity on Celo Mainnet (5 Minutes)

- **Target Contract:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (Celo Mainnet ERC-8004 Identity Registry)
- **Signer Wallet:** Project wallet (`0x3e1bef07824cd0E076F4907641F0A0EF27898e52`) or operator wallet.
- **Estimated Gas Cost:** ~0.001 CELO (~$0.001 USD).
- **Steps:**
  1. Retrieve pre-computed registration transaction payload:
     Open `http://localhost:3000/api/agent/erc8004-registration-tx` (or cloud endpoint).
  2. The endpoint provides:
     - `to`: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
     - `value`: `0`
     - `data`: Function calldata for `register(string)` with appended ERC-8021 tag `celo_235f6ef56f5b`.
     - `gasLimit`: `350,000`
  3. Sign and broadcast the transaction via Celoscan write contract interface, Rabby/MetaMask, or cast CLI:
     ```bash
     cast send 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 "register(string)" "https://<your-service-domain>/api/agent/metadata" --rpc-url https://forno.celo.org
     ```
  4. Note the returned `agentId` from the `Transfer` event.
- **Evidence to Save:** Registration transaction hash and assigned `agentId`.

---

## 6. Action 5: (Optional) Claim Faucet & Execute Paid Buy Inference (10 Minutes)

- **Platform:** Google Cloud Web3 Celo Mainnet Faucet (`https://cloud.google.com/application/web3/faucet/celo/mainnet`)
- **Cost:** Free ($0.00 personal spend).
- **Steps:**
  1. Follow [`ZERO_COST_FUNDING_RESEARCH.md`](file:///d:/Blockchain/BuildWithBuy/ZERO_COST_FUNDING_RESEARCH.md).
  2. Request free USA₮ tokens to wallet `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`.
  3. In `.env`, set `BUY_ENABLED=true`, `CENCORI_ENABLED=true`, `BUY_DAILY_BUDGET_ATOMIC=100000`, `BUY_PER_CALL_CAP_ATOMIC=20000`.
  4. Run an investigation to generate a paid Cencori AI explanation.
- **Evidence to Save:** Settlement transaction hash and Cencori response in database.

---

## 7. Action 6: Submit Final Project on Loops House Portal (5 Minutes)

- **Platform:** Loops House Portal
- **Checklist for Submission:**
  - Project Title: `RevertLens`
  - Tagline: `Your Celo transaction failed. Find out why.`
  - Track: `PS3 — Build with Buy`
  - GitHub Repository: `https://github.com/Harshal-Pande/openHackathonPS3.git`
  - Agent Wallet Address: `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`
  - Attribution Tag: `celo_235f6ef56f5b`
  - Live Demo URL: `<Your Cloud Deployment URL>`
  - Demo Video URL: `<Your Video URL>`
