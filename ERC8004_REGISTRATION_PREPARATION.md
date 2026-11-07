# RevertLens — ERC-8004 Agent Identity Registration Preparation

**Document Version:** 1.0.0 (Phase 11 Authoritative Runbook)  
**Standard:** ERC-8004 (Trustless Agents — On-Chain Identity & Trust Standard)  
**Network:** Celo Mainnet (`eip155:42220`)  
**Official Identity Registry Contract:**  
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`  
**Official Reputation Registry Contract:**  
`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`  
**Agent Wallet (Owner):**  
`0x3e1bef07824cd0E076F4907641F0A0EF27898e52`  
**Official Attribution Tag:**  
`celo_235f6ef56f5b`  

---

## 1. Executive Summary

ERC-8004 standardizes on-chain identity, discovery, and reputation for autonomous AI agents on EVM networks. On Celo Mainnet, the canonical singleton Identity Registry mints an ERC-721 NFT representing the agent's identity, whose metadata points to an agent registration file detailing capabilities and endpoints.

Current Status: **`PREPARED_NOT_REGISTERED`**
- The registration transaction payload has been constructed, tagged with `celo_235f6ef56f5b`, and verified.
- Live RPC gas estimation succeeded: `eth_estimateGas` returned `180,953` gas (~0.0362 CELO).
- Broadcast is pending human operator signature with project wallet `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`.

---

## 2. RevertLens Agent Registration Metadata

RevertLens exposes its compliant ERC-8004 metadata file directly via HTTP:
- **Hosted Endpoint:** `GET /api/agent/metadata`
- **Canonical Hosted URL:** `https://revertlens.onrender.com/api/agent/metadata` (or cloud service URL)

### Canonical Registration JSON Payload
```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "RevertLens",
  "description": "Evidence-backed forensic investigation of failed Celo transactions, including execution traces, revert reasons, causal propagation analysis and evidence-led reports.",
  "image": "https://revertlens.onrender.com/assets/revertlens-banner.png",
  "network": "Celo Mainnet",
  "chainId": 42220,
  "agentWallet": "0x3e1bef07824cd0E076F4907641F0A0EF27898e52",
  "attributionTag": "celo_235f6ef56f5b",
  "services": [
    {
      "name": "RevertLens Investigation API",
      "endpoint": "https://revertlens.onrender.com/api/investigations",
      "version": "1.0.0"
    },
    {
      "name": "RevertLens Public Health Check",
      "endpoint": "https://revertlens.onrender.com/api/health",
      "version": "1.0.0"
    },
    {
      "name": "RevertLens Agent Metadata",
      "endpoint": "https://revertlens.onrender.com/api/agent/metadata",
      "version": "1.0.0"
    }
  ],
  "supportedTrust": [
    "erc8004-identity-v1"
  ]
}
```

---

## 3. Smart Contract & Function Interface

- **Target Contract:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (ERC-8004 Identity Registry on Celo Mainnet)
- **Function:** `register(string agentURI)`
- **Function Selector:** `0xf2c298be`
- **Return Value:** `uint256 agentId` (the minted NFT token ID identifying RevertLens)

---

## 4. Pre-Computed, Tagged Transaction Details

RevertLens provides a live endpoint `GET /api/agent/erc8004-registration-tx` that builds the exact tagged transaction payload:

| Transaction Field | Value | Verification |
|:---|:---|:---|
| **`to`** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | Canonical ERC-8004 Registry |
| **`from`** | `0x3e1bef07824cd0E076F4907641F0A0EF27898e52` | Official Agent Wallet |
| **`value`** | `0 CELO` (`0x0`) | Registration has no protocol fee |
| **`chainId`** | `42220` | Celo Mainnet |
| **`gasLimit`** | `350,000` gas | Sufficient for ERC-721 mint + state write |
| **`attributionTag`**| `celo_235f6ef56f5b` | Official Hackathon Tag |
| **`ERC-8021 Suffix`**| `0x63656c6f5f323335663665663536663562110080218021802180218021802180218021` | Appended to calldata |

### Full Assembled Calldata (With Attribution Tag)
When `agentURI` is `"https://revertlens.onrender.com/api/agent/metadata"`:
```text
0xf2c298be
0000000000000000000000000000000000000000000000000000000000000020
0000000000000000000000000000000000000000000000000000000000000033
68747470733a2f2f7265766572746c656e732e6f6e72656e6465722e636f6d2f
6170692f6167656e742f6d6574616461746100000000000000000000000000
63656c6f5f323335663665663536663562110080218021802180218021802180218021
```
*Note: The final 35 bytes represent the exact ERC-8021 hackathon builder tag `celo_235f6ef56f5b`.*

### Live Simulation & Gas Estimation Evidence
- **Verification Date:** 2026-11-07
- **Method:** `eth_estimateGas` on Celo Mainnet (`eip155:42220`) via Chainstack node.
- **Estimated Gas Units:** `180,953` gas.
- **Gas Price:** ~`200 Gwei` (`200001000000 wei`).
- **Total Required Cost:** `~0.0362 CELO` (~$0.015 USD).
- **Current Balance:** `0 CELO` (Funding required before broadcast).

### Operator Broadcast Command (Preserving Calldata Suffix)
To ensure the attribution suffix is strictly preserved during broadcast, the operator must pass the full raw calldata:
```bash
# Using Foundry cast (substituting <private-key> or ledger):
cast send 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 \
  0xf2c298be0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003368747470733a2f2f7265766572746c656e732e6f6e72656e6465722e636f6d2f6170692f6167656e742f6d657461646174610000000000000000000000000063656c6f5f323335663665663536663562110080218021802180218021802180218021 \
  --rpc-url https://forno.celo.org
```

---

## 5. Post-Registration Verification Steps

After the human operator signs and broadcasts the registration transaction:
1. **Locate Transaction Receipt:** Check transaction status on [Celoscan](https://celoscan.io).
2. **Read `Registered` / `Transfer` Event:** The ERC-721 `Transfer(address(0), 0x3e1b..., uint256 agentId)` event emits the assigned `agentId`.
3. **Verify On-Chain Record:** Call `tokenURI(agentId)` on contract `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` to confirm it returns `agentURI`.
4. **Save Evidence:** Record the `agentId` and registration transaction hash in project documentation.
