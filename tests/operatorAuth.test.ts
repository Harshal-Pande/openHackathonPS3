import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  parseScryptHash,
  validateScryptHashFormat,
  calculateScryptMemoryRequirement,
  isScryptMemoryWithinBudget,
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

describe('DEF-19: Hard Session Capacity Invariants', () => {
  const sessionSecret = 'test_session_secret_32_characters_minimum_length';

  it('allows session creation below capacity and rejects at hard capacity with 503', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });
    // Hard session capacity configured to 2
    const service = new OperatorAuthService(config, { maxTrackedSessions: 2 });
    const now = Date.now();

    const { token: t1 } = await service.login('10.0.0.1', TEST_OPERATOR_PASSWORD, now);
    const { token: t2 } = await service.login('10.0.0.2', TEST_OPERATOR_PASSWORD, now);

    expect(service.getSessionCount()).toBe(2);
    expect(service.verifySession(t1, now)).not.toBeNull();
    expect(service.verifySession(t2, now)).not.toBeNull();

    // 3rd login must be rejected with 503 SESSION_CAPACITY_EXCEEDED
    try {
      await service.login('10.0.0.3', TEST_OPERATOR_PASSWORD, now);
      expect.unreachable('Should have thrown 503 SESSION_CAPACITY_EXCEEDED');
    } catch (err: any) {
      expect(err).toBeInstanceOf(OperatorAuthError);
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe('SESSION_CAPACITY_EXCEEDED');
      expect(err.message).toContain('Session capacity reached');
      // Must not leak internal session IDs or keys
      expect(err.message).not.toContain(t1);
      expect(err.message).not.toContain(t2);
      expect(err.message).not.toContain(sessionSecret);
    }

    // Active sessions must not be evicted
    expect(service.getSessionCount()).toBe(2);
    expect(service.verifySession(t1, now)).not.toBeNull();
    expect(service.verifySession(t2, now)).not.toBeNull();
  });

  it('allows session creation after logout frees capacity', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });
    const service = new OperatorAuthService(config, { maxTrackedSessions: 2 });
    const now = Date.now();

    const { token: t1 } = await service.login('10.0.0.1', TEST_OPERATOR_PASSWORD, now);
    const { token: t2 } = await service.login('10.0.0.2', TEST_OPERATOR_PASSWORD, now);

    expect(service.getSessionCount()).toBe(2);

    // Logout t1
    service.logout(t1);
    expect(service.getSessionCount()).toBe(1);

    // Now t3 login succeeds
    const { token: t3 } = await service.login('10.0.0.3', TEST_OPERATOR_PASSWORD, now);
    expect(service.getSessionCount()).toBe(2);
    expect(service.verifySession(t1, now)).toBeNull();
    expect(service.verifySession(t2, now)).not.toBeNull();
    expect(service.verifySession(t3, now)).not.toBeNull();
  });

  it('pruning expired sessions frees capacity for new sessions', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });
    const lifetimeMs = 60 * 1000; // 1 minute
    const service = new OperatorAuthService(config, { maxTrackedSessions: 2, sessionLifetimeMs: lifetimeMs });
    const t0 = 1000000;

    const { token: t1 } = await service.login('10.0.0.1', TEST_OPERATOR_PASSWORD, t0);
    const { token: t2 } = await service.login('10.0.0.2', TEST_OPERATOR_PASSWORD, t0);
    expect(service.getSessionCount()).toBe(2);

    // Advance past expiration of t1 and t2
    const tFuture = t0 + lifetimeMs + 5000;

    // Login at tFuture: pruning runs, freeing capacity
    const { token: t3 } = await service.login('10.0.0.3', TEST_OPERATOR_PASSWORD, tFuture);
    expect(service.getSessionCount()).toBe(1);
    expect(service.verifySession(t1, tFuture)).toBeNull();
    expect(service.verifySession(t2, tFuture)).toBeNull();
    expect(service.verifySession(t3, tFuture)).not.toBeNull();
  });

  it('prevents concurrent login completions from exceeding hard capacity', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });
    // Hard session capacity of 2
    const service = new OperatorAuthService(config, { maxTrackedSessions: 2 });
    const now = Date.now();

    // Trigger 5 concurrent logins
    const loginPromises = [
      service.login('10.0.0.1', TEST_OPERATOR_PASSWORD, now),
      service.login('10.0.0.2', TEST_OPERATOR_PASSWORD, now),
      service.login('10.0.0.3', TEST_OPERATOR_PASSWORD, now),
      service.login('10.0.0.4', TEST_OPERATOR_PASSWORD, now),
      service.login('10.0.0.5', TEST_OPERATOR_PASSWORD, now)
    ];

    const results = await Promise.allSettled(loginPromises);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    // Exactly 2 must succeed, 3 must be rejected
    expect(fulfilled.length).toBe(2);
    expect(rejected.length).toBe(3);

    for (const rej of rejected) {
      const err = (rej as PromiseRejectedResult).reason;
      expect(err).toBeInstanceOf(OperatorAuthError);
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe('SESSION_CAPACITY_EXCEEDED');
    }

    // Capacity must never exceed 2
    expect(service.getSessionCount()).toBe(2);
  });

  it('Fastify HTTP route returns 503 SESSION_CAPACITY_EXCEEDED when session limit hit', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });
    const db = new Database(':memory:');
    const service = new OperatorAuthService(config, { maxTrackedSessions: 1 });
    const app = buildApp(config, { db, authService: service });

    // 1st login -> 200
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/operator/login',
      payload: { password: TEST_OPERATOR_PASSWORD }
    });
    expect(res1.statusCode).toBe(200);

    // 2nd login -> 503 SESSION_CAPACITY_EXCEEDED
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/operator/login',
      payload: { password: TEST_OPERATOR_PASSWORD }
    });
    expect(res2.statusCode).toBe(503);
    const body = res2.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('SESSION_CAPACITY_EXCEEDED');
    expect(body.error.message).toContain('Session capacity reached');
  });
});

