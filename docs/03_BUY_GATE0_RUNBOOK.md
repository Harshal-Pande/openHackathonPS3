# 03 — Gate 0: Buy live integration proof

## Purpose

Gate 0 is a technical go/no-go test. It must be completed before building the main UI. The most important unknown is whether the Buy-routed Chainstack Celo endpoint supports `debug_traceTransaction` and returns a useful call tree.

## 1. Safety rules

- Use a dedicated low-balance project wallet.
- The human operator owns and controls the wallet.
- Never ask for a seed phrase/private key.
- Never export keychain contents.
- Never fund or sign without explicit human action.
- Read current Buy docs and `buy --help`; package versions and flags can change.
- Start with free/read-only discovery.
- Quote exact request bodies.
- Stop for approval before each paid call.
- Do not automatically retry ambiguous calls.

## 2. Read-only discovery

Record:
- date/time UTC;
- OS;
- Node version;
- npm version;
- Buy CLI version;
- relevant `buy --help` output;
- installed skill version and source URL;
- whether the CLI wallet/keychain is available (do not reveal secret material);
- current live catalogue JSON, stored as a redacted artifact.

Live catalogue source: `https://gateway.usebuy.ai/v1/catalog`

For each candidate capability record:
- capability ID;
- available flag;
- method;
- URL;
- input schema;
- accepted token options;
- price or price options;
- provider/platform label.

Do not hardcode a capability based on this document. Use the live result.

## 3. Select a failed Celo transaction

Candidate only; verify independently before use:
`0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445`

Check that:
- transaction exists;
- chain is Celo mainnet;
- receipt status is failed;
- block and transaction fields are available;
- it is appropriate for a public demonstration.

If this candidate is invalid or no longer useful, find another publicly inspectable failed Celo mainnet transaction. Do not fabricate one.

## 4. Exact RPC requests

Use JSON-RPC IDs that are unique and stable within the request.

Initial candidate batch:
- `eth_chainId`
- `eth_getTransactionByHash` with the chosen hash
- `eth_getTransactionReceipt` with the chosen hash

Trace request candidate:
- method `debug_traceTransaction`
- params `[txHash, {"tracer":"callTracer"}]`

The trace request is only a candidate. Use the current live capability input schema and exact route. Do not add undocumented fields such as tracer configuration or timeout unless the provider schema/docs explicitly support them.

## 5. Quote and operator approval

For each paid request, show:
- provider and capability ID;
- method and exact URL;
- exact serialized body;
- SHA-256 body hash;
- token symbol;
- token contract;
- token decimals;
- amount in atomic units;
- human-readable amount;
- recipient/payee;
- quote timestamp and expiry;
- maximum spend requested;
- purpose.

The human operator must approve the exact quote. A general instruction to build or test is not approval.

## 6. Execute once and verify

Use the currently documented Buy CLI/MCP flow. Inspect current help for exact command syntax. Do not assume examples from older versions are still valid.

After execution preserve:
- redacted CLI output;
- provider response;
- correlation ID;
- settlement transaction hash;
- receipt;
- payer/authorizer if recoverable;
- tx sender;
- recipient;
- token;
- amount;
- service response status.

Verify settlement independently. Never infer payment success from HTTP status alone.

## 7. Cencori test

Discover the live Cencori capability and schema. The historical skill snapshot documented an OpenAI-compatible chat completion route, but the live catalogue and exact quote are authoritative.

Send a minimal structured test request. Then test an incomplete evidence object and confirm the model says insufficient evidence rather than inventing a reason. Validate output against the expected schema.

## 8. Gate 0 result table

Create `GATE0_RESULTS.md` with one row per item:
- `PASS`
- `FAIL`
- `BLOCKED`
- `NOT_TESTED`

Required items:
1. Current Buy CLI inspected.
2. Live catalogue fetched.
3. Chainstack capability available.
4. Exact quote for initial RPC batch.
5. Paid transaction/receipt call settled.
6. Transaction and receipt returned and validated.
7. Trace quote obtained.
8. Trace request accepted.
9. Trace response usable and call tree parsed.
10. Cencori capability available.
11. Cencori quote obtained.
12. Cencori paid call settled.
13. Cencori output validated.
14. Keychain/CLI works on intended deployment host.

Every PASS must point to a real artifact. No PASS by assumption.

## 9. Go/no-go

- **Primary GO:** Chainstack payment settled, transaction/receipt work, usable trace returned, Cencori call works or a deterministic explanation fallback is accepted.
- **Receipt-only fallback:** paid Chainstack RPC works but trace does not. Re-scope and re-score; never call it a transaction debugger.
- **STOP:** paid Chainstack RPC unavailable. Do not quietly use free RPC and claim Buy is core.
- **Cencori fallback:** if unavailable, deterministic explanation is allowed only if trace path itself has enough user value.
- **No spend approval:** no paid call. Continue only with mocked local code and mark Gate 0 blocked.
