# RevertLens — Official Celo Attribution Integration Audit

**Document Version:** 1.0.0 (Phase 11 Compliance Audit)  
**Hackathon:** Agents on Open Rails 2026 | Track PS3 — Build with Buy  
**Network:** Celo Mainnet (`eip155:42220`)  
**Official Attribution Tag:** `celo_235f6ef56f5b`  
**Standard:** ERC-8021 (EVM Transaction Builder-Code Attribution)  
**SDK Package:** `@celo/attribution-tags` v0.5.0  

---

## 1. Executive Summary

This audit establishes that RevertLens has fully integrated the official, mandatory Celo attribution tag assigned to our hackathon project: **`celo_235f6ef56f5b`**.

All applicable outgoing Celo Mainnet transactions constructed by the application are guaranteed to carry this exact ERC-8021 data suffix, verified cryptographically before serialization and transmission.

---

## 2. Official Hackathon Tag Specification

| Dimension | Value / Detail |
|:---|:---|
| **Assigned Attribution Tag** | `celo_235f6ef56f5b` |
| **Encoding Standard** | ERC-8021 (Builder-Code Calldata Suffix) |
| **Hex Encoding of Code** | `0x63656c6f5f323335663665663536663562` (UTF-8 representation of `celo_235f6ef56f5b`) |
| **Schema ID & Length** | `0x1100` (Schema 0, length 17 bytes) |
| **ERC-8021 Standard Marker** | `0x80218021802180218021802180218021` (16 bytes) |
| **Full Suffix Hex Payload** | `0x63656c6f5f323335663665663536663562110080218021802180218021802180218021` (35 bytes total) |
| **Decodability Proof** | `fromDataSuffix(suffix)` returns `{ codes: ['celo_235f6ef56f5b'], schemaId: 0 }` |

---

## 3. Integration Architecture

### Core Service: `CeloAttributionService` (`src/server/services/celoAttributionService.ts`)
- **Immutability Enforcement:** The service verifies that the configured tag matches `celo_235f6ef56f5b`. Any attempt to pass an empty, truncated, or substitute tag throws an immediate `AttributionError('INVALID_ATTRIBUTION_TAG')`.
- **Chain ID Validation:** Enforces `chainId === 42220`. Non-Celo transactions are strictly rejected.
- **Shared Transaction Preparation:** `prepareTaggedTransaction()` automatically appends the 35-byte suffix to any calldata and verifies that the output passes `fromDataSuffix()`.
- **ERC-8004 Preparation:** `buildErc8004RegistrationTransaction()` builds the `register(string agentURI)` transaction calling `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` with the official tag appended to the function calldata.

---

## 4. Invariant Protection: Read-Only RPC & x402 Separation

### 1. Read-Only RPC Calls Are NEVER Tagged
RevertLens uses direct Chainstack Celo Mainnet RPC for transaction investigation:
- `eth_getTransactionByHash`
- `eth_getTransactionReceipt`
- `debug_traceTransaction`
- `eth_chainId`, `eth_blockNumber`

These are read-only JSON-RPC queries. Appending a calldata suffix to a read-only query is technically invalid. RevertLens enforces `CeloAttributionService.assertReadOnlyRpcUntagged` to guarantee that read-only RPC calls are never modified.

### 2. Off-Chain x402 HTTP Requests Are NOT EVM Transactions
Inquiries to the Cencori AI gateway (`https://gateway.usebuy.ai/cencori/v1/chat/completions`) are off-chain HTTP messages returning HTTP 402 challenge headers. RevertLens explicitly distinguishes x402 HTTP requests from on-chain transactions; off-chain HTTP requests do not carry calldata suffixes.

---

## 5. Verification & Test Evidence

Automated unit and integration tests in [`tests/attribution.test.ts`](file:///d:/Blockchain/BuildWithBuy/tests/attribution.test.ts) verify all attribution rules:

```text
 ✓ tests/attribution.test.ts (11 tests) 14ms
   ✓ uses the exact official hackathon attribution tag
   ✓ rejects initialization with unauthorized or substituted tag
   ✓ appends verified ERC-8021 data suffix to outgoing Celo Mainnet transaction
   ✓ preserves base calldata and contract parameters without corruption
   ✓ tags empty calldata transactions safely
   ✓ rejects transactions targeting wrong chain IDs (non-42220)
   ✓ rejects transactions with invalid or malformed recipient address
   ✓ builds valid tagged ERC-8004 identity registration transaction
   ✓ generates compliant ERC-8004 agent metadata payload
   ✓ strictly protects read-only RPC calls from attribution suffix injection
   ✓ keeps the same agent wallet configured consistently in AppConfig
```

**Verdict: 100% PASS.** All attribution constraints are actively tested and enforced.
