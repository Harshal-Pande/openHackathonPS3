import { describe, it, expect } from 'vitest';
import {
  loadConfig,
  createTestConfig,
  ensureAppConfig,
  validatePublicBaseUrl,
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
      PUBLIC_BASE_URL: 'https://revertlens.example.com',
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
            OPERATOR_PASSWORD_HASH: VALID_SCRYPT_HASH,
            PUBLIC_BASE_URL: 'https://revertlens.example.com'
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
            OPERATOR_PASSWORD_HASH: VALID_SCRYPT_HASH,
            PUBLIC_BASE_URL: 'https://revertlens.example.com'
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

  describe('PUBLIC_BASE_URL Non-Public Network Validation (DEF-57)', () => {
    it('rejects invalid inputs and non-absolute URLs', () => {
      expect(validatePublicBaseUrl('').valid).toBe(false);
      expect(validatePublicBaseUrl('not-a-url').valid).toBe(false);
      expect(validatePublicBaseUrl('ftp://example.com').valid).toBe(false);
      expect(validatePublicBaseUrl('https://user:pass@example.com').valid).toBe(false);
    });

    it('permits localhost and http in development/test', () => {
      const devRes = validatePublicBaseUrl('http://localhost:3000', false);
      expect(devRes.valid).toBe(true);
      expect(devRes.normalized).toBe('http://localhost:3000');

      const slashRes = validatePublicBaseUrl('https://localhost:3000/api/', false);
      expect(slashRes.valid).toBe(true);
      expect(slashRes.normalized).toBe('https://localhost:3000/api');
    });

    it('rejects http protocol in production', () => {
      const res = validatePublicBaseUrl('http://revertlens.example.com', true);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('must use https: protocol');
    });

    it('rejects localhost and .localhost in production', () => {
      expect(validatePublicBaseUrl('https://localhost:3000', true).valid).toBe(false);
      expect(validatePublicBaseUrl('https://app.localhost', true).valid).toBe(false);
    });

    it('rejects all IPv4 loopback variations in production', () => {
      const loopbacks = [
        'https://127.0.0.1:3000',
        'https://127.0.0.2:3000',
        'https://127.1.2.3:8080',
        'https://127.255.255.254'
      ];
      for (const url of loopbacks) {
        const res = validatePublicBaseUrl(url, true);
        expect(res.valid).toBe(false);
        expect(res.reason).toContain('private, loopback, or reserved');
      }
    });

    it('rejects private and link-local IPv4 ranges in production', () => {
      const privateIps = [
        'https://10.0.0.1:3000',
        'https://10.254.1.2',
        'https://172.16.0.1:4000',
        'https://172.31.255.255',
        'https://192.168.1.1:8080',
        'https://192.168.100.50',
        'https://169.254.1.1',
        'https://0.0.0.0:3000'
      ];
      for (const url of privateIps) {
        const res = validatePublicBaseUrl(url, true);
        expect(res.valid).toBe(false);
        expect(res.reason).toContain('private, loopback, or reserved');
      }
    });

    it('rejects bracketed IPv6 loopback, unique-local, link-local and IPv4-mapped addresses in production', () => {
      const ipv6Urls = [
        'https://[::1]:3000',
        'https://[::1]',
        'https://[fc00::1]:3000',
        'https://[fd00::1]:8080',
        'https://[fe80::1]:3000',
        'https://[::ffff:127.0.0.1]:3000',
        'https://[::ffff:192.168.1.1]:8080',
        'https://[::ffff:7f00:1]:3000'
      ];
      for (const url of ipv6Urls) {
        const res = validatePublicBaseUrl(url, true);
        expect(res.valid).toBe(false);
        expect(res.reason).toContain('private, loopback, or reserved');
      }
    });

    it('permits valid public HTTPS domain and IP in production', () => {
      const valid1 = validatePublicBaseUrl('https://revertlens.example.com', true);
      expect(valid1.valid).toBe(true);
      expect(valid1.normalized).toBe('https://revertlens.example.com');

      const valid2 = validatePublicBaseUrl('https://revertlens.celo.org/app/', true);
      expect(valid2.valid).toBe(true);
      expect(valid2.normalized).toBe('https://revertlens.celo.org/app');

      const validPublicIp = validatePublicBaseUrl('https://8.8.8.8', true);
      expect(validPublicIp.valid).toBe(true);

      const validPublicIpv6 = validatePublicBaseUrl('https://[2607:f8b0:4005:805::200e]', true);
      expect(validPublicIpv6.valid).toBe(true);
    });
  });
});
