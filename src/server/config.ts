import { z } from 'zod';
import dotenv from 'dotenv';
import { validateScryptHashFormat } from './auth/passwordHasher.js';

dotenv.config();

// Placeholder sentinel values that must never appear in production
export const PLACEHOLDER_SESSION_SECRET = 'REPLACE_WITH_RANDOM_32_BYTE_OR_LONGER_SECRET';
export const PLACEHOLDER_OPERATOR_HASH = 'REPLACE_WITH_SCRYPT_HASH';

// Guaranteed valid scrypt test credentials for unit tests and local mock verification
// Password: 'test-operator-password'
export const TEST_OPERATOR_PASSWORD = 'test-operator-password';
export const TEST_OPERATOR_HASH =
  'scrypt$v=1$N=16384$r=8$p=1$MTIzNDU2Nzg5MDEyMzQ1Ng==$lz+/lmHQGUWcL7lg4806U5pUvi6ksAUVulQc8tB+0Mw=';

const booleanField = z
  .union([
    z.boolean(),
    z.string().transform((val) => val.toLowerCase() === 'true')
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
  TRUST_PROXY: booleanField,

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
  CELO_ATTRIBUTION_TAG: z.string().default('celo_235f6ef56f5b'),
  AGENT_WALLET_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default('0x3e1bef07824cd0E076F4907641F0A0EF27898e52'),

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

  if (config.CELO_ATTRIBUTION_TAG !== 'celo_235f6ef56f5b') {
    errors.push('CELO_ATTRIBUTION_TAG must match the official hackathon tag "celo_235f6ef56f5b".');
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
