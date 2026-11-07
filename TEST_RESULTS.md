# Test Results

**Date/time:** 2026-11-07 07:28:00 UTC  
**Commit:** Phase 6 Cencori AI integration & Buy payment architecture  
**Node:** v22.17.0  
**npm:** 11.6.1  

| Command | Exit code | Result | Notes |
|---|---:|---|---|
| `npm run typecheck` | 0 | PASS | Server (`tsconfig.server.json`) & client (`tsconfig.client.json`) strict; 0 errors |
| `npm test` | 0 | PASS | **12 test files, 78/78 tests passed** in 1.83s |
| `npm run build` | 0 | PASS | Server: `dist/server/`; Client: `dist/client/assets/index-BXaFsXBa.js` (472.36 kB) via Vite 6.4.5 |

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

### `tests/traceParser.test.ts` — 7 tests PASS (LOCAL)
| Test | Class | Result |
|---|---|---|
| parses single frame without subcalls | LOCAL | PASS |
| correctly tracks nested calls and identifies propagated failure | LOCAL | PASS |
| distinguishes caught child error (parent does not fail) vs propagated error | LOCAL | PASS |
| marks child error as CAUGHT_CHILD_REVERT when parent continues and makes subsequent calls | LOCAL | PASS |
| classifies multiple failing child branches as CAUSALITY_UNCERTAIN | LOCAL | PASS |
| marks root-only failure as OBSERVED_FAILURE | LOCAL | PASS |
| handles empty revert data and missing optional frame fields gracefully | LOCAL | PASS |

### `tests/forensics.test.ts` — 3 tests PASS (LOCAL)
| Test | Class | Result |
|---|---|---|
| builds atomic evidence items with SHA-256 hashes | LOCAL | PASS |
| classifies explicit revert with decoded string | LOCAL | PASS |
| classifies panic error with code and explanation | LOCAL | PASS |

### `tests/investigations.test.ts` — 6 tests PASS (LOCAL/MOCKED)
| Test | Class | Result |
|---|---|---|
| rejects invalid transaction hash format with HTTP 400 | LOCAL | PASS |
| executes full investigation with mocked provider and persists report to SQLite | MOCKED | PASS |
| validates UUID format in GET /api/investigations/:id with 400 INVALID_INPUT | LOCAL | PASS |
| validates limit query param in GET /api/investigations with 400 INVALID_INPUT | LOCAL | PASS |
| handles invalid JSON body in POST /api/investigations with 400 INVALID_INPUT | LOCAL | PASS |
| performs full round-trip persistence to SQLite and restores all fields across instance reload | LOCAL | PASS |

### `tests/regressionEdgeCases.test.ts` — 10 tests PASS (LOCAL/MOCKED)
| Test | Class | Result |
|---|---|---|
| handles trace timeout gracefully with TIMEOUT status and limitations note | MOCKED | PASS |
| handles unsupported trace method (-32601) with UNSUPPORTED status | MOCKED | PASS |
| handles rate limiting (429) during trace retrieval with RATE_LIMITED status | MOCKED | PASS |
| returns HTTP 502 with redacted URL on provider network outage | MOCKED | PASS |
| correctly classifies pending transaction in mempool without false revert | MOCKED | PASS |
| handles mined transaction with null receipt as UNCONFIRMED_RECEIPT | MOCKED | PASS |
| detects malformed trace payload and sets INVALID_RESPONSE | MOCKED | PASS |
| returns HTTP 404 when transaction is not found on Celo Mainnet | MOCKED | PASS |
| returns HTTP 503 when RPC endpoint is not configured | LOCAL | PASS |
| verifies evidence correctness and does not treat caught child reverts as root cause | LOCAL | PASS |

### `tests/cencoriProvider.test.ts` — 3 tests PASS (LOCAL/MOCKED)
| Test | Class | Result |
|---|---|---|
| respects enabled and disabled states | LOCAL | PASS |
| constructs strict, evidence-only prompt payload conforming to schema | LOCAL | PASS |
| generates quote object with exact body SHA-256 hash | MOCKED | PASS |

### `tests/aiValidation.test.ts` — 9 tests PASS (LOCAL)
| Test | Class | Result |
|---|---|---|
| accepts valid, well-cited AI response conforming to evidence | LOCAL | PASS |
| rejects AI response referencing non-existent evidence IDs | LOCAL | PASS |
| rejects proven facts that fail to cite an evidence reference | LOCAL | PASS |
| rejects confidence elevation above deterministic confidence | LOCAL | PASS |
| rejects invented addresses not present in the on-chain evidence | LOCAL | PASS |
| rejects hallucinated revert reasons not observed on chain | LOCAL | PASS |
| quarantines prompt injection patterns in AI response text | LOCAL | PASS |
| handles malformed JSON and rejects empty responses gracefully | LOCAL | PASS |
| automatically preserves missing deterministic limitations | LOCAL | PASS |

### `tests/buyQuote.test.ts` — 9 tests PASS (LOCAL)
| Test | Class | Result |
|---|---|---|
| creates immutable quote record bound to body SHA-256 with AWAITING_OPERATOR_APPROVAL status | LOCAL | PASS |
| rejects quote creation when unapproved capability is requested | LOCAL | PASS |
| rejects quote creation for non-Celo chain IDs | LOCAL | PASS |
| rejects quote creation for unapproved recipient addresses | LOCAL | PASS |
| rejects quote creation exceeding per-call spending cap | LOCAL | PASS |
| rejects quote approval when expected body SHA-256 does not match quoted body | LOCAL | PASS |
| allows authenticated operator to approve matching quote and transitions status to APPROVED | LOCAL | PASS |
| rejects duplicate approval of an already-approved quote | LOCAL | PASS |
| rejects approval when quote has expired | LOCAL | PASS |

### `tests/buySecurity.test.ts` — 4 tests PASS (LOCAL)
| Test | Class | Result |
|---|---|---|
| rejects quote approval from unauthenticated public callers with HTTP 401 | LOCAL | PASS |
| allows authenticated operator to log in and approve quote | LOCAL | PASS |
| emergency kill switch immediately halts all quote creation and approvals | LOCAL | PASS |
| persists quote records, approval state, and body SHA-256 durably across SQLite reload | LOCAL | PASS |

---

## Test class breakdown

- **LOCAL:** 54 passed  
- **MOCKED:** 24 passed  
- **LIVE_MAINNET_PAID:** 0 (zero personal budget spent; zero paid calls executed)  
- **TOTAL:** **78 passed, 0 failed**  
