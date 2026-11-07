# RevertLens — Independent User Evidence & Testing Framework

**Document Version:** 1.0.0 (Phase 11.5 Compliance Framework)  
**Hackathon:** Agents on Open Rails 2026 | Track PS3 — Build with Buy  
**Current Status:** **`NO_VERIFIED_INDEPENDENT_USERS`** (Framework Ready; Cohort Recruitment Pending Public Deployment)  

---

## 1. Executive Summary & Honest Disclosure

In accordance with Section 10 of the Phase 11.5 specification:
- RevertLens has been thoroughly tested through local integration suites, live Celo Mainnet RPC queries, and automated Chrome browser testing.
- However, **no independent external users have yet tested the application on a public deployment**.
- Current testing status is honestly declared as **`NO_VERIFIED_INDEPENDENT_USERS`**.
- This document establishes the official verification framework, eligibility criteria, and evidence collection templates for the human operator to onboard independent users once deployed.

---

## 2. Hackathon Eligibility Criteria for Independent Users

To count as an eligible independent user trial under hackathon evaluation guidelines:
1. **Independence:** Testers must be genuine third-party developers, traders, or Celo community members not affiliated with the core development team.
2. **Real World Use-Case:** Testers must provide real failed Celo Mainnet transaction hashes originating from their own wallets or dApp interactions.
3. **No Manufactured Funding:** The project team must NOT fund user wallets or reimburse gas simply to manufacture artificial activity (`FUNDING_PROVENANCE_VERIFIED`).
4. **Verifiable Feedback:** Users must provide qualitative feedback and confirm that the investigation diagnosed their failure accurately.

---

## 3. Privacy & Safety Guidelines for User Testing

- **Zero Secret Collection:** RevertLens never requests, requires, or stores private keys, seed phrases, or wallet connection permissions.
- **Unlisted Reports:** Public investigation reports are unlisted by default and referenced only by UUID, containing no personal identifying information.
- **Client Anonymity:** Testers use RevertLens without creating accounts or providing email addresses.

---

## 4. Independent User Onboarding & Evidence Capture Workflow

```text
Step 1: User navigates to public RevertLens deployment (e.g. https://revertlens.onrender.com).
Step 2: User pastes a recent failed Celo Mainnet transaction hash from their activity.
Step 3: User clicks "Inspect Transaction" and reviews the deterministic failure analysis.
Step 4: User expands the call trace, inspects the failing child frame, and downloads the JSON report.
Step 5: User submits a brief verification record via the feedback template.
```

---

## 5. Official User Testing Log Template (`USER_TEST_LOG.csv`)

| User ID | Date (UTC) | Tested Transaction Hash | Failure Category Diagnosed | Solved User Question? | Feedback Notes |
|:---:|:---:|:---|:---:|:---:|:---|
| `USR-01` | Pending | `0x...` | `PROPAGATED_CHILD_REVERT` | Yes / No | User confirmed slippage was the cause. |
| `USR-02` | Pending | `0x...` | `OUT_OF_GAS` | Yes / No | User confirmed sub-call ran out of gas. |

---

## 6. Action for Human Operator

Upon deploying RevertLens to cloud hosting, share the live link with at least 2–3 independent Celo builders or community members, record their test hashes in `USER_TEST_LOG.csv`, and include the log in the final submission package.
