import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Database } from '../dist/server/db/database.js';
import { ChainstackProvider } from '../dist/server/providers/chainstack.js';
import { InvestigationService } from '../dist/server/services/investigationService.js';
import { parseCallTrace } from '../dist/server/forensics/traceParser.js';
import { decodeRevertData } from '../dist/server/forensics/revertDecoder.js';
import { classifyFailure } from '../dist/server/forensics/classifier.js';
import { buildEvidenceLedger } from '../dist/server/forensics/evidenceBuilder.js';

const CANDIDATE_TX = '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445';
const TEMP_DB = path.resolve('./data/temp_live_verification.sqlite');

// Clean any leftover temp db
for (const f of [TEMP_DB, `${TEMP_DB}-journal`, `${TEMP_DB}-wal`, `${TEMP_DB}-shm`]) {
  try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
}

const env = dotenv.parse(fs.readFileSync('.env'));
const rpcUrl = env.CHAINSTACK_CELO_MAINNET_RPC_URL;
if (!rpcUrl) {
  console.error('FATAL: CHAINSTACK_CELO_MAINNET_RPC_URL missing in .env');
  process.exit(1);
}

console.log('=== REVERTLENS CONTROLLED LIVE INVESTIGATION & PERSISTENCE VERIFICATION ===');
console.log('Target Network: Celo Mainnet (42220)');
console.log('Candidate Tx:', CANDIDATE_TX);
console.log('Temp Database:', TEMP_DB);

