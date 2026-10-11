import crypto from 'node:crypto';
import { argon2id } from 'hash-wasm';

export const ARGON2_CONFIG = {
  iterations: 3,        // t=3
  memorySize: 65536,    // m=64MB (65536 KB)
  parallelism: 4,       // p=4
  hashLength: 32,       // 32-byte digest
  outputType: 'encoded' // Standard PHC string: $argon2id$v=19$m=65536,t=3,p=4$...
};

/**
 * Generate 16 cryptographically random bytes for salt
 */
export function generateSalt() {
  return crypto.randomBytes(16);
}

/**
 * Hash password using Argon2id with unique 16-byte salt
 */
export async function hashPassword(password) {
  const salt = generateSalt();
  return argon2id({
    password,
    salt,
    ...ARGON2_CONFIG,
  });
}

/**
 * Parse standard PHC Argon2id string and compare with constant-time equality
 */
export async function verifyPassword(password, encodedHash) {
  if (!encodedHash || typeof encodedHash !== 'string') return false;

  const parts = encodedHash.split('$');
  // Format: ['', 'argon2id', 'v=19', 'm=65536,t=3,p=4', '<salt_b64>', '<hash_b64>']
  if (parts.length < 6 || parts[1] !== 'argon2id') {
    return false;
  }

  const paramsStr = parts[3];
  const saltBase64 = parts[4];
  const hashBase64 = parts[5];

  let memorySize = 65536;
  let iterations = 3;
  let parallelism = 4;

  paramsStr.split(',').forEach(p => {
    const [k, v] = p.split('=');
    if (k === 'm') memorySize = parseInt(v, 10);
    if (k === 't') iterations = parseInt(v, 10);
    if (k === 'p') parallelism = parseInt(v, 10);
  });

  const salt = Buffer.from(saltBase64, 'base64');
  const expectedHash = Buffer.from(hashBase64, 'base64');

  const computedHashRaw = await argon2id({
    password,
    salt,
    iterations,
    memorySize,
    parallelism,
    hashLength: expectedHash.length || 32,
    outputType: 'binary',
  });

  const computedBuffer = Buffer.from(computedHashRaw);
  if (computedBuffer.length !== expectedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, expectedHash);
}

// Reusable dummy salt to simulate hashing without database user leakage
const DUMMY_SALT = crypto.randomBytes(16);

/**
 * Dummy verify executes on non-existent accounts to eliminate timing side-channels
 */
export async function dummyVerify(password) {
  try {
    await argon2id({
      password: password || 'dummy-timing-safe-string',
      salt: DUMMY_SALT,
      iterations: 3,
      memorySize: 65536,
      parallelism: 4,
      hashLength: 32,
      outputType: 'binary',
    });
  } catch {
    // Ignore timing dummy errors
  }
  return false;
}

/**
 * Password policy enforcement:
 * - Minimum 12 characters
 * - Uppercase, lowercase, number, special character
 */
export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password must be provided' };
  }
  if (password.length < 12) {
    return { valid: false, error: 'Password must be at least 12 characters in length' };
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
    return {
      valid: false,
      error: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    };
  }

  return { valid: true };
}

/**
 * Generate cryptographically secure random session token (256-bit entropy)
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash session token with SHA-256 for persistent PostgreSQL storage
 */
export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token, 'utf-8').digest('hex');
}

/**
 * Generate CSRF token (256-bit entropy hex string)
 */
export function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}
