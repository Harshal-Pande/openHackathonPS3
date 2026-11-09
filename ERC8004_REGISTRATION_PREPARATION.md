# RevertLens — ERC-8004 Agent Identity Registration Preparation & Audit

**Document Version:** 2.0.0 (MOD-05A Audit & Readiness Release)<br/>
**Standard:** ERC-8004 (Trustless Agents — On-Chain Identity & Trust Standard)<br/>
**Network:** Celo Mainnet (`eip155:42220` / `0xa4ec`)<br/>
**Official Identity Registry Contract:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`<br/>
**Registry Implementation (ERC-1967):** `0x7274e874ca62410a93bd8bf61c69d8045e399c02`<br/>
**Official Reputation Registry Contract:** `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`<br/>
**Agent Wallet (Owner):** `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`<br/>
**Official Attribution Tag:** `celo_235f6ef56f5b`<br/>
**Preparation Lifecycle State:** `PREPARED_NOT_REGISTERED`

---

## 1. Executive Summary & Audit Mission

ERC-8004 establishes trustless on-chain identity, discovery, and capability verification for autonomous agents on EVM networks. On Celo Mainnet, the canonical Identity Registry issues an ERC-721 token representing the agent, pointing immutably or dynamically to an `agentURI` metadata document describing its capabilities and endpoints.

RevertLens has completed **MOD-05A: ERC-8004 Registration Preparation, Implementation Audit & Readiness**. Every smart contract interface, ABI definition, event signature, calldata encoding, attribution suffix, metadata schema, endpoint, and post-mint receipt verifier has been fully audited, implemented, and verified with automated tests.

**Current Lifecycle Status:**
- Preparation Status: `MOD-05A & MOD-05B IMPLEMENTATION COMPLETE — LIVE CLOUD DEPLOYED`
- On-Chain Status: `WALLET_READY_PENDING_OPERATOR_SIGNATURE`
- Live Production Endpoint: `https://revertlens-production.onrender.com/api/agent/erc8004-registration-tx` (Returns `READY_FOR_OPERATOR_SIGNATURE`)
- Browser Wallet Signing Console: Fully operational at `/operator` with live preflight, gas shortfall estimation, text confirmation gate (`REGISTER REVERTLENS ON CELO MAINNET`), transaction broadcasting, and receipt verification polling.
- Total Project Spend: `$0.00` (Zero spend invariant strictly maintained).
- Target Spend on Registration: `~0.0362 CELO` (~$0.015 USD for gas). No server-side keys used; signed by human operator via browser wallet.

---

## 2. Comprehensive 18-Point Verification Checklist

| # | Checklist Item | Specification & Audit Finding | Verification Status |
|:---|:---|:---|:---|
| 1 | **Target Contract Address** | Canonical Celo Mainnet Identity Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (`eip155:42220`). | `LIVE_MAINNET` verified |
| 2 | **Proxy Architecture** | ERC-1967 Transparent/Beacon Proxy architecture verified on-chain. Storage slot `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc` resolves to implementation `0x7274e874ca62410a93bd8bf61c69d8045e399c02`. | `LIVE_MAINNET` verified |
| 3 | **Token Standard & Identity** | ERC-721 standard compliant. Contract returns `name()` = `"AgentIdentity"`, `symbol()` = `"AGENT"`. | `LIVE_MAINNET` verified |
| 4 | **Function Interface & Selector** | Function `register(string agentURI)` with strict 4-byte selector `0xf2c298be`. Non-payable (`stateMutability: 'nonpayable'`). | `LIVE_MAINNET` verified |
| 5 | **Minting & Registration Events** | Emits both `Registered(uint256 indexed agentId, string agentURI, address indexed owner)` (topic0: `0xca52e62c...`) and ERC-721 `Transfer(address indexed from, address indexed to, uint256 indexed tokenId)` (topic0: `0xddf252ad...`). | `LIVE_MAINNET` verified |
| 6 | **Official Agent Wallet** | Strictly pinned to `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`. Protected by production configuration invariant `DEF-53`. | `LOCAL` & `LIVE_MAINNET` verified |
| 7 | **Official Attribution Tag** | Strictly pinned to `celo_235f6ef56f5b`. Suffix appended to calldata via `@celo/attribution-tags` (ERC-8021). | `LOCAL` verified |
| 8 | **Metadata Specification** | Conforms strictly to `https://eips.ethereum.org/EIPS/eip-8004#registration-v1`. Validated with Zod `.strict()` schema; extra/fabricated keys rejected. | `LOCAL` verified |
| 9 | **Canonical Metadata Route** | Exposed at `GET /api/agent/metadata`. Dynamically resolves canonical `PUBLIC_BASE_URL`. | `LOCAL` verified |
| 10 | **Registration Preview Route** | Exposed at `GET /api/agent/erc8004-registration-tx`. Returns complete transaction parameters, attribution verification, and readiness status. | `LOCAL` verified |
| 11 | **Localhost Readiness Behavior** | Route strictly returns `readinessStatus: 'BLOCKED_PENDING_PUBLIC_DEPLOYMENT'` and `metadataUriStatus: 'BLOCKED_PENDING_PUBLIC_DEPLOYMENT'` when on localhost or private IP. | `LOCAL` verified |
| 12 | **Public Deployment Readiness** | Returns `readinessStatus: 'READY_FOR_OPERATOR_SIGNATURE'` and `metadataUriStatus: 'CONFIGURED_CANONICAL_URI'` when configured with public HTTPS URL. | `LOCAL` verified |
| 13 | **Calldata Assembly & Suffix** | Calldata prefix encodes `register(agentURI)`; suffix encodes 35-byte ERC-8021 tag `0x6365...8021`. Total calldata verified via ABI decoder. | `LOCAL` verified |
| 14 | **Gas Estimation & Economics** | Live `eth_estimateGas` on Celo Mainnet: `180,953` gas. Gas limit configured to conservative `350,000`. Estimated cost: `~0.0362 CELO` (~$0.015 USD). | `LIVE_MAINNET` verified |
| 15 | **Zero-Spend Invariant** | Total project spend across all phases is strictly `$0.00`. No funds transferred, no signing keys accessed, no unapproved broadcasts. | `LOCAL` & `LIVE_MAINNET` verified |
| 16 | **Receipt Verification Engine** | `verifyErc8004RegistrationReceipt()` rigorously validates receipt status, sender wallet, target registry, calldata selector, attribution tag, and extracts `agentId`. Handles ambiguous/reverted cases. | `LOCAL` verified |
| 17 | **Reputation Registry Integration** | Canonical Reputation Registry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` catalogued and prepared for post-identity feedback logging. | `LIVE_MAINNET` catalogued |
| 18 | **Sequential Execution Roadmap** | Strictly follows: `MOD-04 ACCEPTED → MOD-05A PREPARATION → MOD-06 DEPLOYMENT → MOD-05B LIVE REGISTRATION → MOD-07 USER TESTING → MOD-08 SUBMISSION`. | Governance verified |

---

## 3. Strict ERC-8004 Metadata Schema & Payload

The metadata payload served at `GET /api/agent/metadata` strictly implements the official registration schema:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "RevertLens",
  "description": "Evidence-backed forensic investigation of failed Celo transactions, including execution traces, revert reasons, causal propagation analysis and evidence-led reports.",
  "image": "https://<PUBLIC_DOMAIN>/assets/revertlens-banner.png",
  "network": "Celo Mainnet",
  "chainId": 42220,
  "agentWallet": "0x3e1bef07824cd0E076F4907641F0A0EF27898e52",
  "attributionTag": "celo_235f6ef56f5b",
  "services": [
    {
      "name": "RevertLens Investigation API",
      "endpoint": "https://<PUBLIC_DOMAIN>/api/investigations",
      "version": "1.0.0"
    },
    {
      "name": "RevertLens Public Health Check",
      "endpoint": "https://<PUBLIC_DOMAIN>/api/health",
      "version": "1.0.0"
    },
    {
      "name": "RevertLens Agent Metadata",
      "endpoint": "https://<PUBLIC_DOMAIN>/api/agent/metadata",
      "version": "1.0.0"
    }
  ],
  "supportedTrust": [
    "erc8004-identity-v1"
  ]
}
```