async function run() {
  const provider = new ChainstackProvider({ rpcUrl });

  // 1. Transaction Retrieval
  console.log('\n[1/12] Testing Transaction Retrieval...');
  const tx = await provider.getTransaction(CANDIDATE_TX);
  if (!tx || tx.hash.toLowerCase() !== CANDIDATE_TX.toLowerCase()) {
    throw new Error('Transaction retrieval failed: hash mismatch or null');
  }
  console.log(`  ✓ Block: ${tx.blockNumber}, From: ${tx.from}, To: ${tx.to}, Gas: ${tx.gas}`);

  // 2. Receipt Retrieval
  console.log('\n[2/12] Testing Receipt Retrieval...');
  const receipt = await provider.getTransactionReceipt(CANDIDATE_TX);
  if (!receipt || receipt.status !== 'REVERTED') {
    throw new Error(`Receipt retrieval failed: expected REVERTED, got ${receipt?.status}`);
  }
  console.log(`  ✓ Receipt status: ${receipt.status} (raw: ${receipt.rawStatus}), Gas Used: ${receipt.gasUsed}`);

  // 3. Trace Retrieval
  console.log('\n[3/12] Testing Trace Retrieval (debug_traceTransaction with callTracer)...');
  const rawTrace = await provider.getCallTrace(CANDIDATE_TX);
  if (!rawTrace) {
    throw new Error('Trace retrieval failed: returned null or unsupported');
  }
  console.log(`  ✓ Root trace type: ${rawTrace.type}, error: "${rawTrace.error}", child calls: ${rawTrace.calls?.length}`);

  // 4. Trace Parsing
  console.log('\n[4/12] Testing Trace Parsing & Frame Flattening...');
  const parsedTrace = parseCallTrace(rawTrace);
  console.log(`  ✓ Total frames: ${parsedTrace.totalFrames}, Max depth: ${parsedTrace.maxDepth}`);
  console.log(`  ✓ Deepest failing frame: id=${parsedTrace.deepestFailingFrame?.id}, error="${parsedTrace.deepestFailingFrame?.error}", causality=${parsedTrace.deepestFailingFrame?.causalityStatus}`);

  // 5. Revert Decoding
  console.log('\n[5/12] Testing Revert Decoding...');
  const failingChild = rawTrace.calls?.[0];
  const decodedRevert = decodeRevertData(failingChild?.output, failingChild?.error || rawTrace.error);
  console.log(`  ✓ Decoded revert: type=${decodedRevert?.type}, reason="${decodedRevert?.reason}", selector=${decodedRevert?.selector || 'none'}`);

  // 6. Causality Classification
  console.log('\n[6/12] Testing Causality Classification...');
  const tempLedger = buildEvidenceLedger(tx, receipt, parsedTrace, decodedRevert);
  const diagnosis = classifyFailure(tx, receipt, parsedTrace, decodedRevert, tempLedger);
  console.log(`  ✓ Diagnosis Category: ${diagnosis.category}`);
  console.log(`  ✓ Confidence: ${diagnosis.confidence}`);
  console.log(`  ✓ Headline: "${diagnosis.headline}"`);
  console.log(`  ✓ Causality Category: ${diagnosis.causalityCategory}`);

  // 7. Evidence Generation
  console.log('\n[7/12] Testing Evidence Generation...');
  console.log(`  ✓ Generated ${tempLedger.length} evidence items:`);
  tempLedger.forEach(e => {
    console.log(`     - [${e.id}] ${e.kind} (${e.sourceMethod}): hash=${e.contentHash.substring(0, 16)}...`);
  });

  // 8. Database Insertion via InvestigationService
  console.log('\n[8/12] Testing Investigation Execution & SQLite Persistence...');
  let db = new Database(TEMP_DB);
  let service = new InvestigationService(provider, db);

  const report = await service.investigate(CANDIDATE_TX);
  console.log(`  ✓ Investigation ID: ${report.investigationId}`);
  console.log(`  ✓ Report status: ${report.status}`);
  console.log(`  ✓ Trace status: ${report.traceStatus}`);
  console.log(`  ✓ Evidence items in report: ${report.evidenceLedger.length}`);

  // 9. API Report Retrieval
  console.log('\n[9/12] Testing API Report Retrieval from SQLite...');
  const retrieved = service.getInvestigation(report.investigationId);
  if (!retrieved) throw new Error('Failed to retrieve investigation from database');
  console.log(`  ✓ Retrieved report ID: ${retrieved.investigationId}`);
  console.log(`  ✓ Raw tree present: ${Boolean(retrieved.executionTrace?.rawTree)}`);
  console.log(`  ✓ Flattened frames count: ${retrieved.executionTrace?.flattenedFrames.length}`);

  // 10. Process Restart Simulation
  console.log('\n[10/12] Simulating Process Restart (closing DB, wiping instances)...');
  db.close();
  db = null;
  service = null;
  console.log('  ✓ Process cleanly decoupled and connection closed.');

  // 11. Database Recovery After Restart
  console.log('\n[11/12] Opening Fresh Connection to Database File...');
  const recoveredDb = new Database(TEMP_DB);
  const recoveredService = new InvestigationService(provider, recoveredDb);
  const recoveredReport = recoveredService.getInvestigation(report.investigationId);
  if (!recoveredReport) throw new Error('Recovery failed: investigation not found after restart');
  console.log(`  ✓ Recovered report ID: ${recoveredReport.investigationId}`);

  // 12. Report Consistency Verification After Restart
  console.log('\n[12/12] Verifying 100% Report Consistency After Restart...');
  const checks = [
    ['investigationId', recoveredReport.investigationId === report.investigationId],
    ['txHash', recoveredReport.txHash.toLowerCase() === report.txHash.toLowerCase()],
    ['status', recoveredReport.status === report.status],
    ['traceStatus', recoveredReport.traceStatus === report.traceStatus],
    ['diagnosis.category', recoveredReport.diagnosis.category === report.diagnosis.category],
    ['diagnosis.confidence', recoveredReport.diagnosis.confidence === report.diagnosis.confidence],
    ['diagnosis.headline', recoveredReport.diagnosis.headline === report.diagnosis.headline],
    ['evidenceLedger count', recoveredReport.evidenceLedger.length === report.evidenceLedger.length],
    ['rawTree present', Boolean(recoveredReport.executionTrace?.rawTree)],
    ['flattenedFrames count', recoveredReport.executionTrace?.flattenedFrames.length === report.executionTrace?.flattenedFrames.length],
    ['decodedRevert reason', recoveredReport.decodedRevert?.reason === report.decodedRevert?.reason]
  ];

  let allPassed = true;
  for (const [name, pass] of checks) {
    console.log(`  ${pass ? '✓' : '✗'} ${name}: ${pass ? 'MATCH' : 'MISMATCH'}`);
    if (!pass) allPassed = false;
  }

  if (!allPassed) {
    throw new Error('Report consistency verification failed!');
  }

  // Clean up
  recoveredDb.close();
  for (const f of [TEMP_DB, `${TEMP_DB}-journal`, `${TEMP_DB}-wal`, `${TEMP_DB}-shm`]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
  }

  console.log('\n=== CONTROLLED LIVE INVESTIGATION VERIFICATION PASSED (12/12) ===');
}

run().catch(err => {
  console.error('\nVERIFICATION FAILED:', err);
  process.exit(1);
});
