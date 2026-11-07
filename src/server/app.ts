import fastify, { FastifyInstance, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import { AppConfig } from './config.js';

export function buildApp(appConfig: AppConfig): FastifyInstance {
  const server = fastify({
    logger: false,
    genReqId: () => randomUUID()
  });

  server.register(cors, {
    origin: appConfig.CORS_ORIGIN,
    credentials: true
  });

  // Standard API Envelope Formatter
  server.addHook('onSend', async (request, reply, payload) => {
    // Only format JSON /api responses if not already formatted
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
    const statusCode = ('statusCode' in error && typeof error.statusCode === 'number') ? error.statusCode : 500;
    const errorCode = ('code' in error && typeof error.code === 'string') ? error.code : 'INTERNAL_SERVER_ERROR';

    reply.status(statusCode).send({
      data: null,
      error: {
        code: errorCode,
        message: statusCode >= 500 ? 'An internal server error occurred.' : error.message
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
        cencoriEnabled: appConfig.CENCORI_ENABLED
      },
      buyReady: false // False until live Gate 0 verified and wallet provisioned
    };
  });

  return server;
}
