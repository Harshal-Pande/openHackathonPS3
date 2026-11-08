import crypto from 'node:crypto';
import { AppConfig } from '../config.js';
import { verifyPassword } from './passwordHasher.js';

export interface OperatorSession {
  username: string;
  authenticatedAt: string;
  expiresAt: string;
}

export interface OperatorAuthServiceOptions {
  maxTrackedSessions?: number;
  maxTrackedIps?: number;
  sessionLifetimeMs?: number;
  attemptWindowMs?: number;
  maxFailedAttempts?: number;
  passwordVerifier?: (password: string, hash: string) => Promise<boolean>;
}

export class OperatorAuthError extends Error {
  public statusCode: number;
  public code: string;
  public retryAfter?: number;

  constructor(message: string, statusCode: number = 401, code: string = 'UNAUTHORIZED', retryAfter?: number) {
    super(message);
    this.name = 'OperatorAuthError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;

/**
 * Authentication and Session Management Service.
 *
 * Operational Limitation:
 * The session registry and brute-force attempt tracking are strictly process-local
 * in memory. Restarting the server process invalidates active sessions, and multi-replica
 * horizontal scaling requires sticky sessions or shared session storage (such as Redis)
 * for cross-node session persistence and global brute-force lockout synchronization.
 */
export class OperatorAuthService {
  private failedAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private pendingReservations: Map<string, number> = new Map();
  private validSessions: Map<string, OperatorSession> = new Map();
  private readonly maxFailedAttempts: number;
  private readonly attemptWindowMs: number;
  private readonly sessionLifetimeMs: number;
  private readonly maxTrackedIps: number;
  private readonly maxTrackedSessions: number;
  private readonly passwordVerifier: (password: string, hash: string) => Promise<boolean>;

  constructor(private config: AppConfig, options: OperatorAuthServiceOptions = {}) {
    this.maxFailedAttempts = options.maxFailedAttempts ?? 5;
    this.attemptWindowMs = options.attemptWindowMs ?? 15 * 60 * 1000; // 15 minutes
    this.sessionLifetimeMs = options.sessionLifetimeMs ?? 2 * 60 * 60 * 1000; // 2 hours
    this.maxTrackedIps = options.maxTrackedIps ?? 5000;
    this.maxTrackedSessions = options.maxTrackedSessions ?? 5000;
    this.passwordVerifier = options.passwordVerifier ?? verifyPassword;
  }

  /**
   * Verifies submitted operator credentials against OPERATOR_PASSWORD_HASH using scrypt.
   * On success, generates an HMAC-signed session token using SESSION_SECRET.
   * Enforces brute-force rate limiting per client IP (max 5 failed attempts per 15 min).
   * Enforces atomic failed-attempt tracking under concurrency (DEF-22B).
   * Enforces hard fail-closed capacity on failedAttempts tracker under concurrency (DEF-20, DEF-22A & DEF-22C).
   * Enforces hard session capacity without evicting active sessions (DEF-19).
   */
  public async login(
    clientIp: string,
    passwordOrSecret: string,
    now: number = Date.now()
  ): Promise<{ token: string; session: OperatorSession }> {
    const cleanIp = (clientIp || '127.0.0.1').trim();
    const rateInfo = this.failedAttempts.get(cleanIp);

    let currentCount = 0;
    if (rateInfo) {
      if (now - rateInfo.lastAttempt < this.attemptWindowMs) {
        currentCount = rateInfo.count;
      } else {
        // Window expired: reset stale count and delete entry
        currentCount = 0;
        this.failedAttempts.delete(cleanIp);
      }
    }

    // Enforce 5 failed attempts lockout within 15-minute window for known identity
    if (currentCount >= this.maxFailedAttempts) {
      const waitSeconds = Math.max(1, Math.ceil((this.attemptWindowMs - (now - rateInfo!.lastAttempt)) / 1000));
      const waitMinutes = Math.ceil(waitSeconds / 60);
      throw new OperatorAuthError(
        `Rate limit exceeded for operator login. Please wait ${waitMinutes} minutes.`,
        429,
        'RATE_LIMITED',
        waitSeconds
      );
    }

    // Atomically acquire one in-flight reservation reference for this request (DEF-22A & DEF-22C)
    // Runs synchronously before async scrypt; throws 503 if distinct identity capacity is exhausted
    this.acquireReservation(cleanIp, now);

    try {
      // Verify password strictly against OPERATOR_PASSWORD_HASH
      // Never compares against SESSION_SECRET (resolving DEF-14)
      const isPasswordValid = await this.passwordVerifier(
        passwordOrSecret,
        this.config.OPERATOR_PASSWORD_HASH
      );

      if (!isPasswordValid) {
        // Atomically record failure; leaves pendingReservations untouched (DEF-22B & DEF-22C)
        this.recordFailure(cleanIp, now);
        throw new OperatorAuthError('Invalid operator credentials.', 401, 'UNAUTHORIZED');
      }

      // Reset failed attempt counter on authenticated success
      // Does not delete or alter other in-flight reservation references for this IP (DEF-22C)
      this.failedAttempts.delete(cleanIp);

      // Prune expired sessions if at capacity before rejecting or creating (DEF-19)
      if (this.validSessions.size >= this.maxTrackedSessions) {
        this.pruneExpiredSessions(now);
      }

      // Hard session capacity check: reject new session if capacity is full (DEF-19)
      // Never evicts active sessions
      if (this.validSessions.size >= this.maxTrackedSessions) {
        throw new OperatorAuthError(
          'Session capacity reached. Active sessions cannot be evicted. Please try again later.',
          503,
          'SESSION_CAPACITY_EXCEEDED'
        );
      }

      // Cryptographically unpredictable 32-byte (64 hex) session ID
      const sessionId = crypto.randomBytes(32).toString('hex');

      // HMAC signature computed using SESSION_SECRET (32-byte / 64 hex SHA-256)
      const signature = crypto
        .createHmac('sha256', this.config.SESSION_SECRET)
        .update(sessionId)
        .digest('hex');

      const token = `${sessionId}.${signature}`;

      const session: OperatorSession = {
        username: 'operator',
        authenticatedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + this.sessionLifetimeMs).toISOString()
      };

      this.validSessions.set(sessionId, session);
      return { token, session };
    } finally {
      // Every admitted request releases exactly its own in-flight reservation reference (DEF-22C)
      this.releaseReservation(cleanIp);
    }
  }

  /**
   * Verifies an HMAC-signed session token and checks in-memory session registry and expiration.
   * Sessions are invalid at or after their expiration timestamp (now >= expiresAt).
   */
  public verifySession(token?: string, now: number = Date.now()): OperatorSession | null {
    if (!token || typeof token !== 'string') return null;

    const parts = token.trim().split('.');
    if (parts.length !== 2) return null;

    const [sessionId, signature] = parts;

    // Strict format and length validation: exactly 64 hex characters for both sessionId and signature
    if (!HEX_64_REGEX.test(sessionId) || !HEX_64_REGEX.test(signature)) {
      return null;
    }

    // Verify HMAC-SHA256 signature using SESSION_SECRET in constant time
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.config.SESSION_SECRET)
        .update(sessionId)
        .digest('hex');

      const sigBuf = Buffer.from(signature, 'hex');
      const expectedBuf = Buffer.from(expectedSignature, 'hex');

      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return null;
      }
    } catch {
      return null;
    }

    // Retrieve session from active registry
    const session = this.validSessions.get(sessionId);
    if (!session) return null;

    // Boundary check: invalid at or after its expiry timestamp
    if (now >= new Date(session.expiresAt).getTime()) {
      this.validSessions.delete(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Revokes an active session token if valid.
   */
  public logout(token: string): void {
    if (!token || typeof token !== 'string') return;
    const parts = token.trim().split('.');
    const sessionId = parts[0];
    if (sessionId && HEX_64_REGEX.test(sessionId)) {
      this.validSessions.delete(sessionId);
    }
  }

  /**
   * Prunes expired sessions without invalidating active sessions.
   */
  public pruneExpiredSessions(now: number = Date.now()): void {
    for (const [id, session] of this.validSessions.entries()) {
      if (now >= new Date(session.expiresAt).getTime()) {
        this.validSessions.delete(id);
      }
    }
  }

  /**
   * Clears all active sessions (e.g. for testing).
   */
  public clearSessions(): void {
    this.validSessions.clear();
  }

  /**
   * Resets rate-limit state (e.g. for testing).
   */
  public resetRateLimits(): void {
    this.failedAttempts.clear();
    this.pendingReservations.clear();
  }

  public getSessionCount(): number {
    return this.validSessions.size;
  }

  public pruneExpiredFailedAttempts(now: number = Date.now()): void {
    for (const [ip, entry] of this.failedAttempts.entries()) {
      if (now - entry.lastAttempt >= this.attemptWindowMs) {
        this.failedAttempts.delete(ip);
      }
    }
  }

  public getTrackedIpCount(): number {
    return this.failedAttempts.size;
  }

  public getPendingReservationCount(): number {
    return this.pendingReservations.size;
  }

  /**
   * Returns the count of distinct identities currently tracked in either
   * failedAttempts or pendingReservations (cardinality of the union) without double-counting.
   */
  public getTotalTrackedCount(): number {
    let count = this.failedAttempts.size;
    for (const ip of this.pendingReservations.keys()) {
      if (!this.failedAttempts.has(ip)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Returns the total in-flight reservation reference count (for cleanIp, or across all IPs).
   */
  public getInFlightReservationCount(cleanIp?: string): number {
    if (cleanIp) {
      return this.pendingReservations.get(cleanIp) ?? 0;
    }
    let total = 0;
    for (const count of this.pendingReservations.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Atomically checks distinct-identity capacity and acquires one in-flight reservation reference.
   * If the identity is already tracked in failedAttempts or pendingReservations, increments its ref count.
   * If it is a new identity, verifies that distinct tracked identities (union cardinality) do not exceed maxTrackedIps.
   * Throws HTTP 503 LOGIN_RATE_LIMITER_CAPACITY_EXCEEDED if capacity is exhausted. (DEF-22A & DEF-22C)
   */
  private acquireReservation(cleanIp: string, now: number): void {
    // If cleanIp already exists in either tracking map, it is already counted in distinct capacity
    if (this.failedAttempts.has(cleanIp) || this.pendingReservations.has(cleanIp)) {
      const current = this.pendingReservations.get(cleanIp) ?? 0;
      this.pendingReservations.set(cleanIp, current + 1);
      return;
    }

    // Completely new identity: check if distinct tracked capacity is available
    if (this.getTotalTrackedCount() >= this.maxTrackedIps) {
      this.pruneExpiredFailedAttempts(now);
    }

    if (this.getTotalTrackedCount() >= this.maxTrackedIps) {
      throw new OperatorAuthError(
        'Login service temporarily unavailable due to rate limiter capacity. Please try again later.',
        503,
        'LOGIN_RATE_LIMITER_CAPACITY_EXCEEDED'
      );
    }

    this.pendingReservations.set(cleanIp, 1);
  }

  /**
   * Releases exactly one in-flight reservation reference for cleanIp.
   * If multiple concurrent requests are in flight for this IP, decrements the reference count.
   * If this was the last in-flight request, deletes the IP from pendingReservations. (DEF-22C)
   */
  private releaseReservation(cleanIp: string): void {
    const current = this.pendingReservations.get(cleanIp);
    if (current === undefined) return;
    if (current <= 1) {
      this.pendingReservations.delete(cleanIp);
    } else {
      this.pendingReservations.set(cleanIp, current - 1);
    }
  }

  /**
   * Atomically records a failed attempt in failedAttempts.
   * Does NOT touch pendingReservations; the calling request's reservation reference
   * is released strictly in its own finally block. (DEF-22B & DEF-22C)
   */
  private recordFailure(cleanIp: string, now: number): void {
    const freshRateInfo = this.failedAttempts.get(cleanIp);
    let newCount = 1;
    if (freshRateInfo && now - freshRateInfo.lastAttempt < this.attemptWindowMs) {
      newCount = freshRateInfo.count + 1;
    }

    this.failedAttempts.set(cleanIp, {
      count: newCount,
      lastAttempt: now
    });
  }
}
