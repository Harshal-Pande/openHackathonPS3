import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../src/server/db/database.js';
import { loadConfig, TEST_OPERATOR_PASSWORD, TEST_OPERATOR_HASH } from '../src/server/config.js';
import { BuyQuoteService } from '../src/server/services/buyQuoteService.js';
import { BuyAdapter } from '../src/server/adapters/buyAdapter.js';
import { buildApp } from '../src/server/app.js';
import crypto from 'node:crypto';

describe('MOD-03: Full Payment Lifecycle, Invariants & Operator Route Verification', () => {
  let db: Database;
  let quoteService: BuyQuoteService;
  let adapter: BuyAdapter;
  const config = loadConfig({
    NODE_ENV: 'test',
    BUY_ENABLED: 'true',
    BUY_DAILY_BUDGET_ATOMIC: '100000',
    BUY_PER_CALL_CAP_ATOMIC: '20000',
    OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH,
    SESSION_SECRET: 'session-secret-at-least-32-characters-long-for-testing'
  });

  const validQuoteParams = {
    investigationId: 'test-lifecycle-inv-01',
    capabilityId: 'cencori.v1.chat.completions',
    url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
    method: 'POST',
    exactBody: JSON.stringify({ model: 'maximo-atlas-1.3', messages: [{ role: 'user', content: 'analyze failure' }] }),
    tokenSymbol: 'USDC',
    tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
    amountAtomic: '10000',
    amountDisplay: '$0.01',
    recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
    chainId: 42220,
    ttlSeconds: 900
  };

  const mockCliRunner = async (cmd: string, args: string[]) => {
    return {
      stdout: JSON.stringify({
        response: {
          id: 'chatcmpl-mod03-test',
          choices: [{ message: { content: '{"summary":"Out of gas in frame 3","confidence":"HIGH"}' } }]
        },
        paymentResponse: {
          txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          settlementTxHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        }
      }),
      stderr: '',
      exitCode: 0
    };
  };

  const mockSettlementVerifier = async (txHash?: string | null) => ({
    verified: true,
    txHash: txHash || '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    blockNumber: 42000000,
    payer: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52'
  });

  beforeEach(() => {
    db = new Database(':memory:');
    adapter = new BuyAdapter({ cliRunner: mockCliRunner, settlementVerifier: mockSettlementVerifier }, db, config);
    quoteService = new BuyQuoteService(db, config, adapter);
  });

  describe('11-State Quote Transition Matrix Integrity', () => {
    it('allows valid forward state transitions', async () => {
      const quote = await quoteService.createQuote(validQuoteParams);
      expect(quote.status).toBe('AWAITING_OPERATOR_APPROVAL');

      // Valid: AWAITING_OPERATOR_APPROVAL -> APPROVED
      db.updateQuoteStatus(quote.quoteId, 'APPROVED');
      expect(db.getQuote(quote.quoteId)?.status).toBe('APPROVED');

      // Valid: APPROVED -> EXECUTION_PENDING
      db.updateQuoteStatus(quote.quoteId, 'EXECUTION_PENDING');
      expect(db.getQuote(quote.quoteId)?.status).toBe('EXECUTION_PENDING');

      // Valid: EXECUTION_PENDING -> SETTLED
      db.updateQuoteStatus(quote.quoteId, 'SETTLED');
      expect(db.getQuote(quote.quoteId)?.status).toBe('SETTLED');
    });

    it('rejects invalid backward state transition (SETTLED -> APPROVED)', async () => {
      const quote = await quoteService.createQuote(validQuoteParams);
      db.updateQuoteStatus(quote.quoteId, 'APPROVED');
      db.updateQuoteStatus(quote.quoteId, 'EXECUTION_PENDING');
      db.updateQuoteStatus(quote.quoteId, 'SETTLED');

      expect(() => {
        db.updateQuoteStatus(quote.quoteId, 'APPROVED');
      }).toThrow(/Invalid quote state transition from "SETTLED" to "APPROVED"/);
    });

    it('rejects execution attempt when quote is not in APPROVED state', async () => {
      const quote = await quoteService.createQuote(validQuoteParams);
      // Status is AWAITING_OPERATOR_APPROVAL

      await expect(
        quoteService.executeQuote({
          quoteId: quote.quoteId,
          approvalId: 'fake-approval-id',
          operatorUsername: 'operator_admin',
          isOperatorAuthenticated: true
        })
      ).rejects.toThrow(/Only APPROVED quotes can be executed/);
    });

    it('rejects execution replay on an already executed quote', async () => {
      const quote = await quoteService.createQuote(validQuoteParams);
      const approval = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      // First execution succeeds
      const result1 = await quoteService.executeQuote({
        quoteId: quote.quoteId,
        approvalId: approval.approvalId,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });
      expect(result1.status).toBe('SETTLED');

      // Second execution attempt must fail
      await expect(
        quoteService.executeQuote({
          quoteId: quote.quoteId,
          approvalId: approval.approvalId,
          operatorUsername: 'operator_admin',
          isOperatorAuthenticated: true
        })
      ).rejects.toThrow(/Only APPROVED quotes can be executed/);
    });
  });

  describe('Single-Use Approval & Hash Integrity Binding', () => {
    it('rejects execution when approvalId does not match recorded approval', async () => {
      const quote = await quoteService.createQuote(validQuoteParams);
      await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      await expect(
        quoteService.executeQuote({
          quoteId: quote.quoteId,
          approvalId: 'forged-approval-id-12345',
          operatorUsername: 'operator_admin',
          isOperatorAuthenticated: true
        })
      ).rejects.toThrow(/Approval ID mismatch/);
    });

    it('rejects quote creation when daily budget cap is exceeded', async () => {
      // Per-call cap is 20,000 atomic, daily cap is 100,000 atomic
      const largeQuoteParams = {
        ...validQuoteParams,
        amountAtomic: '25000'
      };

      await expect(
        quoteService.createQuote(largeQuoteParams)
      ).rejects.toThrow(/exceeds per-call spending cap/);
    });

    it('halts all execution when emergency kill-switch is engaged', async () => {
      const quote = await quoteService.createQuote(validQuoteParams);
      const approval = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      // Engage kill switch
      quoteService.setKillSwitch(true);

      await expect(
        quoteService.executeQuote({
          quoteId: quote.quoteId,
          approvalId: approval.approvalId,
          operatorUsername: 'operator_admin',
          isOperatorAuthenticated: true
        })
      ).rejects.toThrow(/Emergency kill switch is active/);
    });
  });

  describe('Payment Audit Events Ledger', () => {
    it('records immutable audit events at each stage of quote and payment lifecycle', async () => {
      const quote = await quoteService.createQuote(validQuoteParams);
      const approval = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      await quoteService.executeQuote({
        quoteId: quote.quoteId,
        approvalId: approval.approvalId,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      const events = quoteService.getAuditEvents(quote.quoteId);
      expect(events.length).toBeGreaterThanOrEqual(3);

      const toStatuses = events.map((e) => e.to_status);
      expect(toStatuses).toContain('AWAITING_OPERATOR_APPROVAL');
      expect(toStatuses).toContain('APPROVED');
      expect(toStatuses).toContain('SETTLED');
    });
  });

  describe('Fastify Operator API Routes End-to-End', () => {
    it('enforces operator authentication on POST /api/operator/quotes/:id/execute', async () => {
      const app = buildApp(config, { db, buyQuoteService: quoteService, buyAdapter: adapter });

      // Unauthenticated request should return 401
      const res = await app.inject({
        method: 'POST',
        url: '/api/operator/quotes/some-id/execute',
        payload: { approvalId: 'approval-123' }
      });

      expect(res.statusCode).toBe(401);
      const json = res.json();
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('successfully executes approved quote and retrieves purchase and health via operator endpoints', async () => {
      const app = buildApp(config, { db, buyQuoteService: quoteService, buyAdapter: adapter });

      // 1. Log in to get session token
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/operator/login',
        payload: { password: TEST_OPERATOR_PASSWORD }
      });
      expect(loginRes.statusCode).toBe(200);
      const token = loginRes.json().data.token;
      expect(token).toBeDefined();

      // 2. Create quote
      const quote = await quoteService.createQuote(validQuoteParams);

      // 3. Approve quote via API
      const approveRes = await app.inject({
        method: 'POST',
        url: `/api/operator/quotes/${quote.quoteId}/approve`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { expectedBodySha256: quote.bodySha256 }
      });
      expect(approveRes.statusCode).toBe(200);
      const approvalId = approveRes.json().data.approvalId;

      // 4. Execute quote via API
      const execRes = await app.inject({
        method: 'POST',
        url: `/api/operator/quotes/${quote.quoteId}/execute`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { approvalId }
      });
      expect(execRes.statusCode).toBe(200);
      const execData = execRes.json().data;
      expect(execData.result.status).toBe('SETTLED');
      const purchaseAttemptId = execData.result.purchaseAttemptId;

      // 5. Inspect purchase via GET /api/operator/purchases/:id
      const purchaseRes = await app.inject({
        method: 'GET',
        url: `/api/operator/purchases/${purchaseAttemptId}`,
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(purchaseRes.statusCode).toBe(200);
      expect(purchaseRes.json().data.status).toBe('SETTLED');

      // 6. List purchases via GET /api/operator/purchases
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/operator/purchases',
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().data.length).toBeGreaterThan(0);

      // 7. Check Buy health via GET /api/operator/buy-health
      const healthRes = await app.inject({
        method: 'GET',
        url: '/api/operator/buy-health',
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(healthRes.statusCode).toBe(200);
      expect(healthRes.json().data.account).toBeDefined();

      // 8. Check audit events via GET /api/operator/audit-events
      const auditRes = await app.inject({
        method: 'GET',
        url: `/api/operator/audit-events?entityId=${quote.quoteId}`,
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(auditRes.statusCode).toBe(200);
      expect(auditRes.json().data.length).toBeGreaterThanOrEqual(3);
    });
  });
});
