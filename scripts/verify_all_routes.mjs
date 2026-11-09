import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { buildApp } from '../dist/server/app.js';
import { Database } from '../dist/server/db/database.js';
import { ChainstackProvider } from '../dist/server/providers/chainstack.js';

const CANDIDATE_TX = '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445';
const TEMP_DB = path.resolve('./data/temp_routes_audit.sqlite');

for (const f of [TEMP_DB, `${TEMP_DB}-journal`, `${TEMP_DB}-wal`, `${TEMP_DB}-shm`]) {
  try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
}

const env = dotenv.parse(fs.readFileSync('.env'));
const rpcUrl = env.CHAINSTACK_CELO_MAINNET_RPC_URL;
const sessionSecret = 'test_operator_secret_session_key_32_bytes_long';
const operatorPassword = 'test-operator-password';
const operatorPasswordHash = 'scrypt$v=1$N=16384$r=8$p=1$MTIzNDU2Nzg5MDEyMzQ1Ng==$lz+/lmHQGUWcL7lg4806U5pUvi6ksAUVulQc8tB+0Mw=';

console.log('=================================================================');
console.log(' REVERTLENS MASTER API SURFACE AUDIT & ROUTE INJECTION');
console.log(` Timestamp:       ${new Date().toISOString()}`);
console.log('=================================================================\n');

