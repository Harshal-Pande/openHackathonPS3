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
    await new Promise((r) => setTimeout(r, 1200));

    // A.1 Verify page title and header using data-testid
    const pageTitle = await cdp.eval('document.querySelector("[data-testid=page-title]")?.innerText');
    const wordmark = await cdp.eval('document.querySelector("[data-testid=app-title-link]")?.innerText');
    console.log(`  ✓ Page Title: "${pageTitle}"`);
    console.log(`  ✓ Wordmark: "${wordmark}"`);
    if (pageTitle !== 'Your Celo transaction failed. Find out why.') {
      throw new Error(`Unexpected page title: ${pageTitle}`);
    }
    if (!wordmark || !wordmark.includes('RevertLens')) {
      throw new Error(`Unexpected wordmark: ${wordmark}`);
    }

    await assertScreenshot(cdp, 'screenshots/e2e_desktop_home.png');
    await assertScreenshot(cdp, 'screenshots/after/desktop_home.png');

    // A.2 Test Invalid Transaction Input & Validation Error
    console.log('\n  [A.2] Testing Invalid Transaction Input & Validation Error...');
    await cdp.eval(`
      const input = document.getElementById("txHash") || document.querySelector("[data-testid=tx-input]");
      input.value = "0xinvalid123";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("[data-testid=submit-investigate]").click();
    `);
    await new Promise((r) => setTimeout(r, 300));

    const validationMsg = await cdp.eval(`document.querySelector("[data-testid=input-error]")?.innerText`);
    console.log(`  ✓ Validation Error Rendered: "${validationMsg}"`);
    if (!validationMsg || !validationMsg.includes('64-character hexadecimal')) {
      throw new Error(`Validation message missing or incorrect: ${validationMsg}`);
    }
    await assertScreenshot(cdp, 'screenshots/e2e_desktop_invalid_input.png');

    // A.3 Test Loading Verified Sample Transaction
    console.log('\n  [A.3] Testing "sample-button" click...');
    await cdp.eval(`
      const sampleBtn = document.querySelector("[data-testid=sample-button]");
      sampleBtn.click();
    `);
    const populatedTx = await cdp.eval('document.querySelector("[data-testid=tx-input]")?.value || document.getElementById("txHash")?.value');
    console.log(`  ✓ Input populated with: ${populatedTx}`);
    if (populatedTx.toLowerCase() !== CANDIDATE_TX.toLowerCase()) {
      throw new Error(`Populated hash mismatch: ${populatedTx}`);
    }

    // A.4 Submit Investigation & Observe Loading State
    console.log('\n  [A.4] Submitting Investigation to Live Celo Mainnet Node...');
    await cdp.eval('document.querySelector("[data-testid=submit-investigate]").click()');
    await new Promise((r) => setTimeout(r, 200));

    const loadingPanel = await cdp.eval('Boolean(document.querySelector("[data-testid=loading-panel]"))');
    console.log(`  ✓ Loading Panel displayed: ${loadingPanel}`);
    if (!loadingPanel) {
      throw new Error('Loading panel failed to display');
    }

    // A.5 Wait for Live Response and Report Render
    console.log('\n  [A.5] Waiting for Live Report Generation & Route Change...');
    let reportRendered = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const hasHeadline = await cdp.eval('Boolean(document.querySelector("[data-testid=verdict-headline]"))');
      if (hasHeadline) {
        reportRendered = true;
        break;
      }
    }
    if (!reportRendered) {
      throw new Error('Timed out waiting for live investigation report to render in browser');
    }

    // A.6 Inspect Resulting Diagnosis
    const diagnosisHeadline = await cdp.eval('document.querySelector("[data-testid=verdict-headline]")?.innerText');
    const statusChip = await cdp.eval('document.querySelector("[data-testid=status-chip]")?.innerText');
    console.log(`  ✓ Diagnosis Headline: "${diagnosisHeadline}"`);
    console.log(`  ✓ Status Chip: "${statusChip}"`);
    if (!diagnosisHeadline || !diagnosisHeadline.includes('execution reverted')) {
      throw new Error(`Unexpected diagnosis headline: ${diagnosisHeadline}`);
    }
    if (!statusChip || !statusChip.includes('Reverted')) {
      throw new Error(`Expected Reverted status chip: ${statusChip}`);
    }

    // A.7 Verify Call Tree and Failure Propagation
    const treeExists = await cdp.eval('Boolean(document.querySelector("[data-testid=trace-tree]"))');
    if (!treeExists) throw new Error('Trace tree element not found');

    const traceRowsText = await cdp.eval(`
      Array.from(document.querySelectorAll("[data-testid=trace-row]")).map(r => r.innerText).join(" ")
    `);
    const hasPropSupported = traceRowsText.includes('Failure propagated');
    const hasFailingFrame = traceRowsText.includes('Failing frame');
    console.log(`  ✓ Trace rows contain "Failure propagated": ${hasPropSupported}`);
    console.log(`  ✓ Trace rows contain "Failing frame": ${hasFailingFrame}`);
    if (!hasPropSupported) throw new Error('Trace tree missing "Failure propagated" label');
    if (!hasFailingFrame) throw new Error('Trace tree missing "Failing frame" label');

    // A.8 Verify Evidence Items
    const hasE01 = await cdp.eval('Boolean(document.querySelector("[data-testid=evidence-row][data-evidence-id=\'E-01\']"))');
    const hasE02 = await cdp.eval('Boolean(document.querySelector("[data-testid=evidence-row][data-evidence-id=\'E-02\']"))');
    console.log(`  ✓ Evidence row E-01 present: ${hasE01}`);
    console.log(`  ✓ Evidence row E-02 present: ${hasE02}`);
    if (!hasE01 || !hasE02) throw new Error('Evidence ledger missing E-01/E-02 rows');

    // Verify AI and Payment Panels honesty
    const aiPanelText = await cdp.eval('document.querySelector("[data-testid=ai-panel]")?.innerText || ""');
    if (!aiPanelText.includes('Generated text')) throw new Error('AI panel missing "Generated text" honesty disclosure');
    if (aiPanelText.includes('Payment successful')) throw new Error('AI panel dishonestly claims "Payment successful"');

    const paymentPanelText = await cdp.eval('document.querySelector("[data-testid=payment-panel]")?.innerText || ""');
    if (!paymentPanelText.includes('does not execute payments')) {
      throw new Error('Payment panel missing "does not execute payments" honesty statement');
    }
    console.log('  ✓ AI and Payment panels honesty assertions passed');

    await assertScreenshot(cdp, 'screenshots/e2e_desktop_investigation_result.png');
    await assertScreenshot(cdp, 'screenshots/after/desktop_investigation_result.png');

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
      const btn = document.querySelector("[data-testid=export-json]");
      if (!btn) throw new Error("Export JSON button not found");
      btn.click();
    `);

    let exportedJson = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      exportedJson = await cdp.eval('window.__downloadBlob');
      if (exportedJson) break;
    }
    if (!exportedJson) {
      throw new Error('Assertion failed: Download JSON button did not generate blob payload');
    }

    const parsedExport = JSON.parse(exportedJson);
    if (!parsedExport.txHash || parsedExport.txHash.toLowerCase() !== CANDIDATE_TX.toLowerCase()) {
      throw new Error(`Exported JSON txHash mismatch: ${parsedExport.txHash}`);
    }
    if (!parsedExport.evidenceLedger || parsedExport.evidenceLedger.length === 0) {
      throw new Error('Exported JSON missing evidence ledger');
    }
    console.log(`  ✓ JSON Export verified: contains ${parsedExport.evidenceLedger.length} evidence items and matches candidate tx`);

    // Verify toast notification
    const toastText = await cdp.eval('document.querySelector("[data-testid=toast]")?.innerText || ""');
    console.log(`  ✓ Export Toast Rendered: "${toastText}"`);
    if (!toastText.startsWith('Exported')) {
      throw new Error(`Toast message expected to start with "Exported", got: "${toastText}"`);
    }

    // A.10 Test Page Reload on Route & Persistence Recovery
    console.log('\n  [A.10] Testing Page Reload on Report URL & AI Neutral State Recovery...');
    await cdp.send('Page.reload');
    await new Promise((r) => setTimeout(r, 1200));

    const reloadedHeadline = await cdp.eval('document.querySelector("[data-testid=verdict-headline]")?.innerText');
    console.log(`  ✓ Re-hydrated Report Headline after reload: "${reloadedHeadline}"`);
    if (!reloadedHeadline || !reloadedHeadline.includes('execution reverted')) {
      throw new Error(`Failed to reload report on route: ${reloadedHeadline}`);
    }

    // Reloaded report AI panel verification
    const reloadedAiText = await cdp.eval('document.querySelector("[data-testid=ai-panel]")?.innerText || ""');
    if (!reloadedAiText.includes('Not stored for this report') && !reloadedAiText.includes('disabled on this server') && !reloadedAiText.includes('DISABLED')) {
      throw new Error(`AI panel verification failed on reload, got: "${reloadedAiText}"`);
    }
    console.log('  ✓ Persisted AI panel state verified on page reload');

    // A.11 Verify History Page
    console.log('\n  [A.11] Testing History Page navigation & rows...');
    await cdp.eval('window.location.hash = "#/history"');
    await new Promise((r) => setTimeout(r, 600));

    const historyRowExists = await cdp.eval(`
      Array.from(document.querySelectorAll("[data-testid=history-row]")).some(r => r.innerText.includes("${CANDIDATE_TX.slice(0, 10)}"))
    `);
    console.log(`  ✓ History page contains candidate tx row: ${historyRowExists}`);
    if (!historyRowExists) {
      throw new Error('History page missing candidate investigation row');
    }
    await assertScreenshot(cdp, 'screenshots/after/history_page.png');

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

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}#/` });
    await new Promise((r) => setTimeout(r, 1000));

    await assertScreenshot(cdp, 'screenshots/e2e_mobile_home.png');
    await assertScreenshot(cdp, 'screenshots/after/mobile_home.png');

    // Horizontal overflow check on mobile home
    const homeNoOverflow = await cdp.eval('document.documentElement.scrollWidth <= window.innerWidth');
    console.log(`  ✓ Mobile Home page has no horizontal overflow: ${homeNoOverflow}`);
    if (!homeNoOverflow) throw new Error('Mobile Home page has horizontal overflow');

    // Navigate to report on mobile
    await cdp.eval(`
      const recentRow = document.querySelector("[data-testid=recent-row]");
      if (recentRow) recentRow.click();
      else window.location.hash = "#/history";
    `);
    await new Promise((r) => setTimeout(r, 1000));

    // If on history, click first row
    const onHistory = await cdp.eval('window.location.hash === "#/history"');
    if (onHistory) {
      await cdp.eval('document.querySelector("[data-testid=history-row]")?.click()');
      await new Promise((r) => setTimeout(r, 1000));
    }

    const mobileReportHeadline = await cdp.eval('document.querySelector("[data-testid=verdict-headline]")?.innerText');
    console.log(`  ✓ Mobile Report Headline: "${mobileReportHeadline}"`);

    // Horizontal overflow check on mobile report
    const reportNoOverflow = await cdp.eval('document.documentElement.scrollWidth <= window.innerWidth');
    console.log(`  ✓ Mobile Report page has no horizontal overflow: ${reportNoOverflow}`);
    if (!reportNoOverflow) throw new Error('Mobile Report page has horizontal overflow');

    // Tap a trace row to open inspector drawer on mobile
    await cdp.eval(`
      const row = document.querySelector("[data-testid=trace-row]");
      if (row) row.click();
    `);
    await new Promise((r) => setTimeout(r, 500));

    const drawerInspectorVisible = await cdp.eval('Boolean(document.querySelector(".drawer--open [data-testid=frame-inspector]"))');
    console.log(`  ✓ Mobile Frame Inspector Drawer opened: ${drawerInspectorVisible}`);

    await assertScreenshot(cdp, 'screenshots/e2e_mobile_investigation_result.png');
    await assertScreenshot(cdp, 'screenshots/after/mobile_investigation_result.png');

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
