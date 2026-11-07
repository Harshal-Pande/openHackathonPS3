---
trigger: glob
globs: "*.ts, *.tsx"
description: "Rules for Celo transaction validation, JSON-RPC, trace parsing, revert decoding and evidence claims."
---
# Celo forensics rules

- Celo mainnet only; expected chain ID is decimal 42220 / hex `0xa4ec`.
- Validate transaction hashes as exactly `0x` plus 64 hexadecimal characters.
- Match JSON-RPC batch responses by `id`, never by array position.
- Validate all provider responses with Zod before use.
- Distinguish transaction not found, pending/no receipt, successful receipt, failed receipt, RPC error and malformed response.
- A receipt status of zero proves execution failure, not the precise root cause.
- A failed nested call is not necessarily the cause of the top-level failure. Determine whether the error propagated through parent frames.
- Preserve call path, frame error, revert data, truncation, timeout and provider limitations.
- Decode `Error(string)` selector `0x08c379a0` and `Panic(uint256)` selector `0x4e487b71` only when ABI payload decoding succeeds.
- Decode custom errors only with an ABI verified for the exact contract implementation active at the transaction's block. Otherwise show selector and bounded raw bytes as unknown.
- Never call a contract malicious solely because a transaction reverted.
- Every factual report claim must reference one or more evidence IDs.
- If evidence is insufficient, report inconclusive. Never force a diagnosis.