async function testAllRoutes() {
  const config = {
    PORT: 3025,
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DATABASE_PATH: TEMP_DB,
    CORS_ORIGIN: 'http://127.0.0.1:3025',
    CHAINSTACK_CELO_MAINNET_RPC_URL: rpcUrl,
    BUY_ENABLED: true,
    CENCORI_ENABLED: true,
    BUY_DAILY_BUDGET_ATOMIC: '100000',
    BUY_PER_CALL_CAP_ATOMIC: '20000',
    SESSION_SECRET: sessionSecret,
    OPERATOR_PASSWORD_HASH: operatorPasswordHash,
    RATE_LIMIT_INVESTIGATIONS_MAX: 10,
    RATE_LIMIT_INVESTIGATIONS_WINDOW_MS: 60000
  };

  const db = new Database(TEMP_DB);
  const provider = new ChainstackProvider({ rpcUrl });
  const app = buildApp(config, { db, provider });

  let operatorToken = '';
  let investigationId = '';
  let quoteId = '';

  const routeResults = [];
  const uniqueEndpointsTested = new Set();

  async function testRoute(name, req, endpointPattern, expectedStatuses, validator) {
    uniqueEndpointsTested.add(`${req.method} ${endpointPattern}`);
    const res = await app.inject(req);
    const pass = expectedStatuses.includes(res.statusCode);
    let body = null;
    try { body = JSON.parse(res.body); } catch (_) { body = res.body; }
    
    let valid = pass;
    if (validator && pass) {
      valid = validator(res, body);
    }

    routeResults.push({
      name,
      endpoint: `${req.method} ${endpointPattern}`,
      url: req.url,
      statusCode: res.statusCode,
      expected: expectedStatuses,
      pass: valid
    });

    if (!valid) {
      console.error(`[FAIL] ${req.method} ${req.url} -> Status ${res.statusCode} (expected ${expectedStatuses.join('/')}) (${name})`);
      console.error('       Response Body:', JSON.stringify(body));
      throw new Error(`Route assertion failed for scenario: ${name}`);
    } else {
      console.log(`[PASS] ${req.method} ${req.url} -> Status ${res.statusCode} (${name})`);
    }

    return { res, body };
  }

  // 1. GET /api/health
  await testRoute('Public Health Check', { method: 'GET', url: '/api/health' }, '/api/health', [200], (res, body) => {
    return body.data?.status === 'ok' && body.data?.chainId === 42220;
  });

  // 1b. GET /api/agent/metadata (Public ERC-8004 metadata -> 200)
  await testRoute('Public Agent ERC-8004 Metadata', { method: 'GET', url: '/api/agent/metadata' }, '/api/agent/metadata', [200], (res, body) => {
    return body.data?.name === 'RevertLens' && body.data?.attributionTag === 'celo_235f6ef56f5b' && body.data?.chainId === 42220;
  });

  // 1c. GET /api/agent/erc8004-registration-tx (Prepare tagged registration tx -> 200)
  await testRoute('Prepare Tagged ERC-8004 Registration Tx', { method: 'GET', url: '/api/agent/erc8004-registration-tx' }, '/api/agent/erc8004-registration-tx', [200], (res, body) => {
    return (
      body.data?.taggedTransaction?.chainId === 42220 &&
      body.data?.taggedTransaction?.attributionTag === 'celo_235f6ef56f5b' &&
      body.data?.taggedTransaction?.verifiedCodes?.includes('celo_235f6ef56f5b')
    );
  });

  // 2. POST /api/investigations (Invalid hash -> 400)
  await testRoute('Investigation Invalid Hash', {
    method: 'POST',
    url: '/api/investigations',
    payload: { txHash: '0xinvalid' }
  }, '/api/investigations', [400], (res, body) => body.error?.code === 'INVALID_INPUT');

  // 3. POST /api/investigations (Valid candidate tx -> 200)
  await testRoute('Execute Investigation (Live Mainnet)', {
    method: 'POST',
    url: '/api/investigations',
    payload: { txHash: CANDIDATE_TX }
  }, '/api/investigations', [200], (res, body) => {
    investigationId = body.data?.investigationId;
    return Boolean(investigationId && body.data?.status === 'REVERTED');
  });

  // 4. GET /api/investigations/:id (Invalid UUID -> 400)
  await testRoute('Get Investigation Invalid UUID', {
    method: 'GET',
    url: '/api/investigations/not-a-uuid'
  }, '/api/investigations/:id', [400], (res, body) => body.error?.code === 'INVALID_INPUT');

  // 5. GET /api/investigations/:id (Non-existent valid v4 UUID -> 404)
  await testRoute('Get Investigation Not Found', {
    method: 'GET',
    url: '/api/investigations/ffffffff-ffff-4fff-bfff-ffffffffffff'
  }, '/api/investigations/:id', [404], (res, body) => body.error?.code === 'NOT_FOUND');

  // 6. GET /api/investigations/:id (Valid ID -> 200)
  await testRoute('Get Investigation by ID', {
    method: 'GET',
    url: `/api/investigations/${investigationId}`
  }, '/api/investigations/:id', [200], (res, body) => body.data?.investigationId === investigationId);

  // 7. GET /api/investigations (List recent investigations -> 200)
  await testRoute('List Recent Investigations', {
    method: 'GET',
    url: '/api/investigations?limit=5'
  }, '/api/investigations', [200], (res, body) => Array.isArray(body.data) && body.data.length >= 1);

  // 8. GET /api/investigations (Invalid limit query param -> 400)
  await testRoute('List Investigations Invalid Limit', {
    method: 'GET',
    url: '/api/investigations?limit=invalid'
  }, '/api/investigations', [400], (res, body) => body.error?.code === 'INVALID_INPUT');

  // 9. POST /api/investigations/:id/quote (Generate Buy quote -> 200)
  await testRoute('Generate Cencori Quote', {
    method: 'POST',
    url: `/api/investigations/${investigationId}/quote`
  }, '/api/investigations/:id/quote', [200], (res, body) => {
    quoteId = body.data?.quoteId;
    return Boolean(quoteId && body.data?.amountAtomic === '10000');
  });

  // 10. POST /api/operator/login (Invalid password -> 401)
  await testRoute('Operator Login Bad Password', {
    method: 'POST',
    url: '/api/operator/login',
    payload: { password: 'wrong-password' }
  }, '/api/operator/login', [401], (res, body) => body.error?.code === 'UNAUTHORIZED');

  // 11. POST /api/operator/login (DEF-14: SESSION_SECRET as password -> 401)
  await testRoute('Operator Login Session Secret Rejected (DEF-14)', {
    method: 'POST',
    url: '/api/operator/login',
    payload: { password: sessionSecret }
  }, '/api/operator/login', [401], (res, body) => body.error?.code === 'UNAUTHORIZED');

  // 12. POST /api/operator/login (Valid password -> 200)
  await testRoute('Operator Login Success', {
    method: 'POST',
    url: '/api/operator/login',
    payload: { password: operatorPassword }
  }, '/api/operator/login', [200], (res, body) => {
    operatorToken = body.data?.token;
    return Boolean(operatorToken);
  });

  // 12. GET /api/operator/quotes (Public unauthenticated -> 401)
  await testRoute('Operator Quotes Unauthenticated', {
    method: 'GET',
    url: '/api/operator/quotes'
  }, '/api/operator/quotes', [401], (res, body) => body.error?.code === 'UNAUTHORIZED');

  // 13. GET /api/operator/quotes (Authenticated operator -> 200)
  await testRoute('Operator Quotes Authenticated', {
    method: 'GET',
    url: '/api/operator/quotes',
    headers: { authorization: `Bearer ${operatorToken}` }
  }, '/api/operator/quotes', [200], (res, body) => Array.isArray(body.data) && body.data.length >= 1);

  // 14. POST /api/operator/quotes/:id/approve (Tampered SHA-256 -> exact 400 HASH_MISMATCH)
  await testRoute('Approve Quote Tampered Hash', {
    method: 'POST',
    url: `/api/operator/quotes/${quoteId}/approve`,
    headers: { authorization: `Bearer ${operatorToken}` },
    payload: { expectedBodySha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' }
  }, '/api/operator/quotes/:id/approve', [400], (res, body) => {
    return body.error?.code === 'HASH_MISMATCH' && body.error?.message?.includes('Cryptographic body hash mismatch');
  });

  // 15. POST /api/operator/kill-switch (Engage Kill Switch -> 200)
  await testRoute('Engage Emergency Kill Switch', {
    method: 'POST',
    url: '/api/operator/kill-switch',
    headers: { authorization: `Bearer ${operatorToken}` },
    payload: { enabled: true }
  }, '/api/operator/kill-switch', [200], (res, body) => body.data?.killSwitchActive === true);

  // 15b. GET /api/operator/buy-health (Unauthenticated -> 401)
  await testRoute('Buy Health Unauthenticated', {
    method: 'GET',
    url: '/api/operator/buy-health'
  }, '/api/operator/buy-health', [401], (res, body) => body.error?.code === 'UNAUTHORIZED');

  // 15c. GET /api/operator/buy-health (Authenticated -> 200)
  await testRoute('Buy Health Authenticated', {
    method: 'GET',
    url: '/api/operator/buy-health',
    headers: { authorization: `Bearer ${operatorToken}` }
  }, '/api/operator/buy-health', [200], (res, body) => body.data?.network === 'celo' && body.data?.killSwitchActive === true);

  // 15d. GET /api/operator/purchases (Unauthenticated -> 401)
  await testRoute('List Purchases Unauthenticated', {
    method: 'GET',
    url: '/api/operator/purchases'
  }, '/api/operator/purchases', [401], (res, body) => body.error?.code === 'UNAUTHORIZED');

  // 15e. GET /api/operator/purchases (Authenticated -> 200)
  await testRoute('List Purchases Authenticated', {
    method: 'GET',
    url: '/api/operator/purchases',
    headers: { authorization: `Bearer ${operatorToken}` }
  }, '/api/operator/purchases', [200], (res, body) => Array.isArray(body.data));

  // 15f. GET /api/operator/purchases/:id (Non-existent -> 404)
  await testRoute('Get Purchase Not Found', {
    method: 'GET',
    url: '/api/operator/purchases/non-existent-attempt-id',
    headers: { authorization: `Bearer ${operatorToken}` }
  }, '/api/operator/purchases/:id', [404], (res, body) => body.error?.code === 'PURCHASE_NOT_FOUND');

  // 15g. GET /api/operator/audit-events (Authenticated -> 200)
  await testRoute('List Audit Events Authenticated', {
    method: 'GET',
    url: '/api/operator/audit-events',
    headers: { authorization: `Bearer ${operatorToken}` }
  }, '/api/operator/audit-events', [200], (res, body) => Array.isArray(body.data));

  // 15h. POST /api/operator/quotes/:id/execute (Unauthenticated -> 401)
  await testRoute('Execute Quote Unauthenticated', {
    method: 'POST',
    url: `/api/operator/quotes/${quoteId}/execute`,
    payload: { approvalId: 'some-approval' }
  }, '/api/operator/quotes/:id/execute', [401], (res, body) => body.error?.code === 'UNAUTHORIZED');

  // 15i. POST /api/operator/quotes/:id/execute (Missing approvalId -> 400)
  await testRoute('Execute Quote Missing Approval ID', {
    method: 'POST',
    url: `/api/operator/quotes/${quoteId}/execute`,
    headers: { authorization: `Bearer ${operatorToken}` },
    payload: {}
  }, '/api/operator/quotes/:id/execute', [400], (res, body) => body.error?.code === 'INVALID_INPUT');

  // 15j. GET /api/operator/system-status (Unauthenticated -> 401)
  await testRoute('System Status Unauthenticated', {
    method: 'GET',
    url: '/api/operator/system-status'
  }, '/api/operator/system-status', [401], (res, body) => body.error?.code === 'UNAUTHORIZED');

  // 15k. GET /api/operator/system-status (Authenticated -> 200)
  await testRoute('System Status Authenticated', {
    method: 'GET',
    url: '/api/operator/system-status',
    headers: { authorization: `Bearer ${operatorToken}` }
  }, '/api/operator/system-status', [200], (res, body) => body.data?.version === '0.1.0' && body.data?.database?.status === 'ACTIVE');

  // 16. POST /api/operator/logout (Logout session -> 200)
  await testRoute('Operator Logout', {
    method: 'POST',
    url: '/api/operator/logout',
    headers: { authorization: `Bearer ${operatorToken}` }
  }, '/api/operator/logout', [200], (res, body) => body.data?.success === true);

  // 17. GET / (Static SPA HTML -> 200)
  await testRoute('Serve SPA Index HTML', {
    method: 'GET',
    url: '/'
  }, '/', [200], (res, body) => typeof body === 'string' && body.includes('RevertLens'));

  // 18. GET /assets/* (Static Asset delivery -> 200)
  const distDir = path.resolve('./dist/client/assets');
  const assetFiles = fs.existsSync(distDir) ? fs.readdirSync(distDir) : [];
  const jsAsset = assetFiles.find(f => f.endsWith('.js'));
  if (jsAsset) {
    await testRoute('Serve Static JS Asset', {
      method: 'GET',
      url: `/assets/${jsAsset}`
    }, '/assets/*', [200], (res, body) => res.headers['content-type']?.includes('application/javascript'));
  }

  // 19. GET /assets/../package.json (Path traversal attempt -> 403/404)
  await testRoute('Path Traversal Guard on Assets', {
    method: 'GET',
    url: '/assets/../package.json'
  }, '/assets/*', [403, 404], (res, body) => res.statusCode === 403 || res.statusCode === 404);

  // 20. GET /history -> 302 Redirect to Hash SPA Route
  await testRoute('SPA Clean Route Redirect (/history)', {
    method: 'GET',
    url: '/history'
  }, '/history', [302], (res) => res.headers['location'] === '/#/history');

  // 21. GET /about -> 302 Redirect to Hash SPA Route
  await testRoute('SPA Clean Route Redirect (/about)', {
    method: 'GET',
    url: '/about'
  }, '/about', [302], (res) => res.headers['location'] === '/#/about');

  // 22. GET /operator -> 302 Redirect to Hash SPA Route
  await testRoute('SPA Clean Route Redirect (/operator)', {
    method: 'GET',
    url: '/operator'
  }, '/operator', [302], (res) => res.headers['location'] === '/#/operator');

  // 23. GET /investigation/:id -> 302 Redirect to Hash SPA Report Route
  await testRoute('SPA Clean Route Redirect (/investigation/:id)', {
    method: 'GET',
    url: `/investigation/${investigationId}`
  }, '/investigation/:id', [302], (res) => res.headers['location'] === `/#/investigation/${investigationId}`);

  // 24. GET /api/nonexistent -> 404 with standard JSON API error envelope
  await testRoute('Unknown API Route 404 JSON Envelope', {
    method: 'GET',
    url: '/api/nonexistent-endpoint'
  }, '/api/*', [404], (res, body) => {
    return body && body.error && body.error.code === 'NOT_FOUND' && body.data === null;
  });

  // 25. GET /unknown-page (Browser HTML request) -> 302 Redirect to SPA Home
  await testRoute('Browser HTML Navigation Fallback to SPA Home', {
    method: 'GET',
    url: '/unknown-page',
    headers: { 'Accept': 'text/html,application/xhtml+xml' }
  }, '/*', [302], (res) => res.headers['location'] === '/#/');

  // Clean up
  db.close();
  for (const f of [TEMP_DB, `${TEMP_DB}-journal`, `${TEMP_DB}-wal`, `${TEMP_DB}-shm`]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
  }

  console.log('\n=================================================================');
  console.log(` UNIQUE ENDPOINTS TESTED: ${uniqueEndpointsTested.size}`);
  Array.from(uniqueEndpointsTested).forEach(e => console.log(`   - ${e}`));
  console.log(` TOTAL SCENARIOS RUN:     ${routeResults.length} (100% Passed)`);
  console.log(' ALL API SURFACE AND TAMPER-DETECTION ASSERTIONS VERIFIED');
  console.log('=================================================================\n');
}

testAllRoutes().catch(err => {
  console.error('\nAPI AUDIT FAILED:', err);
  process.exit(1);
});
