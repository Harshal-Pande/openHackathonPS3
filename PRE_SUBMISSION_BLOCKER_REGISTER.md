# RevertLens — Pre-Submission Blocker Register

**Document Version:** 1.0.0 (Phase 11 Authoritative Register)  
**Hackathon:** Agents on Open Rails 2026 | Track PS3 — Build with Buy  
**Submission Deadline:** November 9, 2026, 09:00 GMT  
**Technical Implementation Status:** **100% COMPLETE & VERIFIED**  
**Remaining Blockers:** **HUMAN OPERATOR ACTIONS ONLY**  

---

## 1. Blocker Summary & Separation of Responsibilities

All local software engineering, forensic engines, API endpoints, test suites (110/110 passing), browser automation, and attribution tagging mechanisms are fully implemented and verified.

Per non-negotiable safety rules, the automated agent is **strictly prohibited** from performing irreversible, paid, externally visible, or identity-signing actions. The following items constitute the complete pre-submission blocker register requiring human operator execution.

---

## 2. Active Blocker Register

| Blocker ID | Blocker Title | Category | Owner | Severity | Action Required for Resolution | Reference Document |
|:---:|:---|:---:|:---:|:---:|:---|:---|
| **BLK-01** | **Cloud Deployment Provisioning** | Hosting | Human Operator | **HIGH** | Deploy Git repository to Render, Railway, or Fly.io with persistent SQLite storage and set environment variables. | [`DEPLOYMENT_READINESS.md`](file:///d:/Blockchain/BuildWithBuy/DEPLOYMENT_READINESS.md) |
| **BLK-02** | **Demo Video Recording** | Deliverable | Human Operator | **HIGH** | Record 2–3 minute video walking through RevertLens using the 5-act demonstration script and upload to YouTube/Loom. | [`DEMO_SCRIPT.md`](file:///d:/Blockchain/BuildWithBuy/DEMO_SCRIPT.md) |
| **BLK-03** | **Official Agent Wallet in Entry Form** | Compliance | Human Operator | **CRITICAL** | Submit the official public agent wallet `0x3e1bef07824cd0E076F4907641F0A0EF27898e52` in the hackathon portal entry. | [`AGENT_WALLET_AUDIT.md`](file:///d:/Blockchain/BuildWithBuy/AGENT_WALLET_AUDIT.md) |
| **BLK-04** | **ERC-8004 Identity Registration** | On-Chain | Human Operator | **MEDIUM** | Sign and broadcast the pre-computed registration transaction on Celo Mainnet using project wallet (~0.001 CELO gas). | [`ERC8004_REGISTRATION_PREPARATION.md`](file:///d:/Blockchain/BuildWithBuy/ERC8004_REGISTRATION_PREPARATION.md) |
| **BLK-05** | **(Optional) Live Paid Buy Inference** | On-Chain | Human Operator | **LOW** | Claim free USA₮ from Google Cloud Web3 faucet, enable `BUY_ENABLED=true`, and run one paid Cencori investigation. | [`ZERO_COST_FUNDING_RESEARCH.md`](file:///d:/Blockchain/BuildWithBuy/ZERO_COST_FUNDING_RESEARCH.md) |
| **BLK-06** | **Loops House Portal Submission** | Administrative| Human Operator | **CRITICAL** | Fill out the hackathon submission form on Loops House with repo URL, demo video, and wallet before Nov 9, 09:00 GMT. | [`HUMAN_ACTIONS_REQUIRED.md`](file:///d:/Blockchain/BuildWithBuy/HUMAN_ACTIONS_REQUIRED.md) |

---

## 3. Resolution Critical Path

```text
1. Deploy to Render/Railway (15 min) -> Generates Live Public URL
2. Record Demo Video (20 min)        -> Walkthrough on local or deployed URL
3. Sign ERC-8004 Tx (5 min)          -> Registers on-chain Agent ID
4. Submit Hackathon Form (5 min)     -> Completes Entry with Agent Wallet 0x3e1b...
```
*Total Estimated Operator Time: ~45 minutes.*
