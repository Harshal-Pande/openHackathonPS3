# Independent User Evidence Template
**Track:** Agents on Open Rails | Track PS3 — Build with Buy  
**Purpose:** Standardized evidentiary record for qualifying independent user verification per official hackathon definitions.

---

## 1. Compliance Guidelines

Per `docs/09_HACKATHON_COMPLIANCE.md` and the official hackathon rules:
- An independent user cannot be the builder's wallet.
- The wallet must not have been first funded by the builder or project wallet.
- The wallet must possess independent activity on Celo Mainnet prior to the hackathon start.
- **NEVER** request private keys, seed phrases, or sensitive personal data.

---

## 2. Evidence Verification Dimensions

Each candidate user must be evaluated across four distinct verification dimensions:

1. **`CONTROL_PROVEN`**: User proved control of their wallet address via an off-chain cryptographic signature or verifiable communication.
2. **`PRE_EVENT_ACTIVITY_VERIFIED`**: On-chain block explorer records show transactions executed by the wallet prior to the hackathon kickoff.
3. **`FUNDING_PROVENANCE_VERIFIED`**: First funding transaction was traced to an independent source (exchange, external faucet, or third-party transfer), not the project builder.
4. **`ELIGIBILITY_REVIEWED`**: Final compliance review confirming absence of conflict of interest or Sybil duplication.

---

## 3. Individual User Verification Form

```markdown
### User Verification Record: [USER-ID]

- **Tester Identifier / Alias:** [e.g. @tester_handle]
- **Celo Mainnet Address:** `0x...`
- **First On-Chain Activity Date:** YYYY-MM-DD
- **Earliest Transaction Hash:** `0x...`
- **Initial Funding Source:** [Exchange / External Wallet / Independent Faucet]
- **First Funding Transaction Hash:** `0x...`

#### Verification Checklist
- [ ] Control Proven (Signature Hash: `0x...`)
- [ ] Pre-Event Activity Verified on Blockscout / Celoscan
- [ ] Funding Provenance Verified (No builder funds detected)
- [ ] Eligible Independent User Status Approved

**Reviewer Name:** _____________________  
**Verification Date:** __________________  
**Decision:** [ELIGIBLE / INELIGIBLE / UNVERIFIED]
```
