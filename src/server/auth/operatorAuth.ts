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

export class OperatorAuthService {
  private failedAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private validSessions: Map<string, OperatorSession> = new Map();
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000; // 2 hours
  private readonly MAX_TRACKED_IPS = 5000;

  constructor(private config: AppConfig) {}

  /**
   * Verifies submitted operator credentials against OPERATOR_PASSWORD_HASH.
   * On success, generates an HMAC-signed session token using SESSION_SECRET.
   * Enforces brute-force rate limiting per client IP (max 5 failed attempts per 15 min).
   */
  public async login(
    clientIp: string,
    passwordOrSecret: string,
    now: number = Date.now()
  ): Promise<{ token: string; session: OperatorSession }> {
    const cleanIp = (clientIp || '127.0.0.1').trim();
    const rateInfo = this.failedAttempts.get(cleanIp) || { count: 0, lastAttempt: 0 };

    // Enforce 5 failed attempts lockout within 15-minute window
    if (rateInfo.count >= this.MAX_FAILED_ATTEMPTS && now - rateInfo.lastAttempt < this.ATTEMPT_WINDOW_MS) {
      const waitSeconds = Math.max(1, Math.ceil((this.ATTEMPT_WINDOW_MS - (now - rateInfo.lastAttempt)) / 1000));
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
        count: rateInfo.count + 1,
        lastAttempt: now
      });
      throw new OperatorAuthError('Invalid operator credentials.', 401, 'UNAUTHORIZED');
    }

    // Reset failed attempt counter on authenticated success
    this.failedAttempts.delete(cleanIp);

    // Cryptographically unpredictable 32-byte session ID
    const sessionId = crypto.randomBytes(32).toString('hex');

    // HMAC signature computed using SESSION_SECRET
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

    this.validSessions.set(sessionId, session);
    return { token, session };
  }

  /**
   * Verifies an HMAC-signed session token and checks in-memory session registry and expiration.
   */
  public verifySession(token?: string, now: number = Date.now()): OperatorSession | null {
    if (!token || typeof token !== 'string') return null;

    const parts = token.trim().split('.');
    if (parts.length !== 2) return null;

    const [sessionId, signature] = parts;
    if (!sessionId || !signature) return null;

    // Verify HMAC-SHA256 signature using SESSION_SECRET
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

    // Check 2-hour hard session expiration
    if (new Date(session.expiresAt).getTime() < now) {
      this.validSessions.delete(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Revokes an active session token.
   */
  public logout(token: string): void {
    if (!token || typeof token !== 'string') return;
    const parts = token.trim().split('.');
    const sessionId = parts[0];
    if (sessionId) {
      this.validSessions.delete(sessionId);
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

  private pruneFailedAttemptsIfNeeded(now: number): void {
    if (this.failedAttempts.size >= this.MAX_TRACKED_IPS) {
      for (const [ip, entry] of this.failedAttempts.entries()) {
        if (now - entry.lastAttempt >= this.ATTEMPT_WINDOW_MS) {
          this.failedAttempts.delete(ip);
        }
      }
      // If still above bound, drop oldest
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
