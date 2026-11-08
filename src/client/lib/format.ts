// lib/format.ts — Formatting utilities for RevertLens

/** Shorten an Ethereum address: 0x1234...abcd */
export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Shorten a tx hash: 0x1234...abcd (10+4) */
export function shortHash(hash: string): string {
  if (!hash || hash.length < 14) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-4)}`;
}

/** Extract first 10 bytes of input data as selector (0xXXXXXXXX) */
export function extractSelector(input: string): string {
  if (!input || input.length < 10) return '';
  return input.slice(0, 10);
}

/** Wei to CELO string — only when value !== '0' */
export function weiToCelo(wei: string): string | null {
  if (!wei || wei === '0') return null;
  try {
    const bigWei = BigInt(wei);
    const whole = bigWei / BigInt(1e18);
    const frac = bigWei % BigInt(1e18);
    if (frac === 0n) return `${whole} CELO`;
    const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '').slice(0, 6);
    return `${whole}.${fracStr} CELO`;
  } catch {
    return null;
  }
}

/** Gas used as percentage of gas limit */
export function gasPercent(gasUsed: string, gasLimit: string): string | null {
  try {
    const used = BigInt(gasUsed);
    const limit = BigInt(gasLimit);
    if (limit === 0n) return null;
    const pct = Number((used * 10000n) / limit) / 100;
    return `${pct.toFixed(1)}%`;
  } catch {
    return null;
  }
}

export const selector = extractSelector;
export const gasPct = gasPercent;

/** Decimal from hex string with thousands separator */
export function hexToDecimal(hex: string): string {
  try {
    return BigInt(hex).toLocaleString('en-US');
  } catch {
    return '—';
  }
}

/** Relative time from ISO string */
export function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

/** Celoscan URL for a tx hash */
export function celoscanTx(hash: string): string {
  return `https://celoscan.io/tx/${hash}`;
}

/** Celoscan URL for an address */
export function celoscanAddr(addr: string): string {
  return `https://celoscan.io/address/${addr}`;
}

/** Format absolute datetime */
export function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}
