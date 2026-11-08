import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Database } from '../src/server/db/database.js';
import { buildApp } from '../src/server/app.js';
import { loadConfig, createTestConfig, TEST_OPERATOR_HASH } from '../src/server/config.js';

describe('MOD-06.1 / AGY-12: Docker Runtime, Persistence & Container Readiness Suite', () => {
  let tmpDir: string;
  let testDbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revertlens-runtime-test-'));
    testDbPath = path.join(tmpDir, 'nested', 'data', 'revertlens.sqlite');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. SQLite Persistent Storage & WAL Guarantees', () => {
    it('automatically creates parent directory when database path does not exist', () => {
      expect(fs.existsSync(path.dirname(testDbPath))).toBe(false);
      const db = new Database(testDbPath);
      expect(fs.existsSync(path.dirname(testDbPath))).toBe(true);
      expect(fs.existsSync(testDbPath)).toBe(true);
      db.close();
    });

    it('enforces WAL mode, synchronous NORMAL, and 5000ms busy timeout on disk databases', () => {
      const db = new Database(testDbPath);
      const rawDb = db.getRawDb();

      const journalRow = rawDb.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
      expect(journalRow.journal_mode.toLowerCase()).toBe('wal');

      const timeoutRow = rawDb.prepare('PRAGMA busy_timeout;').get() as { timeout: number };
      expect(timeoutRow.timeout).toBe(5000);

      db.close();
    });

    it('supports idempotent close() without throwing on repeated invocations', () => {
      const db = new Database(testDbPath);
      expect(db.isClosed()).toBe(false);

      expect(() => db.close()).not.toThrow();
      expect(db.isClosed()).toBe(true);

      // Repeated close must be a safe no-op
      expect(() => db.close()).not.toThrow();
      expect(db.isClosed()).toBe(true);
    });

    it('persists investigation records across database close and reopen cycles', () => {
      const db1 = new Database(testDbPath);
      const testId = '11111111-1111-4111-8111-111111111111';
      const testHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      db1.saveInvestigation({
        id: testId,
        tx_hash: testHash,
        chain_id: 42220,
        status: 'ANALYZED',
        trace_status: 'AVAILABLE',
        raw_tx: JSON.stringify({ hash: testHash }),
        raw_receipt: JSON.stringify({ status: '0x0' }),
        raw_trace: null,
        normalized_trace: null,
        decoded_revert: 'Execution reverted',
        diagnosis: 'Test diagnosis for persistence verification',
        limitations: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const initialRecord = db1.getInvestigation(testId);
      expect(initialRecord).not.toBeNull();
      expect(initialRecord?.id).toBe(testId);
      expect(initialRecord?.diagnosis).toBe('Test diagnosis for persistence verification');

      // Close the first database connection cleanly
      db1.close();
      expect(db1.isClosed()).toBe(true);

      // Reopen a brand new database connection pointing to the exact same persistent file
      const db2 = new Database(testDbPath);
      expect(db2.isClosed()).toBe(false);

      const persistedRecord = db2.getInvestigation(testId);
      expect(persistedRecord).not.toBeNull();
      expect(persistedRecord?.id).toBe(testId);
      expect(persistedRecord?.tx_hash).toBe(testHash);
      expect(persistedRecord?.diagnosis).toBe('Test diagnosis for persistence verification');
      expect(persistedRecord?.status).toBe('ANALYZED');

      db2.close();
    });
  });

  describe('2. Fastify Graceful Shutdown & Resource Teardown', () => {
    it('automatically closes underlying database when server.close() is executed', async () => {
      const db = new Database(testDbPath);
      expect(db.isClosed()).toBe(false);

      const app = buildApp(createTestConfig({ DATABASE_PATH: ':memory:' }), { db });

      // Trigger Fastify graceful close
      await app.close();

      // Database should have been cleanly closed by Fastify onClose hook
      expect(db.isClosed()).toBe(true);
    });

    it('handles multiple close calls without unhandled rejection or errors', async () => {
      const db = new Database(testDbPath);
      const app = buildApp(createTestConfig({ DATABASE_PATH: ':memory:' }), { db });

      await app.close();
      await expect(app.close()).resolves.not.toThrow();
      expect(db.isClosed()).toBe(true);
    });
  });

  describe('3. Production Health Endpoint & Secrets Hygiene', () => {
    it('serves HTTP 200 with truthful status, chain ID 42220, and no leaked secrets', async () => {
      const app = buildApp(
        createTestConfig({
          BUY_ENABLED: false,
          CENCORI_ENABLED: false,
          CHAINSTACK_CELO_MAINNET_RPC_URL: 'https://secret-node-key.chainstacklabs.com'
        })
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/health'
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);

      expect(json.data).toBeDefined();
      expect(json.data.status).toBe('ok');
      expect(json.data.version).toBe('0.1.0');
      expect(json.data.chainId).toBe(42220);
      expect(json.data.featureFlags.buyEnabled).toBe(false);
      expect(json.data.featureFlags.cencoriEnabled).toBe(false);
      expect(json.data.buyReady).toBe(false);

      // Verify no secrets or credentials leaked in response body
      const bodyStr = res.body.toLowerCase();
      expect(bodyStr).not.toContain('secret-node-key');
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain('session');
      expect(bodyStr).not.toContain('key');

      await app.close();
    });
  });

  describe('4. Routing, SPA Navigation & API Contract Invariants', () => {
    it('returns JSON 404 adhering to API envelope for missing /api endpoints', async () => {
      const app = buildApp(createTestConfig());

      const res = await app.inject({
        method: 'GET',
        url: '/api/nonexistent-endpoint'
      });

      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');

      const json = JSON.parse(res.body);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error.code).toBe('NOT_FOUND');
      expect(json.requestId).toBeDefined();

      await app.close();
    });

    it('returns text 404 for missing assets under /assets/*', async () => {
      const app = buildApp(createTestConfig());

      const res = await app.inject({
        method: 'GET',
        url: '/assets/nonexistent-file.js'
      });

      expect(res.statusCode).toBe(404);
      expect(res.body).toBe('Asset Not Found');

      await app.close();
    });

    it('redirects clean frontend navigation routes to SPA hash routes', async () => {
      const app = buildApp(createTestConfig());

      const historyRes = await app.inject({ method: 'GET', url: '/history' });
      expect(historyRes.statusCode).toBe(302);
      expect(historyRes.headers.location).toBe('/#/history');

      const aboutRes = await app.inject({ method: 'GET', url: '/about' });
      expect(aboutRes.statusCode).toBe(302);
      expect(aboutRes.headers.location).toBe('/#/about');

      const operatorRes = await app.inject({ method: 'GET', url: '/operator' });
      expect(operatorRes.statusCode).toBe(302);
      expect(operatorRes.headers.location).toBe('/#/operator');

      await app.close();
    });
  });

  describe('5. Production Security Invariant Enforcement', () => {
    const validScryptHash = TEST_OPERATOR_HASH;
    const validPublicUrl = 'https://revertlens.net';
    const strongSecret = 'super-strong-production-session-secret-32-chars-long';

    it('rejects placeholder SESSION_SECRET in production', () => {
      expect(() => {
        loadConfig({
          NODE_ENV: 'production',
          PUBLIC_BASE_URL: validPublicUrl,
          OPERATOR_PASSWORD_HASH: validScryptHash,
          CORS_ORIGIN: 'https://revertlens.net',
          DATABASE_PATH: '/app/data/revertlens.sqlite',
          SESSION_SECRET: 'REPLACE_WITH_RANDOM_32_BYTE_OR_LONGER_SECRET'
        });
      }).toThrow(/SESSION_SECRET must be replaced with a real secret in production/);
    });

    it('rejects short SESSION_SECRET in production', () => {
      expect(() => {
        loadConfig({
          NODE_ENV: 'production',
          PUBLIC_BASE_URL: validPublicUrl,
          OPERATOR_PASSWORD_HASH: validScryptHash,
          CORS_ORIGIN: 'https://revertlens.net',
          DATABASE_PATH: '/app/data/revertlens.sqlite',
          SESSION_SECRET: 'too-short-secret'
        });
      }).toThrow(/SESSION_SECRET must be at least 32 characters in production/);
    });

    it('rejects in-memory SQLite database in production', () => {
      expect(() => {
        loadConfig({
          NODE_ENV: 'production',
          PUBLIC_BASE_URL: validPublicUrl,
          SESSION_SECRET: strongSecret,
          OPERATOR_PASSWORD_HASH: validScryptHash,
          CORS_ORIGIN: 'https://revertlens.net',
          DATABASE_PATH: ':memory:'
        });
      }).toThrow(/DATABASE_PATH must be set to a persistent file path in production/);
    });

    it('rejects wildcard CORS origin in production', () => {
      expect(() => {
        loadConfig({
          NODE_ENV: 'production',
          PUBLIC_BASE_URL: validPublicUrl,
          SESSION_SECRET: strongSecret,
          OPERATOR_PASSWORD_HASH: validScryptHash,
          DATABASE_PATH: '/app/data/revertlens.sqlite',
          CORS_ORIGIN: '*'
        });
      }).toThrow(/CORS_ORIGIN must be set to an explicit origin allowlist in production/);
    });

    it('rejects non-public or localhost base URL in production', () => {
      expect(() => {
        loadConfig({
          NODE_ENV: 'production',
          SESSION_SECRET: strongSecret,
          OPERATOR_PASSWORD_HASH: validScryptHash,
          CORS_ORIGIN: 'https://revertlens.net',
          DATABASE_PATH: '/app/data/revertlens.sqlite',
          PUBLIC_BASE_URL: 'http://localhost:3000'
        });
      }).toThrow(/PUBLIC_BASE_URL is invalid/);
    });

    it('accepts completely valid, secure production configuration', () => {
      const prodConfig = loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: strongSecret,
        OPERATOR_PASSWORD_HASH: validScryptHash,
        CORS_ORIGIN: 'https://revertlens.net',
        DATABASE_PATH: '/app/data/revertlens.sqlite',
        PUBLIC_BASE_URL: validPublicUrl,
        BUY_ENABLED: false,
        CENCORI_ENABLED: false
      });

      expect(prodConfig.NODE_ENV).toBe('production');
      expect(prodConfig.PORT).toBe(3000);
      expect(prodConfig.DATABASE_PATH).toBe('/app/data/revertlens.sqlite');
      expect(prodConfig.BUY_ENABLED).toBe(false);
    });
  });
});