describe('DEF-20: Fail-Closed Login Attempt Capacity Invariants', () => {
  const sessionSecret = 'test_session_secret_32_characters_minimum_length';

  it('fails closed for new identities when tracker capacity is exhausted', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });
    // Max 2 tracked IPs
    const service = new OperatorAuthService(config, { maxTrackedIps: 2 });
    const now = Date.now();

    // IP1 and IP2 fail password check
    await expect(service.login('10.1.0.1', 'bad', now)).rejects.toThrow('Invalid operator credentials.');
    await expect(service.login('10.1.0.2', 'bad', now)).rejects.toThrow('Invalid operator credentials.');
    expect(service.getTrackedIpCount()).toBe(2);

    // New IP3 tries to log in: capacity is full, fail closed with 503
    try {
      await service.login('10.1.0.3', 'bad', now);
      expect.unreachable('Should have thrown 503 LOGIN_RATE_LIMITER_CAPACITY_EXCEEDED');
    } catch (err: any) {
      expect(err).toBeInstanceOf(OperatorAuthError);
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe('LOGIN_RATE_LIMITER_CAPACITY_EXCEEDED');
      expect(err.message).toContain('Login service temporarily unavailable');
    }

    // Existing active entries IP1 and IP2 are never evicted
    expect(service.getTrackedIpCount()).toBe(2);

    // Existing tracked IP1 can still attempt login and receive 401 (increments counter)
    await expect(service.login('10.1.0.1', 'bad', now)).rejects.toThrow('Invalid operator credentials.');
  });

  it('locked-out IP remains locked out even when tracker is at full capacity', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });
    const service = new OperatorAuthService(config, { maxTrackedIps: 2 });
    const now = Date.now();

    // IP1 fails 5 times -> locked out
    for (let i = 0; i < 5; i++) {
      await expect(service.login('10.1.0.1', 'bad', now)).rejects.toThrow('Invalid operator credentials.');
    }
    // 6th attempt -> 429
    await expect(service.login('10.1.0.1', 'bad', now)).rejects.toThrow(OperatorAuthError);

    // IP2 fails 1 time -> occupies slot 2
    await expect(service.login('10.1.0.2', 'bad', now)).rejects.toThrow('Invalid operator credentials.');
    expect(service.getTrackedIpCount()).toBe(2);

    // IP1 is STILL locked out (429), not evicted or bypassed
    try {
      await service.login('10.1.0.1', 'bad', now);
      expect.unreachable('Should have thrown 429');
    } catch (err: any) {
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('RATE_LIMITED');
    }
  });

  it('pruning expired IP entries frees tracker capacity for new identities', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });
    const windowMs = 15 * 60 * 1000;
    const service = new OperatorAuthService(config, { maxTrackedIps: 2, attemptWindowMs: windowMs });
    const t0 = 1000000;

    await expect(service.login('10.1.0.1', 'bad', t0)).rejects.toThrow('Invalid operator credentials.');
    await expect(service.login('10.1.0.2', 'bad', t0)).rejects.toThrow('Invalid operator credentials.');
    expect(service.getTrackedIpCount()).toBe(2);

    // Advance time past 15 min window
    const tFuture = t0 + windowMs + 1000;

    // New IP3 tries to log in: expired entries pruned, IP3 attempt is tracked normally (fails 401, not 503!)
    await expect(service.login('10.1.0.3', 'bad', tFuture)).rejects.toThrow('Invalid operator credentials.');
    expect(service.getTrackedIpCount()).toBe(1);
  });

  it('successful authentication clears failed attempt record and frees tracker capacity', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });
    const service = new OperatorAuthService(config, { maxTrackedIps: 2 });
    const now = Date.now();

    // IP1 fails twice
    await expect(service.login('10.1.0.1', 'bad', now)).rejects.toThrow('Invalid operator credentials.');
    await expect(service.login('10.1.0.1', 'bad', now)).rejects.toThrow('Invalid operator credentials.');
    expect(service.getTrackedIpCount()).toBe(1);

    // IP1 logs in successfully with valid password
    const { token } = await service.login('10.1.0.1', TEST_OPERATOR_PASSWORD, now);
    expect(token).toBeDefined();

    // Counter cleared
    expect(service.getTrackedIpCount()).toBe(0);
  });
});

