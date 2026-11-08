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

/**
 * Reviewed Production Policy for scrypt password hashing (OWASP aligned):
 * - Cost (N): Power of 2, between 1024 (2^10) and 65536 (2^16). Default: 16384 (2^14).
 * - Block size (r): between 1 and 16. Default: 8.
 * - Parallelism (p): between 1 and 4. Default: 1.
 * - Salt length: strictly 16 bytes.
 * - Derived key length: strictly 32 bytes.
 * - Maximum memory budget: 64 MiB (67,108,864 bytes).
 */
export const SCRYPT_POLICY = {
  MIN_COST: 1024,
  MAX_COST: 65536,
  DEFAULT_COST: 16384,
  MIN_BLOCK_SIZE: 1,
  MAX_BLOCK_SIZE: 16,
  DEFAULT_BLOCK_SIZE: 8,
  MIN_PARALLELISM: 1,
  MAX_PARALLELISM: 4,
  DEFAULT_PARALLELISM: 1,
  REQUIRED_SALT_BYTES: 16,
  REQUIRED_KEY_BYTES: 32,
  MAX_MEMORY_BUDGET_BYTES: 64 * 1024 * 1024 // 64 MiB
} as const;

export const DEFAULT_SCRYPT_OPTIONS: ScryptOptions = {
  cost: SCRYPT_POLICY.DEFAULT_COST,
  blockSize: SCRYPT_POLICY.DEFAULT_BLOCK_SIZE,
  parallelism: SCRYPT_POLICY.DEFAULT_PARALLELISM,
  keyLen: SCRYPT_POLICY.REQUIRED_KEY_BYTES
};

const HASH_PREFIX = 'scrypt$v=1$';
const STRICT_DECIMAL_REGEX = /^[1-9]\d*$/;
const BASE64_CHAR_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Strictly parses a decimal string without permissive trailing junk, signs, or whitespace.
 */
function parseStrictDecimal(str: string): number | null {
  if (typeof str !== 'string' || !STRICT_DECIMAL_REGEX.test(str)) {
    return null;
  }
  const val = Number(str);
  if (!Number.isSafeInteger(val) || val <= 0) {
    return null;
  }
  return val;
}

/**
 * Enforces canonical Base64 encoding by checking valid characters, 4-byte alignment,
 * and ensuring that decode->re-encode produces the exact original string.
 */
function isCanonicalBase64(str: string): boolean {
  if (typeof str !== 'string' || str.length === 0 || str.length % 4 !== 0) {
    return false;
  }
  if (!BASE64_CHAR_REGEX.test(str)) {
    return false;
  }
  try {
    const buf = Buffer.from(str, 'base64');
    return buf.toString('base64') === str;
  } catch {
    return false;
  }
}

/**
 * Strictly validates and parses a serialized scrypt password hash.
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

  const costStr = parts[2].slice(2);
  const blockSizeStr = parts[3].slice(2);
  const parallelismStr = parts[4].slice(2);

  const cost = parseStrictDecimal(costStr);
  const blockSize = parseStrictDecimal(blockSizeStr);
  const parallelism = parseStrictDecimal(parallelismStr);

  if (cost === null || blockSize === null || parallelism === null) {
    return null;
  }

  // Strict parameter bounds check against reviewed policy
  if (cost < SCRYPT_POLICY.MIN_COST || cost > SCRYPT_POLICY.MAX_COST || (cost & (cost - 1)) !== 0) {
    return null;
  }
  if (blockSize < SCRYPT_POLICY.MIN_BLOCK_SIZE || blockSize > SCRYPT_POLICY.MAX_BLOCK_SIZE) {
    return null;
  }
  if (parallelism < SCRYPT_POLICY.MIN_PARALLELISM || parallelism > SCRYPT_POLICY.MAX_PARALLELISM) {
    return null;
  }

  // Ensure parameter combination does not exceed memory budget (128 * N * r bytes)
  const memoryRequiredBytes = 128 * cost * blockSize;
  if (memoryRequiredBytes > SCRYPT_POLICY.MAX_MEMORY_BUDGET_BYTES) {
    return null;
  }

  const saltB64 = parts[5];
  const keyB64 = parts[6];

  // Canonical Base64 validation
  if (!isCanonicalBase64(saltB64) || !isCanonicalBase64(keyB64)) {
    return null;
  }

  try {
    const salt = Buffer.from(saltB64, 'base64');
    const derivedKey = Buffer.from(keyB64, 'base64');

    // Strict length validation
    if (salt.length !== SCRYPT_POLICY.REQUIRED_SALT_BYTES) {
      return null;
    }
    if (derivedKey.length !== SCRYPT_POLICY.REQUIRED_KEY_BYTES) {
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
    return { valid: false, reason: 'Malformed scrypt hash structure, invalid parameters or non-canonical Base64.' };
  }

  return { valid: true };
}

/**
 * Validates caller-provided options against reviewed production policy.
 */
