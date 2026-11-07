# RevertLens — Transaction Flow & Submission Boundary Architecture

**Document Version:** 1.0.0 (Phase 11 Authoritative Architecture)  
**Target Network:** Celo Mainnet (`eip155:42220`)  
**Official Attribution Tag:** `celo_235f6ef56f5b` (ERC-8021 Suffix)  
**Agent Wallet:** `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`  

---

## 1. Architectural Overview & Context

RevertLens is primarily an **evidence-based forensic investigation engine** for Celo transactions. Its core daily operations query Celo Mainnet archive nodes directly via Chainstack OP Geth to inspect mined execution traces.

Because the **Agents on Open Rails 2026 Hackathon (PS3 — Build with Buy)** ties project scoring, activity verification, and agent identification to on-chain transactions signed by the official agent wallet carrying the official attribution tag `celo_235f6ef56f5b`, this document formally maps every transaction flow, boundary, and classification across the system.

---

## 2. Comprehensive Transaction Flow Map

```mermaid
flowchart TD
    subgraph ClientLayer ["1. Client & Operator Interface"]
        UserBrowser["User Web Browser (SPA)"]
        OperatorCLI["Authenticated Operator"]
    end

    subgraph ServiceBoundaries ["2. RevertLens Backend Services"]
        InvestigateAPI["Investigation API (/api/investigations)"]
        Chainstack["ChainstackProvider (Celo Mainnet OP Geth)"]
        BuyQuoteService["BuyQuoteService (/api/investigations/:id/quote)"]
        AttributionAdapter["CeloAttributionService (ERC-8021 Suffix Engine)"]
        AgentAPI["Agent Endpoints (/api/agent/metadata & erc8004-registration-tx)"]
    end

    subgraph ExternalEcosystem ["3. External Networks & Facilitators"]
        CeloNode["Celo Mainnet Archive Node (Chain ID 42220)"]
        BuyGateway["Buy Gateway (https://gateway.usebuy.ai)"]
        BuyFacilitator["Celo Facilitator / Buy CLI Wallet"]
        ERC8004Registry["ERC-8004 Identity Registry (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)"]
    end

    %% Flows
    UserBrowser -->|1. Submit Tx Hash for Analysis| InvestigateAPI
    InvestigateAPI -->|2. Read-Only RPC eth_getTransaction, debug_trace| Chainstack
    Chainstack -->|3. Read-Only Queries [UNMODIFIED / NO SUFFIX]| CeloNode

    UserBrowser -->|4. Request AI Quote| BuyQuoteService
    BuyQuoteService -->|5. HTTP 402 Pricing Request| BuyGateway

    OperatorCLI -->|6. Review Quote & Budget| BuyQuoteService
    BuyQuoteService -.->|7. If Paid Call Triggered (Controlled)| BuyFacilitator
    BuyFacilitator -.->|8. Settlement Tx Signed by Facilitator| CeloNode

    OperatorCLI -->|9. Request Registration Payload| AgentAPI
    AgentAPI -->|10. Construct & Tag Transaction| AttributionAdapter
    AttributionAdapter -->|11. Injects celo_235f6ef56f5b ERC-8021 Suffix| AgentAPI
    AgentAPI -->|12. Return Prepared Payload| OperatorCLI
    OperatorCLI -->|13. Sign & Broadcast with Agent Wallet 0x3e1b...| ERC8004Registry
```

---

## 3. Strict Boundary Classifications

To prevent misleading claims or cross-protocol confusion, RevertLens explicitly classifies all interactions into five discrete categories:

| Interaction Category | Mechanism | Protocol | Attribution Suffix? | Description & Responsibility |
|:---|:---|:---|:---:|:---|
| **Category 1: Read-Only Forensic RPC** | `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `debug_traceTransaction`, `eth_chainId` | JSON-RPC over HTTPS (Chainstack) | **STRICTLY PROHIBITED** | Read-only requests inspect mined transactions. Appending attribution calldata to read-only RPC is illegal and rejected by `CeloAttributionService.assertReadOnlyRpcUntagged`. |
| **Category 2: Off-Chain x402 HTTP Inquiries** | `POST https://gateway.usebuy.ai/cencori/v1/chat/completions` | HTTP/1.1 with HTTP 402 challenge header | **NOT APPLICABLE** | HTTP REST inquiries query Cencori pricing. They are not EVM transactions and do not possess transaction calldata. |
| **Category 3: Buy Facilitator Settlement** | `@celo/buy curl` invocation | EIP-712 payment authorization / Celo Transfer | **FACILITATOR CONTROLLED** | If paid Cencori execution is triggered, the Buy CLI communicates with the facilitator. Settlement transactions submitted by the facilitator on-chain are external to RevertLens core code. |
| **Category 4: Outgoing Agent Transactions** | `prepareTaggedTransaction()`, `buildErc8004RegistrationTransaction()` | EVM Transaction on Celo Mainnet (`eip155:42220`) | **MANDATORY (ERC-8021)** | Any transaction originated or signed by the RevertLens agent wallet (`0x3e1bef07824cd0E076F4907641F0A0EF27898e52`) MUST carry the official `celo_235f6ef56f5b` suffix. |
| **Category 5: Third-Party Subject Transactions** | The transactions investigated by RevertLens | Mined Celo transactions | **OBSERVED ONLY** | The historical transactions inspected by users belong to arbitrary third-party accounts. RevertLens reports on their outcomes without altering them. |

---

## 4. Shared Attribution Enforcement Boundary

To prevent accidental omission or circumvention, RevertLens routes all transaction generation through a unified enforcement module: `src/server/services/celoAttributionService.ts`.

### Construction & Validation Pipeline
1. **Chain ID Verification:** Checks `tx.chainId === 42220`. Any non-42220 request (e.g. Ethereum 1, Sepolia, Alfajores) immediately throws `AttributionError('INVALID_CHAIN_ID')`.
2. **Address Normalization:** Enforces valid EVM checksum or lowercased hex addresses for `to` and `from`.
3. **ERC-8021 Suffix Concatenation:** Generates the official hex suffix:
   ```text
   0x63656c6f5f323335663665663536663562110080218021802180218021802180218021
   ```
   and appends it to `tx.data`.
4. **Post-Encoding Decodability Verification:** Calls `fromDataSuffix(taggedData)` on the assembled calldata. If the returned codes array does not contain `'celo_235f6ef56f5b'`, the pipeline throws `AttributionError('TAG_VERIFICATION_FAILED')` before the payload can be returned or broadcast.

---

## 5. Security Guarantees & Verification
- **Zero Raw Key Storage:** RevertLens never accepts, parses, or stores private keys or seed phrases.
- **Operator Signature Isolation:** High-value transactions (such as ERC-8004 identity registration) are prepared as verified, immutable payloads via `GET /api/agent/erc8004-registration-tx` for human operator signing.
- **Immunity of Read-Only Inquiries:** Read-only Chainstack RPC queries remain completely standard, ensuring maximum compatibility with archive OP Geth nodes.
