import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_PATH: z.string().default('./data/revertlens.sqlite'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(1).default('REPLACE_WITH_RANDOM_32_BYTE_OR_LONGER_SECRET'),
  OPERATOR_PASSWORD_HASH: z.string().min(1).default('REPLACE_WITH_ARGON2ID_HASH'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  BUY_CLI_PATH: z.string().default('buy'),
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

export function loadConfig(rawEnv: Record<string, string | undefined> = process.env): AppConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }
  return result.data;
}

export const config = loadConfig();
