import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  parseScryptHash,
  validateScryptHashFormat,
  SCRYPT_POLICY
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

describe('Strict scrypt Hash Parsing & Verification (Correction A)', () => {
  it('correctly hashes and verifies a valid password', async () => {
    const password = 'CorrectHorseBatteryStaple123!';
    const encoded = await hashPassword(password);

    expect(encoded.startsWith('scrypt$v=1$N=16384$r=8$p=1$')).toBe(true);

    const isValid = await verifyPassword(password, encoded);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('WrongPassword', encoded);
    expect(isInvalid).toBe(false);
  });

  it('rejects permissive numeric junk: N=16384junk', async () => {
    const validParsed = parseScryptHash(TEST_OPERATOR_HASH)!;
    const junkCostHash = `scrypt$v=1$N=16384junk$r=${validParsed.blockSize}$p=${validParsed.parallelism}$${validParsed.salt.toString('base64')}$${validParsed.derivedKey.toString('base64')}`;
    expect(parseScryptHash(junkCostHash)).toBeNull();
    expect(await verifyPassword('test-operator-password', junkCostHash)).toBe(false);
  });

  it('rejects numeric signs: N=+16384', async () => {
    const validParsed = parseScryptHash(TEST_OPERATOR_HASH)!;
    const signedCostHash = `scrypt$v=1$N=+16384$r=${validParsed.blockSize}$p=${validParsed.parallelism}$${validParsed.salt.toString('base64')}$${validParsed.derivedKey.toString('base64')}`;
    expect(parseScryptHash(signedCostHash)).toBeNull();
    expect(await verifyPassword('test-operator-password', signedCostHash)).toBe(false);
  });

  it('rejects non-canonical Base64 encoding', async () => {
    const validParsed = parseScryptHash(TEST_OPERATOR_HASH)!;
    // Alter canonical padding
    const nonCanonicalKey = validParsed.derivedKey.toString('base64').replace(/=/g, 'A');
    const nonCanonicalHash = `scrypt$v=1$N=16384$r=8$p=1$${validParsed.salt.toString('base64')}$${nonCanonicalKey}`;
    expect(parseScryptHash(nonCanonicalHash)).toBeNull();
    expect(await verifyPassword('test-operator-password', nonCanonicalHash)).toBe(false);
  });

  it('rejects invalid Base64 characters', async () => {
    const validParsed = parseScryptHash(TEST_OPERATOR_HASH)!;
    const invalidCharHash = `scrypt$v=1$N=16384$r=8$p=1$!@#$%^&*()$${validParsed.derivedKey.toString('base64')}`;
    expect(parseScryptHash(invalidCharHash)).toBeNull();
    expect(await verifyPassword('test-operator-password', invalidCharHash)).toBe(false);
  });

  it('rejects truncated salt (< 16 bytes)', async () => {
    const validParsed = parseScryptHash(TEST_OPERATOR_HASH)!;
    const shortSalt = Buffer.alloc(15, 0xaa).toString('base64');
    const truncatedSaltHash = `scrypt$v=1$N=16384$r=8$p=1$${shortSalt}$${validParsed.derivedKey.toString('base64')}`;
    expect(parseScryptHash(truncatedSaltHash)).toBeNull();
    expect(await verifyPassword('test-operator-password', truncatedSaltHash)).toBe(false);
  });

  it('rejects incorrect derived-key length (!= 32 bytes)', async () => {
    const validParsed = parseScryptHash(TEST_OPERATOR_HASH)!;
    const shortKey = Buffer.alloc(31, 0xbb).toString('base64');
    const wrongKeyHash = `scrypt$v=1$N=16384$r=8$p=1$${validParsed.salt.toString('base64')}$${shortKey}`;
    expect(parseScryptHash(wrongKeyHash)).toBeNull();
    expect(await verifyPassword('test-operator-password', wrongKeyHash)).toBe(false);
  });

  it('rejects excessive parameters (N > 65536, r > 16, p > 4)', async () => {
    const validParsed = parseScryptHash(TEST_OPERATOR_HASH)!;
    const saltB64 = validParsed.salt.toString('base64');
    const keyB64 = validParsed.derivedKey.toString('base64');

    // Excessive N
    const excessiveN = `scrypt$v=1$N=131072$r=8$p=1$${saltB64}$${keyB64}`;
    expect(parseScryptHash(excessiveN)).toBeNull();

    // Excessive r
    const excessiveR = `scrypt$v=1$N=16384$r=32$p=1$${saltB64}$${keyB64}`;
    expect(parseScryptHash(excessiveR)).toBeNull();

    // Excessive p
    const excessiveP = `scrypt$v=1$N=16384$r=8$p=8$${saltB64}$${keyB64}`;
    expect(parseScryptHash(excessiveP)).toBeNull();
  });

  it('rejects unsupported hash version: v=2', async () => {
    const validParsed = parseScryptHash(TEST_OPERATOR_HASH)!;
    const v2Hash = `scrypt$v=2$N=16384$r=8$p=1$${validParsed.salt.toString('base64')}$${validParsed.derivedKey.toString('base64')}`;
    expect(parseScryptHash(v2Hash)).toBeNull();
    expect(validateScryptHashFormat(v2Hash).valid).toBe(false);
    expect(await verifyPassword('test-operator-password', v2Hash)).toBe(false);
  });

  it('strictly validates caller options in hashPassword', async () => {
    // Non-power of 2
    await expect(hashPassword('pass', { cost: 1000 })).rejects.toThrow('cost (N) must be a power of 2');

    // Excessive block size
    await expect(hashPassword('pass', { blockSize: 32 })).rejects.toThrow('blockSize (r) must be an integer between 1 and 16');

    // Excessive parallelism
    await expect(hashPassword('pass', { parallelism: 10 })).rejects.toThrow('parallelism (p) must be an integer between 1 and 4');

    // Invalid salt length
    await expect(hashPassword('pass', { salt: Buffer.alloc(12) })).rejects.toThrow('salt must be a Buffer of strictly 16 bytes');
  });

  it('fails verification safely if salt or derived key is tampered', async () => {
    const hash = await hashPassword('TestPassword123');
    const parsed = parseScryptHash(hash)!;

    // Tamper with salt
    const tamperedSalt = Buffer.from(parsed.salt);
    tamperedSalt[0] = tamperedSalt[0] ^ 0xff;
    const tamperedSaltHash = `scrypt$v=1$N=${parsed.cost}$r=${parsed.blockSize}$p=${parsed.parallelism}$${tamperedSalt.toString('base64')}$${parsed.derivedKey.toString('base64')}`;
    expect(await verifyPassword('TestPassword123', tamperedSaltHash)).toBe(false);

    // Tamper with derived key
    const tamperedKey = Buffer.from(parsed.derivedKey);
    tamperedKey[0] = tamperedKey[0] ^ 0xff;
    const tamperedKeyHash = `scrypt$v=1$N=${parsed.cost}$r=${parsed.blockSize}$p=${parsed.parallelism}$${parsed.salt.toString('base64')}$${tamperedKey.toString('base64')}`;
    expect(await verifyPassword('TestPassword123', tamperedKeyHash)).toBe(false);
  });
});

