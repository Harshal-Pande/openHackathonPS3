#!/usr/bin/env node
import crypto from 'node:crypto';

const password = process.argv[2] || crypto.randomBytes(18).toString('base64url');
const isGenerated = !process.argv[2];

const salt = crypto.randomBytes(16);
const cost = 16384;
const blockSize = 8;
const parallelism = 1;
const keyLen = 32;

crypto.scrypt(
  password,
  salt,
  keyLen,
  {
    N: cost,
    r: blockSize,
    p: parallelism,
    maxmem: 64 * 1024 * 1024
  },
  (err, derivedKey) => {
    if (err) {
      console.error('Scrypt error:', err.message);
      process.exit(1);
    }
    const hash = `scrypt$v=1$N=${cost}$r=${blockSize}$p=${parallelism}$${salt.toString('base64')}$${derivedKey.toString('base64')}`;

    console.log('\n======================================================');
    console.log('RevertLens — Secure Operator Hash Generator');
    console.log('======================================================');
    if (isGenerated) {
      console.log(`Generated Password:      ${password}`);
      console.log('IMPORTANT: Record this password. You will need it to log into /operator.');
    } else {
      console.log('Password:                [HIDDEN USER-SUPPLIED]');
    }
    console.log(`OPERATOR_PASSWORD_HASH:  ${hash}`);
    console.log('======================================================\n');
  }
);
