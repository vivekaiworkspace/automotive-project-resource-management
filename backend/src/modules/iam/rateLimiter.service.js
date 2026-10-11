/**
 * Rate Limiter and Account Lockout Service
 * Protects login endpoints against brute force and dictionary attacks (CPD-010, Security § 2.2)
 */

const ipAttempts = new Map();

const RATE_LIMIT_MAX = 5;                     // 5 attempts
const RATE_LIMIT_WINDOW_MS = 60 * 1000;       // per 1 minute window

/**
 * IP-level sliding window rate limiting for authentication endpoints
 */
export function checkIpLoginRateLimit(ip = 'unknown') {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  const timestamps = (ipAttempts.get(ip) || []).filter(t => t > windowStart);

  if (timestamps.length >= RATE_LIMIT_MAX) {
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    ipAttempts.set(ip, timestamps);
    return {
      allowed: false,
      retryAfterSeconds,
    };
  }

  timestamps.push(now);
  ipAttempts.set(ip, timestamps);
  return { allowed: true };
}

/**
 * Clear in-memory rate limiting state (e.g. for testing)
 */
export function clearRateLimitState() {
  ipAttempts.clear();
}
