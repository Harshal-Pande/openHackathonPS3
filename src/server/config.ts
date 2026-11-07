import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Placeholder sentinel values that must never appear in production
const PLACEHOLDER_SESSION_SECRET = 'REPLACE_WITH_RANDOM_32_BYTE_OR_LONGER_SECRET';
const PLACEHOLDER_OPERATOR_HASH = 'REPLACE_WITH_ARGON2ID_HASH';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_PATH: z.string().default('./data/revertlens.sqlite'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(1).default(PLACEHOLDER_SESSION_SECRET),
  OPERATOR_PASSWORD_HASH: z.string().min(1).default(PLACEHOLDER_OPERATOR_HASH),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Buy CLI integration: official @celo/buy package, invoked via npx or installed globally.
  // Backend spawns: npx @celo/buy@latest --json curl --max-amount <cap> ...
  // Wallet management is handled by the Buy CLI OS keychain (run `buy setup` once per machine).
  // No private keys or seed phrases are accepted or stored by this application.
  BUY_CLI_EXECUTABLE: z.string().default('npx'),
  BUY_CLI_ARGS_PREFIX: z.string().default('@celo/buy@latest'),
  BUY_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  BUY_DAILY_BUDGET_ATOMIC: z.string().regex(/^\d+$/).default('0'),
  BUY_PER_INVESTIGATION_BUDGET_ATOMIC: z.string().regex(/^\d+$/).default('0'),
  BUY_PER_CALL_CAP_ATOMIC: z.string().regex(/^\d+$/).default('0'),
  BUY_ALLOWED_TOKEN_CONTRACTS: z
    .string()
    .default('')
    .transform((val) => (val ? val.split(',').map((s) => s.trim().toLowerCase()) : [])),
  BUY_ALLOWED_RECIPIENTS: z
    .string()
    .default('')
    .transform((val) => (val ? val.split(',').map((s) => s.trim().toLowerCase()) : [])),
  BUY_ALLOWED_CAPABILITY_IDS: z
    .string()
    .default('')
    .transform((val) => (val ? val.split(',').map((s) => s.trim()) : [])),

  CENCORI_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  REPORT_TTL_DAYS: z.coerce.number().int().positive().default(14),
  REPORTS_PUBLIC_BY_DEFAULT: z
    .string()
    .default('false')
    .transform((val) => val === 'true')
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
  if (config.OPERATOR_PASSWORD_HASH === PLACEHOLDER_OPERATOR_HASH) {
    errors.push('OPERATOR_PASSWORD_HASH must be set to a real Argon2id hash in production.');
  }
  if (config.BUY_ENABLED && config.BUY_DAILY_BUDGET_ATOMIC === '0') {
    errors.push('BUY_ENABLED is true but BUY_DAILY_BUDGET_ATOMIC is 0 — spending is impossible; disable Buy or set a budget.');
  }
  if (config.BUY_ENABLED && config.BUY_PER_CALL_CAP_ATOMIC === '0') {
    errors.push('BUY_ENABLED is true but BUY_PER_CALL_CAP_ATOMIC is 0 — no per-call cap configured.');
  }

  if (errors.length > 0) {
    throw new Error(`Production security configuration invalid:\n  - ${errors.join('\n  - ')}`);
  }
}

export function loadConfig(rawEnv: Record<string, string | undefined> = process.env): AppConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }
  const config = result.data;
  enforceProductionInvariants(config);
  return config;
}

export const config = loadConfig();
