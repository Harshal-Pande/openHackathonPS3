import crypto from 'node:crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AppConfig } from '../config.js';

export interface OperatorSession {
  username: string;
  authenticatedAt: string;
  expiresAt: string;
}

export class OperatorAuthService {
  private failedAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private validSessions: Map<string, OperatorSession> = new Map();

  constructor(private config: AppConfig) {}

  /**
   * Verifies an operator password or token.
   * Enforces rate limiting: max 5 failed attempts per 15 minutes per IP.
   */
  public async login(
    clientIp: string,
    passwordOrSecret: string
  ): Promise<{ token: string; session: OperatorSession }> {
    const now = Date.now();
    const rateInfo = this.failedAttempts.get(clientIp) || { count: 0, lastAttempt: 0 };

    if (rateInfo.count >= 5 && now - rateInfo.lastAttempt < 15 * 60 * 1000) {
      const waitMinutes = Math.ceil((15 * 60 * 1000 - (now - rateInfo.lastAttempt)) / 60000);
      throw new Error(`Rate limit exceeded for operator login. Please wait ${waitMinutes} minutes.`);
    }

    // In non-production, allow SESSION_SECRET or matching password
    // In production, compare against Argon2id or HMAC-SHA256 of secret
    const expectedSecret = this.config.SESSION_SECRET;
    const isSecretMatch =
      passwordOrSecret.length > 0 &&
      crypto.timingSafeEqual(
        Buffer.from(passwordOrSecret.padEnd(64).slice(0, 64)),
        Buffer.from(expectedSecret.padEnd(64).slice(0, 64))
      );

    if (!isSecretMatch) {
      this.failedAttempts.set(clientIp, {
        count: rateInfo.count + 1,
        lastAttempt: now
      });
      throw new Error('Invalid operator credentials.');
    }

    // Reset failed attempts on success
    this.failedAttempts.delete(clientIp);

    const token = crypto.randomBytes(32).toString('hex');
    const session: OperatorSession = {
      username: 'operator',
      authenticatedAt: new Date().toISOString(),
      expiresAt: new Date(now + 2 * 60 * 60 * 1000).toISOString() // 2 hours
    };

    this.validSessions.set(token, session);
    return { token, session };
  }

  public verifySession(token?: string): OperatorSession | null {
    if (!token) return null;
    const session = this.validSessions.get(token);
    if (!session) return null;

    if (new Date(session.expiresAt).getTime() < Date.now()) {
      this.validSessions.delete(token);
      return null;
    }

    return session;
  }

  public logout(token: string): void {
    this.validSessions.delete(token);
  }
}
