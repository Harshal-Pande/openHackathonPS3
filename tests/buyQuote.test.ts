import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../src/server/db/database.js';
import { loadConfig, createTestConfig } from '../src/server/config.js';
import {
  BuyQuoteService,
  resolveAllowlist,
  DEFAULT_ALLOWED_CAPABILITIES,
  DEFAULT_ALLOWED_RECIPIENTS,
  DEFAULT_ALLOWED_TOKENS
} from '../src/server/services/buyQuoteService.js';

describe('Buy Quote Service & Operator Approval Lifecycle', () => {
  let db: Database;
  let service: BuyQuoteService;

  beforeEach(() => {
    db = new Database(':memory:');
    const config = loadConfig({
      NODE_ENV: 'test',
      BUY_ENABLED: 'true',
      BUY_DAILY_BUDGET_ATOMIC: '100000',
      BUY_PER_CALL_CAP_ATOMIC: '20000'
    });
    service = new BuyQuoteService(db, config);
  });

  const validQuoteParams = {
    investigationId: 'test-inv-01',
    capabilityId: 'cencori.v1.chat.completions',
    url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
    method: 'POST',
    exactBody: '{"model":"maximo-atlas-1.3","messages":[{"role":"user","content":"test"}]}',
    tokenSymbol: 'USDC',
    tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
    amountAtomic: '10000',
    amountDisplay: '$0.01',
    recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
    chainId: 42220,
    ttlSeconds: 900
  };

  it('creates immutable quote record bound to body SHA-256 with AWAITING_OPERATOR_APPROVAL status', async () => {
    const quote = await service.createQuote(validQuoteParams);

    expect(quote.quoteId).toBeDefined();
    expect(quote.status).toBe('AWAITING_OPERATOR_APPROVAL');
    expect(quote.amountAtomic).toBe('10000');
    expect(quote.amountDisplay).toBe('$0.01');
    expect(quote.bodySha256).toMatch(/^[0-9a-f]{64}$/);

    // Verify stored in DB
    const stored = service.getQuote(quote.quoteId);
    expect(stored).not.toBeNull();
    expect(stored?.quoteId).toBe(quote.quoteId);
    expect(stored?.bodySha256).toBe(quote.bodySha256);
  });

  it('rejects quote creation when unapproved capability is requested', async () => {
    await expect(
      service.createQuote({
        ...validQuoteParams,
        capabilityId: 'unapproved.arbitrary.endpoint'
      })
    ).rejects.toThrow('not in the approved Buy capability allowlist');
  });

  it('rejects quote creation for non-Celo chain IDs', async () => {
    await expect(
      service.createQuote({
        ...validQuoteParams,
        chainId: 1 // Ethereum Mainnet
      })
    ).rejects.toThrow('only supports Celo Mainnet (42220)');
  });

  it('rejects quote creation for unapproved recipient addresses', async () => {
    await expect(
      service.createQuote({
        ...validQuoteParams,
        recipient: '0x1111111111111111111111111111111111111111'
      })
    ).rejects.toThrow('not in the approved recipient allowlist');
  });

  it('rejects quote creation exceeding per-call spending cap', async () => {
    await expect(
      service.createQuote({
        ...validQuoteParams,
        amountAtomic: '50000' // Cap is 20,000
      })
    ).rejects.toThrow('exceeds per-call spending cap');
  });

  it('rejects quote approval when expected body SHA-256 does not match quoted body', async () => {
    const quote = await service.createQuote(validQuoteParams);
    const tamperedHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

    await expect(
      service.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: tamperedHash,
        operatorUsername: 'admin',
        isOperatorAuthenticated: true
      })
    ).rejects.toThrow('Cryptographic body hash mismatch');

    // Quote should be invalidated
    const updated = service.getQuote(quote.quoteId);
    expect(updated?.status).toBe('QUOTE_INVALID');
  });

  it('allows authenticated operator to approve matching quote and transitions status to APPROVED', async () => {
    const quote = await service.createQuote(validQuoteParams);

    const approval = await service.approveQuote({
      quoteId: quote.quoteId,
      expectedBodySha256: quote.bodySha256,
      operatorUsername: 'admin',
      isOperatorAuthenticated: true
    });

    expect(approval.status).toBe('APPROVED');
    expect(approval.paidExecutionTriggered).toBe(false); // Proves no paid action occurred
    expect(approval.approvedBy).toBe('admin');
    expect(approval.approvalId).toBeDefined();

    // Verify DB update
    const updated = service.getQuote(quote.quoteId);
    expect(updated?.status).toBe('APPROVED');
    expect(updated?.approvalId).toBe(approval.approvalId);
  });

  it('rejects duplicate approval of an already-approved quote', async () => {
    const quote = await service.createQuote(validQuoteParams);

    await service.approveQuote({
      quoteId: quote.quoteId,
      expectedBodySha256: quote.bodySha256,
      operatorUsername: 'admin',
      isOperatorAuthenticated: true
    });

    // Attempt second approval
    await expect(
      service.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'admin',
        isOperatorAuthenticated: true
      })
    ).rejects.toThrow('already approved');
  });

  it('rejects approval when quote has expired', async () => {
    const quote = await service.createQuote({
      ...validQuoteParams,
      ttlSeconds: -10 // expired in the past!
    });

    await expect(
      service.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'admin',
        isOperatorAuthenticated: true
      })
    ).rejects.toThrow('expired');
  });

  describe('Allowlist Resolution and DEF-13 Robustness', () => {
    it('resolveAllowlist uses defaults when configured list is undefined, null, or empty', () => {
      const defaults = ['alpha', 'beta'];
      expect(resolveAllowlist(undefined, defaults)).toEqual(['alpha', 'beta']);
      expect(resolveAllowlist(null, defaults)).toEqual(['alpha', 'beta']);
      expect(resolveAllowlist([], defaults)).toEqual(['alpha', 'beta']);
    });

    it('resolveAllowlist lowercases and trims entries when provided', () => {
      const defaults = ['alpha'];
      expect(resolveAllowlist(['  FooBar  ', '  BAZ  '], defaults)).toEqual(['FooBar', 'BAZ']);
    });

    it('works when BuyQuoteService is initialized with missing or empty allowlists', async () => {
      const minimalConfig = createTestConfig({
        BUY_ENABLED: true,
        BUY_ALLOWED_CAPABILITY_IDS: [],
        BUY_ALLOWED_TOKEN_CONTRACTS: [],
        BUY_ALLOWED_RECIPIENTS: []
      });
      const robustService = new BuyQuoteService(db, minimalConfig);

      // Should succeed using default allowlists
      const quote = await robustService.createQuote(validQuoteParams);
      expect(quote.quoteId).toBeDefined();
      expect(quote.status).toBe('AWAITING_OPERATOR_APPROVAL');
    });

    it('strictly enforces custom allowlists when explicitly configured', async () => {
      const customConfig = createTestConfig({
        BUY_ENABLED: true,
        BUY_ALLOWED_CAPABILITY_IDS: ['custom.capability'],
        BUY_ALLOWED_TOKEN_CONTRACTS: ['0x1111111111111111111111111111111111111111'],
        BUY_ALLOWED_RECIPIENTS: ['0x2222222222222222222222222222222222222222']
      });
      const customService = new BuyQuoteService(db, customConfig);

      // Should reject standard params because capability is not custom.capability
      await expect(
        customService.createQuote(validQuoteParams)
      ).rejects.toThrow('not in the approved Buy capability allowlist');
    });
  });
});
