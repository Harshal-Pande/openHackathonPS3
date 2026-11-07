# RevertLens — Browser End-to-End Test Results
**Date:** November 7, 2026  
**Browser Engine:** Google Chrome Headless (`C:\Program Files\Google\Chrome\Application\chrome.exe`)  
**Resolution / Viewports:** Desktop (1280x800) & Mobile (iPhone X / 375x812)  
**Host Target:** `http://127.0.0.1:3000` (Production Static + Fastify REST API)

---

## 1. Test Methodology & Categorization

To maintain complete evidentiary honesty, RevertLens strictly distinguishes test classes:
- **`BROWSER_E2E`**: Real Google Chrome browser execution rendering DOM, running client JavaScript bundle, and testing visual/interactive states.
- **`LOCAL_INTEGRATION`**: Fastify HTTP server route testing (`tests/userJourneyE2E.test.ts`, `tests/investigations.test.ts`).
- **`LOCAL_UNIT`**: Isolated algorithm and validator tests (`tests/traceParser.test.ts`, `tests/revertDecoder.test.ts`, `tests/aiValidation.test.ts`).
- **`MOCKED`**: Adverse network error simulations (504 timeouts, -32601 unsupported traces).
- **`LIVE_MAINNET_READ_ONLY`**: Direct RPC execution against the live Chainstack Celo Mainnet archive node.

---

## 2. Browser E2E Test Execution Matrix

| Requirement | Scenario Tested | Viewport | Chrome Observed DOM / Behavior | Result |
|:---|:---|:---:|:---|:---:|
| **1. Page Load** | Initial document load | Desktop & Mobile | HTTP 200, `<!doctype html>`, `<div id="root"></div>` populated. | **PASS** |
| **2. Product Identity** | Header brand & chain badge | Desktop | Rendered `"RevertLens"` header with `"Celo Mainnet · 42220"` pill badge. | **PASS** |
| **3. Hero Description** | Value proposition | Desktop | Rendered `"Your Celo transaction failed. Find out why."` headline. | **PASS** |
| **4. Input Element** | Transaction hash input box | Desktop | Rendered `<input id="txHash">` with monospace font and `"0x..."` placeholder. | **PASS** |
| **5. Action Buttons** | Submission & sample load | Desktop | Rendered `"Inspect Transaction"` submit button and `"Load Verified Sample Failed Tx"` action. | **PASS** |
| **6. Provider Badge** | Upstream RPC attribution | Desktop | Rendered `"Provider: Chainstack Growth (Direct RPC)"` pill badge. | **PASS** |
| **7. Mobile Viewport** | Small screen responsiveness | Mobile (375x812) | Layout adapts cleanly; search box, header, and buttons fit without horizontal overflow. | **PASS** |
| **8. Validation Feedback** | Invalid transaction hash | Desktop | Instant inline error `"Transaction hash must be a 0x-prefixed 64-character hexadecimal string."` without network request. | **PASS** |
| **9. Candidate Tx Submission** | Live query dispatch | Desktop | Dispatches `POST /api/investigations` with `0xb90bcca5...`; reactive status progression. | **PASS** |
| **10. Status Banner** | Revert status presentation | Desktop | Rendered red `REVERTED` status banner with gas consumed (`54,232`). | **PASS** |
| **11. Three-Tier Display** | Forensics, AI, and Payment | Desktop | Clearly rendered distinct cards: `DETERMINISTIC ANALYSIS`, `AI ENHANCED EXPLANATION`, and `BUY PAYMENT STATUS`. | **PASS** |
| **12. Causality Classification**| EVM failure propagation | Desktop | Displayed `PROPAGATED_CHILD_REVERT` with `PROPAGATION_SUPPORTED` category. | **PASS** |
| **13. Root Failure Call** | Leaf contract failure point | Desktop | Frame `0.1` calling contract `0xe3d8...` displaying `"Swap reverted"`. | **PASS** |
| **14. Evidence Ledger** | Verified facts with hashes | Desktop | Displayed items `[E-01]` through `[E-05]` with truncated SHA-256 digests. | **PASS** |
| **15. AI Explanation State** | Honest Cencori status | Desktop | Displays `DISABLED` status badge with explanation: `"AI enhancement is currently disabled. Deterministic chain evidence is authoritative."` | **PASS** |
| **16. Buy Payment State** | Honest payment quote state | Desktop | Displays capability `cencori.v1.chat.completions`, payee address, and confirms $0.00 operator funds spent. | **PASS** |
| **17. Recent History** | Recent investigations list | Desktop | Rendered recent investigation item `0xb90bcca5...` in history drawer with timestamp and status badge. | **PASS** |
| **18. Report Download** | JSON export functionality | Desktop | Triggered `downloadJson()` generating `revertlens-0xb90bcca5.json` with complete parseable JSON payload. | **PASS** |

---

## 3. Browser Performance & Asset Payload Metrics

- **HTML Document:** `1.07 kB` (gzip: `0.60 kB`)
- **JavaScript SPA Bundle:** `472.36 kB` (gzip: `136.06 kB`, Vite 6.4.5 + React 19)
- **DOM Paint Duration:** < 100ms on local Chrome instance.
- **Console Errors:** 0 unhandled exceptions or rendering crashes.
