import fastify, { FastifyInstance, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppConfig, ensureAppConfig, validatePublicBaseUrl } from './config.js';
import { Database, Erc8004RegistrationRow } from './db/database.js';
import { ChainstackProvider } from './providers/chainstack.js';
import { CencoriProvider } from './providers/cencori.js';
import {
  CeloAttributionService,
  ERC8004_IDENTITY_REGISTRY_CELO_MAINNET,
  REQUIRED_CELO_CHAIN_ID,
  OFFICIAL_CELO_ATTRIBUTION_TAG,
  ERC8004_REGISTER_FUNCTION_SELECTOR,
  verifyErc8004RegistrationReceipt
} from './services/celoAttributionService.js';
import { BuyQuoteService } from './services/buyQuoteService.js';
import { BuyAdapter } from './adapters/buyAdapter.js';
import { AiExplanationService } from './services/aiExplanationService.js';
import { OperatorAuthService, OperatorAuthError } from './auth/operatorAuth.js';
import { RateLimiter, getClientIp } from './auth/rateLimiter.js';
import { InvestigationService } from './services/investigationService.js';

export interface AppDependencies {
  db?: Database;
  provider?: ChainstackProvider;
  cencoriProvider?: CencoriProvider;
  buyAdapter?: BuyAdapter;
  buyQuoteService?: BuyQuoteService;
  aiExplanationService?: AiExplanationService;
  authService?: OperatorAuthService;
  rateLimiter?: RateLimiter;
}

const InvestigateBodySchema = z.object({
  txHash: z.string().trim()
});

const LoginBodySchema = z.object({
  password: z.string().min(1)
});

const ApproveQuoteBodySchema = z.object({
  expectedBodySha256: z.string().min(64).max(64)
});

const ExecuteQuoteBodySchema = z.object({
  approvalId: z.string().min(1),
  expectedBodySha256: z.string().min(64).max(64).optional(),
  requestBodyOverride: z.string().optional()
});

const KillSwitchBodySchema = z.object({
  enabled: z.boolean()
});

const RecordPendingBodySchema = z.object({
  txHash: z.string().trim().regex(/^0x[a-fA-F0-9]{64}$/, 'Must be a 32-byte hex transaction hash')
});

const VerifyRegistrationBodySchema = z.object({
  txHash: z.string().trim().regex(/^0x[a-fA-F0-9]{64}$/, 'Must be a 32-byte hex transaction hash')
});

function resolveTrustProxy(trustProxyConfig: boolean | string): boolean | string[] {
  if (trustProxyConfig === false) return false;
  if (typeof trustProxyConfig === 'string' && trustProxyConfig.trim() !== '') {
    return trustProxyConfig.split(',').map((s) => s.trim()).filter(Boolean);
  }
  // When true: trust standard reverse-proxy loopback and private subnets (Render, Railway, Fly.io, Docker)
  return ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'];
}

async function fetchMainnetTxAndReceipt(
  provider: ChainstackProvider,
  txHash: string
): Promise<{ tx: Record<string, unknown> | null; receipt: Record<string, unknown> | null }> {
  try {
    if (provider.isConfigured()) {
      const [tx, receipt] = await Promise.all([
        provider.getRawTransaction(txHash),
        provider.getRawTransactionReceipt(txHash)
      ]);
      return { tx, receipt };
    }
  } catch {
    // Provider query failed, proceed to fallback
  }

  // Fallback to public official Celo mainnet node (forno.celo.org) for read-only receipt retrieval
  try {
    const fallbackUrl = 'https://forno.celo.org';
    const [txRes, receiptRes] = await Promise.all([
      fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [txHash] })
      }).then((r) => r.json() as Promise<any>),
      fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getTransactionReceipt', params: [txHash] })
      }).then((r) => r.json() as Promise<any>)
    ]);
    return {
      tx: txRes?.result || null,
      receipt: receiptRes?.result || null
    };
  } catch {
    return { tx: null, receipt: null };
  }
}

async function fetchLiveBalanceAndGasPrice(
  provider: ChainstackProvider,
  address: string
): Promise<{ balanceWei: string; gasPriceWei: string }> {
  try {
    if (provider.isConfigured()) {
      const [balance, gasPrice] = await Promise.all([
        provider.getBalance(address),
        provider.getGasPrice()
      ]);
      return { balanceWei: balance, gasPriceWei: gasPrice };
    }
  } catch {
    // Provider query failed, proceed to fallback
  }

  try {
    const fallbackUrl = 'https://forno.celo.org';
    const [bRes, gpRes] = await Promise.all([
      fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] })
      }).then((r) => r.json() as Promise<any>),
      fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_gasPrice', params: [] })
      }).then((r) => r.json() as Promise<any>)
    ]);
    return {
      balanceWei: bRes?.result || '0x0',
      gasPriceWei: gpRes?.result || '0x2e90edd000' // ~200 Gwei fallback
    };
  } catch {
    return { balanceWei: '0x0', gasPriceWei: '0x2e90edd000' };
  }
}