describe('DEF-21: Combined scrypt Memory Budget Validation', () => {
  it('correctly calculates scrypt memory requirement including safety overhead', () => {
    // N=16384, r=8, p=1: 128*16384*8 = 16,777,216; parallel: 128*8*1 = 1024; overhead: 1048576 -> 17,826,816
    const memNormal = calculateScryptMemoryRequirement(16384, 8, 1);
    expect(memNormal).toBe(17826816);
    expect(isScryptMemoryWithinBudget(16384, 8, 1)).toBe(true);

    // Overflow protection: non-safe integers return Infinity
    expect(calculateScryptMemoryRequirement(Number.MAX_SAFE_INTEGER, 16, 1)).toBe(Number.POSITIVE_INFINITY);
    expect(isScryptMemoryWithinBudget(Number.MAX_SAFE_INTEGER, 16, 1)).toBe(false);

    // Negative or zero return Infinity
    expect(calculateScryptMemoryRequirement(-1, 8, 1)).toBe(Number.POSITIVE_INFINITY);
    expect(calculateScryptMemoryRequirement(16384, 0, 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it('rejects parameter combinations exceeding 64 MiB budget before calling scrypt', async () => {
    // N=65536, r=16, p=1: 128*65536*16 = 134,217,728 (~128 MiB)
    expect(isScryptMemoryWithinBudget(65536, 16, 1)).toBe(false);

    // N=65536, r=8, p=1: 128*65536*8 = 67,108,864 (exact 64 MiB + overhead exceeds budget)
    expect(isScryptMemoryWithinBudget(65536, 8, 1)).toBe(false);

    // Construct valid base64 salt and key
    const saltB64 = Buffer.alloc(16, 0x11).toString('base64');
    const keyB64 = Buffer.alloc(32, 0x22).toString('base64');

    // Hash with N=65536, r=16 must fail parseScryptHash
    const hash128Mb = `scrypt$v=1$N=65536$r=16$p=1$${saltB64}$${keyB64}`;
    expect(parseScryptHash(hash128Mb)).toBeNull();
    expect(validateScryptHashFormat(hash128Mb).valid).toBe(false);

    // verifyPassword must return false without throwing
    expect(await verifyPassword('any-password', hash128Mb)).toBe(false);

    // Hash with N=65536, r=8 must also fail parseScryptHash
    const hash64MbOverhead = `scrypt$v=1$N=65536$r=8$p=1$${saltB64}$${keyB64}`;
    expect(parseScryptHash(hash64MbOverhead)).toBeNull();
    expect(await verifyPassword('any-password', hash64MbOverhead)).toBe(false);
  });

  it('hashPassword rejects options exceeding 64 MiB memory budget', async () => {
    await expect(hashPassword('pass', { cost: 65536, blockSize: 16 })).rejects.toThrow(
      'exceeds maximum memory budget of 64 MiB'
    );
    await expect(hashPassword('pass', { cost: 65536, blockSize: 8 })).rejects.toThrow(
      'exceeds maximum memory budget of 64 MiB'
    );
  });

  it('permits parameter combinations within the 64 MiB budget', () => {
    // N=32768, r=8, p=1 (~33 MiB)
    expect(isScryptMemoryWithinBudget(32768, 8, 1)).toBe(true);

    // N=65536, r=4, p=1 (~33 MiB)
    expect(isScryptMemoryWithinBudget(65536, 4, 1)).toBe(true);

    // N=16384, r=8, p=1 (~17 MiB - Default production)
    expect(isScryptMemoryWithinBudget(SCRYPT_POLICY.DEFAULT_COST, SCRYPT_POLICY.DEFAULT_BLOCK_SIZE, SCRYPT_POLICY.DEFAULT_PARALLELISM)).toBe(true);
  });
});

describe('DEF-22A: Concurrent Tracker Capacity Invariants', () => {
  const sessionSecret = 'test_session_secret_32_characters_minimum_length';

  it('atomically enforces tracker capacity under concurrent distinct IP requests', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });

    let barrierRelease: () => void;
    const barrierPromise = new Promise<void>((resolve) => {
      barrierRelease = resolve;
    });

    let reachedBarrier = 0;
    const controlledVerifier = async (_pw: string, _hash: string): Promise<boolean> => {
      reachedBarrier++;
      await barrierPromise;
      return false; // invalid password
    };

    // Hard tracker capacity is strictly 3
    const service = new OperatorAuthService(config, {
      maxTrackedIps: 3,
      passwordVerifier: controlledVerifier
    });
    const now = Date.now();

    // Start 6 simultaneous requests from 6 distinct untracked IPs
    const ips = ['192.168.1.1', '192.168.1.2', '192.168.1.3', '192.168.1.4', '192.168.1.5', '192.168.1.6'];
    const loginPromises = ips.map((ip) => service.login(ip, 'invalid-pass', now));
    // Attach allSettled immediately to prevent unhandled rejection warnings in test runner
    const settledPromise = Promise.allSettled(loginPromises);

    // Yield to event loop so synchronous admissions and verifier barrier entries occur
    await new Promise((r) => setImmediate(r));

    // Exactly 3 reached barrier and hold reservations; 4th, 5th, 6th immediately failed closed
    expect(reachedBarrier).toBe(3);
    expect(service.getPendingReservationCount()).toBe(3);
    expect(service.getTrackedIpCount()).toBe(0);
    expect(service.getTotalTrackedCount()).toBe(3);

    // Release the barrier so the 3 in-flight requests finish password verification
    barrierRelease!();

    const results = await settledPromise;
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // All 6 were invalid passwords, so 0 fulfilled
    expect(fulfilled.length).toBe(0);
    expect(rejected.length).toBe(6);

    // Exactly 3 were rejected with 503 LOGIN_RATE_LIMITER_CAPACITY_EXCEEDED
    const capacityErrors = rejected.filter(
      (r) =>
        (r as PromiseRejectedResult).reason instanceof OperatorAuthError &&
        (r as PromiseRejectedResult).reason.statusCode === 503 &&
        (r as PromiseRejectedResult).reason.code === 'LOGIN_RATE_LIMITER_CAPACITY_EXCEEDED'
    );
    expect(capacityErrors.length).toBe(3);

    // Exactly 3 were admitted, reached verifier, and failed with 401 UNAUTHORIZED
    const authErrors = rejected.filter(
      (r) =>
        (r as PromiseRejectedResult).reason instanceof OperatorAuthError &&
        (r as PromiseRejectedResult).reason.statusCode === 401 &&
        (r as PromiseRejectedResult).reason.code === 'UNAUTHORIZED'
    );
    expect(authErrors.length).toBe(3);

    // Tracker size is strictly 3 (never exceeded capacity of 3)
    expect(service.getTrackedIpCount()).toBe(3);
    expect(service.getPendingReservationCount()).toBe(0);
    expect(service.getTotalTrackedCount()).toBe(3);
  });

  it('releases capacity reservation when verifier throws an unexpected error', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });

    const throwingVerifier = async (): Promise<boolean> => {
      throw new Error('Unexpected cryptographic module crash');
    };

    const service = new OperatorAuthService(config, {
      maxTrackedIps: 1,
      passwordVerifier: throwingVerifier
    });

    // Attempt login which throws unexpected error
    await expect(service.login('10.20.30.40', 'pass')).rejects.toThrow('Unexpected cryptographic module crash');

    // Reservation must be fully released
    expect(service.getPendingReservationCount()).toBe(0);
    expect(service.getTrackedIpCount()).toBe(0);
    expect(service.getTotalTrackedCount()).toBe(0);
  });
});

