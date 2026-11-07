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
