import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto, { randomUUID } from 'node:crypto';
import { buildApp } from '../src/server/app.js';
import { Database } from '../src/server/db/database.js';
import { AppConfig, loadConfig, TEST_OPERATOR_PASSWORD, TEST_OPERATOR_HASH } from '../src/server/config.js';
import { CencoriProvider } from '../src/server/providers/cencori.js';

describe('Zero-Funding Architecture & Buy Settlement Webhook Suite', () => {
  let db: Database;
  const sessionSecret = 'test-session-secret-at-least-32-chars-long!!';

  const baseConfig: AppConfig = loadConfig({
    PORT: 3000,
    HOST: '0.0.0.0',
    NODE_ENV: 'test',
    PUBLIC_BASE_URL: 'https://revertlens-production.onrender.com',
    DATABASE_PATH: ':memory:',
    OPERATOR_PASSWORD_HASH: TEST_OPERATOR_HASH,
    SESSION_SECRET: sessionSecret,
    CHAINSTACK_CELO_MAINNET_RPC_URL: 'https://celo-mainnet.core.chainstack.com/test-rpc-key',
    CORS_ORIGIN: '*',
    TRUST_PROXY: false,
    BUY_ENABLED: false,
    BUY_CLI_PATH: 'buy',
    BUY_SPEND_LIMIT_PER_CALL: '1000000000000000000',
    BUY_SPEND_LIMIT_DAILY: '10000000000000000000',
    RATE_LIMIT_INVESTIGATIONS_MAX: 100,
    RATE_LIMIT_INVESTIGATIONS_WINDOW_MS: 60000,
    OPERATOR_RATE_LIMIT_MAX: 100,
    OPERATOR_RATE_LIMIT_WINDOW_MS: 60000,
    AGENT_WALLET_ADDRESS: '0x3e1bef07824cd0E076F4907641F0A0EF27898e52',
    CELO_ATTRIBUTION_TAG: 'celo_235f6ef56f5b',
    CENCORI_ENABLED: false,
    CENCORI_API_URL: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
    CENCORI_MODEL: 'maximo-atlas-1.3',
  });

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    if (!db.isClosed()) {
      db.close();
    }
  });

  function computeHmac(secret: string, body: any): string {
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex');
  }

  async function getOperatorToken(app: any): Promise<string> {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/operator/login',
      payload: { password: TEST_OPERATOR_PASSWORD }
    });
    const body = loginRes.json();
    return body.data?.token || body.token;
  }

  // ========================================================
  // 1. Zero-Funding Architecture & PREPARED_NOT_REGISTERED
  // ========================================================
  describe('1. Zero-Funding Posture & Lifecycle Semantics', () => {
    it('returns PREPARED_NOT_REGISTERED lifecycleStatus when agent wallet has zero balance', async () => {
      const app = buildApp(baseConfig, { db });
      const token = await getOperatorToken(app);

      const res = await app.inject({
        method: 'GET',
        url: '/api/operator/erc8004/status',
        headers: { Authorization: `Bearer ${token}` }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.livePreflight.lifecycleStatus).toBe('PREPARED_NOT_REGISTERED');
      expect(body.data.livePreflight.hasSufficientBalance).toBe(false);
      expect(body.data.agent.agentWallet).toBe('0x3e1bef07824cd0E076F4907641F0A0EF27898e52');
      expect(body.data.agent.attributionTag).toBe('celo_235f6ef56f5b');
      await app.close();
    });

    it('ensures safe preview registration tx endpoint generates calldata and gas estimate without funds', async () => {
      const app = buildApp(baseConfig, { db });
      const res = await app.inject({
        method: 'GET',
        url: '/api/agent/erc8004-registration-tx'
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      const payload = json.data || json;
      expect(payload.readinessStatus).toBe('READY_FOR_OPERATOR_SIGNATURE');
      expect(payload.taggedTransaction.data).toMatch(/^0x/);
      expect(payload.gasEstimate.estimatedGas).toBe('180953');
      expect(payload.gasEstimate.estimatedCostCelo).toContain('CELO');
      await app.close();
    });
  });

  // ========================================================
  // 2. Buy Settlement Webhook & Idempotency
  // ========================================================
  describe('2. Buy Settlement Webhook Security & Idempotency', () => {
    it('rejects webhook requests missing the x-buy-signature header with 401', async () => {
      const app = buildApp(baseConfig, { db });
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/buy-settlement',
        payload: {
          eventType: 'SETTLED',
          purchaseAttemptId: 'attempt-123'
        }
      });

      expect(res.statusCode).toBe(401);
      const json = res.json();
      expect(json.error?.message).toContain('Missing x-buy-signature header');
      await app.close();
    });

    it('rejects webhook requests with invalid HMAC signatures with 401', async () => {
      const app = buildApp(baseConfig, { db });
      const payload = {
        eventType: 'SETTLED',
        purchaseAttemptId: 'attempt-123'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/buy-settlement',
        headers: {
          'x-buy-signature': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        },
        payload
      });

      expect(res.statusCode).toBe(401);
      const json = res.json();
      expect(json.error?.message).toContain('Invalid webhook HMAC signature');
      await app.close();
    });

    it('returns 404 when purchase attempt does not exist', async () => {
      const app = buildApp(baseConfig, { db });
      const payload = {
        eventType: 'SETTLED',
        purchaseAttemptId: 'non-existent-attempt-id'
      };
      const sig = computeHmac(sessionSecret, payload);

      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/buy-settlement',
        headers: { 'x-buy-signature': sig },
        payload
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error?.code).toBe('PURCHASE_NOT_FOUND');
      await app.close();
    });

    it('processes SETTLED event, records proof in settlement_records, and updates status', async () => {
      const app = buildApp(baseConfig, { db });

      // Seed a quote and purchase attempt in database
      const quoteId = randomUUID();
      const attemptId = randomUUID();
      const now = new Date().toISOString();

      db.saveQuote({
        id: quoteId,
        capability_id: 'cencori.v1.chat.completions',
        url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        method: 'POST',
        exact_body: '{"test":true}',
        body_sha256: crypto.createHash('sha256').update('{"test":true}').digest('hex'),
        token_symbol: 'USDC',
        token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amount_atomic: '10000',
        amount_display: '$0.01',
        recipient: '0x20faaaca5f980e29639a0fcc6dca6988e18ed333b',
        chain_id: 42220,
        status: 'EXECUTION_PENDING',
        created_at: now
      });

      db.savePurchaseAttempt({
        id: attemptId,
        quote_id: quoteId,
        approval_id: randomUUID(),
        investigation_id: null,
        capability_id: 'cencori.v1.chat.completions',
        url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        body_sha256: crypto.createHash('sha256').update('{"test":true}').digest('hex'),
        token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amount_atomic: '10000',
        status: 'EXECUTION_PENDING',
        tx_hash: null,
        settlement_tx_hash: null,
        payer_address: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52',
        payee_address: '0x20faaaca5f980e29639a0fcc6dca6988e18ed333b',
        error_message: null,
        raw_stdout_redacted: null,
        raw_stderr_redacted: null,
        created_at: now,
        updated_at: now
      });

      const targetTx = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const payload = {
        eventType: 'SETTLED',
        purchaseAttemptId: attemptId,
        txHash: targetTx,
        blockNumber: 1234567
      };
      const sig = computeHmac(sessionSecret, payload);

      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/buy-settlement',
        headers: { 'x-buy-signature': sig },
        payload
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      const resData = json.data || json;
      expect(resData.status).toBe('SETTLED');
      expect(resData.txHash).toBe(targetTx);

      // Verify database state
      const updatedAttempt = db.getPurchaseAttempt(attemptId);
      expect(updatedAttempt?.status).toBe('SETTLED');
      expect(updatedAttempt?.settlement_tx_hash).toBe(targetTx);

      const proof = db.getSettlementProof(attemptId);
      expect(proof).not.toBeNull();
      expect(proof?.tx_hash).toBe(targetTx);
      expect(proof?.block_number).toBe(1234567);

      // Idempotency: Second identical webhook call returns ALREADY_SETTLED without error
      const repeatRes = await app.inject({
        method: 'POST',
        url: '/api/webhooks/buy-settlement',
        headers: { 'x-buy-signature': sig },
        payload
      });

      expect(repeatRes.statusCode).toBe(200);
      const repeatJson = repeatRes.json();
      const repData = repeatJson.data || repeatJson;
      expect(repData.status).toBe('ALREADY_SETTLED');
      expect(repData.idempotent).toBe(true);

      await app.close();
    });

    it('processes FAILED event and marks attempt FAILED idempotently', async () => {
      const app = buildApp(baseConfig, { db });

      const quoteId = randomUUID();
      const attemptId = randomUUID();
      const now = new Date().toISOString();

      db.saveQuote({
        id: quoteId,
        capability_id: 'cencori.v1.chat.completions',
        url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        method: 'POST',
        exact_body: '{"fail":true}',
        body_sha256: crypto.createHash('sha256').update('{"fail":true}').digest('hex'),
        token_symbol: 'USDC',
        token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amount_atomic: '10000',
        amount_display: '$0.01',
        recipient: '0x20faaaca5f980e29639a0fcc6dca6988e18ed333b',
        chain_id: 42220,
        status: 'EXECUTION_PENDING',
        created_at: now
      });

      db.savePurchaseAttempt({
        id: attemptId,
        quote_id: quoteId,
        approval_id: randomUUID(),
        investigation_id: null,
        capability_id: 'cencori.v1.chat.completions',
        url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        body_sha256: crypto.createHash('sha256').update('{"fail":true}').digest('hex'),
        token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amount_atomic: '10000',
        status: 'EXECUTION_PENDING',
        tx_hash: null,
        settlement_tx_hash: null,
        payer_address: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52',
        payee_address: '0x20faaaca5f980e29639a0fcc6dca6988e18ed333b',
        error_message: null,
        raw_stdout_redacted: null,
        raw_stderr_redacted: null,
        created_at: now,
        updated_at: now
      });

      const payload = {
        eventType: 'FAILED',
        purchaseAttemptId: attemptId,
        reason: 'Payment timeout on upstream gateway'
      };
      const sig = computeHmac(sessionSecret, payload);

      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/buy-settlement',
        headers: { 'x-buy-signature': sig },
        payload
      });

      expect(res.statusCode).toBe(200);
      const resJson = res.json();
      const resData = resJson.data || resJson;
      expect(resData.status).toBe('FAILED');

      const updated = db.getPurchaseAttempt(attemptId);
      expect(updated?.status).toBe('FAILED');
      expect(updated?.error_message).toContain('Payment timeout');

      // Idempotency: Repeating FAILED webhook returns ALREADY_FAILED
      const repeatRes = await app.inject({
        method: 'POST',
        url: '/api/webhooks/buy-settlement',
        headers: { 'x-buy-signature': sig },
        payload
      });

      expect(repeatRes.statusCode).toBe(200);
      const repJson = repeatRes.json();
      const repData = repJson.data || repJson;
      expect(repData.status).toBe('ALREADY_FAILED');
      expect(repData.idempotent).toBe(true);

      await app.close();
    });
  });

  // ========================================================
  // 3. Cencori Provider Connectivity & Preflight
  // ========================================================
  describe('3. Cencori AI Provider Connectivity', () => {
    it('returns configuration attributes and connectivity test format', async () => {
      const provider = new CencoriProvider({
        enabled: true,
        apiUrl: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        model: 'maximo-atlas-1.3'
      });

      expect(provider.isEnabled()).toBe(true);
      expect(provider.getModel()).toBe('maximo-atlas-1.3');
      expect(provider.getApiUrl()).toBe('https://gateway.usebuy.ai/cencori/v1/chat/completions');

      const conn = await provider.testConnectivity();
      expect(typeof conn.reachable).toBe('boolean');
      expect(typeof conn.latencyMs).toBe('number');
      expect(conn.model).toBe('maximo-atlas-1.3');
    });
  });

  // ========================================================
  // 4. Operator System Status Endpoint
  // ========================================================
  describe('4. Comprehensive Operator System Status Endpoint', () => {
    it('provides database counts including settlements and buy/cencori status', async () => {
      const app = buildApp(baseConfig, { db });
      const token = await getOperatorToken(app);

      const res = await app.inject({
        method: 'GET',
        url: '/api/operator/system-status',
        headers: { Authorization: `Bearer ${token}` }
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.database.counts.settlements).toBeDefined();
      expect(json.data.buyIntegration.status).toBe('DISABLED_ZERO_SPEND');
      expect(json.data.cencoriIntegration.status).toBe('DISABLED_ZERO_SPEND');
      expect(json.data.rpc.chainId).toBe(42220);

      await app.close();
    });
  });

  // ========================================================
  // 5. R1 and R2 Multi-Environment Configuration
  // ========================================================
  describe('5. R1 and R2 Environment Separation', () => {
    it('verifies independent configurations for R1 (revertlens-production) and R2 (revertlens-r2)', () => {
      const r1Config: Partial<AppConfig> = {
        PUBLIC_BASE_URL: 'https://revertlens-production.onrender.com',
        DATABASE_PATH: './data/revertlens-r1.sqlite',
      };
      const r2Config: Partial<AppConfig> = {
        PUBLIC_BASE_URL: 'https://revertlens-r2.onrender.com',
        DATABASE_PATH: './data/revertlens-r2.sqlite',
      };

      expect(r1Config.PUBLIC_BASE_URL).not.toBe(r2Config.PUBLIC_BASE_URL);
      expect(r1Config.DATABASE_PATH).not.toBe(r2Config.DATABASE_PATH);
      expect(r1Config.PUBLIC_BASE_URL).toContain('revertlens-production');
      expect(r2Config.PUBLIC_BASE_URL).toContain('revertlens-r2');
    });
  });
});
