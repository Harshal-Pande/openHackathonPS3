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
});
