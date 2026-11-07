import fastify, { FastifyInstance, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppConfig } from './config.js';
import { Database } from './db/database.js';
import { ChainstackProvider } from './providers/chainstack.js';
import { InvestigationService } from './services/investigationService.js';

export interface AppDependencies {
  db?: Database;
  provider?: ChainstackProvider;
}

const InvestigateBodySchema = z.object({
  txHash: z.string().trim()
});

export function buildApp(appConfig: AppConfig, deps: AppDependencies = {}): FastifyInstance {
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

  const investigationService = new InvestigationService(provider, db);

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

    const errorCode = 'code' in error && typeof (error as any).code === 'string'
      ? (error as any).code
      : (statusCode === 400 ? 'BAD_REQUEST'
         : statusCode === 404 ? 'NOT_FOUND'
         : statusCode === 504 ? 'GATEWAY_TIMEOUT'
         : statusCode === 502 || statusCode === 503 ? 'PROVIDER_UNAVAILABLE'
         : 'INTERNAL_SERVER_ERROR');

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

  // GET /api/investigations/:id - Fetch by ID
  server.get('/api/investigations/:id', async (request) => {
    const { id } = request.params as { id: string };
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
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    return investigationService.listRecent(limit);
  });

  return server;
}
