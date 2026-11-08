import { z } from 'zod';
import dotenv from 'dotenv';
import net from 'node:net';
import { validateScryptHashFormat } from './auth/passwordHasher.js';
import {
  OFFICIAL_CELO_ATTRIBUTION_TAG,
  OFFICIAL_AGENT_WALLET_ADDRESS,
  validateAttributionTag,
  validateAgentWalletAddress
} from './config/attribution.js';

dotenv.config();

// Placeholder sentinel values that must never appear in production
export const PLACEHOLDER_SESSION_SECRET = 'REPLACE_WITH_RANDOM_32_BYTE_OR_LONGER_SECRET';
export const PLACEHOLDER_OPERATOR_HASH = 'REPLACE_WITH_SCRYPT_HASH';

// Guaranteed valid scrypt test credentials for unit tests and local mock verification
// Password: 'test-operator-password'
export const TEST_OPERATOR_PASSWORD = 'test-operator-password';
export const TEST_OPERATOR_HASH =
  'scrypt$v=1$N=16384$r=8$p=1$MTIzNDU2Nzg5MDEyMzQ1Ng==$lz+/lmHQGUWcL7lg4806U5pUvi6ksAUVulQc8tB+0Mw=';

export interface BaseUrlValidationResult {
  valid: boolean;
  normalized?: string;
  reason?: string;
}

/**
 * Evaluates whether an IPv4 address belongs to a private, loopback, link-local,
 * multicast, or reserved non-public network block (DEF-57).
 */
function isNonPublicIpv4(octets: number[]): boolean {
  if (octets.length !== 4 || octets.some((o) => isNaN(o) || o < 0 || o > 255)) {
    return true;
  }
  const [o1, o2, o3] = octets;
  // 0.0.0.0/8 (Current network)
  if (o1 === 0) return true;
  // 10.0.0.0/8 (Private network, RFC 1918)
  if (o1 === 10) return true;
  // 100.64.0.0/10 (Shared address space / CGNAT, RFC 6598)
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
  // 127.0.0.0/8 (Loopback, RFC 1122 - entire block 127.0.0.0 - 127.255.255.255)
  if (o1 === 127) return true;
  // 169.254.0.0/16 (Link-local, RFC 3927)
  if (o1 === 169 && o2 === 254) return true;
  // 172.16.0.0/12 (Private network, RFC 1918)
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (o1 === 192 && o2 === 0 && o3 === 0) return true;
  // 192.0.2.0/24 (TEST-NET-1, RFC 5737)
  if (o1 === 192 && o2 === 0 && o3 === 2) return true;
  // 192.168.0.0/16 (Private network, RFC 1918)
  if (o1 === 192 && o2 === 168) return true;
  // 198.18.0.0/15 (Network benchmark tests, RFC 2544)
  if (o1 === 198 && (o2 === 18 || o2 === 19)) return true;
  // 198.51.100.0/24 (TEST-NET-2, RFC 5737)
  if (o1 === 198 && o2 === 51 && o3 === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3, RFC 5737)
  if (o1 === 203 && o2 === 0 && o3 === 113) return true;
  // 224.0.0.0/4 (Multicast, RFC 5771) and 240.0.0.0/4 (Reserved, RFC 1112)
  if (o1 >= 224) return true;

  return false;
}

/**
 * Parses an IPv6 string into 8 16-bit numeric words.
 * Robustly handles standard IPv6, compressed ::, and IPv4-mapped IPv6 suffix formats (DEF-57).
 */
function parseIpv6ToWords(ip: string): number[] | null {
  let clean = ip.toLowerCase();
  let ipv4Words: number[] = [];

  if (clean.includes('.')) {
    const lastColon = clean.lastIndexOf(':');
    if (lastColon === -1) return null;
    const ipv4Str = clean.slice(lastColon + 1);
    clean = clean.slice(0, lastColon);
    const octets = ipv4Str.split('.').map((p) => Number(p));
    if (octets.length !== 4 || octets.some((o) => isNaN(o) || o < 0 || o > 255)) {
      return null;
    }
    ipv4Words = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
  }

  const parts = clean.split('::');
  if (parts.length > 2) return null;
  const targetWords = 8 - ipv4Words.length;

  let words: number[] = [];
  if (parts.length === 1) {
    const raw = parts[0].split(':').filter(Boolean);
    if (raw.length !== targetWords) return null;
    words = raw.map((w) => parseInt(w, 16));
  } else {
    const left = parts[0] ? parts[0].split(':').filter(Boolean).map((w) => parseInt(w, 16)) : [];
    const right = parts[1] ? parts[1].split(':').filter(Boolean).map((w) => parseInt(w, 16)) : [];
    const missing = targetWords - (left.length + right.length);
    if (missing < 0) return null;
    words = [...left, ...new Array(missing).fill(0), ...right];
  }

  if (words.some((w) => isNaN(w) || w < 0 || w > 0xffff)) {
    return null;
  }
  return [...words, ...ipv4Words];
}