describe('Operator Authentication & Session Lifecycle (Correction D)', () => {
  let authService: OperatorAuthService;
  const sessionSecret = 'test_session_secret_32_characters_minimum_length';

  beforeEach(() => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });
    authService = new OperatorAuthService(config);
  });

  it('authenticates with correct operator password and issues HMAC token', async () => {
    const { token, session } = await authService.login('127.0.0.1', TEST_OPERATOR_PASSWORD);
    expect(token).toBeDefined();
    expect(token.includes('.')).toBe(true);

    const [sessionId, signature] = token.split('.');
    expect(sessionId).toHaveLength(64);
    expect(signature).toHaveLength(64);

    const verified = authService.verifySession(token);
    expect(verified).not.toBeNull();
    expect(verified?.username).toBe('operator');
  });

  it('enforces exact session-expiry boundary: invalid at or after expiry timestamp', async () => {
    const now = Date.now();
    const { token } = await authService.login('127.0.0.1', TEST_OPERATOR_PASSWORD, now);

    const twoHoursMs = 2 * 60 * 60 * 1000;

    // 1ms before expiry -> valid
    expect(authService.verifySession(token, now + twoHoursMs - 1)).not.toBeNull();

    // Exactly at expiry -> invalid!
    expect(authService.verifySession(token, now + twoHoursMs)).toBeNull();

    // After expiry -> invalid!
    expect(authService.verifySession(token, now + twoHoursMs + 1000)).toBeNull();
  });

  it('prunes expired session records while retaining active sessions', async () => {
    const now = Date.now();
    const twoHoursMs = 2 * 60 * 60 * 1000;

    // Session 1: created at `now - twoHoursMs - 1000` (expired)
    const { token: expiredToken } = await authService.login('127.0.0.1', TEST_OPERATOR_PASSWORD, now - twoHoursMs - 1000);

    // Session 2: created at `now` (active)
    const { token: activeToken } = await authService.login('127.0.0.2', TEST_OPERATOR_PASSWORD, now);

    expect(authService.getSessionCount()).toBe(2);

    // Prune expired
    authService.pruneExpiredSessions(now);

    expect(authService.getSessionCount()).toBe(1);
    expect(authService.verifySession(expiredToken, now)).toBeNull();
    expect(authService.verifySession(activeToken, now)).not.toBeNull();
  });

  it('logout invalidates the exact supplied session', async () => {
    const { token: token1 } = await authService.login('127.0.0.1', TEST_OPERATOR_PASSWORD);
    const { token: token2 } = await authService.login('127.0.0.2', TEST_OPERATOR_PASSWORD);

    expect(authService.verifySession(token1)).not.toBeNull();
    expect(authService.verifySession(token2)).not.toBeNull();

    authService.logout(token1);

    expect(authService.verifySession(token1)).toBeNull();
    expect(authService.verifySession(token2)).not.toBeNull();
  });

  it('rejects malformed tokens and wrong signature length safely without throwing', () => {
    expect(authService.verifySession(undefined)).toBeNull();
    expect(authService.verifySession('')).toBeNull();
    expect(authService.verifySession('not-a-token')).toBeNull();
    expect(authService.verifySession('shortId.shortSig')).toBeNull();

    // 64-char hex id but 63-char hex sig
    const id = 'a'.repeat(64);
    const badLenSig = 'b'.repeat(63);
    expect(authService.verifySession(`${id}.${badLenSig}`)).toBeNull();

    // 63-char hex id and 64-char sig
    expect(authService.verifySession(`${'a'.repeat(63)}.${'b'.repeat(64)}`)).toBeNull();

    // Non-hex characters
    expect(authService.verifySession(`${'g'.repeat(64)}.${'z'.repeat(64)}`)).toBeNull();
  });

  it('resets stale failed-attempt counter when a new attempt occurs after 15 minutes', async () => {
    const clientIp = '10.50.0.1';
    const t0 = 1000000;

    // 4 failed attempts at t0
    for (let i = 0; i < 4; i++) {
      await expect(authService.login(clientIp, 'wrong', t0)).rejects.toThrow('Invalid operator credentials.');
    }

    // Now advance time 16 minutes (beyond 15-minute window)
    const t1 = t0 + 16 * 60 * 1000;

    // 1st attempt at t1: stale count must be wiped clean, so this fails as attempt #1, NOT lockout!
    await expect(authService.login(clientIp, 'wrong', t1)).rejects.toThrow('Invalid operator credentials.');

    // Attempts 2, 3, 4 at t1 also fail normally
    for (let i = 0; i < 3; i++) {
      await expect(authService.login(clientIp, 'wrong', t1)).rejects.toThrow('Invalid operator credentials.');
    }

    // Attempt 5 at t1 fails normally (5th attempt)
    await expect(authService.login(clientIp, 'wrong', t1)).rejects.toThrow('Invalid operator credentials.');

    // 6th attempt inside t1 window triggers lockout
    await expect(authService.login(clientIp, 'wrong', t1 + 1000)).rejects.toThrow(OperatorAuthError);
  });
});
