import { DecodedRevert } from './types.js';

export const MAX_REVERT_STRING_BYTES = 4096;

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

  // Validate that input contains hexadecimal characters
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    return {
      type: 'ERROR_STRING',
      reason: fallbackReason || 'Execution reverted',
      rawBytes: rawHex
    };
  }

  const selector = '0x' + hex.slice(0, 8).toLowerCase();

  // 1. Error(string) => selector 0x08c379a0
  if (selector === '0x08c379a0') {
    try {
      const dataHex = hex.slice(8);
      // Standard ABI encoding requires at least:
      // Offset field (32 bytes = 64 hex chars) + Length field (32 bytes = 64 hex chars) = 128 hex chars
      if (dataHex.length >= 128) {
        const offsetHex = dataHex.slice(0, 64);

        // Sanity check offset: standard ABI offset is 0x20 (32 bytes = 64 hex characters)
        const offset = parseInt(offsetHex, 16);
        if (isNaN(offset) || offset < 32 || offset > 1024) {
          return {
            type: 'ERROR_STRING',
            selector,
            reason: fallbackReason || 'Execution reverted',
            rawBytes: rawHex
          };
        }

        // The length field begins at offset (offset * 2 hex chars)
        const lengthStartHex = offset * 2;
        if (dataHex.length < lengthStartHex + 64) {
          return {
            type: 'ERROR_STRING',
            selector,
            reason: fallbackReason || 'Execution reverted',
            rawBytes: rawHex
          };
        }

        const lengthHex = dataHex.slice(lengthStartHex, lengthStartHex + 64);

        // Validate length: if leading 52 hex chars are non-zero, length exceeds 2^48 (> 4096)
        const highOrder = lengthHex.slice(0, 52);
        if (!/^0+$/.test(highOrder)) {
          return {
            type: 'ERROR_STRING',
            selector,
            reason: fallbackReason || 'Execution reverted (oversized error payload)',
            rawBytes: rawHex
          };
        }

        const strLen = parseInt(lengthHex.slice(52), 16);
        if (isNaN(strLen) || strLen < 0 || strLen > MAX_REVERT_STRING_BYTES) {
          return {
            type: 'ERROR_STRING',
            selector,
            reason: fallbackReason || 'Execution reverted (oversized error payload)',
            rawBytes: rawHex
          };
        }

        if (strLen === 0) {
          return {
            type: 'ERROR_STRING',
            selector,
            reason: '',
            rawBytes: rawHex
          };
        }

        // String bytes begin 32 bytes (64 hex chars) after the length field
        const stringStartHex = lengthStartHex + 64;
        const availableData = dataHex.slice(stringStartHex);
        const strBytesHex = availableData.slice(0, strLen * 2);

        // Ensure even number of hex chars for Buffer conversion
        const cleanHex = strBytesHex.length % 2 === 0 ? strBytesHex : strBytesHex.slice(0, -1);
        const strBuffer = Buffer.from(cleanHex, 'hex');

        // Sanitize any non-printable ASCII control characters (preserving tab, LF, CR)
        const reason = strBuffer.toString('utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

        return {
          type: 'ERROR_STRING',
          selector,
          reason: reason || fallbackReason || 'Execution reverted',
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
      if (dataHex.length === 64) {
        const panicCode = parseInt(dataHex, 16);
        const panicExplanation = PANIC_DESCRIPTIONS[panicCode] || `Unknown panic code (${panicCode})`;

        return {
          type: 'PANIC',
          selector,
          panicCode,
          panicExplanation,
          rawBytes: rawHex
        };
      }
    } catch {
      // Fallback
    }
    return {
      type: 'PANIC',
      selector,
      panicCode: 0,
      panicExplanation: fallbackReason || 'Generic compiler panic',
      rawBytes: rawHex
    };
  }

  // 3. Custom Error
  return {
    type: 'CUSTOM_ERROR',
    selector,
    reason: fallbackReason || `Custom contract error with selector ${selector}`,
    rawBytes: rawHex
  };
}