/**
 * Evaluates whether an IPv6 address belongs to a non-public, loopback,
 * unique-local, link-local, multicast, or IPv4-mapped non-public range (DEF-57).
 */
function isNonPublicIpv6(words: number[]): boolean {
  if (!words || words.length !== 8) return true;

  // Loopback ::1
  if (words.slice(0, 7).every((w) => w === 0) && words[7] === 1) return true;

  // Unspecified ::
  if (words.every((w) => w === 0)) return true;

  // Unique Local Address fc00::/7 (covers fc00:: through fdff::)
  if ((words[0] & 0xfe00) === 0xfc00) return true;

  // Link-local fe80::/10 (covers fe80:: through febf::)
  if ((words[0] & 0xffc0) === 0xfe80) return true;

  // Multicast ff00::/8
  if ((words[0] & 0xff00) === 0xff00) return true;

  // Documentation 2001:db8::/32
  if (words[0] === 0x2001 && words[1] === 0x0db8) return true;

  // IPv4-mapped IPv6 (::ffff:0:0/96)
  if (words.slice(0, 5).every((w) => w === 0) && words[5] === 0xffff) {
    const o1 = (words[6] >> 8) & 0xff;
    const o2 = words[6] & 0xff;
    const o3 = (words[7] >> 8) & 0xff;
    const o4 = words[7] & 0xff;
    return isNonPublicIpv4([o1, o2, o3, o4]);
  }

  return false;
}

/**
 * Validates and normalizes PUBLIC_BASE_URL (DEF-49, DEF-57).
 * In production:
 * - Must be an absolute HTTPS URL.
 * - Must not contain embedded credentials (username/password).
 * - Must not be localhost, loopback, private-network, link-local, or reserved IP ranges (IPv4 and IPv6).
 * In development/test:
 * - Accepts http:// and https:// including localhost.
 */
export function validatePublicBaseUrl(rawUrl: unknown, isProduction: boolean = false): BaseUrlValidationResult {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return { valid: false, reason: 'PUBLIC_BASE_URL must be a non-empty string.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, reason: `PUBLIC_BASE_URL '${rawUrl}' is not a valid absolute URL.` };
  }

  // Reject embedded credentials
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'PUBLIC_BASE_URL must not contain embedded username or password credentials.' };
  }

  let host = parsed.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }

  if (isProduction) {
    if (parsed.protocol !== 'https:') {
      return { valid: false, reason: `PUBLIC_BASE_URL in production must use https: protocol, got '${parsed.protocol}'.` };
    }

    // Check localhost hostname
    if (host === 'localhost' || host.endsWith('.localhost')) {
      return { valid: false, reason: `PUBLIC_BASE_URL in production cannot be localhost or loopback address '${parsed.hostname}'.` };
    }

    // Check IP addresses using reliable socket IP parser (DEF-57)
    const ipVersion = net.isIP(host);
    if (ipVersion === 4) {
      const octets = host.split('.').map(Number);
      if (isNonPublicIpv4(octets)) {
        return { valid: false, reason: `PUBLIC_BASE_URL in production cannot be a private, loopback, or reserved network address '${parsed.hostname}'.` };
      }
    } else if (ipVersion === 6) {
      const words = parseIpv6ToWords(host);
      if (!words || isNonPublicIpv6(words)) {
        return { valid: false, reason: `PUBLIC_BASE_URL in production cannot be a private, loopback, or reserved network address '${parsed.hostname}'.` };
      }
    }
  } else {
    // In dev / test, accept http and https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: `PUBLIC_BASE_URL must use http: or https: protocol, got '${parsed.protocol}'.` };
    }
  }

  // Normalize: strip trailing slashes, preserve origin + pathname without trailing slash
  const cleanPathname = parsed.pathname.replace(/\/+$/, '');
  const normalized = `${parsed.origin}${cleanPathname}`;

  return { valid: true, normalized };
}

const booleanField = z
  .union([
    z.boolean(),
    z.string().transform((val) => val.toLowerCase() === 'true')
  ])
  .default(false);

const trustProxyField = z
  .union([
    z.boolean(),
    z.string().transform((val) => {
      const trimmed = val.trim().toLowerCase();
      if (trimmed === 'true') return true;
      if (trimmed === 'false' || trimmed === '') return false;
      return val.trim();
    })
  ])
  .default(false);

