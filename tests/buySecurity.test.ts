import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
import {
  verifyReceiptTransferLogs,
  ERC20_TRANSFER_EVENT_TOPIC,
  BuyAdapter
} from '../src/server/adapters/buyAdapter.js';
import {
  normalizeAndVerifyAmount,
  validateCapabilityRequest,
  getRegisteredCapability,
  listRegisteredCapabilities
} from '../src/server/services/capabilityRegistry.js';

const execFileAsync = promisify(execFile);

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

  describe('DEFECT MOD03-SEC-01: On-Chain Settlement Verification & Receipt Log Parsing', () => {
    const validQuote = {
      token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
      recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
      amount_atomic: '10000'
    };

    function makeLog(params: { contract: string; from: string; to: string; amountAtomic: string }) {
      const fromHex = params.from.toLowerCase().replace('0x', '').padStart(64, '0');
      const toHex = params.to.toLowerCase().replace('0x', '').padStart(64, '0');
      const dataHex = '0x' + BigInt(params.amountAtomic).toString(16).padStart(64, '0');
      return {
        address: params.contract.toLowerCase(),
        topics: [
          ERC20_TRANSFER_EVENT_TOPIC,
          '0x' + fromHex,
          '0x' + toHex
        ],
        data: dataHex
      };
    }

    it('verifies correct successful payment with matching ERC-20 transfer log', () => {
      const receipt = {
        status: '0x1',
        transactionHash: '0x' + '1'.repeat(64),
        blockNumber: '0x100',
        from: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52',
        logs: [
          makeLog({
            contract: validQuote.token_contract,
            from: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52',
            to: validQuote.recipient,
            amountAtomic: '10000'
          })
        ]
      };

      const result = verifyReceiptTransferLogs(receipt, validQuote, receipt.transactionHash, '0x3e1bef07824cd0e076f4907641f0a0ef27898e52');
      expect(result.verified).toBe(true);
      expect(result.txHash).toBe('0x' + '1'.repeat(64));
      expect(result.recipient).toBe(validQuote.recipient.toLowerCase());
      expect(result.amountAtomic).toBe('10000');
      expect(result.payer).toBe('0x3e1bef07824cd0e076f4907641f0a0ef27898e52');
    });

    it('rejects receipt when token contract differs (wrong token)', () => {
      const receipt = {
        status: '0x1',
        transactionHash: '0x' + '2'.repeat(64),
        logs: [
          makeLog({
            contract: '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e', // USDT instead of USDC
            from: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52',
            to: validQuote.recipient,
            amountAtomic: '10000'
          })
        ]
      };

      const result = verifyReceiptTransferLogs(receipt, validQuote, receipt.transactionHash, '0x3e1bef07824cd0e076f4907641f0a0ef27898e52');
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('No matching ERC-20 Transfer log found');
    });

    it('rejects receipt when recipient differs (wrong recipient)', () => {
      const receipt = {
        status: '0x1',
        transactionHash: '0x' + '3'.repeat(64),
        logs: [
          makeLog({
            contract: validQuote.token_contract,
            from: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52',
            to: '0x9999999999999999999999999999999999999999', // Unrelated recipient
            amountAtomic: '10000'
          })
        ]
      };

      const result = verifyReceiptTransferLogs(receipt, validQuote, receipt.transactionHash, '0x3e1bef07824cd0e076f4907641f0a0ef27898e52');
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('No matching ERC-20 Transfer log found');
    });

    it('rejects receipt when atomic amount differs (wrong amount)', () => {
      const receipt = {
        status: '0x1',
        transactionHash: '0x' + '4'.repeat(64),
        logs: [
          makeLog({
            contract: validQuote.token_contract,
            from: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52',
            to: validQuote.recipient,
            amountAtomic: '9999' // 1 atomic unit short!
          })
        ]
      };

      const result = verifyReceiptTransferLogs(receipt, validQuote, receipt.transactionHash, '0x3e1bef07824cd0e076f4907641f0a0ef27898e52');
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Total transferred amount 9999 does not equal quoted atomic amount 10000');
    });

    it('rejects unrelated transaction to same recipient with wrong amount or token', () => {
      const receipt = {
        status: '0x1',
        transactionHash: '0x' + '5'.repeat(64),
        logs: [
          makeLog({
            contract: validQuote.token_contract,
            from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            to: validQuote.recipient,
            amountAtomic: '50000000' // $50 paid by someone else
          })
        ]
      };

      const result = verifyReceiptTransferLogs(receipt, validQuote, receipt.transactionHash, '0x3e1bef07824cd0e076f4907641f0a0ef27898e52');
      expect(result.verified).toBe(false);
    });

    it('rejects receipt when transaction reverted (status 0x0)', () => {
      const receipt = {
        status: '0x0',
        transactionHash: '0x' + '6'.repeat(64),
        logs: []
      };

      const result = verifyReceiptTransferLogs(receipt, validQuote, receipt.transactionHash, '0x3e1bef07824cd0e076f4907641f0a0ef27898e52');
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('failed with receipt status');
    });

    it('rejects missing or null receipt', () => {
      expect(verifyReceiptTransferLogs(null, validQuote, '0x' + '1'.repeat(64)).verified).toBe(false);
      expect(verifyReceiptTransferLogs(undefined, validQuote, '0x' + '1'.repeat(64)).verified).toBe(false);
    });

    it('rejects malformed transaction hash in receipt', () => {
      const receipt = {
        status: '0x1',
        transactionHash: '0xinvalidhash',
        logs: []
      };
      expect(verifyReceiptTransferLogs(receipt, validQuote, '0x' + '1'.repeat(64)).verified).toBe(false);
    });

    it('verifies correctly when multiple transfer logs exist in a single transaction', () => {
      const receipt = {
        status: '0x1',
        transactionHash: '0x' + '7'.repeat(64),
        logs: [
          // Intermediate router / protocol fee log
          makeLog({
            contract: '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
            from: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52',
            to: '0x8888888888888888888888888888888888888888',
            amountAtomic: '100'
          }),
          // Target payment log matching quote exactly
          makeLog({
            contract: validQuote.token_contract,
            from: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52',
            to: validQuote.recipient,
            amountAtomic: '10000'
          })
        ]
      };

      const result = verifyReceiptTransferLogs(receipt, validQuote, receipt.transactionHash, '0x3e1bef07824cd0e076f4907641f0a0ef27898e52');
      expect(result.verified).toBe(true);
      expect(result.amountAtomic).toBe('10000');
    });

    it('resolveSettlement rejects recipient-only candidate matching and returns unresolved', async () => {
      const config = loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' });
      const quoteService = new BuyQuoteService(db, config);

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

      const approved = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_alice',
        isOperatorAuthenticated: true
      });

      // Mock CLI runner that returns an unrelated receipt that has matching recipient but different quoteId
      const mockCli = async (cmd: string, args: string[]) => {
        if (args.includes('receipts')) {
          return {
            stdout: JSON.stringify([
              {
                quoteId: 'unrelated-quote-xyz',
                recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b', // same recipient!
                txHash: '0x' + '9'.repeat(64),
                amount: '100.00 USDC'
              }
            ]),
            stderr: '',
            exitCode: 0
          };
        }
        return { stdout: '{}', stderr: '', exitCode: 0 };
      };

      const adapter = new BuyAdapter({ cliRunner: mockCli }, db, config);
      quoteService.setBuyAdapter(adapter);

      // Create a purchase attempt in EXECUTION_PENDING manually
      const { attempt } = db.consumeApprovalAndCreateAttemptAtomic({
        quoteId: quote.quoteId,
        approvalId: approved.approvalId,
        operatorUsername: 'operator_alice',
        limits: { dailyBudgetAtomic: 100000n, perInvestigationCapAtomic: 20000n }
      });

      // Attempt settlement resolution
      const res = await adapter.resolveSettlement(attempt.id);
      expect(res.resolved).toBe(false);
      expect(res.status).toBe('EXECUTION_PENDING');
      expect(res.message).toContain('no matching unique receipt found');

      // Crucial: Quote must NOT be marked settled!
      const quoteAfter = quoteService.getQuote(quote.quoteId);
      expect(quoteAfter?.status).toBe('EXECUTION_PENDING');
    });
  });

  describe('DEFECT MOD03-SEC-02 & MOD03-SEC-07: Capability Registry & Strict Endpoint Binding', () => {
    it('surfaces only active sanctioned capabilities (cencori/inference) omitting legacy Chainstack', async () => {
      const config = loadConfig({ NODE_ENV: 'test' });
      const adapter = new BuyAdapter({}, db, config);
      const caps = await adapter.discoverCapabilities();

      expect(caps).toHaveLength(1);
      expect(caps[0].id).toBe('cencori/inference');
      expect(caps[0].capabilityId).toBe('cencori.v1.chat.completions');
      expect(caps.some((c) => c.capabilityId === 'chainstack.celo')).toBe(false);
    });

    it('rejects quote creation for arbitrary unapproved service URL', () => {
      expect(() =>
        validateCapabilityRequest({
          capabilityId: 'cencori.v1.chat.completions',
          url: 'https://evil-hacker.com/steal-funds',
          method: 'POST',
          tokenSymbol: 'USDC',
          tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
          amountAtomic: '10000',
          amountDisplay: '$0.01',
          recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
          exactBody: '{"model":"maximo-atlas-1.3"}'
        })
      ).toThrowError(/Service URL .* does not match registered URL/);
    });

    it('rejects quote creation for altered HTTP method', () => {
      expect(() =>
        validateCapabilityRequest({
          capabilityId: 'cencori.v1.chat.completions',
          url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
          method: 'GET', // Registered method is POST
          tokenSymbol: 'USDC',
          tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
          amountAtomic: '10000',
          amountDisplay: '$0.01',
          recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
          exactBody: '{"model":"maximo-atlas-1.3"}'
        })
      ).toThrowError(/HTTP method "GET" does not match registered method/);
    });

    it('rejects quote creation for altered recipient / payee address', () => {
      expect(() =>
        validateCapabilityRequest({
          capabilityId: 'cencori.v1.chat.completions',
          url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
          method: 'POST',
          tokenSymbol: 'USDC',
          tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
          amountAtomic: '10000',
          amountDisplay: '$0.01',
          recipient: '0x3333333333333333333333333333333333333333',
          exactBody: '{"model":"maximo-atlas-1.3"}'
        })
      ).toThrowError(/not in the approved recipient allowlist/);
    });

    it('rejects quote creation for payload exceeding maxBodyBytes (32 KiB)', () => {
      const hugeBody = JSON.stringify({
        model: 'maximo-atlas-1.3',
        filler: 'A'.repeat(40000)
      });

      expect(() =>
        validateCapabilityRequest({
          capabilityId: 'cencori.v1.chat.completions',
          url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
          method: 'POST',
          tokenSymbol: 'USDC',
          tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
          amountAtomic: '10000',
          amountDisplay: '$0.01',
          recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
          exactBody: hugeBody
        })
      ).toThrowError(/exceeds maximum permitted for capability/);
    });
  });

  describe('DEFECT MOD03-SEC-03: Mathematical Amount Normalization & Precision Verification', () => {
    it('accepts exact match between atomic amount and display amount (6 decimals)', () => {
      const res = normalizeAndVerifyAmount('10000', '$0.01', 6);
      expect(res.canonicalAtomic).toBe('10000');
      expect(res.canonicalDisplay).toBe('0.01');
    });

    it('rejects one atomic unit mismatch (10001 atomic vs $0.01)', () => {
      expect(() => normalizeAndVerifyAmount('10001', '$0.01', 6)).toThrowError(
        /does not mathematically match/
      );
    });

    it('rejects negative amounts', () => {
      expect(() => normalizeAndVerifyAmount('-10000', '$0.01', 6)).toThrowError(
        /Invalid atomic amount/
      );
    });

    it('rejects zero amount', () => {
      expect(() => normalizeAndVerifyAmount('0', '$0.00', 6)).toThrowError(
        /Invalid atomic amount/
      );
    });

    it('rejects leading zeros in atomic string', () => {
      expect(() => normalizeAndVerifyAmount('010000', '$0.01', 6)).toThrowError(
        /Invalid atomic amount/
      );
    });

    it('rejects decimal precision overflow (7 decimals for a 6 decimal token)', () => {
      expect(() => normalizeAndVerifyAmount('10000', '$0.0100001', 6)).toThrowError(
        /exceeds token decimals/
      );
    });

    it('normalizes large amounts without floating-point errors', () => {
      // 1,000,000 USDC = 1,000,000,000,000 atomic units
      const res = normalizeAndVerifyAmount('1000000000000', '$1000000.00', 6);
      expect(res.canonicalAtomic).toBe('1000000000000');
      expect(res.canonicalDisplay).toBe('1000000');
    });
  });

  describe('DEFECT MOD03-SEC-04: Quote Expiry Between Approval and Execution', () => {
    it('rejects execution when an approved quote expires before execution and transitions to EXPIRED', async () => {
      const config = loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' });
      const quoteService = new BuyQuoteService(db, config);

      // Create quote with 1-second TTL
      const quote = await quoteService.createQuote({
        capabilityId: 'cencori.v1.chat.completions',
        url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        method: 'POST',
        exactBody: '{"model":"maximo-atlas-1.3"}',
        tokenSymbol: 'USDC',
        tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amountAtomic: '10000',
        amountDisplay: '$0.01',
        recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
        ttlSeconds: 1
      });

      const approved = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_alice',
        isOperatorAuthenticated: true
      });

      // Wait 1.1 seconds for TTL to elapse
      await new Promise((r) => setTimeout(r, 1100));

      const cliCalled = vi.fn();
      const adapter = new BuyAdapter({ cliRunner: async () => { cliCalled(); return { stdout: '{}', stderr: '', exitCode: 0 }; } }, db, config);
      quoteService.setBuyAdapter(adapter);

      await expect(
        quoteService.executeQuote({
          quoteId: quote.quoteId,
          approvalId: approved.approvalId,
          operatorUsername: 'operator_alice',
          isOperatorAuthenticated: true
        })
      ).rejects.toThrowError(/has expired prior to execution/);

      // Verify CLI was NEVER spawned
      expect(cliCalled).not.toHaveBeenCalled();

      // Verify quote status transitioned to EXPIRED
      const finalQuote = quoteService.getQuote(quote.quoteId);
      expect(finalQuote?.status).toBe('EXPIRED');
    });
  });

  describe('DEFECT MOD03-SEC-05 & MOD03-SEC-08: Atomic Approval Consumption, Concurrency & Budget Safety', () => {
    it('guarantees single-use atomic approval execution and prevents duplicate execution', async () => {
      const config = loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' });
      const quoteService = new BuyQuoteService(db, config);

      const quote = await quoteService.createQuote({
        capabilityId: 'cencori.v1.chat.completions',
        url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        method: 'POST',
        exactBody: '{"model":"maximo-atlas-1.3"}',
        tokenSymbol: 'USDC',
        tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amountAtomic: '10000',
        amountDisplay: '$0.01',
        recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
        ttlSeconds: 60
      });

      const approved = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_alice',
        isOperatorAuthenticated: true
      });

      let cliCallCount = 0;
      const mockCli = async () => {
        cliCallCount++;
        return {
          stdout: JSON.stringify({
            paymentResponse: {
              settlementTxHash: '0x' + '8'.repeat(64)
            }
          }),
          stderr: '',
          exitCode: 0
        };
      };

      const mockVerifier = async () => ({
        verified: true,
        txHash: '0x' + '8'.repeat(64),
        payer: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52'
      });

      const adapter = new BuyAdapter(
        { cliRunner: mockCli, settlementVerifier: mockVerifier },
        db,
        config
      );
      quoteService.setBuyAdapter(adapter);

      // First execution succeeds
      const result1 = await quoteService.executeQuote({
        quoteId: quote.quoteId,
        approvalId: approved.approvalId,
        operatorUsername: 'operator_alice',
        isOperatorAuthenticated: true
      });
      expect(result1.status).toBe('SETTLED');
      expect(cliCallCount).toBe(1);

      // Immediate second execution fails (quote is already SETTLED, no longer APPROVED)
      await expect(
        quoteService.executeQuote({
          quoteId: quote.quoteId,
          approvalId: approved.approvalId,
          operatorUsername: 'operator_alice',
          isOperatorAuthenticated: true
        })
      ).rejects.toThrowError(/Only APPROVED quotes can be executed/);

      // Verify CLI was NOT dispatched a second time
      expect(cliCallCount).toBe(1);
    });

    it('forbids releasing a COMMITTED budget reservation casually', () => {
      const quoteId = 'committed-quote-01';
      db.reserveBudgetAtomic(quoteId, null, '10000', {
        dailyBudgetAtomic: 100000n,
        perInvestigationCapAtomic: 20000n
      });
      db.commitBudgetReservation(quoteId);

      expect(() => db.releaseBudgetReservation(quoteId, 'casual attempt')).toThrowError(
        /Cannot release budget reservation .* reservation is already COMMITTED/
      );
    });
  });

  describe('DEFECT MOD03-SEC-06: Real Local Buy CLI Integration Check (No Mocks)', () => {
    it(
      'invokes real local pinned Buy CLI entry point for -V using process.execPath without mocks',
      async () => {
        const localBuyPath = path.resolve(process.cwd(), 'node_modules/@celo/buy/dist/main.js');
        expect(fs.existsSync(localBuyPath)).toBe(true);

        const { stdout, stderr } = await execFileAsync(process.execPath, [localBuyPath, '-V'], {
          timeout: 15000,
          shell: false
        });

        expect(stderr).toBe('');
        expect(stdout.trim()).toBe('0.8.5');
      },
      25000
    );

    it(
      'invokes real local pinned Buy CLI entry point for whoami and confirms zero-spend safety',
      async () => {
        const localBuyPath = path.resolve(process.cwd(), 'node_modules/@celo/buy/dist/main.js');
        expect(fs.existsSync(localBuyPath)).toBe(true);

        const { stdout, exitCode } = await execFileAsync(
          process.execPath,
          [localBuyPath, '--json', 'whoami'],
          {
            timeout: 20000,
            shell: false
          }
        );

        // Check exit code and verify output contains the project wallet
        expect(exitCode).toBeUndefined(); // execFile throws on non-zero, so undefined means 0
        expect(stdout).toContain('0x3e1bef07824cd0E076F4907641F0A0EF27898e52');
        expect(stdout).toContain('celo');
        // Confirms unfunded balances: zero funds spent
        expect(stdout).toContain('balances 0 CELO, 0 USDC');
      },
      25000
    );
  });

  // =========================================================================
  // MOD-03.3 HARDENED SETTLEMENT INTEGRITY & AMBIGUOUS PAYMENT TESTS
  // =========================================================================

  describe('DEFECT MOD03.3-01: RPC Chain Verification Must Fail Closed', () => {
    const testQuote: any = {
      id: 'quote-chain-1',
      token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
      recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
      amount_atomic: '10000',
      amount_display: '$0.01'
    };
    const validTxHash = '0x' + 'a'.repeat(64);

    it('verifies successfully when RPC returns exact chain ID 42220 (0xa4ec)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (body.method === 'eth_chainId') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0xa4ec' }), { status: 200 });
        }
        if (body.method === 'eth_getTransactionReceipt') {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              result: {
                status: '0x1',
                transactionHash: validTxHash,
                logs: [
                  {
                    address: testQuote.token_contract,
                    topics: [
                      ERC20_TRANSFER_EVENT_TOPIC,
                      '0x' + '0'.repeat(24) + '3e1bef07824cd0e076f4907641f0a0ef27898e52',
                      '0x' + '0'.repeat(24) + testQuote.recipient.replace('0x', ''),
                    ],
                    data: '0x' + BigInt(10000).toString(16).padStart(64, '0')
                  }
                ]
              }
            }),
            { status: 200 }
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new BuyAdapter({}, db, loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' }));
      const result = await (adapter as any).verifyOnChainSettlement(validTxHash, testQuote);
      fetchSpy.mockRestore();

      expect(result.verified).toBe(true);
      expect(result.txHash).toBe(validTxHash);
    });

    it('fails closed when RPC returns wrong chain ID (e.g. 1 / 0x1 Ethereum Mainnet)', async () => {
      let receiptCalled = false;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (body.method === 'eth_chainId') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' }), { status: 200 });
        }
        if (body.method === 'eth_getTransactionReceipt') {
          receiptCalled = true;
          return new Response('{}', { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new BuyAdapter({}, db, loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' }));
      const result = await (adapter as any).verifyOnChainSettlement(validTxHash, testQuote);
      fetchSpy.mockRestore();

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('expected 42220');
      expect(receiptCalled).toBe(false); // Receipt retrieval must not proceed!
    });

    it('fails closed when eth_chainId returns HTTP 500', async () => {
      let receiptCalled = false;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (body.method === 'eth_chainId') {
          return new Response('Internal Server Error', { status: 500 });
        }
        if (body.method === 'eth_getTransactionReceipt') {
          receiptCalled = true;
          return new Response('{}', { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new BuyAdapter({}, db, loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' }));
      const result = await (adapter as any).verifyOnChainSettlement(validTxHash, testQuote);
      fetchSpy.mockRestore();

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('HTTP 500');
      expect(receiptCalled).toBe(false);
    });

    it('fails closed when eth_chainId returns HTTP 429 rate limit', async () => {
      let receiptCalled = false;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (body.method === 'eth_chainId') {
          return new Response('Too Many Requests', { status: 429 });
        }
        if (body.method === 'eth_getTransactionReceipt') {
          receiptCalled = true;
          return new Response('{}', { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new BuyAdapter({}, db, loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' }));
      const result = await (adapter as any).verifyOnChainSettlement(validTxHash, testQuote);
      fetchSpy.mockRestore();

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('HTTP 429');
      expect(receiptCalled).toBe(false);
    });

    it('fails closed when eth_chainId encounters network error', async () => {
      let receiptCalled = false;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (body.method === 'eth_chainId') {
          throw new Error('connect ECONNREFUSED 127.0.0.1:8545');
        }
        if (body.method === 'eth_getTransactionReceipt') {
          receiptCalled = true;
          return new Response('{}', { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new BuyAdapter({}, db, loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' }));
      const result = await (adapter as any).verifyOnChainSettlement(validTxHash, testQuote);
      fetchSpy.mockRestore();

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('ECONNREFUSED');
      expect(receiptCalled).toBe(false);
    });

    it('fails closed when eth_chainId returns malformed JSON', async () => {
      let receiptCalled = false;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (body.method === 'eth_chainId') {
          return new Response('<html>502 Bad Gateway</html>', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (body.method === 'eth_getTransactionReceipt') {
          receiptCalled = true;
          return new Response('{}', { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new BuyAdapter({}, db, loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' }));
      const result = await (adapter as any).verifyOnChainSettlement(validTxHash, testQuote);
      fetchSpy.mockRestore();

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('not valid JSON');
      expect(receiptCalled).toBe(false);
    });

    it('fails closed when eth_chainId returns JSON-RPC error object', async () => {
      let receiptCalled = false;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (body.method === 'eth_chainId') {
          return new Response(
            JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Node syncing' } }),
            { status: 200 }
          );
        }
        if (body.method === 'eth_getTransactionReceipt') {
          receiptCalled = true;
          return new Response('{}', { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new BuyAdapter({}, db, loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' }));
      const result = await (adapter as any).verifyOnChainSettlement(validTxHash, testQuote);
      fetchSpy.mockRestore();

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('JSON-RPC error');
      expect(receiptCalled).toBe(false);
    });

    it('fails closed when eth_chainId result is missing', async () => {
      let receiptCalled = false;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (body.method === 'eth_chainId') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1 }), { status: 200 });
        }
        if (body.method === 'eth_getTransactionReceipt') {
          receiptCalled = true;
          return new Response('{}', { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new BuyAdapter({}, db, loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' }));
      const result = await (adapter as any).verifyOnChainSettlement(validTxHash, testQuote);
      fetchSpy.mockRestore();

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Invalid or missing hexadecimal chain ID');
      expect(receiptCalled).toBe(false);
    });

    it('fails closed when eth_chainId response ID does not match request ID', async () => {
      let receiptCalled = false;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (body.method === 'eth_chainId') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 999, result: '0xa4ec' }), { status: 200 });
        }
        if (body.method === 'eth_getTransactionReceipt') {
          receiptCalled = true;
          return new Response('{}', { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new BuyAdapter({}, db, loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' }));
      const result = await (adapter as any).verifyOnChainSettlement(validTxHash, testQuote);
      fetchSpy.mockRestore();

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('id mismatch');
      expect(receiptCalled).toBe(false);
    });

    it('fails closed when eth_chainId result is not a valid hex string', async () => {
      let receiptCalled = false;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (body.method === 'eth_chainId') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'not_a_hex_number' }), { status: 200 });
        }
        if (body.method === 'eth_getTransactionReceipt') {
          receiptCalled = true;
          return new Response('{}', { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new BuyAdapter({}, db, loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' }));
      const result = await (adapter as any).verifyOnChainSettlement(validTxHash, testQuote);
      fetchSpy.mockRestore();

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Invalid or missing hexadecimal chain ID');
      expect(receiptCalled).toBe(false);
    });
  });

  describe('DEFECT MOD03.3-02: Receipt Transaction Hash Must Match Requested Hash', () => {
    const validQuote = {
      token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
      recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
      amount_atomic: '10000'
    };
    const validPayer = '0x3e1bef07824cd0e076f4907641f0a0ef27898e52';

    function makeValidReceipt(txHash: string) {
      return {
        status: '0x1',
        transactionHash: txHash,
        logs: [
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + validPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(10000).toString(16).padStart(64, '0')
          }
        ]
      };
    }

    it('verifies exact matching transaction hash', () => {
      const hash = '0x' + 'a'.repeat(64);
      const receipt = makeValidReceipt(hash);
      const res = verifyReceiptTransferLogs(receipt, validQuote, hash, validPayer);
      expect(res.verified).toBe(true);
      expect(res.txHash).toBe(hash);
    });

    it('verifies case-insensitive matching transaction hash', () => {
      const lowerHash = '0x' + 'a1b2c3d4'.repeat(8);
      const upperHash = '0x' + 'A1B2C3D4'.repeat(8);
      const receipt = makeValidReceipt(upperHash);
      const res = verifyReceiptTransferLogs(receipt, validQuote, lowerHash, validPayer);
      expect(res.verified).toBe(true);
    });

    it('rejects receipt with a different valid transaction hash', () => {
      const requestedHash = '0x' + '1'.repeat(64);
      const receiptHash = '0x' + '2'.repeat(64);
      const receipt = makeValidReceipt(receiptHash);
      const res = verifyReceiptTransferLogs(receipt, validQuote, requestedHash, validPayer);
      expect(res.verified).toBe(false);
      expect(res.reason).toContain('does not match requested transaction hash');
    });

    it('rejects when receipt has missing transaction hash', () => {
      const requestedHash = '0x' + '1'.repeat(64);
      const receipt: any = makeValidReceipt(requestedHash);
      delete receipt.transactionHash;
      delete receipt.txHash;
      const res = verifyReceiptTransferLogs(receipt, validQuote, requestedHash, validPayer);
      expect(res.verified).toBe(false);
      expect(res.reason).toContain('Invalid or missing transaction hash in receipt');
    });

    it('rejects when receipt has malformed transaction hash', () => {
      const requestedHash = '0x' + '1'.repeat(64);
      const receipt = makeValidReceipt('0xnot-a-valid-hash');
      const res = verifyReceiptTransferLogs(receipt, validQuote, requestedHash, validPayer);
      expect(res.verified).toBe(false);
      expect(res.reason).toContain('Invalid or missing transaction hash in receipt');
    });

    it('rejects when requested transaction hash is malformed', () => {
      const requestedHash = 'invalid-requested-hash';
      const receipt = makeValidReceipt('0x' + '1'.repeat(64));
      const res = verifyReceiptTransferLogs(receipt, validQuote, requestedHash, validPayer);
      expect(res.verified).toBe(false);
      expect(res.reason).toContain('Invalid or missing expected transaction hash format');
    });
  });

  describe('DEFECT MOD03.3-03: Real Payer Identity Verification (No Fallbacks)', () => {
    const validQuote = {
      token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
      recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
      amount_atomic: '10000'
    };
    const validTxHash = '0x' + '3'.repeat(64);
    const expectedPayer = '0x3e1bef07824cd0e076f4907641f0a0ef27898e52';

    it('verifies when decoded sender topic matches expected payer address', () => {
      const receipt = {
        status: '0x1',
        transactionHash: validTxHash,
        logs: [
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + expectedPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(10000).toString(16).padStart(64, '0')
          }
        ]
      };
      const res = verifyReceiptTransferLogs(receipt, validQuote, validTxHash, expectedPayer);
      expect(res.verified).toBe(true);
      expect(res.payer).toBe(expectedPayer.toLowerCase());
    });

    it('rejects receipt when decoded sender differs from expected payer (wrong payer)', () => {
      const wrongPayer = '0x1111111111111111111111111111111111111111';
      const receipt = {
        status: '0x1',
        transactionHash: validTxHash,
        logs: [
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + wrongPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(10000).toString(16).padStart(64, '0')
          }
        ]
      };
      const res = verifyReceiptTransferLogs(receipt, validQuote, validTxHash, expectedPayer);
      expect(res.verified).toBe(false);
      expect(res.reason).toContain('does not match expected payer');
    });

    it('rejects receipt when sender topic is missing (less than 3 topics)', () => {
      const receipt = {
        status: '0x1',
        transactionHash: validTxHash,
        logs: [
          {
            address: validQuote.token_contract,
            topics: [ERC20_TRANSFER_EVENT_TOPIC],
            data: '0x' + BigInt(10000).toString(16).padStart(64, '0')
          }
        ]
      };
      const res = verifyReceiptTransferLogs(receipt, validQuote, validTxHash, expectedPayer);
      expect(res.verified).toBe(false);
      expect(res.reason).toContain('No matching ERC-20 Transfer log found');
    });

    it('rejects receipt when sender topic is malformed (< 64 hex chars)', () => {
      const receipt = {
        status: '0x1',
        transactionHash: validTxHash,
        logs: [
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x1234', // Malformed sender topic
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(10000).toString(16).padStart(64, '0')
          }
        ]
      };
      const res = verifyReceiptTransferLogs(receipt, validQuote, validTxHash, expectedPayer);
      expect(res.verified).toBe(false);
      expect(res.reason).toContain('invalid or missing sender topic');
    });
  });

  describe('DEFECT MOD03.3-04: Aggregate Transfer Amount Verification', () => {
    const validQuote = {
      token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
      recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
      amount_atomic: '10000'
    };
    const validTxHash = '0x' + '4'.repeat(64);
    const validPayer = '0x3e1bef07824cd0e076f4907641f0a0ef27898e52';

    it('verifies one exact transfer equal to quoted amount', () => {
      const receipt = {
        status: '0x1',
        transactionHash: validTxHash,
        logs: [
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + validPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(10000).toString(16).padStart(64, '0')
          }
        ]
      };
      const res = verifyReceiptTransferLogs(receipt, validQuote, validTxHash, validPayer);
      expect(res.verified).toBe(true);
      expect(res.amountAtomic).toBe('10000');
    });

    it('verifies two split transfers whose sum equals the quoted amount', () => {
      const receipt = {
        status: '0x1',
        transactionHash: validTxHash,
        logs: [
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + validPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(6000).toString(16).padStart(64, '0')
          },
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + validPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(4000).toString(16).padStart(64, '0')
          }
        ]
      };
      const res = verifyReceiptTransferLogs(receipt, validQuote, validTxHash, validPayer);
      expect(res.verified).toBe(true);
      expect(res.amountAtomic).toBe('10000');
    });

    it('rejects when two transfers sum to more than the quote (20000 vs 10000)', () => {
      const receipt = {
        status: '0x1',
        transactionHash: validTxHash,
        logs: [
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + validPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(10000).toString(16).padStart(64, '0')
          },
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + validPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(10000).toString(16).padStart(64, '0')
          }
        ]
      };
      const res = verifyReceiptTransferLogs(receipt, validQuote, validTxHash, validPayer);
      expect(res.verified).toBe(false);
      expect(res.reason).toContain('Total transferred amount 20000 does not equal quoted atomic amount 10000');
    });

    it('rejects one exact transfer plus an additional transfer (10001 vs 10000)', () => {
      const receipt = {
        status: '0x1',
        transactionHash: validTxHash,
        logs: [
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + validPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(10000).toString(16).padStart(64, '0')
          },
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + validPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(1).toString(16).padStart(64, '0')
          }
        ]
      };
      const res = verifyReceiptTransferLogs(receipt, validQuote, validTxHash, validPayer);
      expect(res.verified).toBe(false);
      expect(res.reason).toContain('Total transferred amount 10001 does not equal quoted atomic amount 10000');
    });

    it('rejects aggregate amount below quote (9999 vs 10000)', () => {
      const receipt = {
        status: '0x1',
        transactionHash: validTxHash,
        logs: [
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + validPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(9999).toString(16).padStart(64, '0')
          }
        ]
      };
      const res = verifyReceiptTransferLogs(receipt, validQuote, validTxHash, validPayer);
      expect(res.verified).toBe(false);
      expect(res.reason).toContain('Total transferred amount 9999 does not equal quoted atomic amount 10000');
    });

    it('rejects matching log with malformed data length (< 64 hex characters)', () => {
      const receipt = {
        status: '0x1',
        transactionHash: validTxHash,
        logs: [
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + validPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x123' // Malformed amount data
          }
        ]
      };
      const res = verifyReceiptTransferLogs(receipt, validQuote, validTxHash, validPayer);
      expect(res.verified).toBe(false);
      expect(res.reason).toContain('malformed or un-decodable data amount');
    });

    it('ignores unrelated transfers to other recipients and counts exact target payment', () => {
      const receipt = {
        status: '0x1',
        transactionHash: validTxHash,
        logs: [
          // Transfer to third party
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + validPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + '9999999999999999999999999999999999999999'
            ],
            data: '0x' + BigInt(50000).toString(16).padStart(64, '0')
          },
          // Quoted transfer to target recipient
          {
            address: validQuote.token_contract,
            topics: [
              ERC20_TRANSFER_EVENT_TOPIC,
              '0x' + '0'.repeat(24) + validPayer.replace('0x', ''),
              '0x' + '0'.repeat(24) + validQuote.recipient.replace('0x', '')
            ],
            data: '0x' + BigInt(10000).toString(16).padStart(64, '0')
          }
        ]
      };
      const res = verifyReceiptTransferLogs(receipt, validQuote, validTxHash, validPayer);
      expect(res.verified).toBe(true);
      expect(res.amountAtomic).toBe('10000');
    });
  });

  describe('DEFECT MOD03.3-05: Dispatch Stage Classification & Budget Preservation', () => {
    it('preserves budget reservation and sets SETTLEMENT_UNKNOWN on connection reset after dispatch', async () => {
      const config = loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' });
      const mockCli = async () => ({
        stdout: '',
        stderr: 'Error: read ECONNRESET at TLSWrap.onStreamRead',
        exitCode: 1
      });
      const adapter = new BuyAdapter({ cliRunner: mockCli }, db, config);
      const quoteService = new BuyQuoteService(db, config, adapter);

      const quote = await quoteService.createQuote({
        capabilityId: 'cencori.v1.chat.completions',
        url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        method: 'POST',
        exactBody: JSON.stringify({ model: 'maximo-atlas-1.3', messages: [{ role: 'user', content: 'test' }] }),
        tokenSymbol: 'USDC',
        tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amountAtomic: '10000',
        amountDisplay: '$0.01',
        recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b'
      });
      const approval = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      const res = await quoteService.executeQuote({
        quoteId: quote.quoteId,
        approvalId: approval.approvalId,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      expect(res.status).toBe('SETTLEMENT_UNKNOWN');
      expect(res.isSettled).toBe(false);
      // Reservation MUST remain active
      const bRes = db.getBudgetReservation(quote.quoteId);
      expect(bRes?.status).toBe('RESERVED');
    });

    it('preserves budget reservation and sets SETTLEMENT_UNKNOWN on HTTP 500 after dispatch', async () => {
      const config = loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' });
      const mockCli = async () => ({
        stdout: '',
        stderr: 'HTTP 500 Internal Server Error: upstream provider failed after payment receipt',
        exitCode: 1
      });
      const adapter = new BuyAdapter({ cliRunner: mockCli }, db, config);
      const quoteService = new BuyQuoteService(db, config, adapter);

      const quote = await quoteService.createQuote({
        capabilityId: 'cencori.v1.chat.completions',
        url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        method: 'POST',
        exactBody: JSON.stringify({ model: 'maximo-atlas-1.3', messages: [{ role: 'user', content: 'test' }] }),
        tokenSymbol: 'USDC',
        tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amountAtomic: '10000',
        amountDisplay: '$0.01',
        recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b'
      });
      const approval = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      const res = await quoteService.executeQuote({
        quoteId: quote.quoteId,
        approvalId: approval.approvalId,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      expect(res.status).toBe('SETTLEMENT_UNKNOWN');
      const bRes = db.getBudgetReservation(quote.quoteId);
      expect(bRes?.status).toBe('RESERVED');
    });
  });

  describe('DEFECT MOD03.3-06: Settlement Resolution Unique Matching', () => {
    it('rejects multiple distinct candidate receipts as ambiguous and returns unresolved', async () => {
      const config = loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' });
      const quoteService = new BuyQuoteService(db, config);

      const quote = await quoteService.createQuote({
        capabilityId: 'cencori.v1.chat.completions',
        url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        method: 'POST',
        exactBody: JSON.stringify({ model: 'maximo-atlas-1.3', messages: [{ role: 'user', content: 'test' }] }),
        tokenSymbol: 'USDC',
        tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amountAtomic: '10000',
        amountDisplay: '$0.01',
        recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b'
      });
      const approval = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      // Mock CLI receipts returning TWO distinct candidate receipts for the same quoteId
      const mockCli = async (cmd: string, args: string[]) => {
        if (args.includes('receipts')) {
          return {
            stdout: JSON.stringify([
              {
                quoteId: quote.quoteId,
                txHash: '0x' + '1'.repeat(64)
              },
              {
                quoteId: quote.quoteId,
                txHash: '0x' + '2'.repeat(64)
              }
            ]),
            stderr: '',
            exitCode: 0
          };
        }
        return { stdout: '{}', stderr: '', exitCode: 0 };
      };

      const adapter = new BuyAdapter({ cliRunner: mockCli }, db, config);
      const svcWithAdapter = new BuyQuoteService(db, config, adapter);

      // Create purchase attempt directly
      const { attempt } = db.consumeApprovalAndCreateAttemptAtomic({
        quoteId: quote.quoteId,
        approvalId: approval.approvalId,
        operatorUsername: 'operator_admin',
        limits: { dailyBudgetAtomic: 0n, perInvestigationCapAtomic: 0n }
      });

      const res = await svcWithAdapter.resolvePurchaseSettlement({
        attemptId: attempt.id,
        isOperatorAuthenticated: true
      });

      expect(res.resolved).toBe(false);
      expect(res.message).toContain('ambiguous: found 2 distinct candidate transaction hashes');
    });

    it('resolves successfully when exactly one unique matching receipt is returned', async () => {
      const config = loadConfig({ NODE_ENV: 'test', BUY_ENABLED: 'true' });
      const uniqueTxHash = '0x' + '5'.repeat(64);

      const quoteService = new BuyQuoteService(db, config);
      const quote = await quoteService.createQuote({
        capabilityId: 'cencori.v1.chat.completions',
        url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
        method: 'POST',
        exactBody: JSON.stringify({ model: 'maximo-atlas-1.3', messages: [{ role: 'user', content: 'test' }] }),
        tokenSymbol: 'USDC',
        tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amountAtomic: '10000',
        amountDisplay: '$0.01',
        recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b'
      });
      const approval = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      const mockCli = async (cmd: string, args: string[]) => {
        if (args.includes('receipts')) {
          return {
            stdout: JSON.stringify([
              {
                quoteId: quote.quoteId,
                txHash: uniqueTxHash
              }
            ]),
            stderr: '',
            exitCode: 0
          };
        }
        return { stdout: '{}', stderr: '', exitCode: 0 };
      };

      const mockVerifier = async (txHash?: string | null) => ({
        verified: true,
        txHash: uniqueTxHash,
        blockNumber: 999999,
        payer: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52'
      });

      const adapter = new BuyAdapter({ cliRunner: mockCli, settlementVerifier: mockVerifier }, db, config);
      const svcWithAdapter = new BuyQuoteService(db, config, adapter);

      const { attempt } = db.consumeApprovalAndCreateAttemptAtomic({
        quoteId: quote.quoteId,
        approvalId: approval.approvalId,
        operatorUsername: 'operator_admin',
        limits: { dailyBudgetAtomic: 0n, perInvestigationCapAtomic: 0n }
      });

      const res = await svcWithAdapter.resolvePurchaseSettlement({
        attemptId: attempt.id,
        isOperatorAuthenticated: true
      });

      expect(res.resolved).toBe(true);
      expect(res.status).toBe('SETTLED');
      expect(res.txHash).toBe(uniqueTxHash);
    });
  });

  describe('Database Atomic Settlement State Consistency & Rollback', () => {
    it('atomically commits proof, reservation, attempt, and quote on verified settlement', () => {
      const quoteId = 'atomic-quote-1';
      const attemptId = 'atomic-attempt-1';
      const txHash = '0x' + 'f'.repeat(64);

      db.saveQuote({
        id: quoteId,
        investigation_id: null,
        capability_id: 'cencori.v1.chat.completions',
        url: 'https://cencori-buy-node.cencori.workers.dev/api/v1/chat/completions',
        method: 'POST',
        exact_body: '{}',
        body_sha256: 'sha-1',
        token_symbol: 'USDC',
        token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amount_atomic: '10000',
        amount_display: '$0.01',
        recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
        chain_id: 42220,
        status: 'EXECUTION_PENDING',
        created_at: new Date().toISOString()
      });

      db.reserveBudgetAtomic(quoteId, null, '10000', { dailyBudgetAtomic: 0n, perInvestigationCapAtomic: 0n });

      db.savePurchaseAttempt({
        id: attemptId,
        quote_id: quoteId,
        approval_id: 'app-1',
        investigation_id: null,
        capability_id: 'cencori.v1.chat.completions',
        url: 'https://test',
        body_sha256: 'sha-1',
        token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amount_atomic: '10000',
        status: 'EXECUTION_PENDING',
        created_at: new Date().toISOString()
      });

      db.commitSettlementAtomic({
        id: 'proof-1',
        purchase_attempt_id: attemptId,
        quote_id: quoteId,
        tx_hash: txHash,
        chain_id: 42220,
        block_number: 100,
        token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        payer: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52',
        recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
        amount_atomic: '10000',
        receipt_status: 1,
        verified_at: new Date().toISOString()
      });

      expect(db.getSettlementProof(attemptId)).not.toBeNull();
      expect(db.getBudgetReservation(quoteId)?.status).toBe('COMMITTED');
      expect(db.getPurchaseAttempt(attemptId)?.status).toBe('SETTLED');
      expect(db.getQuote(quoteId)?.status).toBe('SETTLED');
    });

    it('rolls back all updates if reservation was already RELEASED', () => {
      const quoteId = 'atomic-quote-2';
      const attemptId = 'atomic-attempt-2';
      const txHash = '0x' + 'e'.repeat(64);

      db.saveQuote({
        id: quoteId,
        investigation_id: null,
        capability_id: 'cencori.v1.chat.completions',
        url: 'https://cencori-buy-node.cencori.workers.dev/api/v1/chat/completions',
        method: 'POST',
        exact_body: '{}',
        body_sha256: 'sha-2',
        token_symbol: 'USDC',
        token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amount_atomic: '10000',
        amount_display: '$0.01',
        recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
        chain_id: 42220,
        status: 'EXECUTION_PENDING',
        created_at: new Date().toISOString()
      });

      db.reserveBudgetAtomic(quoteId, null, '10000', { dailyBudgetAtomic: 0n, perInvestigationCapAtomic: 0n });
      db.releaseBudgetReservation(quoteId, 'Simulated premature release');

      db.savePurchaseAttempt({
        id: attemptId,
        quote_id: quoteId,
        approval_id: 'app-2',
        investigation_id: null,
        capability_id: 'cencori.v1.chat.completions',
        url: 'https://test',
        body_sha256: 'sha-2',
        token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
        amount_atomic: '10000',
        status: 'EXECUTION_PENDING',
        created_at: new Date().toISOString()
      });

      expect(() => {
        db.commitSettlementAtomic({
          id: 'proof-2',
          purchase_attempt_id: attemptId,
          quote_id: quoteId,
          tx_hash: txHash,
          chain_id: 42220,
          block_number: 100,
          token_contract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
          payer: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52',
          recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
          amount_atomic: '10000',
          receipt_status: 1,
          verified_at: new Date().toISOString()
        });
      }).toThrow('is RELEASED');

      // Assert rollback: proof was NOT saved, attempt and quote remain EXECUTION_PENDING
      expect(db.getSettlementProof(attemptId)).toBeNull();
      expect(db.getPurchaseAttempt(attemptId)?.status).toBe('EXECUTION_PENDING');
      expect(db.getQuote(quoteId)?.status).toBe('EXECUTION_PENDING');
    });
  });
});
