#!/usr/bin/env node

/**
 * Generates an authoritative Gitingest-formatted text digest of the repository.
 * Formats directory tree and file contents with standard Gitingest separator banners.
 * Excludes sensitive files, databases, build artifacts, dependencies, and temporary files.
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const OUTPUT_FILE = path.join(REPO_ROOT, 'revertlens_mod03_4_gitingest.txt');

// Strict exclusion patterns
const EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  'data',
  '.git',
  '.idea',
  '.vscode',
  '.gemini',
  'brain',
  'coverage',
  'screenshots'
]);

const EXCLUDE_FILES = new Set([
  '.env',
  '.env.local',
  '.DS_Store',
  'revertlens_mod02_gitingest.txt',
  'revertlens_mod03_gitingest.txt',
  'revertlens_mod03_2_gitingest.txt',
  'revertlens_mod03_3_gitingest.txt',
  'revertlens_mod03_4_gitingest.txt'
]);

const EXCLUDE_EXTENSIONS = new Set([
  '.sqlite',
  '.sqlite-wal',
  '.sqlite-shm',
  '.sqlite-journal',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.tar',
  '.zip',
  '.gz',
  '.log'
]);

function shouldIncludeFile(filePath) {
  const baseName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (EXCLUDE_FILES.has(baseName)) return false;
  if (EXCLUDE_EXTENSIONS.has(ext)) return false;
  if (baseName.startsWith('.env')) return false;

  return true;
}

function walkDir(currentDir, relativeRoot = '') {
  const results = [];
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.join(relativeRoot, entry.name).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      results.push(...walkDir(fullPath, relPath));
    } else if (entry.isFile()) {
      if (shouldIncludeFile(fullPath)) {
        results.push({ fullPath, relPath });
      }
    }
  }

  return results;
}

function generateDirectoryTree(files) {
  const treeLines = [];
  treeLines.push('Directory Structure:');
  treeLines.push('================================================');

  const sortedPaths = files.map((f) => f.relPath).sort();
  for (const p of sortedPaths) {
    treeLines.push(`  ${p}`);
  }

  treeLines.push('================================================\n');
  return treeLines.join('\n');
}

async function main() {
  console.log('Generating fresh Gitingest snapshot for MOD-03.4...');

  const files = walkDir(REPO_ROOT);
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));

  const outputStream = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf8' });

  // 1. Header & Directory Tree
  outputStream.write(`Repository: RevertLens\n`);
  outputStream.write(`Snapshot Generated: ${new Date().toISOString()}\n`);
  outputStream.write(`Module: MOD-03.4 (Final Payment-Proof Integrity Remediation)\n`);
  outputStream.write(`Included Files: ${files.length}\n\n`);

  const tree = generateDirectoryTree(files);
  outputStream.write(tree);

  // 2. File Contents
  for (const file of files) {
    outputStream.write(`================================================\n`);
    outputStream.write(`File: ${file.relPath}\n`);
    outputStream.write(`================================================\n`);

    try {
      const content = fs.readFileSync(file.fullPath, 'utf8');
      outputStream.write(content);
      if (!content.endsWith('\n')) {
        outputStream.write('\n');
      }
    } catch (err) {
      outputStream.write(`[Error reading file: ${err.message}]\n`);
    }

    outputStream.write('\n');
  }

  outputStream.end();

  await new Promise((resolve) => outputStream.on('finish', resolve));

  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`✓ Snapshot generated successfully:`);
  console.log(`  File:     ${OUTPUT_FILE}`);
  console.log(`  Size:     ${(stats.size / 1024 / 1024).toFixed(2)} MB (${stats.size} bytes)`);
  console.log(`  Files:    ${files.length} tracked files included`);
}

main().catch((err) => {
  console.error('Fatal error generating Gitingest snapshot:', err);
  process.exit(1);
});
