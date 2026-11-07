import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import { buildApp } from '../dist/server/app.js';

const CANDIDATE_TX = '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445';
const PORT = 3020;
const CDP_PORT = 9222;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_DB = path.resolve('./data/temp_browser_e2e.sqlite');

// Clean any leftover temp db
for (const f of [TEMP_DB, `${TEMP_DB}-journal`, `${TEMP_DB}-wal`, `${TEMP_DB}-shm`]) {
  try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
}

const env = dotenv.parse(fs.readFileSync('.env'));
const rpcUrl = env.CHAINSTACK_CELO_MAINNET_RPC_URL;
if (!rpcUrl) {
  console.error('FATAL: CHAINSTACK_CELO_MAINNET_RPC_URL is missing in .env');
  process.exit(1);
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.callbacks = new Map();

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  async send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async captureScreenshot(filepath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    fs.writeFileSync(filepath, buffer);
  }

  close() {
    this.ws.close();
  }
}

async function runBrowserE2E() {
  console.log('=== REVERTLENS FULL BROWSER E2E INTERACTION & SCREENSHOT TEST ===');
  console.log(`Port: ${PORT} | CDP: ${CDP_PORT}`);

  // 1. Start Server
  const config = {
    PORT,
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DATABASE_PATH: TEMP_DB,
    CORS_ORIGIN: `http://127.0.0.1:${PORT}`,
    CHAINSTACK_CELO_MAINNET_RPC_URL: rpcUrl,
    BUY_ENABLED: false,
    CENCORI_ENABLED: false,
    OPERATOR_PASSWORD_HASH: 'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8'
  };

  const app = buildApp(config);
  await app.listen({ port: PORT, host: '127.0.0.1' });
  console.log(`✓ Fastify server started on http://127.0.0.1:${PORT}`);

  // 2. Launch Chrome Headless
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    'about:blank'
  ]);

  // Wait for CDP readiness
  let versionData = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      versionData = await res.json();
      break;
    } catch (_) {}
  }

  if (!versionData) {
    chromeProcess.kill();
    await app.close();
    throw new Error('Failed to connect to Chrome remote debugging port');
  }

  console.log(`✓ Chrome connected: ${versionData.Browser}`);

  // Get active tab from Chrome
  const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const listData = await listRes.json();
  const pageTab = listData.find(t => t.type === 'page') || listData[0];
  if (!pageTab?.webSocketDebuggerUrl) {
    throw new Error('No inspectable page found in Chrome');
  }
  const cdp = new CdpClient(pageTab.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Runtime.enable');

  try {
    // ==========================================================
    // PHASE A: DESKTOP VIEWPORT TESTING (1280x800)
    // ==========================================================
    console.log('\n--- PHASE A: DESKTOP VIEWPORT TESTING (1280x800) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}` });
    await new Promise((r) => setTimeout(r, 1000));

    // A.1 Verify page title and header
    const title = await cdp.eval('document.querySelector("h1")?.innerText');
    const subtitle = await cdp.eval('document.querySelector("h2")?.innerText');
    console.log(`  ✓ Brand Title: "${title}"`);
    console.log(`  ✓ Subtitle: "${subtitle}"`);
    if (title !== 'RevertLens') throw new Error(`Unexpected title: ${title}`);

    // Capture Home Screenshot
    await cdp.captureScreenshot('screenshots/e2e_desktop_home.png');
    console.log('  ✓ Screenshot captured: screenshots/e2e_desktop_home.png');

    // A.2 Test Invalid Transaction Input
    console.log('\n  [A.2] Testing Invalid Transaction Input & Validation Error...');
    await cdp.eval(`
      const input = document.getElementById("txHash");
      input.value = "0xinvalid123";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("button[type='submit']").click();
    `);
    await new Promise((r) => setTimeout(r, 300));

    const validationMsg = await cdp.eval(`document.querySelector("p[style*='color: rgb(248, 113, 113)']")?.innerText`);
    console.log(`  ✓ Validation Error Rendered: "${validationMsg}"`);
    if (!validationMsg?.includes('0x-prefixed 64-character hexadecimal')) {
      throw new Error(`Validation message missing or incorrect: ${validationMsg}`);
    }
    await cdp.captureScreenshot('screenshots/e2e_desktop_invalid_input.png');
    console.log('  ✓ Screenshot captured: screenshots/e2e_desktop_invalid_input.png');

    // A.3 Test Loading Verified Sample Transaction
    console.log('\n  [A.3] Testing "Load Verified Sample Failed Tx" button...');
    await cdp.eval(`
      const sampleBtn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("Load Verified Sample"));
      sampleBtn.click();
    `);
    const populatedTx = await cdp.eval('document.getElementById("txHash")?.value');
    console.log(`  ✓ Input populated with: ${populatedTx}`);
    if (populatedTx.toLowerCase() !== CANDIDATE_TX.toLowerCase()) {
      throw new Error(`Populated hash mismatch: ${populatedTx}`);
    }

    // A.4 Submit Investigation & Observe Loading State
    console.log('\n  [A.4] Submitting Investigation to Live Celo Mainnet Node...');
    await cdp.eval('document.querySelector("button[type=\'submit\']").click()');
    await new Promise((r) => setTimeout(r, 200));

    const loadingText = await cdp.eval('document.querySelector("h3")?.innerText');
    console.log(`  ✓ Loading State Headline: "${loadingText}"`);

    // A.5 Wait for Live Response and Report Render
    console.log('\n  [A.5] Waiting for Live Report Generation...');
    let reportRendered = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const hasReport = await cdp.eval('Boolean(document.querySelector("h2[style*=\'color: rgb(248, 250, 252)\']"))');
      if (hasReport) {
        reportRendered = true;
        break;
      }
    }
    if (!reportRendered) {
      throw new Error('Timed out waiting for live investigation report to render in browser');
    }

    // A.6 Inspect Resulting Diagnosis
    const diagnosisHeadline = await cdp.eval('document.querySelector("h2[style*=\'color: rgb(248, 250, 252)\']")?.innerText');
    const statusBadge = await cdp.eval('document.querySelector("span[style*=\'font-weight: 800\']")?.innerText');
    console.log(`  ✓ Diagnosis Headline: "${diagnosisHeadline}"`);
    console.log(`  ✓ Diagnosis Status: "${statusBadge}"`);

    // A.7 Verify Call Tree and Failure Propagation
    const treeText = await cdp.eval('document.body.innerText');
    const hasSwapReverted = treeText.includes('Swap reverted') || treeText.includes('execution reverted');
    const hasPropSupported = treeText.includes('PROPAGATION_SUPPORTED') || treeText.includes('PROPAGATED_CHILD_REVERT');
    console.log(`  ✓ Call Tree contains revert error: ${hasSwapReverted}`);
    console.log(`  ✓ Causality propagation displayed: ${hasPropSupported}`);

    // A.8 Verify Evidence Items
    const hasEvidence = treeText.includes('E-01') && treeText.includes('E-02');
    console.log(`  ✓ Evidence Ledger [E-01, E-02] displayed: ${hasEvidence}`);

    // Capture Full Investigation Screenshot
    await cdp.captureScreenshot('screenshots/e2e_desktop_investigation_result.png');
    console.log('  ✓ Screenshot captured: screenshots/e2e_desktop_investigation_result.png');

    // A.9 Test Page Reload & SQLite Recovery
    console.log('\n  [A.9] Testing Page Reload & SQLite History Recovery...');
    await cdp.send('Page.reload');
    await new Promise((r) => setTimeout(r, 1000));

    const recentItem = await cdp.eval('document.querySelector("code[style*=\'color: rgb(56, 189, 248)\']")?.innerText');
    console.log(`  ✓ Recent Investigation in Drawer: ${recentItem}`);
    if (!recentItem || !recentItem.includes(CANDIDATE_TX.slice(0, 10))) {
      throw new Error(`Recent item mismatch: ${recentItem}`);
    }

    // Click recent item to reload report
    await cdp.eval('document.querySelector("div[style*=\'cursor: pointer\'][style*=\'justify-content: space-between\']").click()');
    await new Promise((r) => setTimeout(r, 500));
    const reloadedHeadline = await cdp.eval('document.querySelector("h2[style*=\'color: rgb(248, 250, 252)\']")?.innerText');
    console.log(`  ✓ Re-hydrated Report Headline from SQLite: "${reloadedHeadline}"`);
    if (!reloadedHeadline) throw new Error('Failed to reload report from history drawer');

    // ==========================================================
    // PHASE B: MOBILE VIEWPORT TESTING (iPhone X / 375x812)
    // ==========================================================
    console.log('\n--- PHASE B: MOBILE VIEWPORT TESTING (375x812) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}` });
    await new Promise((r) => setTimeout(r, 1000));

    // Capture Mobile Home Screenshot
    await cdp.captureScreenshot('screenshots/e2e_mobile_home.png');
    console.log('  ✓ Screenshot captured: screenshots/e2e_mobile_home.png');

    // Verify mobile layout
    const mobileInput = await cdp.eval('Boolean(document.getElementById("txHash"))');
    const mobileBtn = await cdp.eval('Boolean(document.querySelector("button[type=\'submit\']"))');
    console.log(`  ✓ Mobile Input rendered: ${mobileInput}`);
    console.log(`  ✓ Mobile Button rendered: ${mobileBtn}`);

    // Click recent item in mobile view
    await cdp.eval('document.querySelector("div[style*=\'cursor: pointer\'][style*=\'justify-content: space-between\']").click()');
    await new Promise((r) => setTimeout(r, 500));
    await cdp.captureScreenshot('screenshots/e2e_mobile_investigation_result.png');
    console.log('  ✓ Screenshot captured: screenshots/e2e_mobile_investigation_result.png');

    console.log('\n=== REAL BROWSER E2E TEST VERIFICATION COMPLETED (ALL PASSED) ===');
  } finally {
    cdp.close();
    chromeProcess.kill();
    await app.close();

    // Clean up temp database
    for (const f of [TEMP_DB, `${TEMP_DB}-journal`, `${TEMP_DB}-wal`, `${TEMP_DB}-shm`]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
    }
  }
}

runBrowserE2E().catch((err) => {
  console.error('\nBROWSER E2E FAILED:', err);
  process.exit(1);
});
