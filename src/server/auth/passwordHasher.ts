import crypto from 'node:crypto';

export interface ScryptOptions {
  cost: number;        // N: CPU/memory cost parameter (must be power of 2)
  blockSize: number;   // r: block size parameter
  parallelism: number; // p: parallelization parameter
  keyLen: number;      // derived key length in bytes
  salt?: Buffer;
}

export interface ScryptParsedParams {
  version: number;
  cost: number;
  blockSize: number;
  parallelism: number;
  salt: Buffer;
  derivedKey: Buffer;
}

// Recommended production defaults conforming to OWASP guidelines
export const DEFAULT_SCRYPT_OPTIONS: ScryptOptions = {
  cost: 16384,     // 2^14
  blockSize: 8,
  parallelism: 1,
  keyLen: 32
};

const HASH_PREFIX = 'scrypt$v=1$';

/**
 * Validates and parses a serialized scrypt password hash.
 * Expected format: scrypt$v=1$N=<cost>$r=<blockSize>$p=<parallelism>$<salt-base64>$<derived-key-base64>
 */
export function parseScryptHash(encodedHash: string): ScryptParsedParams | null {
  if (typeof encodedHash !== 'string' || !encodedHash.startsWith(HASH_PREFIX)) {
    return null;
  }

  const parts = encodedHash.split('$');
  // Format splits into 7 parts: ['scrypt', 'v=1', 'N=<cost>', 'r=<blockSize>', 'p=<parallelism>', '<salt>', '<key>']
  if (parts.length !== 7) {
    return null;
  }

  if (parts[0] !== 'scrypt' || parts[1] !== 'v=1') {
    return null;
  }

  if (!parts[2].startsWith('N=') || !parts[3].startsWith('r=') || !parts[4].startsWith('p=')) {
    return null;
  }

  const cost = parseInt(parts[2].slice(2), 10);
  const blockSize = parseInt(parts[3].slice(2), 10);
  const parallelism = parseInt(parts[4].slice(2), 10);

  // Validate scrypt parameter ranges
  if (!Number.isInteger(cost) || cost <= 1 || (cost & (cost - 1)) !== 0 || cost > 1048576) {
    return null;
  }
  if (!Number.isInteger(blockSize) || blockSize < 1 || blockSize > 32) {
    return null;
  }
  if (!Number.isInteger(parallelism) || parallelism < 1 || parallelism > 16) {
    return null;
  }

  if (!parts[5] || !parts[6]) {
    return null;
  }

  try {
    const salt = Buffer.from(parts[5], 'base64');
    const derivedKey = Buffer.from(parts[6], 'base64');

    if (salt.length < 16 || derivedKey.length < 16) {
      return null;
    }

    return {
      version: 1,
      cost,
      blockSize,
      parallelism,
      salt,
      derivedKey
    };
  } catch {
    return null;
  }
}

/**
 * Inspects a candidate hash string for production validation.
 */
export function validateScryptHashFormat(encodedHash: string): { valid: boolean; reason?: string } {
  if (typeof encodedHash !== 'string' || encodedHash.trim() === '') {
    return { valid: false, reason: 'Hash cannot be empty or non-string.' };
  }

  if (!encodedHash.startsWith('scrypt$')) {
    return { valid: false, reason: 'Hash must start with "scrypt$".' };
  }

  if (!encodedHash.startsWith('scrypt$v=1$')) {
    return { valid: false, reason: 'Unsupported scrypt hash version. Only v=1 is supported.' };
  }

  const parsed = parseScryptHash(encodedHash);
  if (!parsed) {
    return { valid: false, reason: 'Malformed scrypt hash structure, invalid parameters or base64 corruption.' };
  }

  return { valid: true };
}

/**
 * Asynchronously hashes a password using Node.js crypto.scrypt with a random salt.
 */
export async function hashPassword(
  password: string,
  options: Partial<ScryptOptions> = {}
): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string.');
  }

  const cost = options.cost ?? DEFAULT_SCRYPT_OPTIONS.cost;
  const blockSize = options.blockSize ?? DEFAULT_SCRYPT_OPTIONS.blockSize;
  const parallelism = options.parallelism ?? DEFAULT_SCRYPT_OPTIONS.parallelism;
  const keyLen = options.keyLen ?? DEFAULT_SCRYPT_OPTIONS.keyLen;
  const salt = options.salt ?? crypto.randomBytes(16);

  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      keyLen,
      {
        N: cost,
        r: blockSize,
        p: parallelism,
        maxmem: 128 * cost * blockSize * 2
      },
      (err, derived) => {
        if (err) reject(err);
        else resolve(derived as Buffer);
      }
    );
  });

  return `scrypt$v=1$N=${cost}$r=${blockSize}$p=${parallelism}$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

/**
 * Asynchronously verifies a candidate password against an encoded scrypt hash in constant time.
 * Never throws on malformed hashes; returns false safely.
 */
export async function verifyPassword(
  password: string,
  encodedHash: string
): Promise<boolean> {
  if (typeof password !== 'string' || password.length === 0) {
    return false;
  }

  const params = parseScryptHash(encodedHash);
  if (!params) {
    return false;
  }

  try {
    const candidateKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(
        password,
        params.salt,
        params.derivedKey.length,
        {
          N: params.cost,
          r: params.blockSize,
          p: params.parallelism,
          maxmem: 128 * params.cost * params.blockSize * 2
        },
        (err, derived) => {
          if (err) reject(err);
          else resolve(derived as Buffer);
        }
      );
    });

    if (candidateKey.length !== params.derivedKey.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateKey, params.derivedKey);
  } catch {
    return false;
  }
}
