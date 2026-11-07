# RevertLens — Official Agent Wallet Audit

**Document Version:** 1.0.0 (Phase 11 Authoritative Audit)  
**Hackathon:** Agents on Open Rails 2026 | Track PS3 — Build with Buy  
**Target Network:** Celo Mainnet (`eip155:42220`)  
**Official Public Agent Wallet Address:**  
`0x3e1bef07824cd0E076F4907641F0A0EF27898e52`  

---

## 1. Executive Summary

In accordance with Section 4 of the Phase 11 specification:
- An audit of the environment and CLI keychain was conducted.
- The project's existing official default wallet was verified through the official `@celo/buy` CLI (`npx @celo/buy@latest whoami`).
- The public address is **`0x3e1bef07824cd0E076F4907641F0A0EF27898e52`**.
- This address is **fixed, permanent, and consistent**, and must be added to the hackathon project entry.

---

## 2. Wallet Profile & Technical Identity

| Attribute | Verified Setting | Notes |
|:---|:---|:---|
| **Public Address** | `0x3e1bef07824cd0E076F4907641F0A0EF27898e52` | Checksum: `0x3e1bef07824cd0E076F4907641F0A0EF27898e52` |
| **Network** | Celo Mainnet | EIP-155 Chain ID: `42220` (`0xa4ec`) |
| **Configuration Origin** | Official `@celo/buy` OS Keychain | Initialized via `buy setup` / default account on Celo |
| **Server Configuration** | `AGENT_WALLET_ADDRESS` in `src/server/config.ts` | Validated via Zod regex `/^0x[a-fA-F0-9]{40}$/` |
| **Key Storage & Security Model** | Secure Local Keystore / Keychain | Private key is NEVER stored in repository, `.env`, SQLite, logs, or client bundles |
| **Current Balances** | `0 CELO, 0 USDC, 0 USDT, 0 USAT, 0 USDm` | Preserves strict $0.00 zero-personal-spend constraint |
| **Hackathon Role** | Official Agent Wallet | Identity owner for ERC-8004 and scorer for hackathon attribution |

---

## 3. Official CLI Verification Output

Direct inspection of `npx @celo/buy@latest whoami` produced the following verified result:

```text
default on celo
  pays from 0x3e1bef07824cd0E076F4907641F0A0EF27898e52
  balances 0 CELO, 0 USDC, 0 USDT, 0 USAT, 0 USDm
```

---

## 4. Wallet Permanence & Scoring Requirements

The hackathon rules mandate:
1. **Single Consistent Wallet:** Scoring and on-chain evaluation are tied directly to this wallet address.
2. **No Address Rotation:** RevertLens will NOT rotate, substitute, or generate secondary wallets.
3. **Attribution Tag Binding:** All transactions signed by this wallet for RevertLens will carry the project's assigned attribution tag `celo_235f6ef56f5b`.

---

## 5. Security & Invariant Checklist

- [x] No private keys or seed phrases exist in Git or repository files.
- [x] No signing credentials appear in any server logs, API responses, or frontend assets.
- [x] Signing operations are isolated to the external operator keystore / wallet.
- [x] Chain ID 42220 is enforced before any transaction payload is prepared.
- [x] The public address is publicly verifiable on Celo block explorers:  
  [https://celoscan.io/address/0x3e1bef07824cd0E076F4907641F0A0EF27898e52](https://celoscan.io/address/0x3e1bef07824cd0E076F4907641F0A0EF27898e52)

---

## 6. Action for Human Operator

The human operator must provide this exact address in the hackathon entry form:
```text
0x3e1bef07824cd0E076F4907641F0A0EF27898e52
```
Do not create a new wallet or change this address in project settings.