---

## 4. Pre-Computed Calldata & Attribution Encoding

The registration transaction payload is assembled using the canonical ABI and tagged with the official ERC-8021 attribution tag:

- **Target Registry:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- **Sender Address:** `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`
- **Value:** `0`
- **Chain ID:** `42220`
- **Gas Limit:** `350,000`
- **Function Selector:** `0xf2c298be` (`register(string)`)
- **ERC-8021 Attribution Suffix:** `0x63656c6f5f323335663665663536663562110080218021802180218021802180218021`

---

## 5. Post-Registration Verification Engine

The newly implemented `verifyErc8004RegistrationReceipt()` function guarantees that once the human operator broadcasts the registration transaction, the on-chain receipt is verified with forensic integrity:

1. **Receipt Validity:** Verifies status is `1` (`SUCCESS`). Fails with `REVERTED` if status is `0`.
2. **Target Matching:** Confirms `to` address is strictly `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.
3. **Sender Matching:** Confirms `from` address is strictly `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`.
4. **Calldata Validation:** Validates function selector `0xf2c298be` and confirms presence of tag `celo_235f6ef56f5b`.
5. **Event Consensus:**
   - Filters logs emitted by the registry contract.
   - Decodes `Registered(uint256 indexed agentId, string agentURI, address indexed owner)`.
   - Decodes `Transfer(address indexed from, address indexed to, uint256 indexed tokenId)` verifying `from == 0x0` (mint).
   - Asserts minted token owner matches `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`.
   - Rejects receipts with conflicting agent IDs (`AMBIGUOUS_EVENTS`).
   - Extracts the authoritative `agentId` string and BigInt.

---

## 6. Safe Operator Broadcast Instructions (For Phase MOD-05B)

> [!IMPORTANT]
> Do NOT execute these steps until MOD-06 (Public Cloud Deployment) is accepted and live on its final canonical HTTPS domain.

1. **Prerequisite:** Confirm public deployment at `https://<PUBLIC_DOMAIN>`.
2. **Verify Preview:** Send `GET https://<PUBLIC_DOMAIN>/api/agent/erc8004-registration-tx` and confirm `readinessStatus: "READY_FOR_OPERATOR_SIGNATURE"`.
3. **Fund Agent Wallet:** Transfer `~0.1 CELO` to `0x3e1bef07824cd0E076F4907641F0A0EF27898e52` for gas.
4. **Broadcast Tagged Transaction:**
   ```bash
   cast send 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 \
     <CALLED_DATA_FROM_API> \
     --rpc-url https://forno.celo.org \
     --private-key <OPERATOR_KEY>
   ```
5. **Verify Receipt:** Feed the returned transaction receipt into `verifyErc8004RegistrationReceipt()` to extract and record the minted `agentId`.
