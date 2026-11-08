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

      const result = verifyReceiptTransferLogs(receipt, validQuote);
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

      const result = verifyReceiptTransferLogs(receipt, validQuote);
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

      const result = verifyReceiptTransferLogs(receipt, validQuote);
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

      const result = verifyReceiptTransferLogs(receipt, validQuote);
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('No matching ERC-20 Transfer log found');
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

      const result = verifyReceiptTransferLogs(receipt, validQuote);
      expect(result.verified).toBe(false);
    });

    it('rejects receipt when transaction reverted (status 0x0)', () => {
      const receipt = {
        status: '0x0',
        transactionHash: '0x' + '6'.repeat(64),
        logs: []
      };

      const result = verifyReceiptTransferLogs(receipt, validQuote);
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('failed with receipt status');
    });

    it('rejects missing or null receipt', () => {
      expect(verifyReceiptTransferLogs(null, validQuote).verified).toBe(false);
      expect(verifyReceiptTransferLogs(undefined, validQuote).verified).toBe(false);
    });

    it('rejects malformed transaction hash in receipt', () => {
      const receipt = {
        status: '0x1',
        transactionHash: '0xinvalidhash',
        logs: []
      };
      expect(verifyReceiptTransferLogs(receipt, validQuote).verified).toBe(false);
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

      const result = verifyReceiptTransferLogs(receipt, validQuote);
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
});
