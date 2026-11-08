import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  parseScryptHash,
  validateScryptHashFormat
} from '../src/server/auth/passwordHasher.js';
import {
  OperatorAuthService,
  OperatorAuthError
} from '../src/server/auth/operatorAuth.js';
import {
  createTestConfig,
  TEST_OPERATOR_PASSWORD,
  TEST_OPERATOR_HASH
} from '../src/server/config.js';
import { buildApp } from '../src/server/app.js';
import { Database } from '../src/server/db/database.js';

describe('Password Hasher (scrypt v=1)', () => {
  it('correctly hashes and verifies a valid password', async () => {
    const password = 'CorrectHorseBatteryStaple123!';
    const encoded = await hashPassword(password);

    expect(encoded.startsWith('scrypt$v=1$N=16384$r=8$p=1$')).toBe(true);

    const isValid = await verifyPassword(password, encoded);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('WrongPassword', encoded);
    expect(isInvalid).toBe(false);
  });

  it('generates different salts for identical passwords', async () => {
    const password = 'SuperSecretPassword!';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword(password, hash1)).toBe(true);
    expect(await verifyPassword(password, hash2)).toBe(true);
  });

  it('rejects empty password safely without crashing', async () => {
    const encoded = await hashPassword('ValidPass123');
    expect(await verifyPassword('', encoded)).toBe(false);
  });

  it('handles malformed hashes safely without throwing', async () => {
    expect(await verifyPassword('password', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('password', 'scrypt$v=2$N=16384$r=8$p=1$salt$key')).toBe(false);
    expect(await verifyPassword('password', 'scrypt$v=1$N=999$r=8$p=1$salt$key')).toBe(false); // N not power of 2
    expect(await verifyPassword('password', 'scrypt$v=1$N=16384$r=0$p=1$salt$key')).toBe(false); // r <= 0
    expect(await verifyPassword('password', 'scrypt$v=1$N=16384$r=8$p=0$salt$key')).toBe(false); // p <= 0
    expect(await verifyPassword('password', 'scrypt$v=1$N=16384$r=8$p=1$short$short')).toBe(false);
  });

  it('fails verification if salt or derived key is altered', async () => {
    const hash = await hashPassword('TestPassword123');
    const parsed = parseScryptHash(hash);
    expect(parsed).not.toBeNull();

    // Tamper with salt
    const tamperedSalt = Buffer.from(parsed!.salt);
    tamperedSalt[0] = tamperedSalt[0] ^ 0xff;
    const tamperedSaltHash = `scrypt$v=1$N=${parsed!.cost}$r=${parsed!.blockSize}$p=${parsed!.parallelism}$${tamperedSalt.toString('base64')}$${parsed!.derivedKey.toString('base64')}`;
    expect(await verifyPassword('TestPassword123', tamperedSaltHash)).toBe(false);

    // Tamper with derived key
    const tamperedKey = Buffer.from(parsed!.derivedKey);
    tamperedKey[0] = tamperedKey[0] ^ 0xff;
    const tamperedKeyHash = `scrypt$v=1$N=${parsed!.cost}$r=${parsed!.blockSize}$p=${parsed!.parallelism}$${parsed!.salt.toString('base64')}$${tamperedKey.toString('base64')}`;
    expect(await verifyPassword('TestPassword123', tamperedKeyHash)).toBe(false);
  });

  it('validates scrypt hash formatting with clear diagnostics', () => {
    expect(validateScryptHashFormat(TEST_OPERATOR_HASH).valid).toBe(true);
    expect(validateScryptHashFormat('').valid).toBe(false);
    expect(validateScryptHashFormat('argon2id$v=19$m=65536').valid).toBe(false);
    expect(validateScryptHashFormat('scrypt$v=2$N=16384$r=8$p=1$salt$key').valid).toBe(false);
  });
});

