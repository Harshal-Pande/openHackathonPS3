import fastify, { FastifyInstance, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppConfig, ensureAppConfig } from './config.js';
import { Database } from './db/database.js';
import { ChainstackProvider } from './providers/chainstack.js';
import { CencoriProvider } from './providers/cencori.js';
import {
  CeloAttributionService,
  ERC8004_IDENTITY_REGISTRY_CELO_MAINNET
} from './services/celoAttributionService.js';
import { BuyQuoteService } from './services/buyQuoteService.js';
import { AiExplanationService } from './services/aiExplanationService.js';
import { OperatorAuthService } from './auth/operatorAuth.js';
import { InvestigationService } from './services/investigationService.js';

export interface AppDependencies {
  db?: Database;
  provider?: ChainstackProvider;
  cencoriProvider?: CencoriProvider;
  buyQuoteService?: BuyQuoteService;
  aiExplanationService?: AiExplanationService;
  authService?: OperatorAuthService;
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

const KillSwitchBodySchema = z.object({
  enabled: z.boolean()
});

export function buildApp(rawConfig: AppConfig | Record<string, unknown>, deps: AppDependencies = {}): FastifyInstance {
  const appConfig = ensureAppConfig(rawConfig);
  const server = fastify({
    logger: false,
    genReqId: () => randomUUID()
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

  const buyQuoteService = deps.buyQuoteService || new BuyQuoteService(db, appConfig);
  const aiExplanationService =
    deps.aiExplanationService ||
    new AiExplanationService(cencoriProvider, buyQuoteService, appConfig);

  const authService = deps.authService || new OperatorAuthService(appConfig);
  const investigationService = new InvestigationService(provider, db, aiExplanationService);
  const celoAttributionService = new CeloAttributionService(appConfig.CELO_ATTRIBUTION_TAG);

  server.register(cors, {
    origin: appConfig.CORS_ORIGIN,
    credentials: true
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

  // POST /api/investigations - Execute or retrieve investigation
  server.post('/api/investigations', async (request) => {
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
    return celoAttributionService.generateErc8004Metadata({
      agentWallet: appConfig.AGENT_WALLET_ADDRESS as `0x${string}`,
      baseUrl: appConfig.PUBLIC_BASE_URL
    });
  });

  // GET /api/agent/erc8004-registration-tx - Prepares tagged ERC-8004 registration transaction payload
  server.get('/api/agent/erc8004-registration-tx', async (request) => {
    const query = (request.query || {}) as { agentURI?: string };
    const agentURI = query.agentURI || `${appConfig.PUBLIC_BASE_URL}/api/agent/metadata`;
    const tx = celoAttributionService.buildErc8004RegistrationTransaction({
      agentURI,
      from: appConfig.AGENT_WALLET_ADDRESS as `0x${string}`
    });
    return {
      agentURI,
      registryAddress: ERC8004_IDENTITY_REGISTRY_CELO_MAINNET,
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

    const clientIp = request.ip || '127.0.0.1';
    try {
      const { token, session } = await authService.login(clientIp, parseResult.data.password);
      reply.header('Set-Cookie', `operator_token=${token}; HttpOnly; SameSite=Strict; Path=/`);
      return { token, session };
    } catch (err: unknown) {
      const error: any = new Error((err as Error).message);
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      throw error;
    }
  });

  // POST /api/operator/logout
  server.post('/api/operator/logout', async (request) => {
    const authHeader = request.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (request.headers['x-operator-token'] as string);
    if (token) {
      authService.logout(token);
    }
    return { success: true };
  });

  // Helper to extract and verify operator session
  function requireOperatorSession(req: any) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.headers['x-operator-token'] as string);
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
      '.ico': 'image/x-icon'
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

  return server;
}
