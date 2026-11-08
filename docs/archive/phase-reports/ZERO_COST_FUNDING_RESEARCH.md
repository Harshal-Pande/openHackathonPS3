# Zero-Cost Funding Research: Google Cloud Web3 Celo USA₮ Faucet

**Date/Time:** 2026-11-07 07:27:00 UTC  
**Author:** RevertLens Security & Implementation Team  
**Status:** `RESEARCH_VERIFIED` | `WALLET_UNFUNDED` | `ZERO_SPEND_INCURRED`  

---

## 1. Executive Summary

As part of Phase 6 (Cencori AI Integration and Buy Payment Architecture Readiness), this document analyzes the official and legitimate no-cost route for obtaining the accepted payment tokens on Celo Mainnet (`eip155:42220`) to fund Buy capabilities (specifically `cencori.v1.chat.completions`) without spending personal money.

We investigated the **Google Cloud Web3 Celo USA₮ Mainnet Faucet**, its distribution campaign, underlying identity requirements, token mechanics, and compatibility with the Celo Buy API gateway.

---

## 2. Token & Campaign Identity

- **Campaign Name:** Google Cloud Web3 Celo USA₮ Distribution Campaign
- **Partners:** Google Cloud for Web3, Self Protocol (Self.xyz), Tether, Anchorage Digital Bank
- **Network:** Celo Mainnet (`eip155:42220`)
- **Token Contract:** `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771`
- **Token Name:** Tether America USD / USA₮ (`$USA₮`)
- **Decimals:** 6
- **Issuer / Backing:** Issued by Anchorage Digital Bank, N.A., backed by Tether as a regulated U.S. dollar-backed stablecoin with native deployment on Celo Mainnet.

---

## 3. How the Faucet Works

To prevent Sybil attacks and automated bot draining, Google Cloud Web3 integrates **Self Protocol's zero-knowledge (ZK) proof-of-humanity** technology:

1. **Step 1: Wallet Connection** — The user connects a standard Celo-compatible wallet (Valora, MetaMask, Rabby, Ledger) to the Google Cloud Web3 faucet portal.
2. **Step 2: Proof-of-Humanity Verification** — The user downloads the Self mobile app and performs a privacy-preserving biometric or government ID check (e.g. NFC chip-enabled passport, national ID card, or Indian Aadhaar).
3. **Step 3: Zero-Knowledge Verification** — Self generates a zero-knowledge cryptographic proof confirming:
   - User is at least 18 years of age.
   - User is located in a non-OFAC sanctioned jurisdiction.
   - User has not claimed the allocation on another wallet.
   - *Crucially:* No raw biometric or identity data is published on-chain.
4. **Step 4: Token Allocation** — Google Cloud Web3 transfers the initial allocation of real mainnet USA₮ directly to the user's Celo address gas-free.

---

## 4. Buy Gateway Compatibility Verification

We independently verified the live Buy API gateway challenge for `cencori.v1.chat.completions` via `https://gateway.usebuy.ai/cencori/v1/chat/completions` (HTTP 402 challenge observed on 2026-11-07 07:20:45 GMT):

```json
{
  "scheme": "exact",
  "network": "celo",
  "maxAmountRequired": "10000",
  "resource": "https://gateway.usebuy.ai/cencori/v1/chat/completions",
  "description": "Chat completion, maximo-atlas-1.3 (closed beta)",
  "mimeType": "application/json",
  "payTo": "0x20faAca5F980E29639A0FCC6dcA6988E18ed333B",
  "maxTimeoutSeconds": 60,
  "asset": "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
  "extra": {
    "name": "Tether America USD",
    "version": "1"
  }
}
```

### Findings:
1. **Direct Compatibility:** The Buy gateway explicitly lists `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771` (Tether America USD / USA₮) as one of the three accepted payment assets.
2. **Exact Price:** 10,000 atomic units ($0.01 at 6 decimals).
3. **Usability for Hackathon:** If claimed, USA₮ tokens can be used directly with `@celo/buy curl` or the gateway to settle Cencori inference requests on Celo Mainnet without converting tokens or spending fiat.

---

## 5. Non-Negotiable Operational Boundaries

In strict compliance with operator instructions:
- **No Agent Wallet Access:** The AI agent has NOT connected a wallet, created a private key, or initiated a claim.
- **Operator Decision:** The human operator must decide if they wish to personally download the Self app and complete the ZK proof-of-humanity verification.
- **Current Status:** The project wallet remains **UNFUNDED**. No personal spending has occurred ($0.00 spent).
- **Graceful Fallback:** If the operator chooses not to claim the faucet, RevertLens continues to operate flawlessly using its deterministic forensic engine.
