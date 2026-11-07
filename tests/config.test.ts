import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/server/config.js';

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
});

describe('Production Security Invariants', () => {
  it('rejects placeholder SESSION_SECRET in production', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'REPLACE_WITH_RANDOM_32_BYTE_OR_LONGER_SECRET',
        OPERATOR_PASSWORD_HASH: '$argon2id$v=19$m=65536,t=3,p=4$validhashvalue'
      });
    }).toThrowError(/SESSION_SECRET must be replaced/);
  });

  it('rejects SESSION_SECRET shorter than 32 chars in production', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'short',
        OPERATOR_PASSWORD_HASH: '$argon2id$v=19$m=65536,t=3,p=4$validhashvalue'
      });
    }).toThrowError(/SESSION_SECRET must be at least 32 characters/);
  });

  it('rejects placeholder OPERATOR_PASSWORD_HASH in production', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
        OPERATOR_PASSWORD_HASH: 'REPLACE_WITH_ARGON2ID_HASH'
      });
    }).toThrowError(/OPERATOR_PASSWORD_HASH must be set/);
  });

  it('allows valid production config with all required fields set', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
      OPERATOR_PASSWORD_HASH: '$argon2id$v=19$m=65536,t=3,p=4$validhashvalue',
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
        OPERATOR_PASSWORD_HASH: '$argon2id$v=19$m=65536,t=3,p=4$validhashvalue',
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
        OPERATOR_PASSWORD_HASH: '$argon2id$v=19$m=65536,t=3,p=4$validhashvalue',
        BUY_ENABLED: 'true',
        BUY_DAILY_BUDGET_ATOMIC: '100000',
        BUY_PER_CALL_CAP_ATOMIC: '0'
      });
    }).toThrowError(/BUY_PER_CALL_CAP_ATOMIC is 0/);
  });

  it('BUY_ENABLED defaults to false in all environments', () => {
    for (const env of ['development', 'production', 'test'] as const) {
      const cfg = env === 'production'
        ? loadConfig({
            NODE_ENV: env,
            SESSION_SECRET: 'a-sufficiently-long-session-secret-for-testing',
            OPERATOR_PASSWORD_HASH: '$argon2id$v=19$m=65536,t=3,p=4$validhashvalue'
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
            OPERATOR_PASSWORD_HASH: '$argon2id$v=19$m=65536,t=3,p=4$validhashvalue'
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
