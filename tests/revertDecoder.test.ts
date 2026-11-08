import { describe, it, expect } from 'vitest';
import { decodeRevertData } from '../src/server/forensics/revertDecoder.js';

describe('Revert Decoder', () => {
  it('decodes standard Solidity Error(string) payload', () => {
    // Error("Swap reverted") ABI encoded:
    // Selector: 08c379a0
    // Offset: 0000000000000000000000000000000000000000000000000000000000000020
    // Length: 000000000000000000000000000000000000000000000000000000000000000d (13)
    // String: 5377617020726576657274656400000000000000000000000000000000000000
    const rawRevert =
      '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000d5377617020726576657274656400000000000000000000000000000000000000';

    const decoded = decodeRevertData(rawRevert);
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('ERROR_STRING');
    expect(decoded?.selector).toBe('0x08c379a0');
    expect(decoded?.reason).toBe('Swap reverted');
  });

  it('decodes Solidity Panic(uint256) arithmetic overflow (0x11)', () => {
    // Panic(0x11)
    const rawPanic = '0x4e487b710000000000000000000000000000000000000000000000000000000000000011';
    const decoded = decodeRevertData(rawPanic);

    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('PANIC');
    expect(decoded?.selector).toBe('0x4e487b71');
    expect(decoded?.panicCode).toBe(17);
    expect(decoded?.panicExplanation).toContain('Arithmetic operation underflow or overflow');
  });

  it('decodes Solidity Panic(uint256) division by zero (0x12)', () => {
    const rawPanic = '0x4e487b710000000000000000000000000000000000000000000000000000000000000012';
    const decoded = decodeRevertData(rawPanic);

    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('PANIC');
    expect(decoded?.panicCode).toBe(18);
    expect(decoded?.panicExplanation).toContain('Division or modulo by zero');
  });

  it('handles custom errors with unknown selectors cleanly', () => {
    const customHex = '0x123456780000000000000000000000000000000000000000000000000000000000000001';
    const decoded = decodeRevertData(customHex);

    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('CUSTOM_ERROR');
    expect(decoded?.selector).toBe('0x12345678');
  });

  it('falls back to string reason if raw hex is empty', () => {
    const decoded = decodeRevertData(undefined, 'TransferHelper: TRANSFER_FAILED');
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('ERROR_STRING');
    expect(decoded?.reason).toBe('TransferHelper: TRANSFER_FAILED');
  });

  it('safely handles empty Error("") string with strLen=0', () => {
    // Error("") with offset 0x20 and length 0
    const emptyRevert =
      '0x08c379a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000';
    const decoded = decodeRevertData(emptyRevert);
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('ERROR_STRING');
    expect(decoded?.reason).toBe('');
  });

  it('safely clamps oversized length (> 4096 bytes) and avoids memory exhaustion', () => {
    // Error(string) with length 4097 (0x1001)
    const oversizedLengthHex = '0000000000000000000000000000000000000000000000000000000000001001';
    const rawRevert = `0x08c379a00000000000000000000000000000000000000000000000000000000000000020${oversizedLengthHex}deadbeef`;
    const decoded = decodeRevertData(rawRevert);
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('ERROR_STRING');
    expect(decoded?.reason).toContain('oversized error payload');
  });

  it('safely handles astronomical 64-char length (0xffffff...) without crashing', () => {
    const maxUint256Length = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const rawRevert = `0x08c379a00000000000000000000000000000000000000000000000000000000000000020${maxUint256Length}deadbeef`;
    const decoded = decodeRevertData(rawRevert);
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('ERROR_STRING');
    expect(decoded?.reason).toContain('oversized error payload');
  });

  it('safely handles truncated string data when available bytes are fewer than declared length', () => {
    // Length declares 32 bytes (64 hex chars), but only 8 hex chars ("deadbeef") are provided
    const length32Hex = '0000000000000000000000000000000000000000000000000000000000000020';
    const rawRevert = `0x08c379a00000000000000000000000000000000000000000000000000000000000000020${length32Hex}61626364`; // "abcd"
    const decoded = decodeRevertData(rawRevert);
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('ERROR_STRING');
    expect(decoded?.reason).toBe('abcd');
  });

  it('safely decodes boundary length of exactly 4096 bytes', () => {
    const length4096Hex = '0000000000000000000000000000000000000000000000000000000000001000'; // 4096 in hex
    const charHex = '41'; // ASCII 'A'
    const fullBody = charHex.repeat(4096);
    const rawRevert = `0x08c379a00000000000000000000000000000000000000000000000000000000000000020${length4096Hex}${fullBody}`;
    const decoded = decodeRevertData(rawRevert);
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('ERROR_STRING');
    expect(decoded?.reason?.length).toBe(4096);
    expect(decoded?.reason?.startsWith('AAAA')).toBe(true);
  });

  it('safely handles non-hex characters in revert payload', () => {
    const invalidHex = '0x08c379a0NOT_HEX_CHARACTERS!!';
    const decoded = decodeRevertData(invalidHex, 'Fallback message');
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('ERROR_STRING');
    expect(decoded?.reason).toBe('Fallback message');
  });

  it('safely handles truncated Panic payload', () => {
    const truncatedPanic = '0x4e487b7112'; // incomplete 32-byte code
    const decoded = decodeRevertData(truncatedPanic);
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('PANIC');
    expect(decoded?.panicExplanation).toContain('Generic compiler panic');
  });
});
