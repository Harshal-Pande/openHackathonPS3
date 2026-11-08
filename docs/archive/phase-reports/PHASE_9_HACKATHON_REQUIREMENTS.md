# Phase 9 — Hackathon Requirements Audit & Compliance Matrix
**Event:** Agents on Open Rails Hackathon (Loops House × Celo)  
**Track:** PS3 — Build with Buy  
**Official Event URL:** `https://www.loops.house/agents-on-open-rails`  
**Evaluation Date:** November 7, 2026

---

## 1. Official Requirements Evaluation Matrix

| Hackathon Requirement | Concrete Project Evidence | Current Verified Status | Required Next Action |
|:---|:---|:---:|:---|
| **1. Public GitHub Repository** | Repository `Harshal-Pande/openHackathonPS3` exists. Release candidate RC-1 prepared locally. | **PENDING AUTHORIZATION** | Operator reviews `GIT_RELEASE_REVIEW.md` and executes `git add`, `commit`, and `push`. |
| **2. Public Deployment URL** | Application built and verified locally on port 3009. Multi-stage `Dockerfile` and Railway deployment guide ready. | **NOT DEPLOYED** | Operator provisions cloud container on Railway/Render with persistent volume. |
| **3. Working Celo Mainnet Forensics** | Verified live on Celo Mainnet (`42220`) via OP Geth archive node. Candidate tx `0xb90bcca5...` fetched with 4-frame trace. | **VERIFIED (LOCAL RUNTIME)** | Verify production smoke test once deployed to cloud. |
| **4. Build with Buy Integration** | Official `@celo/buy` CLI integrated; 170 capabilities discovered; live 402 challenge quotes verified for `cencori.v1.chat.completions`; 11-state payment machine in SQLite. | **PARTIAL (QUOTE VERIFIED / ZERO SPEND)** | If live payment settlement is required by judges, operator funds wallet via USA₮ faucet and approves single $0.01 call. |
| **5. Buy Payment Proof & Settlement** | Quote records bound by SHA-256 body hashes; zero funds spent ($0.00 spent). | **NOT EXECUTED / NOT VERIFIED** | No on-chain settlement tx exists yet because spending was withheld. |
| **6. ERC-8004 Agent Identity** | Registration workflow documented in checklist. Identity signing requires operator private key. | **NOT REGISTERED** | If mandated by organizers, operator performs on-chain agent registration out-of-band. |
| **7. Independent Qualifying Users** | `USER_TESTING_GUIDE.md`, blank `USER_TEST_LOG.csv`, and 4-tier verification standard prepared. No fake users created. | **NOT YET ACQUIRED** | Recruit genuine external Celo developers to test candidate transactions and record signatures. |
| **8. 3-Minute Demo Video** | Demonstration script (`DEMO_SCRIPT.md`) finalized covering real product features. | **PENDING RECORDING** | Record screencast with voiceover following the approved script. |
| **9. Strict Zero-Spend Invariant** | Total spend to date: **$0.00**. No project or personal money deducted. | **FULLY COMPLIANT** | Maintain zero-spend posture until operator explicitly authorizes micro-funding. |

---

## 2. Track PS3 Nuances & Attributions

1. **Facilitator Payment vs. Local Wallet:**  
   Under the Build with Buy specification, the `@celo/buy` CLI submits payment challenges to the Buy gateway facilitator. If live execution is triggered, settlement hashes will be verified directly via `buy receipts`.
2. **Transparent Claim Invariant:**  
   RevertLens will never claim paid Buy usage for free direct Chainstack RPC calls (governed by Decision `AD-008`). Buy usage is strictly attributed to Cencori LLM inference (`cencori.v1.chat.completions`).
