# UI Current State Audit
_Generated: 2026-11-07_

## Build & Test Baseline

| Command | Result |
|---------|--------|
| `npm install` | ✓ EXIT 0 (4 vulns, no breaking) |
| `npm run typecheck` | ✓ EXIT 0 — no type errors |
| `npm test` | ✓ EXIT 0 — **110 tests passed**, 14 test files |
| `npm run build` | ✓ EXIT 0 — dist/client/assets/index-BXaFsXBa.js 472.36 kB |

## Defect Confirmation Against Actual Code

| ID | Description | Confirmed? | Evidence |
|----|-------------|------------|----------|
| D1 | Buy card shows "$0.00 (Zero spend incurred)" green | **CONFIRMED** | App.tsx line 815: `$0.00 (Zero spend incurred)` with `color: '#22c55e'` |
| D2 | AI shows "DISABLED" on reloaded reports when aiExplanation===null | **CONFIRMED** | App.tsx line 721: `report.aiExplanation?.status \|\| 'DISABLED'` |
| D3 | propagatedToParent badge on every frame | **CONFIRMED** | App.tsx line 992-1005: badge shown when `frame.propagatedToParent` is true (not from causalityStatus) |
| D4 | Header hardcodes "Provider: Chainstack Growth" | **CONFIRMED** | App.tsx line 362: `Provider: Chainstack Growth (Direct RPC)` |
| D5 | Loading shows fake step list and spinning emoji | **CONFIRMED** | App.tsx line 545: `⚙️` with spinning animation; lines 554-568: fake step list |
| D6 | Emoji icons (🔍 ⚙️ 🔒) | **CONFIRMED** | App.tsx lines 333, 545, 1140 |
| D7 | Errors drop error.code | **CONFIRMED** | App.tsx line 272: `json.error?.message` only, no code mapping |
| D8 | No history page, no deep links | **CONFIRMED** | No router, single App.tsx file, no hash routing |
| D9 | Types in App.tsx | **CONFIRMED** | All types defined in App.tsx lines 6-187 |
| D10 | E2E tests use inline style selectors | **CONFIRMED** | browser_e2e_cdp.mjs: `querySelector("p[style*='color: rgb(248, 113, 113)']")`, `querySelector("h2[style*='color: rgb(248, 250, 252)']")`, etc. |
| D11 | Footer emoji | **CONFIRMED** | App.tsx line 1140: `🔒 RevertLens...` |
| D12 | System default fonts | **CONFIRMED** | index.html line 26: `-apple-system, BlinkMacSystemFont, "Segoe UI"...` |

## Current File Structure

```
src/client/
  App.tsx  (1145 lines, all inline styles, no components)
  main.tsx (9 lines)
index.html (39 lines, old CSS tokens, system fonts)
```

## Screenshots
- Before screenshots captured to: `screenshots/before/` (via E2E or manual)
