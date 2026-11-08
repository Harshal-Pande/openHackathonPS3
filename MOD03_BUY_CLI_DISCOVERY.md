# MOD-03 Official Buy CLI Discovery Report

**Project:** RevertLens — "Your Celo transaction failed. Find out why."  
**Execution Date:** 2026-11-08  
**Environment:** Windows 10/11 x64, Node.js v22.17.0, npm 11.6.1  
**Package:** `@celo/buy` via `npx @celo/buy@latest`  
**Observed Version:** `0.8.5`  

---

## 1. Verified Current Behavior (LIVE & LOCAL)

### 1.1 Package and Version Identification
- **Executable:** `npx @celo/buy@latest`
- **Reported Version:** `0.8.5` (verified via `npx @celo/buy@latest -V`, exit code 0).
- **Runtime Compatibility:** Node.js v22.17.0, npm 11.6.1.

### 1.2 Available Subcommands and Syntax
Command structure verified via `npx @celo/buy@latest --help`:
- `setup [options]` — Generate a Celo wallet and store key in OS keychain (or file via `BUY_KEYSTORE_BACKEND=file`).
- `whoami [options]` — Show the active account and on-chain balances. Supports `--json`.
- `account` — Manage local accounts.
- `receipts [options]` — List recent payments (newest first). Supports `--limit <n>`, `--resolve` (checks on-chain settlement for pending/doubtful payments), and `--json`.
- `skills` — Browse the buy-skills registry of x402-payable providers (`skills list`, `skills search <query>`, `skills show <fqn>`).
- `send [options] <amount> <recipient>` — Send ERC-20 transfer smoke test.
- `curl [options] <curl-args...>` — Run curl with x402 auto-pay. Options: `--max-amount <amount>`, `--force`, `--data-file <path>`, `--token <symbol>` (USDC, USDT, USAT).
- `quote [options] <curl-args...>` — Read the 402 price of a paid route without a wallet (never pays, read-only). Supports `--token <symbol>` and `--json`.
- `verify` — Self.xyz soft-KYC.
- `mcp` — Model Context Protocol server.

### 1.3 Wallet Identity and Readiness (`whoami`)
Verified via `npx @celo/buy@latest whoami --json`:
```text
default on celo
  pays from 0x3e1bef07824cd0E076F4907641F0A0EF27898e52
  balances 0 CELO, 0 USDC, 0 USDT, 0 USAT, 0 USDm
```
- **Active Account:** `default`
- **Network:** Celo Mainnet (`celo`, chain ID 42220)
- **Paying Address:** `0x3e1bef07824cd0E076F4907641F0A0EF27898e52`
- **Readiness:** OS keychain is accessible; wallet identity is configured.
- **Funded Status:** Unfunded (0 CELO, 0 USDC, 0 USDT, 0 USAT). Paid operations cannot settle until funded.

### 1.4 Capability Discovery (`cencori/inference`)
Verified via `npx @celo/buy@latest skills show cencori/inference`:
- **FQN:** `cencori/inference`
- **Capability ID:** `cencori.v1.chat.completions`
- **Service URL:** `https://gateway.usebuy.ai/cencori/v1/chat/completions`
- **Category:** `inference`
- **Payment Scheme:** `exact`, network `celo`, assets `USDC, USDT, USAT`.
- **Flat Price:** `0.01 USDC` (10,000 atomic units). Flat pricing per completion regardless of output tokens.
- **Model:** Closed beta serves strictly `maximo-atlas-1.3`.
- **Max Tokens Allowed:** Strictly `256`, `1024`, or `4096`.
- **Request Body Limit:** 32 KiB.
- **Permitted Fields:** `model`, `messages`, `max_tokens`, `temperature`, `top_p`, `stop`, `seed`.
- **Receipts / Settlement:** Carries `X-PAYMENT-RESPONSE` header when paid. Unfinished/unsettled payments resolved via `buy receipts --resolve`.

### 1.5 Quote Mechanism Verification (`buy quote`)
Verified via `npx @celo/buy@latest --json quote -X POST https://gateway.usebuy.ai/cencori/v1/chat/completions -H "Content-Type: application/json" -d "@<file>"`:
Returns parseable JSON conforming to HTTP 402 challenge:
- `x402Version`: 1
- `accepts`: Array of offers:
  1. USDC: asset `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`, amount `10000` (10,000 atomic = $0.01), payTo `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`, maxTimeoutSeconds 60.
  2. USDT: asset `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`, amount `10000`, payTo `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`.
  3. USAT: asset `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771`, amount `10000`, payTo `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`.
- `error`: `"payment_required"`

---

## 2. Execution & Safety Parameters for Buy Adapter

1. **Child Process Execution:**
   - Executable: `npx` (or direct path to `@celo/buy` cli if configured).
   - Arguments prefix: `['@celo/buy@latest']`.
   - Fixed argument array, `shell: false`. No string interpolation.
   - For file-based bodies: use `--data-file <path>` or `-d "@<path>"` with strict temporary file lifecycle management.
2. **Output Redaction & Size Guard:**
   - Enforce max buffer: 512 KiB.
   - Timeout: 30,000 ms.
   - Redact all private keys, seed phrases, authorization tokens, or Bearer credentials.
3. **Execution Invariants:**
   - Single-use operator approval bound to exact SHA-256 request body hash.
   - Atomic budget reservation before spawn.
   - Ambiguous outcome (timeout/interruption/error) transitions to `SETTLEMENT_UNKNOWN`. Never automatically retried.

---

## 3. Classification of Current Evidence

| Evidence Item | Source | Classification |
|---|---|:---:|
| Buy CLI version 0.8.5 verification | `npx @celo/buy@latest -V` | `LOCAL` |
| Subcommands & options inspection | `npx @celo/buy@latest --help` | `LOCAL` |
| Wallet identity and address | `npx @celo/buy@latest whoami` | `LIVE_MAINNET_READ_ONLY` |
| Cencori skills registry documentation | `npx @celo/buy@latest skills show cencori/inference` | `LIVE_MAINNET_READ_ONLY` |
| Live 402 challenge quote parsing | `npx @celo/buy@latest quote` | `LIVE_MAINNET_READ_ONLY` |
| Live paid payment settlement | Requires funded wallet and operator approval | `NOT_TESTED` |