const tokenContractsField = z
  .union([
    z.array(z.string()).transform((arr) => arr.map((s) => s.trim().toLowerCase())),
    z.string().transform((val) => (val ? val.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : []))
  ])
  .default([]);

const recipientsField = z
  .union([
    z.array(z.string()).transform((arr) => arr.map((s) => s.trim().toLowerCase())),
    z.string().transform((val) => (val ? val.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : []))
  ])
  .default([]);

const capabilityIdsField = z
  .union([
    z.array(z.string()).transform((arr) => arr.map((s) => s.trim())),
    z.string().transform((val) => (val ? val.split(',').map((s) => s.trim()).filter(Boolean) : []))
  ])
  .default([]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_PATH: z.string().default('./data/revertlens.sqlite'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(1).default(PLACEHOLDER_SESSION_SECRET),
  OPERATOR_PASSWORD_HASH: z.string().min(1).default(PLACEHOLDER_OPERATOR_HASH),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Rate Limiting Policy (Public Forensic Ingestion)
  RATE_LIMIT_INVESTIGATIONS_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_INVESTIGATIONS_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // Reverse Proxy header trust configuration (false by default for safety against spoofing)
  TRUST_PROXY: trustProxyField,

  // Direct Chainstack Celo Mainnet RPC Endpoint (Growth plan)
  // Kept server-side only; never leaked to frontend or logs
  CHAINSTACK_CELO_MAINNET_RPC_URL: z.string().url().optional().or(z.literal('')),

  // Buy CLI integration: official @celo/buy package, invoked via npx or installed globally.
  // Backend spawns: npx @celo/buy@latest --json curl --max-amount <cap> ...
  // Wallet management is handled by the Buy CLI OS keychain (run `buy setup` once per machine).
  // No private keys or seed phrases are accepted or stored by this application.
  BUY_CLI_EXECUTABLE: z.string().default('npx'),
  BUY_CLI_ARGS_PREFIX: z.string().default('@celo/buy@latest'),
  BUY_ENABLED: booleanField,
  BUY_DAILY_BUDGET_ATOMIC: z.string().regex(/^\d+$/).default('0'),
  BUY_PER_INVESTIGATION_BUDGET_ATOMIC: z.string().regex(/^\d+$/).default('0'),
  BUY_PER_CALL_CAP_ATOMIC: z.string().regex(/^\d+$/).default('0'),
  BUY_ALLOWED_TOKEN_CONTRACTS: tokenContractsField,
  BUY_ALLOWED_RECIPIENTS: recipientsField,
  BUY_ALLOWED_CAPABILITY_IDS: capabilityIdsField,

  CENCORI_ENABLED: booleanField,

  // Official Hackathon Attribution & Agent Wallet Configuration
  CELO_ATTRIBUTION_TAG: z.string().default(OFFICIAL_CELO_ATTRIBUTION_TAG),
  AGENT_WALLET_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default(OFFICIAL_AGENT_WALLET_ADDRESS),

  REPORT_TTL_DAYS: z.coerce.number().int().positive().default(14),
  REPORTS_PUBLIC_BY_DEFAULT: booleanField
});

export type AppConfig = z.infer<typeof envSchema>;

/**
 * Production security invariants applied after Zod schema parsing.
 * Throws if any placeholder or obviously insecure value is present in production.
 */
