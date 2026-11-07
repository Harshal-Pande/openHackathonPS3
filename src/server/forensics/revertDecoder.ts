import { DecodedRevert } from './types.js';

const PANIC_DESCRIPTIONS: Record<number, string> = {
  0x00: 'Generic compiler panic',
  0x01: 'Assert evaluated to false',
  0x11: 'Arithmetic operation underflow or overflow',
  0x12: 'Division or modulo by zero',
  0x21: 'Enum conversion out of bounds',
  0x22: 'Storage byte array incorrectly encoded',
  0x31: 'Called .pop() on an empty array',
  0x32: 'Array index out of bounds or negative index',
  0x41: 'Allocating too much memory or creating an array that is too large',
  0x51: 'Calling a zero-initialized variable of internal function type'
};

export function decodeRevertData(rawHex?: string, fallbackReason?: string): DecodedRevert | null {
  if (!rawHex && fallbackReason) {
    return {
      type: 'ERROR_STRING',
      reason: fallbackReason
    };
  }

  if (!rawHex || typeof rawHex !== 'string') return null;

  const hex = rawHex.startsWith('0x') ? rawHex.slice(2) : rawHex;
  if (hex.length < 8) {
    if (fallbackReason) {
      return { type: 'ERROR_STRING', reason: fallbackReason, rawBytes: rawHex };
    }
    return null;
  }

  const selector = '0x' + hex.slice(0, 8).toLowerCase();

  // 1. Error(string) => selector 0x08c379a0
  if (selector === '0x08c379a0') {
    try {
      const dataHex = hex.slice(8);
      // Standard ABI encoding:
      // Offset to string (32 bytes): chars 0-64
      // Length of string (32 bytes): chars 64-128
      // String data: chars 128 onwards
      if (dataHex.length >= 128) {
        const lengthHex = dataHex.slice(64, 128);
        const strLen = parseInt(lengthHex, 16);
        const strBytesHex = dataHex.slice(128, 128 + strLen * 2);
        const strBuffer = Buffer.from(strBytesHex, 'hex');
        const reason = strBuffer.toString('utf8');

        return {
          type: 'ERROR_STRING',
          selector,
          reason,
          rawBytes: rawHex
        };
      }
    } catch {
      // Fallback
    }
    return {
      type: 'ERROR_STRING',
      selector,
      reason: fallbackReason || 'Execution reverted',
      rawBytes: rawHex
    };
  }

  // 2. Panic(uint256) => selector 0x4e487b71
  if (selector === '0x4e487b71') {
    try {
      const dataHex = hex.slice(8, 72);
      const panicCode = parseInt(dataHex, 16);
      const panicExplanation = PANIC_DESCRIPTIONS[panicCode] || `Unknown panic code (${panicCode})`;

      return {
        type: 'PANIC',
        selector,
        panicCode,
        panicExplanation,
        rawBytes: rawHex
      };
    } catch {
      // Fallback
    }
  }

  // 3. Custom Error
  return {
    type: 'CUSTOM_ERROR',
    selector,
    reason: fallbackReason || `Custom contract error with selector ${selector}`,
    rawBytes: rawHex
  };
}
