// lib/extractHash.ts — Extract tx hash from pasted text or URL
const TX_HASH_RE = /0x[0-9a-fA-F]{64}/;

/**
 * Given arbitrary text (paste, URL, plain hash), extract a 66-char tx hash.
 * Returns null if none found.
 */
export function extractHash(text: string): string | null {
  if (!text) return null;
  const match = text.match(TX_HASH_RE);
  return match ? match[0] : null;
}

export const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export function isValidHash(hash: string): boolean {
  return TX_HASH_REGEX.test(hash.trim());
}
