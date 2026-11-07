import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';

describe('Health Check Endpoint GET /api/health', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    BUY_ENABLED: 'false',
    CENCORI_ENABLED: 'false'
  });
  const app = buildApp(config);

  it('returns 200 with standard envelope matching API contract', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health'
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);

    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('error', null);
    expect(body).toHaveProperty('requestId');
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);

    expect(body.data).toEqual({
      status: 'ok',
      version: '0.1.0',
      chainId: 42220,
      featureFlags: {
        buyEnabled: false,
        cencoriEnabled: false
      },
      buyReady: false
    });
  });

  it('sets CORS headers properly for configured origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        origin: 'http://localhost:5173'
      }
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
