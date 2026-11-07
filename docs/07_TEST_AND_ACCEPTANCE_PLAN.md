# 07 — Test and acceptance plan

## Test classes

- `LOCAL`: local application logic and integration with mocks.
- `MOCKED`: synthetic fixture, never live proof.
- `LIVE_MAINNET`: real Celo mainnet/Buy interaction with explicit operator approval.
- `NOT_TESTED`: not executed.

## Unit tests

### Input
- valid hash;
- uppercase hex;
- leading/trailing whitespace;
- wrong length;
- missing 0x;
- invalid hex.

### Chain/RPC
- chain ID 42220;
- wrong chain;
- transaction missing;
- pending/no receipt;
- successful receipt;
- failed receipt;
- malformed transaction;
- malformed receipt;
- JSON-RPC error;
- batch responses reordered;
- duplicate/missing response IDs.

### Trace
- supported callTracer fixture;
- unsupported method;
- timeout;
- malformed trace;
- oversized trace;
- truncated trace;
- no child calls;
- one child revert;
- caught child revert;
- propagated child revert;
- multiple child failures;
- nested failure with parent success;
- missing revert bytes.

### Revert decoding
- valid Error(string);
- malformed Error(string);
- valid Panic(uint256);
- unknown panic code;
- unknown selector;
- custom error with no ABI;
- custom error with wrong ABI;
- exact implementation ABI at historical block.

### Payment safety
- quote expired;
- quote body changed;
- quote URL changed;
- quote method changed;
- token changed;
- amount changed;
- recipient changed;
- approval replay;
- approval for another quote;
- public user attempts approval;
- missing operator session;
- CSRF failure;
- per-call cap exceeded;
- investigation cap exceeded;
- daily cap exceeded;
- global kill switch;
- concurrent reservation;
- duplicate idempotency key;
- timeout after payment attempt;
- `settle_uncertain`;
- ambiguous 500;
- successful HTTP but no settlement proof;
- verified settlement;
- wrong payee;
- secret redaction.

### LLM
- valid evidence response;
- unknown evidence ID;
- fabricated address;
- fabricated selector;
- unsupported cause;
- instruction injection in revert string;
- excessive output;
- malformed JSON;
- provider error;
- fallback template.

## Golden transaction evaluation

Create a curated set of real Celo failed transactions. For each case record:
- transaction hash;
- observed block;
- receipt status;
- source explorer link;
- whether trace was obtained;
- expected failure path;
- whether failure propagated;
- expected decoder result;
- ground-truth confidence;
- reviewer;
- notes.

Do not use a transaction as a golden case unless a human has reviewed the expected result. Never publish user-submitted hashes without consent.

## Acceptance thresholds

Before real-user release:
- 100% of spend-control negative tests pass;
- 100% of payment ambiguity tests prevent blind retry;
- 100% of report claims reference evidence or are explicitly marked inference/unknown;
- no known critical/high security issue remains unresolved;
- all core app tests pass;
- every live paid call has a verified settlement record;
- no fake or mocked evidence is shown as live.

For forensic accuracy:
- report the exact number of reviewed golden cases;
- measure correct propagated-failure classification;
- measure inconclusive rate;
- do not invent a target accuracy until a baseline set exists;
- if a false root-cause claim occurs, block release and fix the parser/claim policy.

## Required commands

The implementation must provide and run:
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run db:migrate`

If Playwright is configured:
- `npm run test:e2e`

Record exact outputs and exit codes in `TEST_RESULTS.md`.
