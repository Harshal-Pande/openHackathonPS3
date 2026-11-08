import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../src/server/db/database.js';
import { loadConfig } from '../src/server/config.js';
import {
  BuyAdapter,
  redactSensitiveOutput,
  BuyAdapterError
} from '../src/server/adapters/buyAdapter.js';
import { BuyQuoteService } from '../src/server/services/buyQuoteService.js';
import crypto from 'node:crypto';

describe('BuyAdapter — Security, Execution & Settlement Verification', () => {
  let db: Database;
  let adapter: BuyAdapter;
  let quoteService: BuyQuoteService;
  const config = loadConfig({
    NODE_ENV: 'test',
    BUY_ENABLED: 'true',
    BUY_DAILY_BUDGET_ATOMIC: '100000',
    BUY_PER_CALL_CAP_ATOMIC: '20000'
  });

  beforeEach(() => {
    db = new Database(':memory:');
  });

  describe('Sensitive Credential Redaction', () => {
    it('redacts private keys (0x followed by 64 hex characters)', () => {
      const sensitive = 'Private key: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef found in debug output';
      const redacted = redactSensitiveOutput(sensitive);
      expect(redacted).not.toContain('1234567890abcdef');
      expect(redacted).toContain('[REDACTED_KEY_MATERIAL]');
    });

    it('redacts Bearer tokens and Authorization headers', () => {
      const sensitive = 'Headers: {"authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.supersecret"}';
      const redacted = redactSensitiveOutput(sensitive);
      expect(redacted).not.toContain('supersecret');
      expect(redacted).toContain('[REDACTED_AUTH]');
    });

    it('redacts custom x-auth headers', () => {
      const sensitive = 'x-buy-auth: secret-api-key-12345\r\n';
      const redacted = redactSensitiveOutput(sensitive);
      expect(redacted).not.toContain('secret-api-key-12345');
      expect(redacted).toContain('[REDACTED_HEADER]');
    });
  });

  describe('Discovered Capabilities & Health', () => {
    it('parses capability catalog correctly from skills list', async () => {
      const mockCli = async (cmd: string, args: string[]) => {
        if (args.includes('show') && args.includes('cencori/inference')) {
          return {
            stdout: JSON.stringify({
              name: 'cencori/inference',
              endpoint: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
              method: 'POST',
              price: '0.01 USDC',
              model: 'maximo-atlas-1.3',
              description: 'Cencori AI chat completions for EVM forensics'
            }),
            stderr: '',
            exitCode: 0
          };
        }
        return {
          stdout: 'cencori/inference\n',
          stderr: '',
          exitCode: 0
        };
      };

      const mockSettlementVerifier = async (txHash?: string | null) => ({
        verified: true,
        txHash: txHash || '0x2222222222222222222222222222222222222222222222222222222222222222',
        blockNumber: 1234567,
        payer: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52'
      });

      adapter = new BuyAdapter({ cliRunner: mockCli, settlementVerifier: mockSettlementVerifier }, db, config);
      const caps = await adapter.discoverCapabilities();

      expect(caps.length).toBeGreaterThan(0);
      expect(caps[0].id).toBe('cencori/inference');
      expect(caps[0].method).toBe('POST');
      expect(caps[0].priceDisplay).toBe('0.01 USDC');
    });

    it('reports health status and account balances from whoami', async () => {
      const mockCli = async () => ({
        stdout: JSON.stringify({
          payingAddress: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52',
          network: 'celo',
          balances: { CELO: '0', USDC: '0' }
        }),
        stderr: '',
        exitCode: 0
      });

      const mockSettlementVerifier = async (txHash?: string | null) => ({
        verified: true,
        txHash: txHash || '0x2222222222222222222222222222222222222222222222222222222222222222',
        blockNumber: 1234567,
        payer: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52'
      });

      adapter = new BuyAdapter({ cliRunner: mockCli, settlementVerifier: mockSettlementVerifier }, db, config);
      const health = await adapter.getHealth();

      expect(health.ready).toBe(true);
      expect(health.account.toLowerCase()).toBe('0x3e1bef07824cd0e076f4907641f0a0ef27898e52');
      expect(health.funded).toBe(false); // 0 balance means unfunded
      expect(health.balances['CELO']).toBe('0');
    });
  });

  describe('Approved Request Execution Lifecycle', () => {
    const quoteParams = {
      investigationId: 'inv-lifecycle-01',
      capabilityId: 'cencori.v1.chat.completions',
      url: 'https://gateway.usebuy.ai/cencori/v1/chat/completions',
      method: 'POST',
      exactBody: JSON.stringify({ model: 'maximo-atlas-1.3', messages: [{ role: 'user', content: 'test prompt' }] }),
      tokenSymbol: 'USDC',
      tokenContract: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
      amountAtomic: '10000',
      amountDisplay: '$0.01',
      recipient: '0x20faaca5f980e29639a0fcc6dca6988e18ed333b',
      chainId: 42220,
      ttlSeconds: 900
    };

    it('executes approved quote successfully, verifies on-chain receipt, and records settlement', async () => {
      const mockCli = async (cmd: string, args: string[]) => {
        return {
          stdout: JSON.stringify({
            response: {
              id: 'chatcmpl-mock-123',
              choices: [{ message: { content: '{"summary":"Gas exhaustion verified","likelyExplanations":["Out of gas"]}' } }]
            },
            paymentResponse: {
              txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
              settlementTxHash: '0x2222222222222222222222222222222222222222222222222222222222222222'
            }
          }),
          stderr: '',
          exitCode: 0
        };
      };

      const mockSettlementVerifier = async (txHash?: string | null) => ({
        verified: true,
        txHash: txHash || '0x2222222222222222222222222222222222222222222222222222222222222222',
        blockNumber: 1234567,
        payer: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52'
      });

      adapter = new BuyAdapter({ cliRunner: mockCli, settlementVerifier: mockSettlementVerifier }, db, config);
      quoteService = new BuyQuoteService(db, config, adapter);

      // Create quote
      const quote = await quoteService.createQuote(quoteParams);

      // Approve quote
      const approval = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      // Execute approved quote
      const execResult = await quoteService.executeQuote({
        quoteId: quote.quoteId,
        approvalId: approval.approvalId,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      expect(execResult.isSettled).toBe(true);
      expect(execResult.status).toBe('SETTLED');
      expect(execResult.settlementTxHash).toBe('0x2222222222222222222222222222222222222222222222222222222222222222');

      // Verify quote updated to SETTLED
      const updatedQuote = quoteService.getQuote(quote.quoteId);
      expect(updatedQuote?.status).toBe('SETTLED');

      // Verify purchase attempt recorded
      const purchase = quoteService.getPurchaseAttempt(execResult.purchaseAttemptId);
      expect(purchase).not.toBeNull();
      expect(purchase?.status).toBe('SETTLED');
      expect(purchase?.tx_hash).toBe('0x1111111111111111111111111111111111111111111111111111111111111111');
      expect(purchase?.settlement_tx_hash).toBe('0x2222222222222222222222222222222222222222222222222222222222222222');

      // Verify settlement proof recorded in DB
      const proof = db.getSettlementProof(execResult.purchaseAttemptId);
      expect(proof).not.toBeUndefined();
      expect(proof?.tx_hash).toBe('0x2222222222222222222222222222222222222222222222222222222222222222');
      expect(proof?.receipt_status).toBe(1);
    });

    it('handles CLI execution failure by setting FAILED status and releasing budget reservation', async () => {
      const mockCli = async () => ({
        stdout: '',
        stderr: 'Error: insufficient funds in paying wallet for gas',
        exitCode: 1
      });

      const mockSettlementVerifier = async (txHash?: string | null) => ({
        verified: true,
        txHash: txHash || '0x2222222222222222222222222222222222222222222222222222222222222222',
        blockNumber: 1234567,
        payer: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52'
      });

      adapter = new BuyAdapter({ cliRunner: mockCli, settlementVerifier: mockSettlementVerifier }, db, config);
      quoteService = new BuyQuoteService(db, config, adapter);

      const quote = await quoteService.createQuote(quoteParams);
      const approval = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      const execResult = await quoteService.executeQuote({
        quoteId: quote.quoteId,
        approvalId: approval.approvalId,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      expect(execResult.isSettled).toBe(false);
      expect(execResult.status).toBe('FAILED');
      expect(execResult.errorMessage).toContain('insufficient funds');

      // Quote status is FAILED
      const updatedQuote = quoteService.getQuote(quote.quoteId);
      expect(updatedQuote?.status).toBe('FAILED');

      // Budget reservation was released
      const budgetRow = db.getBudgetReservation(quote.quoteId);
      expect(budgetRow?.status).toBe('RELEASED');
    });

    it('handles timeout/interruption by setting SETTLEMENT_UNKNOWN without auto-retry, preserving budget', async () => {
      const mockCli = async () => {
        const timeoutErr: any = new Error('Command timed out after 60000ms');
        timeoutErr.code = 'ETIMEDOUT';
        throw timeoutErr;
      };

      const mockSettlementVerifier = async (txHash?: string | null) => ({
        verified: true,
        txHash: txHash || '0x2222222222222222222222222222222222222222222222222222222222222222',
        blockNumber: 1234567,
        payer: '0x3e1bef07824cd0e076f4907641f0a0ef27898e52'
      });

      adapter = new BuyAdapter({ cliRunner: mockCli, settlementVerifier: mockSettlementVerifier }, db, config);
      quoteService = new BuyQuoteService(db, config, adapter);

      const quote = await quoteService.createQuote(quoteParams);
      const approval = await quoteService.approveQuote({
        quoteId: quote.quoteId,
        expectedBodySha256: quote.bodySha256,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      const execResult = await quoteService.executeQuote({
        quoteId: quote.quoteId,
        approvalId: approval.approvalId,
        operatorUsername: 'operator_admin',
        isOperatorAuthenticated: true
      });

      expect(execResult.isSettled).toBe(false);
      expect(execResult.status).toBe('SETTLEMENT_UNKNOWN');
      expect(execResult.errorMessage).toContain('timed out');

      // Quote status is SETTLEMENT_UNKNOWN
      const updatedQuote = quoteService.getQuote(quote.quoteId);
      expect(updatedQuote?.status).toBe('SETTLEMENT_UNKNOWN');

      // Budget reservation stays RESERVED (never freed prematurely)
      const budgetRow = db.getBudgetReservation(quote.quoteId);
      expect(budgetRow?.status).toBe('RESERVED');
    });
  });
});
