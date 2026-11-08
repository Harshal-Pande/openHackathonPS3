import { describe, it, expect } from 'vitest';
import {
  loadConfig,
  createTestConfig,
  ensureAppConfig,
  TEST_OPERATOR_HASH
} from '../src/server/config.js';

const VALID_SCRYPT_HASH = TEST_OPERATOR_HASH;

describe('Environment Config Validation', () => {
  it('loads valid default configurations safely', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test_session_secret_32_bytes_long_here',
      OPERATOR_PASSWORD_HASH: 'test_operator_hash'
    });

    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.BUY_ENABLED).toBe(false);
    expect(config.CENCORI_ENABLED).toBe(false);
    expect(config.BUY_DAILY_BUDGET_ATOMIC).toBe('0');
    expect(config.REPORT_TTL_DAYS).toBe(14);
  });

  it('defaults to npx @celo/buy@latest as the Buy CLI mechanism', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.BUY_CLI_EXECUTABLE).toBe('npx');
    expect(config.BUY_CLI_ARGS_PREFIX).toBe('@celo/buy@latest');
  });

  it('correctly parses boolean flag transforms', () => {
    const config = loadConfig({
      NODE_ENV: 'development',
      BUY_ENABLED: 'true',
      CENCORI_ENABLED: 'true'
    });

    expect(config.BUY_ENABLED).toBe(true);
    expect(config.CENCORI_ENABLED).toBe(true);
  });

  it('rejects invalid NODE_ENV values', () => {
    expect(() => {
      loadConfig({
        // @ts-expect-error testing invalid input
        NODE_ENV: 'invalid_env'
      });
    }).toThrowError(/Environment validation failed/);
  });

  it('parses comma-separated allowlists into arrays', () => {
    const config = loadConfig({
      BUY_ALLOWED_TOKEN_CONTRACTS: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C, 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
      BUY_ALLOWED_CAPABILITY_IDS: 'chainstack.celo, cencori.v1.chat.completions'
    });

    expect(config.BUY_ALLOWED_TOKEN_CONTRACTS).toEqual([
      '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
      '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e'
    ]);
    expect(config.BUY_ALLOWED_CAPABILITY_IDS).toEqual([
      'chainstack.celo',
      'cencori.v1.chat.completions'
    ]);
  });

  it('handles array inputs directly and falls back gracefully with ensureAppConfig', () => {
    const rawConfig = {
      NODE_ENV: 'test' as const,
      BUY_ALLOWED_CAPABILITY_IDS: ['cencori.v1.chat.completions'],
      BUY_ALLOWED_TOKEN_CONTRACTS: ['0xcebA9300f2b948710d2653dD7B07f33A8B32118C'],
      BUY_ALLOWED_RECIPIENTS: ['0x20fAACA5f980E29639A0Fcc6dca6988E18ed333B']
    };

    const config = loadConfig(rawConfig as any);
    expect(config.BUY_ALLOWED_CAPABILITY_IDS).toEqual(['cencori.v1.chat.completions']);
    expect(config.BUY_ALLOWED_TOKEN_CONTRACTS).toEqual(['0xceba9300f2b948710d2653dd7b07f33a8b32118c']);
    expect(config.BUY_ALLOWED_RECIPIENTS).toEqual(['0x20faaca5f980e29639a0fcc6dca6988e18ed333b']);
  });

  it('createTestConfig provides safe defaults with required array fields present', () => {
    const testCfg = createTestConfig({ BUY_ENABLED: true });
    expect(Array.isArray(testCfg.BUY_ALLOWED_CAPABILITY_IDS)).toBe(true);
    expect(Array.isArray(testCfg.BUY_ALLOWED_TOKEN_CONTRACTS)).toBe(true);
    expect(Array.isArray(testCfg.BUY_ALLOWED_RECIPIENTS)).toBe(true);
    expect(testCfg.BUY_ENABLED).toBe(true);

    const ensured = ensureAppConfig({});
    expect(Array.isArray(ensured.BUY_ALLOWED_CAPABILITY_IDS)).toBe(true);
    expect(Array.isArray(ensured.BUY_ALLOWED_TOKEN_CONTRACTS)).toBe(true);
    expect(Array.isArray(ensured.BUY_ALLOWED_RECIPIENTS)).toBe(true);
  });
});

