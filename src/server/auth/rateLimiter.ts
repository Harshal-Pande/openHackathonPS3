import { FastifyRequest } from 'fastify';
import net from 'node:net';

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
 * Genuine sliding-window in-memory rate limiter with injectable clock.
 * Tracks individual request timestamps per IP and prunes expired timestamps.
 *
 * Operational Limitation:
 * Enforcement is strictly process-local in memory. For multi-replica horizontally
 * scaled deployments, shared external persistence (such as Redis) is required
 * for globally synchronized rate limits across cluster nodes.
 */
export class RateLimiter {
  private entries: Map<string, number[]> = new Map();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor(options: RateLimiterOptions) {
    if (!Number.isInteger(options.max) || options.max <= 0) {
      throw new Error('RateLimiter "max" must be a positive integer.');
    }
    if (!Number.isInteger(options.windowMs) || options.windowMs <= 0) {
      throw new Error('RateLimiter "windowMs" must be a positive integer.');
    }
    const maxEntries = options.maxEntries ?? 10000;
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error('RateLimiter "maxEntries" must be a positive integer.');
    }

    this.max = options.max;
    this.windowMs = options.windowMs;
    this.maxEntries = maxEntries;
  }

  /**
   * Checks whether the given client IP is allowed to proceed under the sliding-window policy.
   * @param ip Client IP address.
   * @param now Current epoch millisecond timestamp (injectable for deterministic testing).
   */
  public check(ip: string, now: number = Date.now()): RateLimitCheckResult {
    const cleanIp = (ip || '127.0.0.1').trim();
    const windowStart = now - this.windowMs;

    const existingTimestamps = this.entries.get(cleanIp);

    if (existingTimestamps) {
      // Filter out timestamps that have rolled outside the sliding window
      const activeTimestamps = existingTimestamps.filter((t) => t > windowStart);

      if (activeTimestamps.length >= this.max) {
        // Find earliest timestamp contributing to the limit to determine exact retry-after
        const earliestActive = activeTimestamps[0];
        const retryAfterMs = Math.max(1, earliestActive + this.windowMs - now);
        const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

        // Preserve active timestamps in map
        this.entries.set(cleanIp, activeTimestamps);

        return {
          allowed: false,
          retryAfterSeconds,
          remaining: 0
        };
      }

      // Record this request
      activeTimestamps.push(now);
      this.entries.set(cleanIp, activeTimestamps);

      return {
        allowed: true,
        retryAfterSeconds: 0,
        remaining: Math.max(0, this.max - activeTimestamps.length)
      };
    }

    // New identity: check capacity bounds before admitting
    this.pruneExpiredEntries(now);

    // Fail-closed policy: if entry capacity is fully exhausted by active entries,
    // reject new identities to prevent memory exhaustion and uncontrolled tracking
    if (this.entries.size >= this.maxEntries) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(this.windowMs / 1000)),
        remaining: 0
      };
    }

    // Admit new identity
    this.entries.set(cleanIp, [now]);
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, this.max - 1)
    };
  }

  /**
   * Prunes all entries where all recorded timestamps have expired outside the sliding window.
   * Active entries are preserved intact to prevent reset/eviction bypass.
   */
  public pruneExpiredEntries(now: number = Date.now()): void {
    const windowStart = now - this.windowMs;

    for (const [key, timestamps] of this.entries.entries()) {
      const active = timestamps.filter((t) => t > windowStart);
      if (active.length === 0) {
        this.entries.delete(key);
      } else if (active.length !== timestamps.length) {
        this.entries.set(key, active);
      }
    }
  }

  public reset(): void {
    this.entries.clear();
  }

  public getEntryCount(): number {
    return this.entries.size;
  }
}

/**
 * Extracts and strictly validates client IP from Fastify request.
 * Relies on Fastify's native trustProxy resolution (proxy-addr) to ensure
 * arbitrary X-Forwarded-For headers from untrusted socket peers are ignored.
 */
export function getClientIp(request: FastifyRequest): string {
  // Use Fastify's validated request.ip (computed via native trustProxy check)
  const candidateIp = request.ip?.trim() || request.raw?.socket?.remoteAddress?.trim() || '127.0.0.1';

  // Strict IP syntax validation via Node.js net.isIP
  if (net.isIP(candidateIp) !== 0) {
    return candidateIp;
  }

  // Fallback to verified socket peer if candidate was somehow malformed
  const socketIp = request.raw?.socket?.remoteAddress?.trim();
  if (socketIp && net.isIP(socketIp) !== 0) {
    return socketIp;
  }

  return '127.0.0.1';
}