describe('DEF-22B: Concurrent Same-IP Failed Attempts Invariants', () => {
  const sessionSecret = 'test_session_secret_32_characters_minimum_length';

  it('atomically increments failed attempt counter under concurrent requests from the same IP', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });

    let barrierRelease: () => void;
    const barrierPromise = new Promise<void>((resolve) => {
      barrierRelease = resolve;
    });

    let reachedVerifier = 0;
    const controlledVerifier = async (_pw: string, _hash: string): Promise<boolean> => {
      reachedVerifier++;
      await barrierPromise;
      return false; // invalid password
    };

    const service = new OperatorAuthService(config, {
      maxFailedAttempts: 5,
      passwordVerifier: controlledVerifier
    });
    const clientIp = '192.168.100.50';
    const now = Date.now();

    // Start 5 concurrent failed requests from the same IP
    const promises = [
      service.login(clientIp, 'wrong-1', now),
      service.login(clientIp, 'wrong-2', now),
      service.login(clientIp, 'wrong-3', now),
      service.login(clientIp, 'wrong-4', now),
      service.login(clientIp, 'wrong-5', now)
    ];

    await new Promise((r) => setImmediate(r));
    expect(reachedVerifier).toBe(5);

    // Release barrier so all 5 finish verification and record failures
    barrierRelease!();

    const results = await Promise.allSettled(promises);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);

    for (const r of results) {
      const err = (r as PromiseRejectedResult).reason;
      expect(err).toBeInstanceOf(OperatorAuthError);
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    }

    // Every single failure must be counted: counter must be exactly 5, NOT overwritten to 1!
    expect(service.getTrackedIpCount()).toBe(1);
    expect(service.getPendingReservationCount()).toBe(0);

    // Now, subsequent attempt #6 from this IP must immediately trigger 429 lockout!
    try {
      await service.login(clientIp, 'wrong-6', now);
      expect.unreachable('Should have thrown 429 RATE_LIMITED');
    } catch (err: any) {
      expect(err).toBeInstanceOf(OperatorAuthError);
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('RATE_LIMITED');
      expect(err.retryAfter).toBeGreaterThan(0);
    }

    // Verify no unexpected session was created
    expect(service.getSessionCount()).toBe(0);
  });

  it('allows already tracked identity to authenticate successfully when capacity is full', async () => {
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH
    });

    const service = new OperatorAuthService(config, {
      maxTrackedIps: 2
    });
    const now = Date.now();

    // Fill capacity: IP1 and IP2 record failed attempts
    await expect(service.login('10.0.0.1', 'bad', now)).rejects.toThrow('Invalid operator credentials.');
    await expect(service.login('10.0.0.2', 'bad', now)).rejects.toThrow('Invalid operator credentials.');
    expect(service.getTrackedIpCount()).toBe(2);

    // IP1 now logs in with valid credentials: since it is already tracked, it must not be blocked by 503
    const { token } = await service.login('10.0.0.1', TEST_OPERATOR_PASSWORD, now);
    expect(token).toBeDefined();

    // After success, IP1 record is cleared, opening up 1 slot in the tracker
    expect(service.getTrackedIpCount()).toBe(1);
    expect(service.getPendingReservationCount()).toBe(0);
  });
});