function validateHashOptions(options: Partial<ScryptOptions>): void {
  if (options.cost !== undefined) {
    if (!Number.isInteger(options.cost) || options.cost < SCRYPT_POLICY.MIN_COST || options.cost > SCRYPT_POLICY.MAX_COST || (options.cost & (options.cost - 1)) !== 0) {
      throw new Error(`scrypt cost (N) must be a power of 2 between ${SCRYPT_POLICY.MIN_COST} and ${SCRYPT_POLICY.MAX_COST}.`);
    }
  }
  if (options.blockSize !== undefined) {
    if (!Number.isInteger(options.blockSize) || options.blockSize < SCRYPT_POLICY.MIN_BLOCK_SIZE || options.blockSize > SCRYPT_POLICY.MAX_BLOCK_SIZE) {
      throw new Error(`scrypt blockSize (r) must be an integer between ${SCRYPT_POLICY.MIN_BLOCK_SIZE} and ${SCRYPT_POLICY.MAX_BLOCK_SIZE}.`);
    }
  }
  if (options.parallelism !== undefined) {
    if (!Number.isInteger(options.parallelism) || options.parallelism < SCRYPT_POLICY.MIN_PARALLELISM || options.parallelism > SCRYPT_POLICY.MAX_PARALLELISM) {
      throw new Error(`scrypt parallelism (p) must be an integer between ${SCRYPT_POLICY.MIN_PARALLELISM} and ${SCRYPT_POLICY.MAX_PARALLELISM}.`);
    }
  }
  if (options.keyLen !== undefined) {
    if (options.keyLen !== SCRYPT_POLICY.REQUIRED_KEY_BYTES) {
      throw new Error(`scrypt keyLen must be strictly ${SCRYPT_POLICY.REQUIRED_KEY_BYTES} bytes.`);
    }
  }
  if (options.salt !== undefined) {
    if (!Buffer.isBuffer(options.salt) || options.salt.length !== SCRYPT_POLICY.REQUIRED_SALT_BYTES) {
      throw new Error(`scrypt salt must be a Buffer of strictly ${SCRYPT_POLICY.REQUIRED_SALT_BYTES} bytes.`);
    }
  }

  const cost = options.cost ?? SCRYPT_POLICY.DEFAULT_COST;
  const blockSize = options.blockSize ?? SCRYPT_POLICY.DEFAULT_BLOCK_SIZE;
  if (128 * cost * blockSize > SCRYPT_POLICY.MAX_MEMORY_BUDGET_BYTES) {
    throw new Error('scrypt parameter combination exceeds maximum memory budget of 64 MiB.');
  }
}

/**
 * Asynchronously hashes a password using Node.js crypto.scrypt with a random salt.
 * Options are strictly validated against the reviewed production policy.
 */
export async function hashPassword(
  password: string,
  options: Partial<ScryptOptions> = {}
): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string.');
  }

  validateHashOptions(options);

  const cost = options.cost ?? SCRYPT_POLICY.DEFAULT_COST;
  const blockSize = options.blockSize ?? SCRYPT_POLICY.DEFAULT_BLOCK_SIZE;
  const parallelism = options.parallelism ?? SCRYPT_POLICY.DEFAULT_PARALLELISM;
  const keyLen = options.keyLen ?? SCRYPT_POLICY.REQUIRED_KEY_BYTES;
  const salt = options.salt ?? crypto.randomBytes(SCRYPT_POLICY.REQUIRED_SALT_BYTES);

  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      keyLen,
      {
        N: cost,
        r: blockSize,
        p: parallelism,
        maxmem: SCRYPT_POLICY.MAX_MEMORY_BUDGET_BYTES
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
 * Validates format and parameters before invoking scrypt; never throws on malformed hashes.
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
          maxmem: SCRYPT_POLICY.MAX_MEMORY_BUDGET_BYTES
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
