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
        cencoriEnabled: false,
        chainstackConfigured: false
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

  it('serves static HTML index on GET /', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('RevertLens');
    expect(response.body).toContain('<div id="root"></div>');
  });

  it('blocks directory traversal attempts on static assets with HTTP 403 or 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/assets/../../src/server/config.ts'
    });

    expect([403, 404]).toContain(response.statusCode);
  });
});
