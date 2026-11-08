import crypto from 'node:crypto';
import { AppConfig } from '../config.js';
import { verifyPassword } from './passwordHasher.js';

export interface OperatorSession {
  username: string;
  authenticatedAt: string;
  expiresAt: string;
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
  private validSessions: Map<string, OperatorSession> = new Map();
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000; // 2 hours
  private readonly MAX_TRACKED_IPS = 5000;
  private readonly MAX_TRACKED_SESSIONS = 5000;

  constructor(private config: AppConfig) {}

  /**
   * Verifies submitted operator credentials against OPERATOR_PASSWORD_HASH using scrypt.
   * On success, generates an HMAC-signed session token using SESSION_SECRET.
   * Enforces brute-force rate limiting per client IP (max 5 failed attempts per 15 min).
   * Stale attempt counts outside the 15-minute window are strictly reset to 0.
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
      if (now - rateInfo.lastAttempt < this.ATTEMPT_WINDOW_MS) {
        currentCount = rateInfo.count;
      } else {
        // Window expired: reset stale count to 0
        currentCount = 0;
        this.failedAttempts.delete(cleanIp);
      }
    }

    // Enforce 5 failed attempts lockout within 15-minute window
    if (currentCount >= this.MAX_FAILED_ATTEMPTS) {
      const waitSeconds = Math.max(1, Math.ceil((this.ATTEMPT_WINDOW_MS - (now - rateInfo!.lastAttempt)) / 1000));
      const waitMinutes = Math.ceil(waitSeconds / 60);
      throw new OperatorAuthError(
        `Rate limit exceeded for operator login. Please wait ${waitMinutes} minutes.`,
        429,
        'RATE_LIMITED',
        waitSeconds
      );
    }

    // Verify password strictly against OPERATOR_PASSWORD_HASH
    // Never compares against SESSION_SECRET (resolving DEF-14)
    const isPasswordValid = await verifyPassword(
      passwordOrSecret,
      this.config.OPERATOR_PASSWORD_HASH
    );

    if (!isPasswordValid) {
      this.pruneFailedAttemptsIfNeeded(now);
      this.failedAttempts.set(cleanIp, {
        count: currentCount + 1,
        lastAttempt: now
      });
      throw new OperatorAuthError('Invalid operator credentials.', 401, 'UNAUTHORIZED');
    }

    // Reset failed attempt counter on authenticated success
    this.failedAttempts.delete(cleanIp);

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
      expiresAt: new Date(now + this.SESSION_LIFETIME_MS).toISOString()
    };

    this.pruneExpiredSessionsIfNeeded(now);
    this.validSessions.set(sessionId, session);
    return { token, session };
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
  }

  public getSessionCount(): number {
    return this.validSessions.size;
  }

  private pruneExpiredSessionsIfNeeded(now: number): void {
    if (this.validSessions.size >= this.MAX_TRACKED_SESSIONS) {
      this.pruneExpiredSessions(now);
    }
  }

  private pruneFailedAttemptsIfNeeded(now: number): void {
    if (this.failedAttempts.size >= this.MAX_TRACKED_IPS) {
      for (const [ip, entry] of this.failedAttempts.entries()) {
        if (now - entry.lastAttempt >= this.ATTEMPT_WINDOW_MS) {
          this.failedAttempts.delete(ip);
        }
      }
      if (this.failedAttempts.size >= this.MAX_TRACKED_IPS) {
        let deleted = 0;
        for (const ip of this.failedAttempts.keys()) {
          this.failedAttempts.delete(ip);
          deleted++;
          if (deleted >= Math.floor(this.MAX_TRACKED_IPS * 0.2)) break;
        }
      }
    }
  }
}
