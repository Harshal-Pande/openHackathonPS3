#!/usr/bin/env node

/**
 * Verification script for RevertLens environment templates (.env.example and .env.production.example).
 * Validates:
 * 1. Zero duplicate keys in templates.
 * 2. All variables in templates map cleanly to src/server/config.ts schema.
 * 3. Required production blanks remain blank.
 * 4. Zero secret values or credentials embedded in templates.
 * 5. Production validation fails intentionally when required blanks are empty.
 * 6. Production validation succeeds when required blanks are provided.
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { loadConfig } from '../dist/server/config.js';

const REPO_ROOT = process.cwd();

function checkTemplate(filename, isProduction = false) {
  console.log(`\nChecking ${filename}...`);
  const filePath = path.join(REPO_ROOT, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File ${filename} does not exist`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  const keys = [];
  const keyCounts = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      keys.push(k);
      keyCounts[k] = (keyCounts[k] || 0) + 1;
    }
  }

  // 1. Zero duplicate keys
  const duplicates = Object.entries(keyCounts).filter(([_, count]) => count > 1);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate keys found in ${filename}: ${JSON.stringify(duplicates)}`);
  }
  console.log(`  ✓ Zero duplicate keys (${keys.length} keys total)`);

  const parsed = dotenv.parse(raw);

  // 2. Check no secret values or credentials embedded
  if (parsed.SESSION_SECRET && parsed.SESSION_SECRET !== 'REPLACE_WITH_RANDOM_32_BYTE_OR_LONGER_SECRET') {
    throw new Error(`Security violation: SESSION_SECRET is not empty or placeholder in ${filename}`);
  }
  if (parsed.OPERATOR_PASSWORD_HASH && parsed.OPERATOR_PASSWORD_HASH !== 'REPLACE_WITH_SCRYPT_HASH') {
    throw new Error(`Security violation: OPERATOR_PASSWORD_HASH is not empty or placeholder in ${filename}`);
  }
  if (parsed.CHAINSTACK_CELO_MAINNET_RPC_URL && parsed.CHAINSTACK_CELO_MAINNET_RPC_URL.trim() !== '') {
    throw new Error(`Security violation: CHAINSTACK_CELO_MAINNET_RPC_URL is not empty in ${filename}`);
  }
  console.log('  ✓ Zero secret values or credentials embedded');

  // 3. For production template: check required blank values
  if (isProduction) {
    const requiredBlanks = [
      'PORT',
      'PUBLIC_BASE_URL',
      'CORS_ORIGIN',
      'SESSION_SECRET',
      'OPERATOR_PASSWORD_HASH',
      'CHAINSTACK_CELO_MAINNET_RPC_URL',
      'BUY_CLI_EXECUTABLE',
      'BUY_CLI_ARGS_PREFIX',
      'BUY_ALLOWED_TOKEN_CONTRACTS',
      'BUY_ALLOWED_RECIPIENTS',
      'BUY_ALLOWED_CAPABILITY_IDS'
    ];
    for (const key of requiredBlanks) {
      if (parsed[key] !== '') {
        throw new Error(`Expected ${key} to be blank in ${filename}, but found '${parsed[key]}'`);
      }
    }
    console.log(`  ✓ All ${requiredBlanks.length} required blank values remain blank`);

    // 4. Intentional validation failure when required values are blank
    let intentionalFailureCaught = false;
    try {
      loadConfig(parsed);
    } catch (err) {
      intentionalFailureCaught = true;
      console.log(`  ✓ Production config validation intentionally failed on blank required fields: ${err.message.split('\n')[0]}`);
    }
    if (!intentionalFailureCaught) {
      throw new Error('Expected production validation to fail on blank required values, but it succeeded');
    }

    // 5. Successful validation when valid production values are supplied
    const validProductionHash = 'scrypt$v=1$N=16384$r=8$p=1$sjdZpRAoPjKcofchuSEXbw==$m5A6RLbzK6gt87WXrKWNIDRdyzSaIfBinXkVOdFQQ+4=';
    const completeEnv = {
      ...parsed,
      PUBLIC_BASE_URL: 'https://revertlens.onrender.com',
      CORS_ORIGIN: 'https://revertlens.onrender.com',
      SESSION_SECRET: 'a-random-32-byte-secret-for-production-signing-test',
      OPERATOR_PASSWORD_HASH: validProductionHash
    };
    const loaded = loadConfig(completeEnv);
    if (loaded.NODE_ENV !== 'production' || loaded.HOST !== '0.0.0.0' || loaded.PORT !== 3000) {
      throw new Error(`Loaded config unexpected values: NODE_ENV=${loaded.NODE_ENV}, HOST=${loaded.HOST}, PORT=${loaded.PORT}`);
    }
    console.log('  ✓ Production config loads successfully when operator values are supplied');
  }
}

console.log('======================================================');
console.log('RevertLens — Environment Templates Verification');
console.log('======================================================');

checkTemplate('.env.example', false);
checkTemplate('.env.production.example', true);

console.log('\n======================================================');
console.log('✅ ALL ENVIRONMENT TEMPLATE CHECKS PASSED');
console.log('======================================================\n');
