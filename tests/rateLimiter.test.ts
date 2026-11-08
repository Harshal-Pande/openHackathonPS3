import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter, getClientIp } from '../src/server/auth/rateLimiter.js';
import { buildApp } from '../src/server/app.js';
import { Database } from '../src/server/db/database.js';
import { ChainstackProvider } from '../src/server/providers/chainstack.js';
import { createTestConfig } from '../src/server/config.js';

describe('Sliding-Window RateLimiter Unit Tests (Correction C)', () => {
  it('validates constructor parameters strictly', () => {
    expect(() => new RateLimiter({ max: 0, windowMs: 1000 })).toThrow('must be a positive integer');
    expect(() => new RateLimiter({ max: -5, windowMs: 1000 })).toThrow('must be a positive integer');
    expect(() => new RateLimiter({ max: 5.5, windowMs: 1000 })).toThrow('must be a positive integer');
    expect(() => new RateLimiter({ max: 5, windowMs: 0 })).toThrow('must be a positive integer');
    expect(() => new RateLimiter({ max: 5, windowMs: 1000, maxEntries: 0 })).toThrow('must be a positive integer');
  });

  it('allows requests below the limit and calculates exact remaining count', () => {
    const limiter = new RateLimiter({ max: 3, windowMs: 60000 });
    const now = 1000000;

    const r1 = limiter.check('10.0.0.1', now);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check('10.0.0.1', now + 10000);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check('10.0.0.1', now + 20000);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // 4th request exceeds limit
    const r4 = limiter.check('10.0.0.1', now + 30000);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    // Oldest active was at now (1000000). Window ends at 1060000. Now is 1030000.
    // Retry-After: (1060000 - 1030000) / 1000 = 30 seconds
    expect(r4.retryAfterSeconds).toBe(30);
  });

  it('correctly slides window as time advances (sliding-window behavior)', () => {
    const limiter = new RateLimiter({ max: 2, windowMs: 10000 });
    const t0 = 1000000;

    // Request 1 at t0 (1000000)
    expect(limiter.check('10.0.0.1', t0).allowed).toBe(true);

    // Request 2 at t0 + 4000 (1004000) -> limit reached
    expect(limiter.check('10.0.0.1', t0 + 4000).allowed).toBe(true);

    // Request 3 at t0 + 8000 (1008000) -> rejected! Window expires at 1010000
    const rBlocked = limiter.check('10.0.0.1', t0 + 8000);
    expect(rBlocked.allowed).toBe(false);
    expect(rBlocked.retryAfterSeconds).toBe(2); // 1010000 - 1008000 = 2s

    // At t0 + 10001 (1010001): Request 1 (at 1000000) has slid out!
    // Request 2 (at 1004000) is still active in window (ends at 1014000).
    // Now request 3 should be allowed!
    const rSlid = limiter.check('10.0.0.1', t0 + 10001);
    expect(rSlid.allowed).toBe(true);
    expect(rSlid.remaining).toBe(0); // 2 active now (1004000 and 1010001)
  });

  it('provides independent rate limits per IP address', () => {
    const limiter = new RateLimiter({ max: 2, windowMs: 60000 });
    const now = 1000000;

    limiter.check('192.168.1.1', now);
    limiter.check('192.168.1.1', now);
    expect(limiter.check('192.168.1.1', now).allowed).toBe(false);

    // Different IP is completely unaffected
    expect(limiter.check('192.168.1.2', now).allowed).toBe(true);
  });

  it('fails closed when capacity is exhausted by active identities', () => {
    const limiter = new RateLimiter({ max: 2, windowMs: 60000, maxEntries: 2 });
    const now = 1000000;

    // Fill capacity with 2 distinct IPs
    limiter.check('10.0.0.1', now);
    limiter.check('10.0.0.2', now);
    expect(limiter.getEntryCount()).toBe(2);

    // 3rd IP arrives while both existing entries are active -> FAIL CLOSED!
    const rFailClosed = limiter.check('10.0.0.3', now);
    expect(rFailClosed.allowed).toBe(false);
    expect(rFailClosed.remaining).toBe(0);
    expect(rFailClosed.retryAfterSeconds).toBe(60);

    // Existing active entries can still be queried
    expect(limiter.check('10.0.0.1', now).allowed).toBe(true);
  });

  it('prunes expired entries and admits new identities once space frees up', () => {
    const limiter = new RateLimiter({ max: 2, windowMs: 1000, maxEntries: 2 });
    const now = 1000000;

    limiter.check('10.0.0.1', now);
    limiter.check('10.0.0.2', now);

    // Advance beyond window so entries expire
    const future = now + 2000;
    expect(limiter.check('10.0.0.3', future).allowed).toBe(true);
  });
});

