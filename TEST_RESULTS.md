# Test Results

**Date/time:** 2026-11-07 06:46:00 UTC  
**Commit:** 7d59083 + Phase 4 implementation  
**Node:** v22.17.0  
**npm:** 11.6.1  

| Command | Exit code | Result | Notes |
|---|---:|---|---|
| `npm run typecheck` | 0 | PASS | Server (`tsconfig.server.json`) & client (`tsconfig.client.json`) strict; 0 errors |
| `npm test` | 0 | PASS | **7 test files, 35/35 tests passed** in 1.35s |
| `npm run build` | 0 | PASS | Server: `dist/server/`; Client: `dist/client/assets/index-zVKXPFNf.js` (240.71 kB) via Vite 6.4.5 |

---

## Test breakdown by file

### `tests/config.test.ts` — 14 tests PASS (LOCAL)
| Test | Class | Result |
|---|---|---|
| Loads valid default config | LOCAL | PASS |
| Defaults to `npx @celo/buy@latest` as Buy CLI | LOCAL | PASS |
| Correctly parses boolean flag transforms | LOCAL | PASS |
| Rejects invalid NODE_ENV values | LOCAL | PASS |
| Parses comma-separated allowlists into arrays | LOCAL | PASS |
| Rejects placeholder SESSION_SECRET in production | LOCAL | PASS |
| Rejects SESSION_SECRET < 32 chars in production | LOCAL | PASS |
| Rejects placeholder OPERATOR_PASSWORD_HASH in production | LOCAL | PASS |
| Allows valid production config with all required fields | LOCAL | PASS |
| Rejects production with BUY_ENABLED=true + zero daily budget | LOCAL | PASS |
| Rejects production with BUY_ENABLED=true + zero per-call cap | LOCAL | PASS |
| BUY_ENABLED defaults to false in all environments | LOCAL | PASS |
| CENCORI_ENABLED defaults to false in all environments | LOCAL | PASS |
| All spending limits default to zero | LOCAL | PASS |

### `tests/health.test.ts` — 2 tests PASS (LOCAL)
| Test | Class | Result |
|---|---|---|
| GET /api/health returns 200 with API envelope & chainstackConfigured flag | LOCAL | PASS |
| CORS headers set correctly for configured origin | LOCAL | PASS |

### `tests/chainstackProvider.test.ts` — 6 tests PASS (MOCKED)
| Test | Class | Result |
|---|---|---|
| reports isConfigured true when URL present | MOCKED | PASS |
| reports isConfigured false when URL missing | MOCKED | PASS |
| enforces Celo Mainnet chain ID 42220 | MOCKED | PASS |
| rejects non-Celo chain ID | MOCKED | PASS |
| redacts secret RPC URL in error outputs | MOCKED | PASS |
| gracefully detects unsupported trace method (-32601) | MOCKED | PASS |

### `tests/revertDecoder.test.ts` — 5 tests PASS (LOCAL)
| Test | Class | Result |
|---|---|---|
| decodes standard Solidity Error(string) | LOCAL | PASS |
| decodes Solidity Panic(0x01) assert failure | LOCAL | PASS |
| decodes Solidity Panic(0x11) arithmetic overflow | LOCAL | PASS |
| returns custom error for unknown selector | LOCAL | PASS |
| handles empty or malformed revert data gracefully | LOCAL | PASS |

### `tests/traceParser.test.ts` — 3 tests PASS (LOCAL)
| Test | Class | Result |
|---|---|---|
| flattens nested call frame tree and tracks depth | LOCAL | PASS |
| detects when a child revert propagates to root | LOCAL | PASS |
| distinguishes caught child revert from root failure | LOCAL | PASS |

### `tests/forensics.test.ts` — 3 tests PASS (LOCAL)
| Test | Class | Result |
|---|---|---|
| builds atomic evidence items with SHA-256 hashes | LOCAL | PASS |
| classifies explicit revert with decoded string | LOCAL | PASS |
| classifies panic error with code and explanation | LOCAL | PASS |

### `tests/investigations.test.ts` — 2 tests PASS (LOCAL/MOCKED)
| Test | Class | Result |
|---|---|---|
| rejects invalid transaction hash format with HTTP 400 | LOCAL | PASS |
| executes full investigation with mocked provider and persists report to SQLite | MOCKED | PASS |

---

## Test class breakdown

- **LOCAL:** 26 passed  
- **MOCKED:** 9 passed  
- **LIVE_MAINNET_PAID:** 0 (zero personal budget spent; zero paid calls executed)  
- **TOTAL:** **35 passed, 0 failed**  
