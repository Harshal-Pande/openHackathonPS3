# Gate 0 Results — Infrastructure & Integration Verification

**Date/time UTC:** 2026-11-07 06:45:00 UTC  
**Machine/OS:** Windows 10/11 (win32 x64)  
**Node:** v22.17.0  
**npm:** 11.6.1  
**Buy CLI version:** 0.8.5 — `@celo/buy` via `npx @celo/buy@latest`  
**Deployment target:** Local development host  

---

| Check | Status | Test class | Evidence | Notes |
|---|---|---|---|---|
| Current Buy CLI inspected | PASS | LOCAL | `npx @celo/buy@latest --help` exit 0 | Version 0.8.5; confirmed subcommands: `setup`, `whoami`, `curl`, `quote`, `receipts`. |
| Buy `quote` subcommand works (no wallet) | PASS | LOCAL | `buy quote` exit 0, prints 402 JSON | Verified parseable `--json` output using `@file` syntax on Windows. |
| Live catalogue fetched | PASS | LIVE_MAINNET_READ_ONLY | `gateway.usebuy.ai/v1/catalog` HTTP 200 | 170 capabilities; gateway version 1; protocol x402-v1 / x402-v2. |
| `chainstack.celo` capability available | PASS | LIVE_MAINNET_READ_ONLY | Catalog + 402 challenge | ID `chainstack.celo`, available: true, $0.01 USDC/USDT/USAT per call. |
| Initial RPC quote obtained | PASS | LIVE_MAINNET_READ_ONLY | `buy quote` output | Payee `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`, 10000 atomic USDC on Celo 42220. |
| Candidate failed Celo tx verified | PASS | LIVE_MAINNET_READ_ONLY | Blockscout API | `0xb90bcca5...` block 52460432; reverted `Error(string)`: `"Swap reverted"`. |
| **Trace quote obtained via `buy quote`** | **PASS** | **LIVE_MAINNET_READ_ONLY** | `buy quote` with trace payload | Body SHA-256: `35406284f1673b329e88e9b2d7e162c4e515123aec7237ef8aea1acba23b7882`; Quoted 10,000 atomic units ($0.01 USDC). |
| `cencori.v1.chat.completions` available | PASS | LIVE_MAINNET_READ_ONLY | Catalog + 402 challenge | Model `maximo-atlas-1.3`, available: true, $0.01 per call. |
| USA₮ Faucet eligibility confirmed | PASS | LOCAL | Google Cloud Web3 Celo Mainnet Faucet | Self ZK-pass verification yields USA₮; accepted by Buy gateway at zero personal cost. |
| Direct Chainstack Growth Node Provisioned | PASS | LIVE_MAINNET_READ_ONLY | Operator dashboard (`ND-801-666-498`) | OP Geth, 250 RPS, debug/trace namespaces, Celo Mainnet 42220. Adopted under AD-008. |
| Direct Chainstack Provider & Client Built | PASS | LOCAL_TESTED | `tests/chainstackProvider.test.ts` (6/6 pass) | Enforces chainId 42220, exponential backoff, URL redaction (`[REDACTED_RPC_ENDPOINT]`). |
| Forensic Pipeline (revertDecoder, traceParser, classifier) | PASS | LOCAL_TESTED | `tests/revertDecoder.test.ts`, `tests/traceParser.test.ts`, `tests/forensics.test.ts` | 14/14 tests passing. Decodes `Error(string)` and `Panic(uint256)`, checks revert propagation. |
| Investigation Service & SQLite Persistence | PASS | LOCAL_TESTED | `tests/investigations.test.ts` (2/2 pass) | Persists investigations and atomic evidence items to SQLite. |
| React Dark Forensics Dashboard | PASS | LOCAL_TESTED | Vite build (`dist/client`) | Full UI with call trace viewer, root failure highlights, evidence ledger, report download. |
| Full Automated Test Suite | PASS | LOCAL_TESTED | Vitest (35/35 passing) | 100% pass across all 7 test files. |
| Live Chainstack Node Execution | BLOCKED | LIVE_MAINNET_READ_ONLY | Awaiting `.env` creation | Requires operator to set `CHAINSTACK_CELO_MAINNET_RPC_URL` in `.env`. |

---

## Exact Quote Evidence (Live Read-Only Discovery)

### Candidate Trace Request Quote (`debug_traceTransaction`)
- **Capability ID:** `chainstack.celo`
- **Method:** `POST`
- **URL:** `https://gateway.usebuy.ai/chainstack/celo`
- **Target Transaction:** `0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445`
- **Exact Body:** `{"jsonrpc":"2.0","id":1,"method":"debug_traceTransaction","params":["0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445",{"tracer":"callTracer"}]}`
- **Body SHA-256 Digest:** `35406284f1673b329e88e9b2d7e162c4e515123aec7237ef8aea1acba23b7882`
- **Quoted Price:** 10,000 atomic units ($0.01 USD)
- **Payee Address:** `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`
- **Allowed Assets (Celo Mainnet 42220):**
  - USDC (`0xcebA9300f2b948710d2653dD7B07f33A8B32118C`)
  - USDT (`0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`)
  - USAT (`0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771`)
- **Timeout:** 60 seconds

---

## Infrastructure Decision (AD-008)

- **RPC Infrastructure:** Direct Chainstack Growth Elastic Global Node (`ND-801-666-498`) on Celo Mainnet (OP Geth, Worldwide global1, 250 RPS) with debug & trace namespaces.
- **Cost:** $0.00 / call (unlimited within Growth plan quota).
- **Payment Architecture:** Buy CLI / MCP gateway capabilities preserved for paid Cencori LLM inference (`cencori.v1.chat.completions`) funded via USA₮ faucet.
- **Action Required to Run Live Query:** Operator creates `.env` with `CHAINSTACK_CELO_MAINNET_RPC_URL="https://celo-mainnet.core.chainstack.com/..."`.