describe('Production Security Invariants', () => {
  it('rejects placeholder SESSION_SECRET in production', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'REPLACE_WITH_RANDOM_32_BYTE_OR_LONGER_SECRET',
        OPERATOR_PASSWORD_HASH: VALID_SCRYPT_HASH
      });
    }).toThrowError(/SESSION_SECRET must be replaced/);
  });

  it('rejects SESSION_SECRET shorter than 32 chars in production', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'short',
        OPERATOR_PASSWORD_HASH: VALID_SCRYPT_HASH
      });
    }).toThrowError(/SESSION_SECRET must be at least 32 characters/);
  });

  it('rejects placeholder OPERATOR_PASSWORD_HASH in production', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
        OPERATOR_PASSWORD_HASH: 'REPLACE_WITH_SCRYPT_HASH'
      });
    }).toThrowError(/OPERATOR_PASSWORD_HASH must be set/);
  });

  it('rejects reuse of SESSION_SECRET as OPERATOR_PASSWORD_HASH in production', () => {
    const reused = 'scrypt$v=1$N=16384$r=8$p=1$MTIzNDU2Nzg5MDEyMzQ1Ng==$lz+/lmHQGUWcL7lg4806U5pUvi6ksAUVulQc8tB+0Mw=';
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: reused,
        OPERATOR_PASSWORD_HASH: reused
      });
    }).toThrowError(/OPERATOR_PASSWORD_HASH must not match SESSION_SECRET/);
  });

  it('rejects malformed scrypt hash in production', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
        OPERATOR_PASSWORD_HASH: 'not-a-valid-scrypt-hash'
      });
    }).toThrowError(/OPERATOR_PASSWORD_HASH is invalid/);
  });

  it('rejects unsupported hash version in production', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
        OPERATOR_PASSWORD_HASH: 'scrypt$v=99$N=16384$r=8$p=1$MTIzNDU2Nzg5MDEyMzQ1Ng==$lz+/lmHQGUWcL7lg4806U5pUvi6ksAUVulQc8tB+0Mw='
      });
    }).toThrowError(/Unsupported scrypt hash version/);
  });

  it('rejects invalid rate limit configuration in production', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
        OPERATOR_PASSWORD_HASH: VALID_SCRYPT_HASH,
        RATE_LIMIT_INVESTIGATIONS_MAX: 0
      });
    }).toThrowError(/Environment validation failed|RATE_LIMIT_INVESTIGATIONS_MAX/);
  });

  it('allows valid production config with all required fields set', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
      OPERATOR_PASSWORD_HASH: VALID_SCRYPT_HASH,
      BUY_ENABLED: 'false',
      CENCORI_ENABLED: 'false'
    });

    expect(config.NODE_ENV).toBe('production');
    expect(config.BUY_ENABLED).toBe(false);
    expect(config.CENCORI_ENABLED).toBe(false);
  });

  it('rejects production with BUY_ENABLED=true but zero daily budget', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
        OPERATOR_PASSWORD_HASH: VALID_SCRYPT_HASH,
        BUY_ENABLED: 'true',
        BUY_DAILY_BUDGET_ATOMIC: '0',
        BUY_PER_CALL_CAP_ATOMIC: '10000'
      });
    }).toThrowError(/BUY_DAILY_BUDGET_ATOMIC is 0/);
  });

  it('rejects production with BUY_ENABLED=true but zero per-call cap', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
        OPERATOR_PASSWORD_HASH: VALID_SCRYPT_HASH,
        BUY_ENABLED: 'true',
        BUY_DAILY_BUDGET_ATOMIC: '100000',
        BUY_PER_CALL_CAP_ATOMIC: '0'
      });
    }).toThrowError(/BUY_PER_CALL_CAP_ATOMIC is 0/);
  });

  it('rejects in-memory DATABASE_PATH in production', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
        OPERATOR_PASSWORD_HASH: VALID_SCRYPT_HASH,
        DATABASE_PATH: ':memory:'
      });
    }).toThrowError(/DATABASE_PATH must be set to a persistent file path in production/);
  });

  it('rejects wildcard CORS_ORIGIN in production', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
        OPERATOR_PASSWORD_HASH: VALID_SCRYPT_HASH,
        CORS_ORIGIN: '*'
      });
    }).toThrowError(/CORS_ORIGIN must be set to an explicit origin allowlist in production/);
  });

  it('BUY_ENABLED defaults to false in all environments', () => {
    for (const env of ['development', 'production', 'test'] as const) {
      const cfg = env === 'production'
        ? loadConfig({
            NODE_ENV: env,
            SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
            OPERATOR_PASSWORD_HASH: VALID_SCRYPT_HASH
          })
        : loadConfig({ NODE_ENV: env });
      expect(cfg.BUY_ENABLED).toBe(false);
    }
  });

  it('CENCORI_ENABLED defaults to false in all environments', () => {
    for (const env of ['development', 'production', 'test'] as const) {
      const cfg = env === 'production'
        ? loadConfig({
            NODE_ENV: env,
            SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
            OPERATOR_PASSWORD_HASH: VALID_SCRYPT_HASH
          })
        : loadConfig({ NODE_ENV: env });
      expect(cfg.CENCORI_ENABLED).toBe(false);
    }
  });

  it('all spending limits default to zero', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.BUY_DAILY_BUDGET_ATOMIC).toBe('0');
    expect(config.BUY_PER_INVESTIGATION_BUDGET_ATOMIC).toBe('0');
    expect(config.BUY_PER_CALL_CAP_ATOMIC).toBe('0');
  });
});
