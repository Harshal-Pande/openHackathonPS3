#!/usr/bin/env node

import crypto from 'node:crypto';
import readline from 'node:readline';

const COST = 16384;     // N: 2^14
const BLOCK_SIZE = 8;   // r
const PARALLELISM = 1;  // p
const KEY_LEN = 32;     // 32-byte derived key

async function generateScryptHash(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LEN,
      {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELISM,
        maxmem: 128 * COST * BLOCK_SIZE * 2
      },
      (err, derived) => {
        if (err) reject(err);
        else resolve(derived);
      }
    );
  });

  return `scrypt$v=1$N=${COST}$r=${BLOCK_SIZE}$p=${PARALLELISM}$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

async function promptPassword() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    // Note: Node CLI password masking
    process.stdout.write('Enter operator password: ');
    process.stdin.setRawMode?.(true);

    let password = '';
    process.stdin.on('data', function onData(char) {
      char = char.toString();
      if (char === '\n' || char === '\r' || char === '\u0004') {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(password);
      } else if (char === '\u0003') {
        process.exit(1);
      } else if (char === '\u0008' || char === '\x7f') {
        if (password.length > 0) {
          password = password.slice(0, -1);
        }
      } else {
        password += char;
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    const testHash = 'scrypt$v=1$N=16384$r=8$p=1$MTIzNDU2Nzg5MDEyMzQ1Ng==$lz+/lmHQGUWcL7lg4806U5pUvi6ksAUVulQc8tB+0Mw=';
    console.log('\n--- RevertLens Test Operator Hash Example ---');
    console.log('Password:        test-operator-password');
    console.log('Encoded Hash:    ' + testHash);
    console.log('Usage:           Set OPERATOR_PASSWORD_HASH in test configurations.\n');
    return;
  }

  let password = '';
  const passArgIndex = args.indexOf('--password');
  if (passArgIndex !== -1 && args[passArgIndex + 1]) {
    password = args[passArgIndex + 1];
  } else if (process.env.OPERATOR_PASSWORD_INPUT) {
    password = process.env.OPERATOR_PASSWORD_INPUT;
  } else {
    password = await promptPassword();
  }

  if (!password || password.trim().length === 0) {
    console.error('Error: Password cannot be empty.');
    process.exit(1);
  }

  if (password.length < 12) {
    console.warn('Warning: Operator passwords should be at least 12 characters long.');
  }

  const hash = await generateScryptHash(password);

  console.log('\n=============================================================');
  console.log(' REVERTLENS OPERATOR PASSWORD HASH GENERATOR (scrypt v=1)');
  console.log('=============================================================');
  console.log('\nGenerated OPERATOR_PASSWORD_HASH:\n');
  console.log(`  ${hash}\n`);
  console.log('Configuration instructions:');
  console.log('  1. Copy the value above into your server environment variables or .env:');
  console.log(`     OPERATOR_PASSWORD_HASH="${hash}"`);
  console.log('  2. In production, configure this via your cloud provider dashboard.');
  console.log('  3. NEVER commit real passwords or hashes to Git.');
  console.log('=============================================================\n');
}

main().catch((err) => {
  console.error('Fatal error generating password hash:', err);
  process.exit(1);
});
