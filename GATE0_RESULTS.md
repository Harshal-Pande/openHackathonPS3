# Gate 0 Results — Buy Integration Verification

**Date/time UTC:** 2026-11-07 06:07:00 UTC  
**Operator:** Pending human operator approval for paid calls  
**Machine/OS:** Windows 10/11 (win32 x64)  
**Node:** v22.17.0  
**npm:** 11.6.1  
**Buy CLI version:** 0.8.5 — `@celo/buy` via `npx @celo/buy@latest`  
**Deployment target:** Local development host  

---

| Check | Status | Test class | Evidence | Notes |
|---|---|---|---|---|
| Current Buy CLI inspected | PASS | LOCAL | `npx @celo/buy@latest --help` exit 0 | Version 0.8.5; commands: setup, whoami, curl, quote, receipts, mcp, etc. |
| Buy `quote` subcommand works (no wallet) | PASS | LOCAL | `buy quote` exit 0, prints 402 JSON | Confirmed `--json` output parseable. curl `@file` body syntax required on Windows. |
| Live catalogue fetched | PASS | LIVE_MAINNET_READ_ONLY | `gateway.usebuy.ai/v1/catalog` HTTP 200 | 170 capabilities; gateway version 1; payment protocol x402. |
| `chainstack.celo` capability available | PASS | LIVE_MAINNET_READ_ONLY | Catalog + 402 challenge | ID `chainstack.celo`, available: true, $0.01 USDC/USDT/USAT per call. |
| `chainstack.celo` 402 quote obtained | PASS | LIVE_MAINNET_READ_ONLY | `buy quote` output | Payee `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`, 10000 atomic USDC on Celo 42220. |
| `cencori.v1.chat.completions` available | PASS | LIVE_MAINNET_READ_ONLY | Catalog + 402 challenge | Model `maximo-atlas-1.3`, available: true, $0.01 per call. |
| `cencori` 402 quote obtained | PASS | LIVE_MAINNET_READ_ONLY | HTTP 402 body | Same payee and amount as Chainstack. |
| Candidate failed Celo tx verified | PASS | LIVE_MAINNET_READ_ONLY | Blockscout API | `0xb90bcca5...` block 52460432; reverted `Error(string)`: `"Swap reverted"`. |
| Buy wallet / account configured | BLOCKED | LOCAL | `buy whoami` → `no_account` error | Requires `buy setup` by the human operator; no key material accepted by agent. |
| RPC purchase settled | NOT_TESTED | LIVE_MAINNET_PAID | — | BLOCKED: No operator spend approval granted; wallet not configured. |
| Transaction/receipt returned & validated | NOT_TESTED | LIVE_MAINNET_PAID | — | BLOCKED on RPC purchase. |
| Trace quote obtained via `buy quote` | NOT_TESTED | LIVE_MAINNET_READ_ONLY | — | To be run separately; body must include `debug_traceTransaction` payload. |
| Trace call accepted & call tree parsed | NOT_TESTED | LIVE_MAINNET_PAID | — | BLOCKED: Requires paid call. Cannot confirm `callTracer` support without execution. |
| Cencori purchase settled | NOT_TESTED | LIVE_MAINNET_PAID | — | BLOCKED: No operator spend approval granted. |
| Cencori output validated against schema | NOT_TESTED | LIVE_MAINNET_PAID | — | BLOCKED on purchase. |
| Buy receipts settlement verification | NOT_TESTED | LIVE_MAINNET_PAID | — | `buy receipts --json --resolve` will verify settlement; not yet tested. |

---

## Exact Quote Evidence (Read-Only, No Spend)

### Chainstack Celo — `buy quote` output (2026-11-07)
- **Capability ID:** `chainstack.celo`  
- **Method:** POST  
- **URL:** `https://gateway.usebuy.ai/chainstack/celo`  
- **maxAmountRequired (USDC):** `10000` atomic units = $0.01  
- **Asset (USDC):** `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`  
- **Asset (USDT):** `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`  
- **Asset (USAT):** `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771`  
- **Payee:** `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`  
- **maxTimeoutSeconds:** 60  

### Cencori — HTTP 402 body (2026-11-07)
- **Capability ID:** `cencori.v1.chat.completions`  
- **Model:** `maximo-atlas-1.3`  
- **maxAmountRequired (USDC):** `10000` atomic units = $0.01  
- **Payee:** `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`  

---

## Official Buy Integration Mechanism (Identified 2026-11-07)

- **Package:** `@celo/buy` on npm  
- **Confirmed version:** 0.8.5  
- **Invocation (no install):** `npx @celo/buy@latest`  
- **Invocation (global install):** `npm install -g @celo/buy` then `buy`  
- **Wallet management:** `buy setup` stores key in OS keychain (Windows Credential Manager / macOS Keychain). No keys ever passed to or stored by this application.  
- **Quote (no spend):** `buy --json quote <url> -X POST -H 'content-type: application/json' --data @body.json`  
- **Paid call:** `buy --json curl --max-amount <cap> <url> -X POST -H 'content-type: application/json' --data @body.json`  
- **Receipt/settlement:** `buy --json receipts --limit 1 --resolve`  
- **Backend adapter pattern:** Spawn `npx` (or `buy`) as a child process with a **fixed argv array** (no shell), strict timeout, capped `max-amount`, bounded stdout capture, and mandatory redaction of any secret material from logs.  

---

## Decision

- [ ] PRIMARY GO: trace path proven.  
- [ ] RECEIPT-ONLY FALLBACK: paid RPC works, trace unavailable.  
- [ ] STOP: paid Chainstack RPC unavailable.  
- [x] **BLOCKED: Operator wallet not configured; no spend approval granted.**  

**Reason:** All read-only discovery is complete. Both `chainstack.celo` and `cencori.v1.chat.completions` are confirmed active and priced. The `@celo/buy` CLI v0.8.5 is available and its `quote` subcommand works without a wallet. Live paid execution awaits: (1) the operator running `buy setup` to provision a project wallet, (2) funding that wallet with a small USDC/USDT balance, and (3) explicit approval of the exact $0.01 test payload in this conversation.