describe('Trusted Reverse-Proxy Handling (Correction B)', () => {
  it('ignores spoofed X-Forwarded-For when TRUST_PROXY is false (default)', async () => {
    const config = createTestConfig({ TRUST_PROXY: false });
    const db = new Database(':memory:');
    const app = buildApp(config, { db });

    app.get('/test-proxy-ip', async (req) => ({ clientIp: getClientIp(req) }));

    const res = await app.inject({
      method: 'GET',
      url: '/test-proxy-ip',
      headers: { 'x-forwarded-for': '203.0.113.195' }
    });

    // When TRUST_PROXY=false, socket IP (127.0.0.1) is used; spoofed header is ignored
    expect(JSON.parse(res.body).data.clientIp).toBe('127.0.0.1');
  });

  it('respects X-Forwarded-For when connection originates from a trusted reverse proxy', async () => {
    // Inject in tests connects over 127.0.0.1; configure 127.0.0.1 as trusted proxy
    const config = createTestConfig({ TRUST_PROXY: '127.0.0.1' });
    const db = new Database(':memory:');
    const app = buildApp(config, { db });

    app.get('/test-proxy-ip', async (req) => ({ clientIp: getClientIp(req) }));

    const res = await app.inject({
      method: 'GET',
      url: '/test-proxy-ip',
      headers: { 'x-forwarded-for': '198.51.100.42' }
    });

    expect(JSON.parse(res.body).data.clientIp).toBe('198.51.100.42');
  });

  it('ignores X-Forwarded-For if socket peer does not match configured trusted proxy list', async () => {
    // Only trust a non-loopback proxy (10.99.99.99), while inject connects from 127.0.0.1
    const config = createTestConfig({ TRUST_PROXY: '10.99.99.99' });
    const db = new Database(':memory:');
    const app = buildApp(config, { db });

    app.get('/test-proxy-ip', async (req) => ({ clientIp: getClientIp(req) }));

    const res = await app.inject({
      method: 'GET',
      url: '/test-proxy-ip',
      headers: { 'x-forwarded-for': '198.51.100.42' }
    });

    // 127.0.0.1 is not in [10.99.99.99], so header is untrusted and ignored!
    expect(JSON.parse(res.body).data.clientIp).toBe('127.0.0.1');
  });

  it('isolates rate-limiting per client IP through a trusted reverse proxy', async () => {
    const config = createTestConfig({
      TRUST_PROXY: '127.0.0.1',
      RATE_LIMIT_INVESTIGATIONS_MAX: 2,
      RATE_LIMIT_INVESTIGATIONS_WINDOW_MS: 60000
    });
    const db = new Database(':memory:');
    const app = buildApp(config, { db });

    // Client A sends 2 requests -> reaches limit
    await app.inject({
      method: 'POST',
      url: '/api/investigations',
      headers: { 'x-forwarded-for': '198.51.100.1' },
      payload: { txHash: 'invalid' }
    });
    await app.inject({
      method: 'POST',
      url: '/api/investigations',
      headers: { 'x-forwarded-for': '198.51.100.1' },
      payload: { txHash: 'invalid' }
    });

    // Client A request 3 -> blocked 429
    const blockedA = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      headers: { 'x-forwarded-for': '198.51.100.1' },
      payload: { txHash: 'invalid' }
    });
    expect(blockedA.statusCode).toBe(429);

    // Client B sends request through same proxy -> allowed 400 (validation error, not 429 rate limit)
    const allowedB = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      headers: { 'x-forwarded-for': '198.51.100.2' },
      payload: { txHash: 'invalid' }
    });
    expect(allowedB.statusCode).toBe(400);
  });
});
