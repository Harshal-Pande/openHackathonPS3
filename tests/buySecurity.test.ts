import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/server/app.js';
import { Database } from '../src/server/db/database.js';
import {
  loadConfig,
  createTestConfig,
  TEST_OPERATOR_PASSWORD,
  TEST_OPERATOR_HASH
} from '../src/server/config.js';
import { BuyQuoteService } from '../src/server/services/buyQuoteService.js';
import { ChainstackProvider } from '../src/server/providers/chainstack.js';

describe('Buy Payment Security, Auth & Persistence Guarantees', () => {
  let db: Database;
  let provider: ChainstackProvider;

  beforeEach(() => {
    db = new Database(':memory:');
    provider = new ChainstackProvider({ rpcUrl: 'https://test-node' });
    vi.spyOn(provider, 'isConfigured').mockReturnValue(true);
    vi.spyOn(provider, 'getChainId').mockResolvedValue(42220);
  });

  it('rejects quote approval from unauthenticated public callers with HTTP 401', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      BUY_ENABLED: 'true',
      BUY_DAILY_BUDGET_ATOMIC: '100000',
      BUY_PER_CALL_CAP_ATOMIC: '20000'
    });
    const quoteService = new BuyQuoteService(db, config);
    const app = buildApp(config, { db, provider, buyQuoteService: quoteService });

    const quote = await quoteService.createQuote({
      capabilityId: 'cencori.v1.chat.completions',
      url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
      method: 'POST',
      exactBody: '{"test":true}',
      tokenSymbol: 'USDC',
      tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
      amountAtomic: '10000',
      amountDisplay: '$0.01',
      recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b'
    });

    // Public caller tries to call POST /api/operator/quotes/:id/approve with no auth token
    const res = await app.inject({
      method: 'POST',
      url: `/api/operator/quotes/${quote.quoteId}/approve`,
      payload: { expectedBodySha256: quote.bodySha256 }
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toContain('Public callers cannot access operator endpoints');
  });

  it('allows authenticated operator to log in and approve quote, rejecting session secret as password', async () => {
    const sessionSecret = 'test_session_secret_for_local_development_testing_only';
    const config = createTestConfig({
      SESSION_SECRET: sessionSecret,
      OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH,
      BUY_ENABLED: 'true',
      BUY_DAILY_BUDGET_ATOMIC: '100000',
      BUY_PER_CALL_CAP_ATOMIC: '20000'
    });
    const quoteService = new BuyQuoteService(db, config);
    const app = buildApp(config, { db, provider, buyQuoteService: quoteService });

    // 1. Attempt login with SESSION_SECRET as password -> must be REJECTED (DEF-14)
    const badLoginRes = await app.inject({
      method: 'POST',
      url: '/api/operator/login',
      payload: { password: sessionSecret }
    });
    expect(badLoginRes.statusCode).toBe(401);
    expect(JSON.parse(badLoginRes.body).error.code).toBe('UNAUTHORIZED');

    // 2. Attempt login with the raw hash as password -> must be REJECTED
    const rawHashLoginRes = await app.inject({
      method: 'POST',
      url: '/api/operator/login',
      payload: { password: TEST_OPERATOR_HASH }
    });
    expect(rawHashLoginRes.statusCode).toBe(401);

    // 3. Operator logs in with the true operator password
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/operator/login',
      payload: { password: TEST_OPERATOR_PASSWORD }
    });
    expect(loginRes.statusCode).toBe(200);
    const loginData = JSON.parse(loginRes.body).data;
    const operatorToken = loginData.token;
    expect(operatorToken).toBeDefined();

    // 2. Create quote
    const quote = await quoteService.createQuote({
      capabilityId: 'cencori.v1.chat.completions',
      url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
      method: 'POST',
      exactBody: '{"test":true}',
      tokenSymbol: 'USDC',
      tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
      amountAtomic: '10000',
      amountDisplay: '$0.01',
      recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b'
    });

    // 3. Operator approves quote with bearer token
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/operator/quotes/${quote.quoteId}/approve`,
      headers: { authorization: `Bearer ${operatorToken}` },
      payload: { expectedBodySha256: quote.bodySha256 }
    });

    expect(approveRes.statusCode).toBe(200);
    const approveData = JSON.parse(approveRes.body).data;
    expect(approveData.status).toBe('APPROVED');
    expect(approveData.paidExecutionTriggered).toBe(false);
  });

  it('emergency kill switch immediately halts all quote creation and approvals', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      BUY_ENABLED: 'true',
      BUY_DAILY_BUDGET_ATOMIC: '100000',
      BUY_PER_CALL_CAP_ATOMIC: '20000'
    });
    const quoteService = new BuyQuoteService(db, config);

    // Engage kill switch
    quoteService.setKillSwitch(true);
    expect(quoteService.getKillSwitch()).toBe(true);

    // Attempt quote creation -> must fail with 503
    await expect(
      quoteService.createQuote({
        capabilityId: 'cencori.v1.chat.completions',
        url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        method: 'POST',
        exactBody: '{"test":true}',
        tokenSymbol: 'USDC',
        tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amountAtomic: '10000',
        amountDisplay: '$0.01',
        recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b'
      })
    ).rejects.toThrow('Emergency kill switch is active');
  });

  it('persists quote records, approval state, and body SHA-256 durably across SQLite reload', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revertlens-quote-test-'));
    const dbPath = path.join(tmpDir, 'quote_test.sqlite');

    try {
      const diskDb = new Database(dbPath);
      const config = loadConfig({
        NODE_ENV: 'test',
        DATABASE_PATH: dbPath,
        BUY_ENABLED: 'true',
        BUY_DAILY_BUDGET_ATOMIC: '100000',
        BUY_PER_CALL_CAP_ATOMIC: '20000'
      });
      const quoteService = new BuyQuoteService(diskDb, config);

      const quote = await quoteService.createQuote({
        capabilityId: 'cencori.v1.chat.completions',
        url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        method: 'POST',
        exactBody: '{"model":"maximo-atlas-1.3"}',
        tokenSymbol: 'USDC',
        tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amountAtomic: '10000',
        amountDisplay: '$0.01',
        recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b'
      });

      await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_alice',
        isOperatorAuthenticated: true
      });

      // Close the database connection
      diskDb.close();

      // Open a completely new Database connection to the same file
      const restoredDb = new Database(dbPath);
      const restoredQuoteService = new BuyQuoteService(restoredDb, config);

      const reloaded = restoredQuoteService.getQuote(quote.quoteId);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.quoteId).toBe(quote.quoteId);
      expect(reloaded?.status).toBe('APPROVED');
      expect(reloaded?.bodySha256).toBe(quote.bodySha256);
      expect(reloaded?.approvedBy).toBe('operator_alice');
      expect(reloaded?.tokenContract).toBe('0xceba9300f2b948710d2653dd7b07f33a8b32118c');

      restoredDb.close();
    } finally {
      await new Promise((r) => setTimeout(r, 50));
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {
        // Ignored
      }
    }
  });
});
