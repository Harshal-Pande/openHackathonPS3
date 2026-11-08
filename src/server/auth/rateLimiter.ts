import { FastifyRequest } from 'fastify';

export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  maxEntries?: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

/**
 * High-performance, bounded in-memory sliding window rate limiter.
 * Operates process-locally without external infrastructure dependencies.
 *
 * NOTE: For multi-replica horizontally-scaled deployments, shared storage
 * (such as Redis) is required for globally synchronized limits across nodes.
 */
export class RateLimiter {
  private entries: Map<string, { count: number; resetAt: number }> = new Map();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor(options: RateLimiterOptions) {
    if (options.max <= 0) {
      throw new Error('RateLimiter "max" must be a positive integer.');
    }
    if (options.windowMs <= 0) {
      throw new Error('RateLimiter "windowMs" must be a positive integer.');
    }
    this.max = options.max;
    this.windowMs = options.windowMs;
    this.maxEntries = options.maxEntries ?? 10000;
  }

  public check(ip: string, now: number = Date.now()): RateLimitCheckResult {
    const cleanIp = (ip || '127.0.0.1').trim();
    const entry = this.entries.get(cleanIp);

    if (!entry || now >= entry.resetAt) {
      this.pruneIfNeeded(now);
      this.entries.set(cleanIp, {
        count: 1,
        resetAt: now + this.windowMs
      });
      return {
        allowed: true,
        retryAfterSeconds: 0,
        remaining: Math.max(0, this.max - 1)
      };
    }

    if (entry.count >= this.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      return {
        allowed: false,
        retryAfterSeconds,
        remaining: 0
      };
    }

    entry.count += 1;
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, this.max - entry.count)
    };
  }

  public reset(): void {
    this.entries.clear();
  }

  public getEntryCount(): number {
    return this.entries.size;
  }

  private pruneIfNeeded(now: number): void {
    if (this.entries.size >= this.maxEntries) {
      for (const [key, value] of this.entries.entries()) {
        if (now >= value.resetAt) {
          this.entries.delete(key);
        }
      }
      // If still exceeding bound, remove oldest entries
      if (this.entries.size >= this.maxEntries) {
        let deleted = 0;
        for (const key of this.entries.keys()) {
          this.entries.delete(key);
          deleted++;
          if (deleted >= Math.floor(this.maxEntries * 0.2)) break;
        }
      }
    }
  }
}

/**
 * Extracts client IP address with strict reverse proxy safety.
 * Arbitrary X-Forwarded-For headers are ignored unless trustProxy is explicitly enabled.
 */
export function getClientIp(request: FastifyRequest, trustProxy: boolean = false): string {
  if (trustProxy) {
    const xForwardedFor = request.headers['x-forwarded-for'];
    if (typeof xForwardedFor === 'string' && xForwardedFor.trim() !== '') {
      const firstIp = xForwardedFor.split(',')[0].trim();
      if (firstIp) return firstIp;
    }
  }
  return request.ip || '127.0.0.1';
}
