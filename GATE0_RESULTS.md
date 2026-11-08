# Gate 0 Results — Infrastructure & Integration Verification

**Date/time UTC:** 2026-11-08 10:45:00 UTC
**Machine/OS:** Windows 10/11 (win32 x64)  
**Node:** v22.17.0  
**npm:** 11.6.1  
**Buy CLI version:** 0.8.5 — `@celo/buy` via `npx @celo/buy@latest`  
**Deployment target:** Local development host  
**Agent Wallet Address:** `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`
**Official Attribution Tag:** `celo_235f6ef56f5b`

---

| Check | Status | Test class | Evidence | Notes |
|---|---|---|---|---|
| Current Buy CLI inspected | PASS | LIVE_MAINNET_READ_ONLY | `npx @celo/buy@latest -V` exit 0 | Version 0.8.5; confirmed subcommands: `setup`, `whoami`, `curl`, `quote`, `receipts`, `skills`, `gate`, `verify`. |
| Buy `whoami` identity inspected | PASS | LIVE_MAINNET_READ_ONLY | `npx @celo/buy@latest whoami` | Paying address `0x3e1bef07824cd0E076F4907641F0A0EF27898e52` on network `celo`; balances: `0 CELO, 0 USDC, 0 USDT, 0 USAT, 0 USDm`. |
| Buy `skills show cencori/inference` inspected | PASS | LIVE_MAINNET_READ_ONLY | `buy skills show cencori/inference` | Capability `cencori.v1.chat.completions`, URL `https://gateway.usebuy.ai/cencori/v1/chat/completions`, flat price $0.01 USDC (10,000 atomic units), model `maximo-atlas-1.3`. |
| Buy `quote` subcommand works (no wallet) | PASS | LOCAL | `buy quote` exit 0, prints 402 JSON | Verified parseable `--json` output using `@file` syntax on Windows. |
| Live catalogue fetched | PASS | LIVE_MAINNET_READ_ONLY | `gateway.usebuy.ai/v1/catalog` HTTP 200 | 170 capabilities; gateway version 1; protocol x402-v1 / x402-v2. |
| `chainstack.celo` capability available | PASS | LIVE_MAINNET_READ_ONLY | Catalog + 402 challenge | ID `chainstack.celo`, available: true, $0.01 USDC/USDT/USAT per call. |
| Initial RPC quote obtained | PASS | LIVE_MAINNET_READ_ONLY | `buy quote` output | Payee `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`, 10000 atomic USDC on Celo 42220. |
| Candidate failed Celo tx verified | PASS | LIVE_MAINNET_READ_ONLY | Blockscout API / Chainstack OP Geth | `0xb90bcca5...` block 52460432; reverted `Error(string)`: `"Swap reverted"`. |
| Direct Chainstack Growth Node Provisioned | PASS | LIVE_MAINNET_READ_ONLY | Operator dashboard (`ND-801-666-498`) | OP Geth, 250 RPS, debug/trace namespaces, Celo Mainnet 42220. Adopted under AD-008. |
| Bounded Buy Adapter (`src/server/adapters/buyAdapter.ts`) | PASS | LOCAL_TESTED | `tests/buyAdapter.test.ts` (8/8 pass) | Fixed executable `npx.cmd`, `shell: false`, 512 KiB buffer, 60s timeout, credential redaction, independent settlement verification. |
| Payment Lifecycle & 11-State Transitions | PASS | LOCAL_TESTED | `tests/paymentLifecycle.test.ts` (10/10 pass) | Enforces 11-state matrix, atomic budget reservation, single-use approval, SHA-256 integrity, audit ledger. |
| Cencori AI Procurement & Forensic Guardrails | PASS | LOCAL_TESTED | `tests/cencoriProvider.test.ts`, `tests/aiValidation.test.ts` | Strict anti-hallucination validation, address/revert bounding, deterministic fallback. |
| Full Automated Test Suite | PASS | LOCAL_TESTED | Vitest (213/213 passing across 20 suites) | 100% pass across all unit, security, lifecycle, and E2E suites. |
| Master API Surface Audit | PASS | LOCAL_TESTED | `node scripts/verify_all_routes.mjs` (36/36 pass) | 25 unique endpoints verified, including all operator payment and health routes. |
| Browser CDP E2E Automation | PASS | LOCAL_TESTED | `node scripts/browser_e2e_cdp.mjs` (exit code 0) | Desktop (1280x800) and Mobile (375x812) viewports tested with hard assertions and verified screenshots. |
| Live Paid On-Chain Settlement | BLOCKED_PENDING_OPERATOR_APPROVAL | LIVE_MAINNET | Agent wallet balances = 0 | Wallet `0x3e1b...8e52` has 0 CELO and 0 USDC. Paid on-chain settlement blocked until funded by operator. Zero personal spend incurred. |

---

## Live Discovery Evidence (MOD-03 Phase A)

### 1. Buy CLI Version and Wallet Readiness
```
$ npx @celo/buy@latest -V
0.8.5

$ npx @celo/buy@latest whoami
celo_235f6ef56f5b: 0x3e1bef07824cd0E076F4907641F0A0EF27898e52 pays from 0x3e1bef07824cd0E076F4907641F0A0EF27898e52 on celo; balances 0 CELO, 0 USDC, 0 USDT, 0 USAT, 0 USDm
```

### 2. Cencori Capability Discovery (`skills show cencori/inference`)
```
capability:  cencori.v1.chat.completions
endpoint:    https://gateway.usebuy.ai/cencori/v1/chat/completions
method:      POST
price:       0.01 USDC (or USDT, USAT)
model:       maximo-atlas-1.3
payee:       0x20faAca5F980E29639A0FCC6dcA6988E18ed333B
network:     celo (42220)
```

### 3. Live 402 Challenge via `buy quote`
```json
{
  "status": 402,
  "payment": {
    "network": "celo",
    "token": "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    "amount": "10000",
    "payee": "0x20faAca5F980E29639A0FCC6dcA6988E18ed333B"
  }
}
```
