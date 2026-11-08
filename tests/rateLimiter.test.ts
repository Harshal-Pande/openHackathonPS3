import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter, getClientIp } from '../src/server/auth/rateLimiter.js';
import { buildApp } from '../src/server/app.js';
import { Database } from '../src/server/db/database.js';
import { ChainstackProvider } from '../src/server/providers/chainstack.js';
import { createTestConfig } from '../src/server/config.js';

describe('RateLimiter Unit Tests (AGY-06)', () => {
  it('allows requests below the limit and calculates remaining count', () => {
    const limiter = new RateLimiter({ max: 3, windowMs: 60000 });
    const now = 1000000;

    const r1 = limiter.check('10.0.0.1', now);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check('10.0.0.1', now + 1000);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check('10.0.0.1', now + 2000);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // 4th request exceeds limit
    const r4 = limiter.check('10.0.0.1', now + 3000);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterSeconds).toBe(57); // 60s - 3s
  });

  it('provides independent rate limits per IP address', () => {
    const limiter = new RateLimiter({ max: 2, windowMs: 60000 });
    const now = 1000000;

    limiter.check('192.168.1.1', now);
    limiter.check('192.168.1.1', now);
    expect(limiter.check('192.168.1.1', now).allowed).toBe(false);

    // Different IP is allowed
    expect(limiter.check('192.168.1.2', now).allowed).toBe(true);
  });

  it('resets counter after windowMs expires', () => {
    const limiter = new RateLimiter({ max: 2, windowMs: 10000 });
    const now = 1000000;

    limiter.check('10.0.0.1', now);
    limiter.check('10.0.0.1', now);
    expect(limiter.check('10.0.0.1', now).allowed).toBe(false);

    // Advance beyond window
    const afterWindow = now + 10001;
    const rAfter = limiter.check('10.0.0.1', afterWindow);
    expect(rAfter.allowed).toBe(true);
    expect(rAfter.remaining).toBe(1);
  });

  it('bounds memory usage by pruning expired entries', () => {
    const limiter = new RateLimiter({ max: 5, windowMs: 1000, maxEntries: 10 });
    const now = 1000000;

    for (let i = 0; i < 15; i++) {
      limiter.check(`10.0.0.${i}`, now);
    }

    // Now advance time so entries expire
    limiter.check('10.0.0.99', now + 2000);
    expect(limiter.getEntryCount()).toBeLessThanOrEqual(10);
  });
});

describe('Public Forensic Ingestion Rate Limiting Integration (AGY-06)', () => {
  let db: Database;
  let provider: ChainstackProvider;

  beforeEach(() => {
    db = new Database(':memory:');
    provider = new ChainstackProvider({ rpcUrl: 'https://test-node' });
    vi.spyOn(provider, 'isConfigured').mockReturnValue(true);
    vi.spyOn(provider, 'getChainId').mockResolvedValue(42220);
  });

  it('enforces rate limit on POST /api/investigations and returns 429 envelope', async () => {
    const config = createTestConfig({
      RATE_LIMIT_INVESTIGATIONS_MAX: 3,
      RATE_LIMIT_INVESTIGATIONS_WINDOW_MS: 60000
    });
    const app = buildApp(config, { db, provider });

    // 3 rapid requests
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/investigations',
        payload: { txHash: 'invalid-hash' } // triggers validation error, but counts towards IP rate limit
      });
      expect(res.statusCode).toBe(400); // hit endpoint, got validation error
    }

    // 4th request must receive HTTP 429
    const limitedRes = await app.inject({
      method: 'POST',
      url: '/api/investigations',
      payload: { txHash: '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445' }
    });

    expect(limitedRes.statusCode).toBe(429);
    expect(limitedRes.headers['retry-after']).toBeDefined();

    const body = JSON.parse(limitedRes.body);
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.message).toContain('Too many investigation requests');
    expect(body.requestId).toBeDefined();
  });

  it('does NOT rate-limit health checks or report read routes when POST is blocked', async () => {
    const config = createTestConfig({
      RATE_LIMIT_INVESTIGATIONS_MAX: 2,
      RATE_LIMIT_INVESTIGATIONS_WINDOW_MS: 60000
    });
    const app = buildApp(config, { db, provider });

    // Exhaust POST limit
    await app.inject({ method: 'POST', url: '/api/investigations', payload: { txHash: 'invalid' } });
    await app.inject({ method: 'POST', url: '/api/investigations', payload: { txHash: 'invalid' } });
    const blockedRes = await app.inject({ method: 'POST', url: '/api/investigations', payload: { txHash: 'invalid' } });
    expect(blockedRes.statusCode).toBe(429);

    // GET /api/health must still return 200
    const healthRes = await app.inject({ method: 'GET', url: '/api/health' });
    expect(healthRes.statusCode).toBe(200);

    // GET /api/agent/metadata must still return 200
    const agentRes = await app.inject({ method: 'GET', url: '/api/agent/metadata' });
    expect(agentRes.statusCode).toBe(200);

    // GET /api/investigations (history) must still return 200
    const listRes = await app.inject({ method: 'GET', url: '/api/investigations' });
    expect(listRes.statusCode).toBe(200);
  });
});
