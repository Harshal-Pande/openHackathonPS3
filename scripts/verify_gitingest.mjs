#!/usr/bin/env node

/**
 * Independent Standalone Verifier for RevertLens Gitingest Snapshot & Manifests.
 * Reads the generated snapshot and manifest from disk and independently asserts all 17 conditions.
 * Fails closed with exit code 1 if any discrepancy or violation is detected.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const SNAPSHOT_FILENAME = 'revertlens_mod05a_1_gitingest.txt';
const MANIFEST_JSON_FILENAME = 'revertlens_mod05a_1_gitingest_manifest.json';
const MANIFEST_MD_FILENAME = 'revertlens_mod05a_1_gitingest_manifest.md';

const SNAPSHOT_PATH = path.join(REPO_ROOT, SNAPSHOT_FILENAME);
const MANIFEST_JSON_PATH = path.join(REPO_ROOT, MANIFEST_JSON_FILENAME);
const MANIFEST_MD_PATH = path.join(REPO_ROOT, MANIFEST_MD_FILENAME);

function fail(message) {
  console.error(`âŒ VERIFICATION FAILURE: ${message}`);
  process.exit(1);
}

function pass(checkName, detail = '') {
  console.log(`âœ“ [PASS] ${checkName}${detail ? ` (${detail})` : ''}`);
}

async function verify() {
  console.log('Running independent Gitingest snapshot & manifest verification...');

  // 1. Manifest JSON exists and parses
  if (!fs.existsSync(MANIFEST_JSON_PATH)) {
    fail(`Manifest JSON does not exist at ${MANIFEST_JSON_PATH}`);
  }
  let manifest;
  try {
    const raw = fs.readFileSync(MANIFEST_JSON_PATH, 'utf8');
    manifest = JSON.parse(raw);
    pass('1. Manifest JSON parses cleanly', `${manifest.expected_file_count} files listed`);
  } catch (err) {
    fail(`Manifest JSON parse failed: ${err.message}`);
  }

  // 2. Snapshot file exists
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    fail(`Snapshot file does not exist at ${SNAPSHOT_PATH}`);
  }
  pass('2. Snapshot file exists', SNAPSHOT_PATH);

  // Read snapshot bytes and content
  const snapshotBuffer = fs.readFileSync(SNAPSHOT_PATH);
  const snapshotContent = snapshotBuffer.toString('utf8');
  const snapshotStats = fs.statSync(SNAPSHOT_PATH);

  // 3. Snapshot SHA-256 matches manifest
  const actualSnapshotSha256 = crypto.createHash('sha256').update(snapshotBuffer).digest('hex');
  if (actualSnapshotSha256 !== manifest.snapshot_sha256) {
    fail(`Snapshot SHA-256 mismatch: actual ${actualSnapshotSha256} vs manifest ${manifest.snapshot_sha256}`);
  }
  pass('3. Snapshot SHA-256 matches manifest', actualSnapshotSha256);

  // 4. Snapshot byte count matches manifest
  if (snapshotStats.size !== manifest.snapshot_bytes) {
    fail(`Snapshot byte size mismatch: actual ${snapshotStats.size} vs manifest ${manifest.snapshot_bytes}`);
  }
  pass('4. Snapshot byte size matches manifest', `${snapshotStats.size} bytes`);

  // 5. Snapshot line count matches manifest
  const actualLines = snapshotContent.split('\n').length;
  if (actualLines !== manifest.snapshot_lines) {
    fail(`Snapshot line count mismatch: actual ${actualLines} vs manifest ${manifest.snapshot_lines}`);
  }
  pass('5. Snapshot line count matches manifest', `${actualLines} lines`);

  // 6. Directory-tree paths parse correctly
  const dirMatch = snapshotContent.match(/Directory Structure:\n=+([\s\S]*?)\n=+\n/);
  if (!dirMatch) {
    fail('Could not parse Directory Structure section in snapshot');
  }
  const treePaths = dirMatch[1]
    .trim()
    .split('\n')
    .map((l) => l.trim().replace(/\\/g, '/'))
    .filter(Boolean);

  if (treePaths.length !== manifest.directory_tree_file_count) {
    fail(`Tree paths count mismatch: parsed ${treePaths.length} vs manifest ${manifest.directory_tree_file_count}`);
  }
  pass('6. Directory tree paths parse correctly', `${treePaths.length} paths parsed`);

  // 7. Content-section paths parse correctly
  const sectionMatches = [...snapshotContent.matchAll(/^=+\nFile: (.*)\n=+/gm)].map((m) =>
    m[1].trim().replace(/\\/g, '/')
  );
  if (sectionMatches.length !== manifest.content_section_file_count) {
    fail(
      `Content sections count mismatch: parsed ${sectionMatches.length} vs manifest ${manifest.content_section_file_count}`
    );
  }
  pass('7. Content-section paths parse correctly', `${sectionMatches.length} sections parsed`);

  // 8. Expected filesystem paths match both parsed sets (Set A === Set B === Set C)
  const manifestPaths = manifest.files.map((f) => f.path.replace(/\\/g, '/')).sort();
  const sortedTree = [...treePaths].sort();
  const sortedSections = [...sectionMatches].sort();

  if (manifestPaths.length !== sortedTree.length || manifestPaths.length !== sortedSections.length) {
    fail(
      `Path set cardinality mismatch: manifest ${manifestPaths.length}, tree ${sortedTree.length}, sections ${sortedSections.length}`
    );
  }

  for (let i = 0; i < manifestPaths.length; i++) {
    if (manifestPaths[i] !== sortedTree[i]) {
      fail(`Path mismatch between manifest and tree at [${i}]: '${manifestPaths[i]}' vs '${sortedTree[i]}'`);
    }
    if (manifestPaths[i] !== sortedSections[i]) {
      fail(`Path mismatch between manifest and sections at [${i}]: '${manifestPaths[i]}' vs '${sortedSections[i]}'`);
    }
  }
  pass('8. Exact path-set equality verified (Set A === Set B === Set C)', `${manifestPaths.length} paths matched bit-for-bit`);

  // 9. No duplicate paths exist
  const checkDuplicates = (arr, label) => {
    const seen = new Set();
    const dups = [];
    arr.forEach((p) => {
      if (seen.has(p)) dups.push(p);
      seen.add(p);
    });
    if (dups.length > 0) {
      fail(`Duplicate paths found in ${label}: ${dups.join(', ')}`);
    }
  };
  checkDuplicates(treePaths, 'Directory tree');
  checkDuplicates(sectionMatches, 'Content sections');
  pass('9. Zero duplicate paths in directory tree or content sections');

  // 10 & 11. No missing or unexpected paths
  const manifestSet = new Set(manifestPaths);
  const missingTree = manifestPaths.filter((p) => !new Set(treePaths).has(p));
  const missingSections = manifestPaths.filter((p) => !new Set(sectionMatches).has(p));
  const unexpectedTree = treePaths.filter((p) => !manifestSet.has(p));
  const unexpectedSections = sectionMatches.filter((p) => !manifestSet.has(p));

  if (missingTree.length > 0 || missingSections.length > 0) {
    fail(`Missing paths detected: tree=[${missingTree}], sections=[${missingSections}]`);
  }
  if (unexpectedTree.length > 0 || unexpectedSections.length > 0) {
    fail(`Unexpected paths detected: tree=[${unexpectedTree}], sections=[${unexpectedSections}]`);
  }
  pass('10 & 11. Zero missing and zero unexpected paths confirmed');

  // 12. No read errors recorded or encountered
  if (manifest.read_errors && manifest.read_errors.length > 0) {
    fail(`Manifest records read errors: ${JSON.stringify(manifest.read_errors)}`);
  }
  if (snapshotContent.split('\n').some((line) => line.trim().startsWith('[Error reading file:'))) {
    fail('Snapshot contains placeholder read error banner');
  }
  pass('12. Zero read errors recorded or present in artifact');

  // 13. All per-file hashes match source on disk
  for (const fileEntry of manifest.files) {
    const fullPath = path.join(REPO_ROOT, fileEntry.path);
    if (!fs.existsSync(fullPath)) {
      fail(`Source file missing on disk: ${fileEntry.path}`);
    }
    const sourceBuf = fs.readFileSync(fullPath);
    const actualHash = crypto.createHash('sha256').update(sourceBuf).digest('hex');
    if (actualHash !== fileEntry.source_sha256) {
      fail(`Source hash mismatch for ${fileEntry.path}: disk ${actualHash} vs manifest ${fileEntry.source_sha256}`);
    }
  }
  pass('13. Per-file hashes match source disk files bit-for-bit', `${manifest.files.length} files checked`);

  // 14. Mandatory governance documents (10 documents) verified
  const MANDATORY_DOCUMENTS = [
    'MASTER_CHANGELOG.md',
    'MASTER_PROJECT_AUDIT.md',
    'MASTER_DEFECT_REGISTER.md',
    'MASTER_EXECUTION_ROADMAP.md',
    'MASTER_REQUIREMENTS_TRACEABILITY.md',
    'MASTER_RELEASE_GATE.md',
    'SECURITY.md',
    'TEST_RESULTS.md',
    'PROOF.md',
    'README.md'
  ];

  for (const doc of MANDATORY_DOCUMENTS) {
    const diskPath = path.join(REPO_ROOT, doc);
    if (!fs.existsSync(diskPath)) {
      fail(`Mandatory governance document missing on disk: ${doc}`);
    }
    const entry = manifest.files.find((f) => f.path === doc);
    if (!entry) {
      fail(`Mandatory governance document missing from manifest: ${doc}`);
    }
    if (!treePaths.includes(doc)) {
      fail(`Mandatory governance document missing from snapshot directory tree: ${doc}`);
    }
    if (!sectionMatches.includes(doc)) {
      fail(`Mandatory governance document missing from snapshot content sections: ${doc}`);
    }
  }
  pass('14. All 10 mandatory governance documents verified in disk, manifest, tree, and content sections');


  // 15. Phase 25.4 is present in changelog content
  const changelogDiskContent = fs.readFileSync(path.join(REPO_ROOT, 'MASTER_CHANGELOG.md'), 'utf8');
  if (!changelogDiskContent.includes('Phase 25.4')) {
    fail('MASTER_CHANGELOG.md source does not contain Phase 25.4');
  }
  if (!snapshotContent.includes('Phase 25.4')) {
    fail('Snapshot section for MASTER_CHANGELOG.md does not contain Phase 25.4');
  }
  pass('15. Phase 25.4 entry is verified present in source and snapshot');

  // 16. Snapshot excludes itself and the manifests
  const illegalArtifacts = [SNAPSHOT_FILENAME, MANIFEST_JSON_FILENAME, MANIFEST_MD_FILENAME];
  illegalArtifacts.forEach((art) => {
    if (treePaths.includes(art)) {
      fail(`Self-inclusion violation: directory tree contains ${art}`);
    }
    if (sectionMatches.includes(art)) {
      fail(`Self-inclusion violation: content sections contain ${art}`);
    }
  });
  pass('16. Strict self-exclusion confirmed (snapshot and manifests excluded)');

  // 17. Commit SHA recorded in manifest matches git rev-parse HEAD
  let currentGitHead = '';
  try {
    currentGitHead = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: REPO_ROOT }).trim();
  } catch (err) {
    fail(`Could not query git rev-parse HEAD: ${err.message}`);
  }

  if (manifest.commit_sha !== currentGitHead) {
    fail(`Commit SHA mismatch: manifest records ${manifest.commit_sha} vs current git HEAD ${currentGitHead}`);
  }
  pass('17. Commit SHA matches current Git HEAD', currentGitHead);

  console.log('\n======================================================');
  console.log('âœ… ALL 17 INDEPENDENT SNAPSHOT VERIFICATION CHECKS PASSED');
  console.log(`   Snapshot:   ${SNAPSHOT_FILENAME} (${(snapshotStats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   SHA-256:    ${manifest.snapshot_sha256}`);
  console.log(`   Files:      ${manifest.expected_file_count} files verified`);
  console.log(`   Commit:     ${currentGitHead}`);
  console.log('======================================================\n');
}

verify().catch((err) => {
  console.error('Fatal verifier error:', err);
  process.exit(1);
});