describe('Operator Authentication Service (AGY-05 / DEF-14)', () => {
  let authService: OperatorAuthService;
  const sessionSecret = 'test_session_secret_32_characters_minimum_length';

  beforeEach(() => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });
    authService = new OperatorAuthService(config);
  });

  it('authenticates with correct operator password', async () => {
    const { token, session } = await authService.login('127.0.0.1', TEST_OPERATOR_PASSWORD);
    expect(token).toBeDefined();
    expect(token.includes('.')).toBe(true);
    expect(session.username).toBe('operator');

    // Token must verify successfully
    const verified = authService.verifySession(token);
    expect(verified).not.toBeNull();
    expect(verified?.username).toBe('operator');
  });

  it('DEF-14: rejects SESSION_SECRET when submitted as operator password', async () => {
    await expect(authService.login('127.0.0.1', sessionSecret)).rejects.toThrow(
      'Invalid operator credentials.'
    );
  });

  it('rejects raw encoded scrypt hash when submitted as operator password', async () => {
    await expect(authService.login('127.0.0.1', TEST_OPERATOR_HASH)).rejects.toThrow(
      'Invalid operator credentials.'
    );
  });

  it('rejects modified or forged session tokens', async () => {
    const { token } = await authService.login('127.0.0.1', TEST_OPERATOR_PASSWORD);
    const [sessionId, sig] = token.split('.');

    // Tampered signature
    const tamperedSig = sig.slice(0, -2) + '00';
    expect(authService.verifySession(`${sessionId}.${tamperedSig}`)).toBeNull();

    // Tampered session ID
    const tamperedId = sessionId.slice(0, -2) + '00';
    expect(authService.verifySession(`${tamperedId}.${sig}`)).toBeNull();

    // Random non-signed token
    expect(authService.verifySession('random-unformatted-token')).toBeNull();
  });

  it('enforces 2-hour hard session expiration', async () => {
    const now = Date.now();
    const { token } = await authService.login('127.0.0.1', TEST_OPERATOR_PASSWORD, now);

    // Within lifetime
    expect(authService.verifySession(token, now + 1 * 60 * 60 * 1000)).not.toBeNull();

    // Past 2 hours
    expect(authService.verifySession(token, now + 2 * 60 * 60 * 1000 + 1000)).toBeNull();
  });

  it('invalidates session on logout', async () => {
    const { token } = await authService.login('127.0.0.1', TEST_OPERATOR_PASSWORD);
    expect(authService.verifySession(token)).not.toBeNull();

    authService.logout(token);
    expect(authService.verifySession(token)).toBeNull();
  });

  it('enforces 5 failed attempts lockout per IP with 429 and Retry-After', async () => {
    const clientIp = '192.168.1.50';
    const now = Date.now();

    // 5 consecutive failed attempts
    for (let i = 0; i < 5; i++) {
      await expect(authService.login(clientIp, 'wrong-password', now)).rejects.toThrow(
        'Invalid operator credentials.'
      );
    }

    // 6th attempt inside window must throw 429 RATE_LIMITED
    try {
      await authService.login(clientIp, 'wrong-password', now + 1000);
      expect.fail('Should have thrown OperatorAuthError 429');
    } catch (err: any) {
      expect(err).toBeInstanceOf(OperatorAuthError);
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('RATE_LIMITED');
      expect(err.retryAfter).toBeGreaterThan(0);
      expect(err.message).toContain('Rate limit exceeded for operator login');
    }

    // A different IP is unaffected
    const otherIpRes = await authService.login('10.0.0.1', TEST_OPERATOR_PASSWORD, now + 1000);
    expect(otherIpRes.token).toBeDefined();

    // After 15 minutes window, lock expires
    const futureTime = now + 15 * 60 * 1000 + 1000;
    const recovered = await authService.login(clientIp, TEST_OPERATOR_PASSWORD, futureTime);
    expect(recovered.token).toBeDefined();
  });

  it('resets failed attempt counter upon successful login', async () => {
    const clientIp = '192.168.1.99';
    const now = Date.now();

    // 3 failed attempts
    for (let i = 0; i < 3; i++) {
      await expect(authService.login(clientIp, 'wrong', now)).rejects.toThrow();
    }

    // 1 successful login
    await authService.login(clientIp, TEST_OPERATOR_PASSWORD, now);

    // Next 3 failed attempts do not trigger lockout because counter was reset
    for (let i = 0; i < 3; i++) {
      await expect(authService.login(clientIp, 'wrong', now)).rejects.toThrow(
        'Invalid operator credentials.'
      );
    }
  });
});

describe('Operator HTTP Route Authentication Integration', () => {
  it('rejects spoofed X-Forwarded-For headers when TRUST_PROXY is false', async () => {
    const config = createTestConfig({
      TRUST_PROXY: false,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });
    const db = new Database(':memory:');
    const app = buildApp(config, { db });

    // Lockout the actual connection IP (127.0.0.1) by sending 5 bad attempts
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/operator/login',
        payload: { password: 'bad' }
      });
    }

    // 6th attempt with spoofed X-Forwarded-For: attacker tries to bypass rate limit
    const spoofedRes = await app.inject({
      method: 'POST',
      url: '/api/operator/login',
      headers: { 'x-forwarded-for': '203.0.113.195' },
      payload: { password: 'bad' }
    });

    // When TRUST_PROXY=false, the spoofed header is ignored and the socket IP is rate-limited!
    expect(spoofedRes.statusCode).toBe(429);
    const body = JSON.parse(spoofedRes.body);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(spoofedRes.headers['retry-after']).toBeDefined();
  });
});