function enforceProductionInvariants(config: AppConfig): void {
  if (config.NODE_ENV !== 'production') return;

  const errors: string[] = [];

  if (config.SESSION_SECRET === PLACEHOLDER_SESSION_SECRET) {
    errors.push('SESSION_SECRET must be replaced with a real secret in production.');
  }
  if (config.SESSION_SECRET.length < 32) {
    errors.push('SESSION_SECRET must be at least 32 characters in production.');
  }
  if (config.OPERATOR_PASSWORD_HASH === PLACEHOLDER_OPERATOR_HASH || config.OPERATOR_PASSWORD_HASH.trim() === '') {
    errors.push('OPERATOR_PASSWORD_HASH must be set to a real scrypt hash in production.');
  }
  if (config.OPERATOR_PASSWORD_HASH === config.SESSION_SECRET) {
    errors.push('OPERATOR_PASSWORD_HASH must not match SESSION_SECRET.');
  }

  // Validate scrypt hash format in production
  const hashValidation = validateScryptHashFormat(config.OPERATOR_PASSWORD_HASH);
  if (!hashValidation.valid) {
    errors.push(`OPERATOR_PASSWORD_HASH is invalid: ${hashValidation.reason}`);
  }

  if (config.RATE_LIMIT_INVESTIGATIONS_MAX <= 0) {
    errors.push('RATE_LIMIT_INVESTIGATIONS_MAX must be a positive integer.');
  }
  if (config.RATE_LIMIT_INVESTIGATIONS_WINDOW_MS <= 0) {
    errors.push('RATE_LIMIT_INVESTIGATIONS_WINDOW_MS must be a positive integer.');
  }

  if (!config.DATABASE_PATH || config.DATABASE_PATH === ':memory:' || config.DATABASE_PATH.trim() === '') {
    errors.push('DATABASE_PATH must be set to a persistent file path in production (cannot be :memory: or empty).');
  }
  if (!config.CORS_ORIGIN || config.CORS_ORIGIN === '*' || config.CORS_ORIGIN.trim() === '') {
    errors.push('CORS_ORIGIN must be set to an explicit origin allowlist in production (cannot be wildcard * or empty).');
  }
  if (config.BUY_ENABLED && config.BUY_DAILY_BUDGET_ATOMIC === '0') {
    errors.push('BUY_ENABLED is true but BUY_DAILY_BUDGET_ATOMIC is 0 — spending is impossible; disable Buy or set a budget.');
  }
  if (config.BUY_ENABLED && config.BUY_PER_CALL_CAP_ATOMIC === '0') {
    errors.push('BUY_ENABLED is true but BUY_PER_CALL_CAP_ATOMIC is 0 — no per-call cap configured.');
  }

  if (config.CELO_ATTRIBUTION_TAG !== OFFICIAL_CELO_ATTRIBUTION_TAG) {
    errors.push(`CELO_ATTRIBUTION_TAG must match the official hackathon tag "${OFFICIAL_CELO_ATTRIBUTION_TAG}".`);
  }
  const tagValidation = validateAttributionTag(config.CELO_ATTRIBUTION_TAG);
  if (!tagValidation.valid) {
    errors.push(`CELO_ATTRIBUTION_TAG is invalid: ${tagValidation.reason}`);
  }

  // Validate agent wallet address in production (DEF-53)
  const walletValidation = validateAgentWalletAddress(config.AGENT_WALLET_ADDRESS, true);
  if (!walletValidation.valid) {
    errors.push(`AGENT_WALLET_ADDRESS is invalid: ${walletValidation.reason}`);
  }

  // Validate public base URL in production (DEF-49)
  const urlValidation = validatePublicBaseUrl(config.PUBLIC_BASE_URL, true);
  if (!urlValidation.valid) {
    errors.push(`PUBLIC_BASE_URL is invalid: ${urlValidation.reason}`);
  }

  if (errors.length > 0) {
    throw new Error(`Production security configuration invalid:\n  - ${errors.join('\n  - ')}`);
  }
}

export function loadConfig(rawEnv: Record<string, unknown> = process.env): AppConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }
  const config = result.data;
  enforceProductionInvariants(config);
  return config;
}

/**
 * Normalizes and validates any configuration input ensuring complete, authoritative AppConfig.
 */
export function ensureAppConfig(input: unknown): AppConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Application configuration must be an object.');
  }
  return loadConfig(input as Record<string, unknown>);
}

/**
 * Reusable test configuration factory providing guaranteed complete AppConfig fields.
 */
export function createTestConfig(overrides: Record<string, unknown> = {}): AppConfig {
  const base: Record<string, unknown> = {
    NODE_ENV: 'test',
    PORT: 3000,
    HOST: '127.0.0.1',
    DATABASE_PATH: ':memory:',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test_session_secret_32_characters_minimum_length',
    OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH,
    RATE_LIMIT_INVESTIGATIONS_MAX: 10,
    RATE_LIMIT_INVESTIGATIONS_WINDOW_MS: 60000,
    TRUST_PROXY: false,
    CORS_ORIGIN: 'http://localhost:5173',
    BUY_ENABLED: false,
    CENCORI_ENABLED: false,
    BUY_DAILY_BUDGET_ATOMIC: '0',
    BUY_PER_INVESTIGATION_BUDGET_ATOMIC: '0',
    BUY_PER_CALL_CAP_ATOMIC: '0',
    BUY_ALLOWED_TOKEN_CONTRACTS: [],
    BUY_ALLOWED_RECIPIENTS: [],
    BUY_ALLOWED_CAPABILITY_IDS: [],
    REPORT_TTL_DAYS: 14,
    REPORTS_PUBLIC_BY_DEFAULT: false,
    ...overrides
  };
  return loadConfig(base);
}

export const config = loadConfig();
