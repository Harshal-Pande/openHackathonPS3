# RevertLens — User Testing Guide
**Target Track:** Agents on Open Rails | Track PS3 — Build with Buy  
**Target Environment:** Celo Mainnet (`eip155:42220`)

---

## 1. Overview for Testers

RevertLens is a specialized forensics tool for Celo Mainnet developers and users. When your transaction fails on Celo, block explorers often display only vague `"execution reverted"` messages. RevertLens reconstructs the internal EVM call tree, identifies the exact failing contract and leaf method, proves whether child errors propagated to the root, and generates an evidence-backed diagnosis.

---

## 2. Testing Steps

### Step 1: Launch Application
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Ensure your local `.env` has a valid Celo Mainnet RPC configured:
   ```bash
   CHAINSTACK_CELO_MAINNET_RPC_URL="<your-celo-mainnet-rpc>"
   ```
3. Start the application:
   ```bash
   npm run build
   npm start
   ```
4. Open your browser to `http://localhost:3000`.

### Step 2: Test Known Reverted Transaction
1. In the search box, paste the verified failed swap transaction:
   ```
   0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445
   ```
2. Click **Investigate Failure**.
3. Verify:
   - Status badge shows `REVERTED` with red highlight.
   - Gas consumed displays `54,232`.
   - Root Failure displays frame `0.1` calling contract `0xe3d8...`.
   - Causality classification displays `PROPAGATION_SUPPORTED`.
   - Evidence ledger displays 5 verified evidence items (`[E-01]` through `[E-05]`).

### Step 3: Inspect Call Trace Tree
1. Scroll down to the **Execution Call Tree**.
2. Click on the frames to view the caller, destination contract, gas used, and decoded revert strings.
3. Confirm that frame `0.1` shows `revertReason: "Swap reverted"`.

### Step 4: Test Export Functionality
1. Click **Download JSON Report** at the top right of the investigation view.
2. Confirm that a file named `revertlens-0xb90bcca5...json` downloads to your machine.
3. Open the JSON file in an editor and confirm it contains the full diagnosis, evidence ledger with content hashes, and execution trace frames.

### Step 5: Test Error & Adverse Cases
1. Paste an invalid hash (e.g. `0x123`) and verify an immediate validation error appears before any network call.
2. Search for a non-existent transaction hash and confirm a clean 404 message appears without application crash.

---

## 3. Security Warning for Testers
- **NEVER** enter private keys, seed phrases, or wallet passwords into RevertLens.
- RevertLens is strictly read-only for public visitors and will never ask to connect a wallet or sign transactions.
