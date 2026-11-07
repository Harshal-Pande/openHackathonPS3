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
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, buffer);
  }

  close() {
    this.ws.close();
  }
}

async function assertScreenshot(cdp, filepath) {
  await cdp.captureScreenshot(filepath);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Assertion failed: Screenshot not created at ${filepath}`);
  }
  const stat = fs.statSync(filepath);
  if (stat.size === 0) {
    throw new Error(`Assertion failed: Screenshot file ${filepath} is empty`);
  }
  console.log(`  ✓ Screenshot verified: ${filepath} (${stat.size} bytes)`);
}

async function runBrowserE2E() {
  console.log('=================================================================');
  console.log(' REVERTLENS RIGOROUS BROWSER E2E INTERACTION & AUDIT TEST');
  console.log(` Timestamp:       ${new Date().toISOString()}`);
  console.log(` Port:            ${PORT}`);
  console.log(` CDP Debug Port:  ${CDP_PORT}`);
  console.log(` Chrome Binary:   ${CHROME_PATH}`);
  console.log('=================================================================\n');

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
    if (!subtitle || subtitle.length === 0) throw new Error('Missing subtitle');

    await assertScreenshot(cdp, 'screenshots/e2e_desktop_home.png');

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
    if (!validationMsg || !validationMsg.includes('0x-prefixed 64-character hexadecimal')) {
      throw new Error(`Validation message missing or incorrect: ${validationMsg}`);
    }
    await assertScreenshot(cdp, 'screenshots/e2e_desktop_invalid_input.png');

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
    if (!loadingText) {
      throw new Error('Loading state failed to display');
    }

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
    const badges = await cdp.eval(`Array.from(document.querySelectorAll("span[style*='font-weight: 800']")).map(s => s.innerText)`);
    console.log(`  ✓ Diagnosis Headline: "${diagnosisHeadline}"`);
    console.log(`  ✓ Status Badges: [${badges.join(', ')}]`);
    if (!diagnosisHeadline || !diagnosisHeadline.includes('execution reverted')) {
      throw new Error(`Unexpected diagnosis headline: ${diagnosisHeadline}`);
    }
    if (!badges.includes('REVERTED')) {
      throw new Error(`Expected REVERTED badge in [${badges.join(', ')}]`);
    }
    if (!badges.includes('DETERMINISTIC ANALYSIS')) {
      throw new Error(`Expected DETERMINISTIC ANALYSIS badge in [${badges.join(', ')}]`);
    }

    // A.7 Verify Call Tree and Failure Propagation
    const treeText = await cdp.eval('document.body.innerText');
    const hasSwapReverted = treeText.includes('Swap reverted') || treeText.includes('execution reverted');
    const hasPropSupported = treeText.includes('Propagated') || treeText.includes('PROPAGATED_CHILD_REVERT') || treeText.includes('FAILURE_PROPAGATION');
    if (!hasSwapReverted) throw new Error('Call tree missing expected revert error text');
    if (!hasPropSupported) throw new Error('Call tree missing expected causality propagation status');
    console.log(`  ✓ Call Tree contains revert error (ASSERTION PASSED)`);
    console.log(`  ✓ Causality propagation displayed (ASSERTION PASSED)`);

    // A.8 Verify Evidence Items
    const hasEvidence = treeText.includes('E-01') && treeText.includes('E-02');
    if (!hasEvidence) throw new Error('Evidence ledger missing E-01/E-02 citations');
    console.log(`  ✓ Evidence Ledger [E-01, E-02] displayed (ASSERTION PASSED)`);

    await assertScreenshot(cdp, 'screenshots/e2e_desktop_investigation_result.png');

    // A.9 Test JSON Export Functionality
    console.log('\n  [A.9] Testing JSON Export Functionality...');
    await cdp.eval(`
      window.__downloadBlob = null;
      const origCreate = URL.createObjectURL;
      URL.createObjectURL = function(blob) {
        const reader = new FileReader();
        reader.onload = () => { window.__downloadBlob = reader.result; };
        reader.readAsText(blob);
        return origCreate.apply(this, arguments);
      };
    `);

    await cdp.eval(`
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("Download JSON Report"));
      if (!btn) throw new Error("Download JSON Report button not found");
      btn.click();
    `);

    let exportedJson = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      exportedJson = await cdp.eval('window.__downloadBlob');
      if (exportedJson) break;
    }
    if (!exportedJson) {
      throw new Error('Assertion failed: Download JSON Report button did not generate blob payload');
    }

    const parsedExport = JSON.parse(exportedJson);
    if (!parsedExport.txHash || parsedExport.txHash.toLowerCase() !== CANDIDATE_TX.toLowerCase()) {
      throw new Error(`Exported JSON txHash mismatch: ${parsedExport.txHash}`);
    }
    if (!parsedExport.evidenceLedger || parsedExport.evidenceLedger.length === 0) {
      throw new Error('Exported JSON missing evidence ledger');
    }
    console.log(`  ✓ JSON Export verified: contains ${parsedExport.evidenceLedger.length} evidence items and matches candidate tx`);

    // A.10 Test Page Reload & SQLite Recovery
    console.log('\n  [A.10] Testing Page Reload & SQLite History Recovery...');
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
    if (!reloadedHeadline || !reloadedHeadline.includes('execution reverted')) {
      throw new Error(`Failed to reload report from history drawer: ${reloadedHeadline}`);
    }

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

    await assertScreenshot(cdp, 'screenshots/e2e_mobile_home.png');

    // Verify mobile layout
    const mobileInput = await cdp.eval('Boolean(document.getElementById("txHash"))');
    const mobileBtn = await cdp.eval('Boolean(document.querySelector("button[type=\'submit\']"))');
    if (!mobileInput) throw new Error('Mobile viewport missing txHash input element');
    if (!mobileBtn) throw new Error('Mobile viewport missing submit button');
    console.log(`  ✓ Mobile Input and Button verified (ASSERTION PASSED)`);

    // Click recent item in mobile view
    await cdp.eval('document.querySelector("div[style*=\'cursor: pointer\'][style*=\'justify-content: space-between\']").click()');
    await new Promise((r) => setTimeout(r, 500));
    await assertScreenshot(cdp, 'screenshots/e2e_mobile_investigation_result.png');

    console.log('\n=================================================================');
    console.log(' ALL BROWSER E2E ASSERTIONS & SCREENSHOTS PASSED (EXIT CODE 0)');
    console.log(' Desktop & Mobile Viewports Fully Validated with Hard Assertions');
    console.log('=================================================================\n');
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
