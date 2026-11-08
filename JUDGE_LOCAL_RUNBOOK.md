# RevertLens — Judge Local Verification & Runbook

**Target Audience:** Hackathon Judges & Independent Reviewers
**Hackathon:** Agents on Open Rails 2026 | Track PS3 — Build with Buy
**Target Blockchain:** Celo Mainnet (`eip155:42220` / `0xa4ec`)
**Project:** RevertLens — "Your Celo transaction failed. Find out why."
**Repository:** `https://github.com/Harshal-Pande/openHackathonPS3`

---

## 1. Quick Verification Overview (Under 3 Minutes)

RevertLens is designed to be **100% reproducible and verifiable from a fresh clone** without requiring external API keys, private keys, or wallet funding.

All core forensic algorithms, EVM call trace tree parsing, Solidity revert decoding, continuous causality evaluation, ERC-8021 attribution tagging, and ERC-8004 identity preparation run offline in deterministic automated tests.

---

## 2. System Prerequisites

Ensure your environment has:
- **Node.js:** `>=22.0.0` LTS (Node 22 is required for native `node:sqlite`). Verify with:
  ```bash
  node -v
  ```
- **npm:** `>=10.0.0`. Verify with:
  ```bash
  npm -v
  ```
- **Git:** Standard Git CLI.
- **Web Browser:** Any modern desktop browser (Chrome, Brave, Firefox, Edge, Safari).

---

## 3. Step-by-Step Local Setup & Execution

### Step 1: Clone the Repository
```bash
git clone https://github.com/Harshal-Pande/openHackathonPS3.git
cd openHackathonPS3
```

### Step 2: Install Dependencies from Lockfile
Install exact locked dependencies with clean installation:
```bash
npm ci
```
*Expected result:* Added 367 packages in ~30s with zero peer dependency conflicts.

### Step 3: Run Automated Test Suite (100% Offline)
Execute the complete automated test suite:
```bash
npm test
```
*Expected result:*
- **22 test files passed (22)**
- **498 tests passed (498)**
- Duration: ~11–12 seconds.
- Zero failures, zero skipped tests.

### Step 4: Verify Static Typing
Verify TypeScript strict mode across both server and client:
```bash
npm run typecheck
```
*Expected result:* Clean exit with **0 errors**.

### Step 5: Compile Production Bundles
Build both Fastify server and Vite client:
```bash
npm run build
```
*Expected result:*
- Compiles server TypeScript to `dist/server/`.
- Bundles Vite React client with vendor splitting (`vendor-react`, `vendor-icons`) into `dist/client/`.
- Zero build warnings.

### Step 6: Launch Local Application
Start the production server:
```bash
npm start
```
*Expected output:*
```
Fastify server listening on http://127.0.0.1:3000
RevertLens ready for Celo Mainnet investigations.
```

---

## 4. Verifying Application Endpoints

Open a second terminal window to verify key endpoints:

### 1. Health Probe (`GET /api/health`)
```bash
curl http://127.0.0.1:3000/api/health
```
**Expected Response:**
```json
{
  "data": {
    "status": "ok",
    "version": "0.1.0",
    "chainId": 42220,
    "featureFlags": {
      "buyEnabled": false,
      "cencoriEnabled": false,
      "chainstackConfigured": false
    },
    "buyReady": false
  },
  "error": null,
  "requestId": "..."
}
```

### 2. Public ERC-8004 Agent Metadata (`GET /api/agent/metadata`)
```bash
curl http://127.0.0.1:3000/api/agent/metadata
```
**Expected Response:**
Conforms strictly to EIP-8004 registration schema:
- `name`: `"RevertLens"`
- `network`: `"Celo Mainnet"`
- `chainId`: `42220`
- `agentWallet`: `"0x3e1bef07824cd0E076F4907641F0A0EF27898e52"`
- `attributionTag`: `"celo_235f6ef56f5b"`
- `services`: APIs for investigation, health, and metadata.

### 3. Tagged ERC-8004 Registration Calldata (`GET /api/agent/erc8004-registration-tx`)
```bash
curl http://127.0.0.1:3000/api/agent/erc8004-registration-tx
```
**Expected Response:**
- Returns pre-computed transaction payload targeting Celo Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.
- Notice `readinessStatus`: `"BLOCKED_PENDING_PUBLIC_DEPLOYMENT"` (correctly prevents premature registration when running on `localhost`).
- Notice calldata starts with `0xf2c298be` (`register(string)`) and ends with 35-byte ERC-8021 tag `celo_235f6ef56f5b`.

---

## 5. Web UI Walkthrough & Forensic Investigation

1. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```
2. **Examine the Forensic Workbench ("The Evidence Bench"):**
   - Click the **"Sample Reverted Tx"** button in the search bar.
   - It will automatically populate the verified Celo Mainnet reverted transaction:
     ```
     0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445
     ```
3. **Understanding Offline vs. Live Tracing Modes:**
   - **Offline Mode (Default):** If `CHAINSTACK_CELO_MAINNET_RPC_URL` is not set in `.env`, the server operates in offline test mode. To test the forensic engine against this transaction with verified live fixtures, run `npm test tests/userJourneyE2E.test.ts`.
   - **Live Tracing Mode:** To trace arbitrary live Celo Mainnet transactions directly from the UI, set `CHAINSTACK_CELO_MAINNET_RPC_URL=<YOUR_CELO_NODE_URL>` in `.env` and restart the server.
4. **Inspect the Forensic Findings:**
   - Interactive EVM call tree viewer with frame depths and gas consumption.
   - Deepest failing frame badge highlighting sub-call to contract `0xe3d8bd6aed4f159bc8000a9cd47cffdb95f96121`.
   - Causality badge: `PROPAGATION_SUPPORTED` (proving the sub-call error caused the top-level revert).
   - Evidence ledger table `[E-01]` through `[E-05]` with calculated SHA-256 hashes.
   - Click **"Export JSON Report"** to download the structured forensic report.

---

## 6. Full Automated Test Suite Execution

Judges can run the entire automated quality suite via:

```bash
# 1. Vitest test runner (22 suites, 498 tests)
npm test

# 2. Fastify route surface injection audit (36 scenarios across 25 endpoints)
node scripts/verify_all_routes.mjs

# 3. Real Chrome browser automation via CDP (Desktop 1280x800 & Mobile 375x812)
node scripts/browser_e2e_cdp.mjs
```
*Note: Script 3 requires Google Chrome installed locally on the evaluation machine.*

---

## 7. Troubleshooting Guide

- **Error: `Cannot find module 'node:sqlite'`**
  - *Cause:* Running an outdated version of Node.js (< 22.0.0).
  - *Fix:* Install Node.js 22 LTS via nvm: `nvm install 22 && nvm use 22`.
- **Port 3000 Already in Use:**
  - *Fix:* Set a different port before launching: `PORT=3001 npm start`.
- **Database File Permission Error:**
  - *Fix:* Ensure the `./data` directory exists and is writable (`mkdir -p data`).