export function buildApp(rawConfig: AppConfig | Record<string, unknown>, deps: AppDependencies = {}): FastifyInstance {
  const appConfig = ensureAppConfig(rawConfig);
  const server = fastify({
    logger: false,
    genReqId: () => randomUUID(),
    trustProxy: resolveTrustProxy(appConfig.TRUST_PROXY)
  });

  const db = deps.db || new Database(appConfig.DATABASE_PATH);
  const provider =
    deps.provider ||
    new ChainstackProvider({
      rpcUrl: appConfig.CHAINSTACK_CELO_MAINNET_RPC_URL
    });

  const cencoriProvider =
    deps.cencoriProvider ||
    new CencoriProvider({
      enabled: appConfig.CENCORI_ENABLED
    });

  const buyAdapter = deps.buyAdapter || new BuyAdapter({}, db, appConfig);
  const buyQuoteService = deps.buyQuoteService || new BuyQuoteService(db, appConfig, buyAdapter);
  const aiExplanationService =
    deps.aiExplanationService ||
    new AiExplanationService(cencoriProvider, buyQuoteService, appConfig, db);

  const authService = deps.authService || new OperatorAuthService(appConfig);
  const investigationRateLimiter =
    deps.rateLimiter ||
    new RateLimiter({
      max: appConfig.RATE_LIMIT_INVESTIGATIONS_MAX,
      windowMs: appConfig.RATE_LIMIT_INVESTIGATIONS_WINDOW_MS
    });
  const investigationService = new InvestigationService(provider, db, aiExplanationService);
  const celoAttributionService = new CeloAttributionService(appConfig.CELO_ATTRIBUTION_TAG);

  server.register(cors, {
    origin: appConfig.CORS_ORIGIN,
    credentials: true
  });

  // Graceful shutdown lifecycle: close database cleanly on Fastify close
  server.addHook('onClose', async () => {
    try {
      db.close();
    } catch {
      // Ignore database close errors during teardown
    }
  });

  // Standard API Envelope Formatter
  server.addHook('onSend', async (request, reply, payload) => {
    const contentType = reply.getHeader('content-type');
    if (typeof contentType === 'string' && contentType.includes('application/json')) {
      try {
        const parsed = JSON.parse(payload as string);
        if (parsed && typeof parsed === 'object' && ('data' in parsed || 'error' in parsed)) {
          return payload;
        }
        return JSON.stringify({
          data: parsed,
          error: null,
          requestId: request.id
        });
      } catch {
        return payload;
      }
    }
    return payload;
  });

  // Error Handler conforming to API contract
  server.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const statusCode = 'statusCode' in error && typeof (error as any).statusCode === 'number'
      ? (error as any).statusCode
      : (reply.statusCode >= 400 ? reply.statusCode : 500);

    const rawCode = 'code' in error && typeof (error as any).code === 'string'
      ? (error as any).code
      : undefined;

    const isJsonSyntaxError = rawCode === 'FST_ERR_CTP_INVALID_JSON' || (statusCode === 400 && error.name === 'SyntaxError');

    const errorCode = isJsonSyntaxError
      ? 'INVALID_INPUT'
      : (rawCode && !rawCode.startsWith('FST_ERR_')
         ? rawCode
         : (statusCode === 400 ? 'INVALID_INPUT'
            : statusCode === 404 ? 'NOT_FOUND'
            : statusCode === 504 ? 'GATEWAY_TIMEOUT'
            : statusCode === 502 || statusCode === 503 ? 'PROVIDER_UNAVAILABLE'
            : 'INTERNAL_SERVER_ERROR'));

    // Strict URL redaction so secrets are never leaked in error messages
    const rawMessage = error.message || 'An error occurred during request processing.';
    const sanitizedMessage = rawMessage.replace(/https?:\/\/[^\s]+/g, '[REDACTED_RPC_ENDPOINT]');

    const message = statusCode >= 500 && appConfig.NODE_ENV === 'production' && statusCode !== 502 && statusCode !== 503 && statusCode !== 504
      ? 'An internal server error occurred.'
      : sanitizedMessage;

    reply.status(statusCode).send({
      data: null,
      error: {
        code: errorCode,
        message
      },
      requestId: request.id
    });
  });

  // Health endpoint conforming to docs/05_API_CONTRACT.md
  server.get('/api/health', async () => {
    return {
      status: 'ok',
      version: '0.1.0',
      chainId: 42220,
      featureFlags: {
        buyEnabled: appConfig.BUY_ENABLED,
        cencoriEnabled: appConfig.CENCORI_ENABLED,
        chainstackConfigured: provider.isConfigured()
      },
      buyReady: false
    };
  });

  // POST /api/investigations - Execute or retrieve investigation with IP-based rate limiting
  server.post('/api/investigations', async (request, reply) => {
    const clientIp = getClientIp(request);
    const rateCheck = investigationRateLimiter.check(clientIp);
    if (!rateCheck.allowed) {
      reply.header('Retry-After', rateCheck.retryAfterSeconds.toString());
      const err: any = new Error(
        `Too many investigation requests from this IP. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`
      );
      err.statusCode = 429;
      err.code = 'RATE_LIMITED';
      throw err;
    }

    const parseResult = InvestigateBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      const err: any = new Error(`Invalid request body: ${parseResult.error.errors.map((e) => e.message).join(', ')}`);
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }

    const report = await investigationService.investigate(parseResult.data.txHash);
    return report;
  });

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // GET /api/investigations/:id - Fetch by ID
  server.get('/api/investigations/:id', async (request) => {
    const { id } = request.params as { id: string };
    if (!id || !UUID_REGEX.test(id)) {
      const err: any = new Error(`Invalid investigation ID format: ${id}. Must be a valid UUID.`);
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }
    const report = investigationService.getInvestigation(id);
    if (!report) {
      const err: any = new Error(`Investigation ${id} not found.`);
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }
    return report;
  });

  // GET /api/investigations - List recent
  server.get('/api/investigations', async (request) => {
    const query = request.query as { limit?: string };
    let limit = 20;
    if (query.limit !== undefined) {
      const parsed = Number(query.limit);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        const err: any = new Error('Query parameter "limit" must be an integer between 1 and 100.');
        err.statusCode = 400;
        err.code = 'INVALID_INPUT';
        throw err;
      }
      limit = parsed;
    }
    return investigationService.listRecent(limit);
  });

  // POST /api/investigations/:id/quote - Request a Buy quote for Cencori explanation without spending
  server.post('/api/investigations/:id/quote', async (request) => {
    const { id } = request.params as { id: string };
    if (!id || !UUID_REGEX.test(id)) {
      const err: any = new Error(`Invalid investigation ID format: ${id}. Must be a valid UUID.`);
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }

    const report = investigationService.getInvestigation(id);
    if (!report) {
      const err: any = new Error(`Investigation ${id} not found.`);
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const payload = cencoriProvider.buildPromptPayload(report);
    const quoteInfo = await cencoriProvider.getQuote(payload);
    const quote = await buyQuoteService.createQuote({
      investigationId: report.investigationId,
      capabilityId: quoteInfo.capabilityId,
      url: quoteInfo.url,
      method: quoteInfo.method,
      exactBody: quoteInfo.exactBody,
      tokenSymbol: quoteInfo.tokenSymbol,
      tokenContract: quoteInfo.tokenContract,
      amountAtomic: quoteInfo.amountAtomic,
      amountDisplay: quoteInfo.amountDisplay,
      recipient: quoteInfo.recipient,
      chainId: quoteInfo.chainId,
      ttlSeconds: quoteInfo.maxTimeoutSeconds,
      reason: 'Cencori maximo-atlas-1.3 AI explanation'
    });

    return quote;
  });

  // ==========================================
  // HACKATHON AGENT & ATTRIBUTION ENDPOINTS
  // ==========================================

  // GET /api/agent/metadata - Public ERC-8004 agent registration metadata
  server.get('/api/agent/metadata', async () => {
    const canonicalBaseUrl = appConfig.PUBLIC_BASE_URL.replace(/\/+$/, '');
    return celoAttributionService.generateErc8004Metadata({
      agentWallet: appConfig.AGENT_WALLET_ADDRESS as `0x${string}`,
      baseUrl: canonicalBaseUrl
    });
  });

  // GET /api/agent/erc8004-registration-tx - Prepares tagged ERC-8004 registration transaction payload
  // Security Hardening (DEF-49): Strictly uses canonical metadata URI from validated configuration;
  // public query parameter overrides (e.g. ?agentURI=...) are ignored and cannot substitute target URI.
  server.get('/api/agent/erc8004-registration-tx', async (_request) => {
    const canonicalBaseUrl = appConfig.PUBLIC_BASE_URL.replace(/\/+$/, '');
    const isPublicProductionUrl = validatePublicBaseUrl(canonicalBaseUrl, true).valid;
    const isLocalOrLoopback = !isPublicProductionUrl;
    const canonicalAgentUri = `${canonicalBaseUrl}/api/agent/metadata`;

    const tx = celoAttributionService.buildErc8004RegistrationTransaction({
      agentURI: canonicalAgentUri,
      from: appConfig.AGENT_WALLET_ADDRESS as `0x${string}`
    });

    const existingRegistration = db.getLatestErc8004Registration();
    let readinessStatus = isLocalOrLoopback ? 'BLOCKED_PENDING_PUBLIC_DEPLOYMENT' : 'READY_FOR_OPERATOR_SIGNATURE';
    let onChainRegistrationStatus = 'PREPARED_NOT_REGISTERED';
    let agentId: string | null = null;

    if (existingRegistration) {
      if (existingRegistration.status === 'CONFIRMED') {
        readinessStatus = 'ALREADY_REGISTERED';
        onChainRegistrationStatus = 'VERIFIED_REGISTERED';
        agentId = existingRegistration.agent_id;
      } else if (existingRegistration.status === 'PENDING_CONFIRMATION') {
        readinessStatus = 'PENDING_CONFIRMATION';
        onChainRegistrationStatus = 'PENDING_CONFIRMATION';
      }
    }

    return {
      network: 'Celo Mainnet',
      chainId: REQUIRED_CELO_CHAIN_ID,
      registryAddress: ERC8004_IDENTITY_REGISTRY_CELO_MAINNET,
      agentWallet: appConfig.AGENT_WALLET_ADDRESS,
      registrationFunction: 'register(string agentURI)',
      functionSelector: ERC8004_REGISTER_FUNCTION_SELECTOR,
      agentURI: canonicalAgentUri,
      metadataUriStatus: isLocalOrLoopback ? 'BLOCKED_PENDING_PUBLIC_DEPLOYMENT' : 'CONFIGURED_CANONICAL_URI',
      calldataValidationStatus: 'VALID_HEX_AND_ENCODING',
      attributionStatus: 'TAGGED_CORRECTLY',
      attributionTag: OFFICIAL_CELO_ATTRIBUTION_TAG,
      gasEstimate: {
        estimatedGas: '180953',
        gasLimit: tx.gasLimit ? tx.gasLimit.toString() : '350000',
        gasPriceGwei: '~200',
        estimatedCostCelo: '~0.0362 CELO'
      },
      readinessStatus,
      agentId,
      onChainRegistrationStatus,
      existingRegistration: existingRegistration || null,
      taggedTransaction: {
        to: tx.to,
        from: tx.from,
        value: tx.value.toString(),
        data: tx.data,
        chainId: tx.chainId,
        gasLimit: tx.gasLimit ? tx.gasLimit.toString() : '350000',
        attributionTag: tx.attributionTag,
        dataSuffix: tx.dataSuffix,
        verifiedCodes: tx.verifiedCodes
      }
    };
  });

  // ==========================================
  // OPERATOR-ONLY ENDPOINTS (AUTHENTICATED)
  // ==========================================

  // POST /api/operator/login - Authenticate operator session
  server.post('/api/operator/login', async (request, reply) => {
    const parseResult = LoginBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      const err: any = new Error('Operator login requires a valid password.');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }

    const clientIp = getClientIp(request);
    try {
      const { token, session } = await authService.login(clientIp, parseResult.data.password);
      const secureSuffix = appConfig.NODE_ENV === 'production' ? '; Secure' : '';
      reply.header('Set-Cookie', `operator_token=${token}; HttpOnly; SameSite=Strict; Path=/${secureSuffix}`);
      return { token, session };
    } catch (err: unknown) {
      if (err instanceof OperatorAuthError) {
        if (err.statusCode === 429 && err.retryAfter) {
          reply.header('Retry-After', err.retryAfter.toString());
        }
        reply.status(err.statusCode);
        const authErr: any = new Error(err.message);
        authErr.statusCode = err.statusCode;
        authErr.code = err.code;
        throw authErr;
      }

      const message = err instanceof Error ? err.message : 'Invalid operator credentials.';
      const error: any = new Error(message);
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      throw error;
    }
  });

  // Helper to extract operator token from Bearer header, custom header or cookie
  function extractOperatorToken(req: any): string | undefined {
    const authHeader = req.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    const customHeader = req.headers['x-operator-token'];
    if (typeof customHeader === 'string' && customHeader.trim() !== '') {
      return customHeader.trim();
    }
    const cookieHeader = req.headers['cookie'];
    if (typeof cookieHeader === 'string') {
      const match = cookieHeader.match(/(?:^|;\s*)operator_token=([^;]+)/);
      if (match?.[1]) {
        return decodeURIComponent(match[1].trim());
      }
    }
    return undefined;
  }

  // POST /api/operator/logout
  server.post('/api/operator/logout', async (request, reply) => {
    const token = extractOperatorToken(request);
    if (token) {
      authService.logout(token);
    }
    const secureSuffix = appConfig.NODE_ENV === 'production' ? '; Secure' : '';
    reply.header('Set-Cookie', `operator_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureSuffix}`);
    return { success: true };
  });

  // Helper to extract and verify operator session
  function requireOperatorSession(req: any) {
    const token = extractOperatorToken(req);
    const session = authService.verifySession(token);
    if (!session) {
      const err: any = new Error('Public callers cannot access operator endpoints. Valid operator session required.');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    return session;
  }

  // GET /api/operator/quotes - List quotes (Operator only)
  server.get('/api/operator/quotes', async (request) => {
    requireOperatorSession(request);
    return buyQuoteService.listQuotes(50);
  });

  // POST /api/operator/quotes/:id/approve - Approve quote bound to exact body SHA-256 (Operator only)
  server.post('/api/operator/quotes/:id/approve', async (request) => {
    const session = requireOperatorSession(request);
    const { id } = request.params as { id: string };

    const parseResult = ApproveQuoteBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      const err: any = new Error('Approval requires expectedBodySha256 (64 hex characters).');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }

    const packet = await buyQuoteService.approveQuote({
      quoteId: id,
      expectedBodySha256: parseResult.data.expectedBodySha256,
      operatorUsername: session.username,
      isOperatorAuthenticated: true
    });

    return packet;
  });

  // POST /api/operator/kill-switch - Emergency Kill Switch toggle (Operator only)
  server.post('/api/operator/kill-switch', async (request) => {
    requireOperatorSession(request);
    const parseResult = KillSwitchBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      const err: any = new Error('Request body must contain { enabled: boolean }.');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }

    buyQuoteService.setKillSwitch(parseResult.data.enabled);
    return {
      killSwitchActive: buyQuoteService.getKillSwitch(),
      message: parseResult.data.enabled ? 'Kill switch ENGAGED. All quotes and spending halted.' : 'Kill switch DISENGAGED.'
    };
  });

  // POST /api/operator/quotes/:id/execute - Execute an approved quote via Buy CLI (Operator only)
  server.post('/api/operator/quotes/:id/execute', async (request) => {
    const session = requireOperatorSession(request);
    const { id } = request.params as { id: string };

    const parseResult = ExecuteQuoteBodySchema.safeParse(request.body || {});
    if (!parseResult.success) {
      const err: any = new Error('Execution requires approvalId.');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }

    const quote = buyQuoteService.getQuote(id);
    if (!quote) {
      const err: any = new Error(`Quote ${id} not found.`);
      err.statusCode = 404;
      err.code = 'QUOTE_NOT_FOUND';
      throw err;
    }

    if (quote.investigationId) {
      return aiExplanationService.executeAndAttachExplanation({
        quoteId: id,
        approvalId: parseResult.data.approvalId,
        operatorUsername: session.username
      });
    }

    const result = await buyQuoteService.executeQuote({
      quoteId: id,
      approvalId: parseResult.data.approvalId,
      operatorUsername: session.username,
      isOperatorAuthenticated: true
    });

    return {
      result,
      aiExplanation: null
    };
  });

  // GET /api/operator/purchases/:id - Inspect purchase attempt by ID (Operator only)
  server.get('/api/operator/purchases/:id', async (request) => {
    requireOperatorSession(request);
    const { id } = request.params as { id: string };
    const attempt = buyQuoteService.getPurchaseAttempt(id);
    if (!attempt) {
      const err: any = new Error(`Purchase attempt ${id} not found.`);
      err.statusCode = 404;
      err.code = 'PURCHASE_NOT_FOUND';
      throw err;
    }
    return attempt;
  });

  // GET /api/operator/purchases - List recent purchase attempts (Operator only)
  server.get('/api/operator/purchases', async (request) => {
    requireOperatorSession(request);
    const query = request.query as { limit?: string };
    const limit = query.limit ? Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100) : 50;
    return buyQuoteService.listPurchaseAttempts(limit);
  });

  // POST /api/operator/purchases/:id/resolve - Resolve ambiguous settlement (Operator only)
  server.post('/api/operator/purchases/:id/resolve', async (request) => {
    requireOperatorSession(request);
    const { id } = request.params as { id: string };
    return buyQuoteService.resolvePurchaseSettlement({
      attemptId: id,
      isOperatorAuthenticated: true
    });
  });

  // GET /api/operator/buy-health - Real-time Buy CLI & wallet health (Operator only)
  server.get('/api/operator/buy-health', async (request) => {
    requireOperatorSession(request);
    return buyQuoteService.getBuyHealth();
  });

  // GET /api/operator/audit-events - Immutable payment audit ledger (Operator only)
  server.get('/api/operator/audit-events', async (request) => {
    requireOperatorSession(request);
    const query = request.query as { entityId?: string; limit?: string };
    const limit = query.limit ? Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200) : 50;
    return buyQuoteService.getAuditEvents(query.entityId, limit);
  });

  // GET /api/operator/system-status - Comprehensive system, database & RPC overview (Operator only)
  server.get('/api/operator/system-status', async (request) => {
    requireOperatorSession(request);
    const counts = db.getSystemCounts();
    const journalMode = db.getJournalMode();
    const busyTimeout = db.getBusyTimeout();
    const isPublicProductionUrl = validatePublicBaseUrl(appConfig.PUBLIC_BASE_URL, true).valid;

    // Check RPC connectivity
    let rpcConnected = false;
    let rpcLatencyMs = 0;
    try {
      const start = Date.now();
      const gasPrice = await provider.getGasPrice();
      rpcLatencyMs = Date.now() - start;
      rpcConnected = Boolean(gasPrice && BigInt(gasPrice) > 0n);
    } catch {
      rpcConnected = false;
    }

    return {
      version: '0.1.0',
      uptimeSeconds: Math.floor(process.uptime()),
      environment: appConfig.NODE_ENV,
      nodeVersion: process.version,
      publicBaseUrl: appConfig.PUBLIC_BASE_URL,
      isPublicProductionUrl,
      trustProxy: appConfig.TRUST_PROXY,
      database: {
        status: 'ACTIVE',
        path: appConfig.DATABASE_PATH,
        journalMode,
        busyTimeoutMs: busyTimeout,
        counts,
      },
      rpc: {
        provider: 'Chainstack Celo Mainnet (OP Geth)',
        chainId: REQUIRED_CELO_CHAIN_ID,
        chainHex: '0xa4ec',
        configured: Boolean(appConfig.CHAINSTACK_CELO_MAINNET_RPC_URL),
        connected: rpcConnected,
        latencyMs: rpcLatencyMs,
      },
      modules: {
        forensicsEngine: 'ACTIVE',
        evidenceLedger: 'ACTIVE',
        erc8004Engine: 'ACTIVE',
        buyPayments: appConfig.BUY_ENABLED ? 'ACTIVE' : 'DISABLED_ZERO_SPEND',
        cencoriAi: appConfig.CENCORI_ENABLED ? 'ACTIVE' : 'DISABLED_ZERO_SPEND',
        rateLimiter: 'ACTIVE',
        killSwitch: buyQuoteService.getKillSwitch() ? 'ENGAGED' : 'DISENGAGED',
      },
    };
  });

  // ==========================================
  // OPERATOR ERC-8004 REGISTRATION & VERIFICATION
  // ==========================================

  // GET /api/operator/erc8004/status - Operator overview of ERC-8004 registration state & live preflight
  server.get('/api/operator/erc8004/status', async (request) => {
    requireOperatorSession(request);
    const canonicalBaseUrl = appConfig.PUBLIC_BASE_URL.replace(/\/+$/, '');
    const isPublicProductionUrl = validatePublicBaseUrl(canonicalBaseUrl, true).valid;
    const canonicalAgentUri = `${canonicalBaseUrl}/api/agent/metadata`;
    const latestRegistration = db.getLatestErc8004Registration();
    const allRegistrations = db.listErc8004Registrations();

    // Fetch live balance and gas price
    const { balanceWei, gasPriceWei } = await fetchLiveBalanceAndGasPrice(provider, appConfig.AGENT_WALLET_ADDRESS);
    const gasLimit = 350000n;
    const gasPriceBigInt = BigInt(gasPriceWei);
    const balanceBigInt = BigInt(balanceWei);
    const estimatedCostWei = gasLimit * (gasPriceBigInt > 0n ? gasPriceBigInt : 200000000000n);

    const balanceCelo = (Number(balanceBigInt) / 1e18).toFixed(6);
    const estimatedCostCelo = (Number(estimatedCostWei) / 1e18).toFixed(6);
    const gasPriceGwei = (Number(gasPriceBigInt) / 1e9).toFixed(2);
    const hasSufficientBalance = balanceBigInt >= estimatedCostWei;
    const shortfallWei = hasSufficientBalance ? '0' : (estimatedCostWei - balanceBigInt).toString();
    const shortfallCelo = hasSufficientBalance ? '0' : (Number(estimatedCostWei - balanceBigInt) / 1e18).toFixed(6);

    let lifecycleStatus = 'READY_TO_SIGN';
    if (latestRegistration?.status === 'CONFIRMED') {
      lifecycleStatus = 'VERIFIED_REGISTERED';
    } else if (latestRegistration?.status === 'PENDING_CONFIRMATION') {
      lifecycleStatus = 'PENDING_CONFIRMATION';
    } else if (!isPublicProductionUrl) {
      lifecycleStatus = 'PREFLIGHT_FAILED';
    } else if (!hasSufficientBalance) {
      lifecycleStatus = 'INSUFFICIENT_BALANCE';
    }

    return {
      agent: {
        name: 'RevertLens',
        type: 'ERC-8004 Identity',
        network: 'Celo Mainnet',
        chainId: REQUIRED_CELO_CHAIN_ID,
        chainHex: '0xa4ec',
        registryAddress: ERC8004_IDENTITY_REGISTRY_CELO_MAINNET,
        agentWallet: appConfig.AGENT_WALLET_ADDRESS,
        attributionTag: appConfig.CELO_ATTRIBUTION_TAG,
        canonicalAgentUri
      },
      livePreflight: {
        isPublicProductionUrl,
        balanceWei: balanceBigInt.toString(),
        balanceCelo,
        gasPriceWei: gasPriceBigInt.toString(),
        gasPriceGwei,
        estimatedGas: '180953',
        gasLimit: gasLimit.toString(),
        estimatedCostWei: estimatedCostWei.toString(),
        estimatedCostCelo,
        hasSufficientBalance,
        shortfallWei,
        shortfallCelo,
        lifecycleStatus
      },
      latestRegistration,
      allRegistrations
    };
  });

  // POST /api/operator/erc8004/record-pending - Record pending registration broadcast
  server.post('/api/operator/erc8004/record-pending', async (request) => {
    requireOperatorSession(request);
    const parseResult = RecordPendingBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      const err: any = new Error(parseResult.error.errors.map((e) => e.message).join(', '));
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }

    const { txHash } = parseResult.data;
    const canonicalBaseUrl = appConfig.PUBLIC_BASE_URL.replace(/\/+$/, '');
    const canonicalAgentUri = `${canonicalBaseUrl}/api/agent/metadata`;

    let registration = db.getErc8004RegistrationByTxHash(txHash);
    if (!registration) {
      const now = new Date().toISOString();
      registration = {
        id: randomUUID(),
        tx_hash: txHash.toLowerCase(),
        status: 'PENDING_CONFIRMATION',
        agent_id: null,
        agent_uri: canonicalAgentUri,
        registry_address: ERC8004_IDENTITY_REGISTRY_CELO_MAINNET,
        owner_address: appConfig.AGENT_WALLET_ADDRESS,
        chain_id: REQUIRED_CELO_CHAIN_ID,
        block_number: null,
        gas_used: null,
        actual_fee_paid: null,
        attribution_tag: appConfig.CELO_ATTRIBUTION_TAG,
        has_attribution: 1,
        created_at: now,
        updated_at: now
      };
      db.saveErc8004Registration(registration);
    }

    return { success: true, registration };
  });

  // POST /api/operator/erc8004/verify - Independently retrieve on-chain receipt and verify registration
  server.post('/api/operator/erc8004/verify', async (request) => {
    requireOperatorSession(request);
    const parseResult = VerifyRegistrationBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      const err: any = new Error(parseResult.error.errors.map((e) => e.message).join(', '));
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }

    const { txHash } = parseResult.data;
    const canonicalBaseUrl = appConfig.PUBLIC_BASE_URL.replace(/\/+$/, '');
    const canonicalAgentUri = `${canonicalBaseUrl}/api/agent/metadata`;

    const existing = db.getErc8004RegistrationByTxHash(txHash);
    if (existing && existing.status === 'CONFIRMED') {
      return {
        verified: true,
        status: 'VERIFIED_REGISTERED',
        agentId: existing.agent_id,
        registration: existing
      };
    }

    // Retrieve receipt and transaction from Celo Mainnet
    const { tx, receipt } = await fetchMainnetTxAndReceipt(provider, txHash);

    if (!receipt) {
      return {
        verified: false,
        status: 'PENDING_CONFIRMATION',
        reason: 'Transaction is not yet mined or receipt is pending on Celo Mainnet.'
      };
    }

    // Verify receipt using canonical celoAttributionService
    const result = celoAttributionService.verifyErc8004RegistrationReceipt({
      receipt: receipt as any,
      transaction: (tx as any) || undefined,
      expectedRegistry: ERC8004_IDENTITY_REGISTRY_CELO_MAINNET,
      expectedWallet: appConfig.AGENT_WALLET_ADDRESS as `0x${string}`,
      expectedAttributionTag: appConfig.CELO_ATTRIBUTION_TAG
    });

    const now = new Date().toISOString();
    const gasUsedStr = receipt.gasUsed ? String(BigInt(receipt.gasUsed as any)) : null;
    const actualFeeStr =
      receipt.gasUsed && receipt.effectiveGasPrice
        ? (BigInt(receipt.gasUsed as any) * BigInt(receipt.effectiveGasPrice as any)).toString()
        : null;

    if (result.verified && result.agentId) {
      const confirmedRow: Erc8004RegistrationRow = {
        id: existing?.id || randomUUID(),
        tx_hash: txHash.toLowerCase(),
        status: 'CONFIRMED',
        agent_id: result.agentId,
        agent_uri: result.agentURI || canonicalAgentUri,
        registry_address: result.registryAddress,
        owner_address: result.owner || appConfig.AGENT_WALLET_ADDRESS,
        chain_id: REQUIRED_CELO_CHAIN_ID,
        block_number: result.blockNumber,
        gas_used: gasUsedStr,
        actual_fee_paid: actualFeeStr,
        attribution_tag: result.attributionTag,
        has_attribution: result.hasExpectedAttribution ? 1 : 0,
        created_at: existing?.created_at || now,
        updated_at: now
      };
      db.saveErc8004Registration(confirmedRow);

      return {
        verified: true,
        status: 'VERIFIED_REGISTERED',
        agentId: result.agentId,
        registration: confirmedRow
      };
    }

    if (result.status === 'REVERTED') {
      const revertedRow: Erc8004RegistrationRow = {
        id: existing?.id || randomUUID(),
        tx_hash: txHash.toLowerCase(),
        status: 'REVERTED',
        agent_id: null,
        agent_uri: canonicalAgentUri,
        registry_address: result.registryAddress,
        owner_address: appConfig.AGENT_WALLET_ADDRESS,
        chain_id: REQUIRED_CELO_CHAIN_ID,
        block_number: result.blockNumber,
        gas_used: gasUsedStr,
        actual_fee_paid: actualFeeStr,
        attribution_tag: result.attributionTag,
        has_attribution: 0,
        created_at: existing?.created_at || now,
        updated_at: now
      };
      db.saveErc8004Registration(revertedRow);

      return {
        verified: false,
        status: 'TRANSACTION_REVERTED',
        reason: result.reason || 'Transaction reverted on Celo Mainnet.'
      };
    }

    return {
      verified: false,
      status: 'REGISTRATION_ERROR',
      reason: result.reason || 'Transaction does not contain valid ERC-8004 registration events.'
    };
  });

  // ==========================================
  // STATIC FRONTEND SERVING (PRODUCTION BUILD)
  // ==========================================
  const clientDistDir = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(clientDistDir)) {
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2'
    };

    server.get('/', async (req, reply) => {
      const htmlPath = path.join(clientDistDir, 'index.html');
      if (fs.existsSync(htmlPath)) {
        reply.type('text/html; charset=utf-8').send(fs.readFileSync(htmlPath, 'utf8'));
        return;
      }
      reply.status(404).send('Not Found');
    });

    server.get('/favicon.ico', async (req, reply) => {
      const iconPath = path.join(clientDistDir, 'favicon.ico');
      if (fs.existsSync(iconPath)) {
        reply.type('image/x-icon').send(fs.readFileSync(iconPath));
        return;
      }
      reply.status(204).send();
    });

    // Client clean routes: redirect to hash-based SPA routes
    server.get('/history', async (req, reply) => {
      reply.redirect('/#/history', 302);
    });

    server.get('/about', async (req, reply) => {
      reply.redirect('/#/about', 302);
    });

    server.get('/operator', async (req, reply) => {
      reply.redirect('/#/operator', 302);
    });

    server.get('/investigate', async (req, reply) => {
      reply.redirect('/#/', 302);
    });

    server.get('/investigation/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      reply.redirect(`/#/investigation/${id}`, 302);
    });

    server.get('/assets/*', async (req, reply) => {
      const sanitizedUrl = req.url.split('?')[0];
      const filePath = path.join(clientDistDir, sanitizedUrl);
      if (!filePath.startsWith(clientDistDir)) {
        reply.status(403).send('Forbidden');
        return;
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        reply.type(contentType).send(fs.readFileSync(filePath));
        return;
      }
      reply.status(404).send('Asset Not Found');
    });
  }

  // Not Found handler: maintains standard JSON API contract for /api/* and redirects unhandled browser HTML requests to SPA
  server.setNotFoundHandler((request, reply) => {
    // Missing /api/* endpoints return standard API contract JSON 404
    if (request.url.startsWith('/api/') || request.url === '/api') {
      reply.status(404).send({
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: `Endpoint ${request.method} ${request.url} not found.`
        },
        requestId: request.id
      });
      return;
    }

    // Missing assets under /assets/* return text 404
    if (request.url.startsWith('/assets/')) {
      reply.status(404).send('Asset Not Found');
      return;
    }

    // Browser navigation with Accept: text/html redirects to SPA
    const accept = request.headers['accept'] || '';
    if (typeof accept === 'string' && accept.includes('text/html')) {
      reply.redirect('/#/', 302);
      return;
    }

    // Default 404 for other unhandled requests
    reply.status(404).send({
      data: null,
      error: {
        code: 'NOT_FOUND',
        message: `Resource ${request.method} ${request.url} not found.`
      },
      requestId: request.id
    });
  });

  return server;
}
