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
   * Enforces hard fail-closed capacity on failedAttempts tracker under concurrency (DEF-20 & DEF-22A).
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

    // Atomically reserve capacity before starting asynchronous verification (DEF-22A)
    const hasReservation = this.acquireReservation(cleanIp, now);

    try {
      // Verify password strictly against OPERATOR_PASSWORD_HASH
      // Never compares against SESSION_SECRET (resolving DEF-14)
      const isPasswordValid = await this.passwordVerifier(
        passwordOrSecret,
        this.config.OPERATOR_PASSWORD_HASH
      );

      if (!isPasswordValid) {
        // Atomically record failure and transition capacity reservation (DEF-22A & DEF-22B)
        this.recordFailure(cleanIp, now);
        throw new OperatorAuthError('Invalid operator credentials.', 401, 'UNAUTHORIZED');
      }

      // Reset failed attempt counter on authenticated success
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
      if (hasReservation) {
        this.releaseReservation(cleanIp);
      }
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

  public getTotalTrackedCount(): number {
    return this.failedAttempts.size + this.pendingReservations.size;
  }

  /**
   * Atomically checks capacity and reserves a slot for an untracked IP during asynchronous verification.
   * Returns true if a reservation was acquired; false if the IP already occupies a slot in failedAttempts.
   * Throws HTTP 503 LOGIN_RATE_LIMITER_CAPACITY_EXCEEDED if capacity is exhausted.
   */
  private acquireReservation(cleanIp: string, now: number): boolean {
    // If cleanIp already has an active entry in failedAttempts, its capacity slot is already accounted for
    if (this.failedAttempts.has(cleanIp)) {
      return false;
    }

    // If cleanIp already has an in-flight reservation, share the slot via ref count
    const existingRefCount = this.pendingReservations.get(cleanIp);
    if (existingRefCount !== undefined) {
      this.pendingReservations.set(cleanIp, existingRefCount + 1);
      return true;
    }

    // Completely new identity: check if capacity is available
    if (this.failedAttempts.size + this.pendingReservations.size >= this.maxTrackedIps) {
      this.pruneExpiredFailedAttempts(now);
    }

    if (this.failedAttempts.size + this.pendingReservations.size >= this.maxTrackedIps) {
      throw new OperatorAuthError(
        'Login service temporarily unavailable due to rate limiter capacity. Please try again later.',
        503,
        'LOGIN_RATE_LIMITER_CAPACITY_EXCEEDED'
      );
    }

    this.pendingReservations.set(cleanIp, 1);
    return true;
  }

  /**
   * Releases an in-flight capacity reservation for an untracked IP.
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
   * Atomically records a failed attempt and synchronously transfers capacity accounting
   * from pendingReservations to failedAttempts, guaranteeing total tracked entries never double counts.
   */
  private recordFailure(cleanIp: string, now: number): void {
    const freshRateInfo = this.failedAttempts.get(cleanIp);
    let newCount = 1;
    if (freshRateInfo && now - freshRateInfo.lastAttempt < this.attemptWindowMs) {
      newCount = freshRateInfo.count + 1;
    }

    // Synchronously delete from pendingReservations as it is inserted into failedAttempts
    this.pendingReservations.delete(cleanIp);

    this.failedAttempts.set(cleanIp, {
      count: newCount,
      lastAttempt: now
    });
  }
}
