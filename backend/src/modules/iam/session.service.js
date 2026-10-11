import { query } from '../../db/index.js';
import { generateSessionToken, hashSessionToken, generateCsrfToken } from './crypto.service.js';
import { config } from '../../config/index.js';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;       // 30 minutes
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Create a new server-side session in PostgreSQL.
 * Only the SHA-256 hash of the token is persisted; the raw token is returned to be sent via cookie.
 */
export async function createSession(userId, { userAgent = null, ipAddress = null } = {}) {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const csrfSecret = generateCsrfToken();
  const expiresAt = new Date(Date.now() + ABSOLUTE_TIMEOUT_MS);

  const sql = `
    INSERT INTO user_sessions (
      user_id,
      token_hash,
      csrf_secret,
      created_at,
      last_active_at,
      expires_at,
      is_revoked,
      user_agent,
      ip_address
    ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4, FALSE, $5, $6)
    RETURNING id, user_id, created_at, expires_at, csrf_secret;
  `;

  const res = await query(sql, [userId, tokenHash, csrfSecret, expiresAt, userAgent, ipAddress]);
  const sessionRow = res.rows[0];

  return {
    rawToken,
    sessionId: sessionRow.id,
    csrfToken: csrfSecret,
    expiresAt: sessionRow.expires_at,
  };
}

/**
 * Validate session by raw token.
 * Enforces:
 * - Revocation check
 * - Absolute expiry check (8 hours)
 * - Idle expiry check (30 minutes)
 * Updates last_active_at on success.
 */
export async function validateSession(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    return { valid: false, error: 'NO_TOKEN' };
  }

  const tokenHash = hashSessionToken(rawToken);

  const sql = `
    SELECT 
      s.id AS session_id,
      s.user_id,
      s.csrf_secret,
      s.created_at AS session_created_at,
      s.last_active_at,
      s.expires_at,
      s.is_revoked,
      u.email,
      u.full_name,
      u.is_active,
      u.must_change_password
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1;
  `;

  const res = await query(sql, [tokenHash]);
  if (res.rows.length === 0) {
    return { valid: false, error: 'SESSION_NOT_FOUND' };
  }

  const session = res.rows[0];

  if (session.is_revoked) {
    return { valid: false, error: 'SESSION_REVOKED' };
  }

  const now = Date.now();
  const absoluteExpiry = new Date(session.expires_at).getTime();
  const lastActive = new Date(session.last_active_at).getTime();

  // 1. Absolute Expiry check
  if (now > absoluteExpiry) {
    await revokeSessionByHash(tokenHash);
    return { valid: false, error: 'ABSOLUTE_EXPIRED' };
  }

  // 2. Idle Expiry check
  if (now - lastActive > IDLE_TIMEOUT_MS) {
    await revokeSessionByHash(tokenHash);
    return { valid: false, error: 'IDLE_EXPIRED' };
  }

  // 3. User Active status check
  if (!session.is_active) {
    await revokeSessionByHash(tokenHash);
    return { valid: false, error: 'USER_INACTIVE' };
  }

  // Update last_active_at timestamp (throttled to once every 10 seconds to reduce DB writes)
  if (now - lastActive > 10000) {
    await query('UPDATE user_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1', [session.session_id]);
  }

  // Fetch roles and scopes
  const [rolesRes, scopesRes, pmScopesRes, rmScopesRes] = await Promise.all([
    query('SELECT role_code FROM user_roles WHERE user_id = $1', [session.user_id]),
    query('SELECT scope_type, target_id FROM user_scopes WHERE user_id = $1', [session.user_id]),
    query('SELECT project_id FROM project_manager_scopes WHERE user_id = $1', [session.user_id]),
    query('SELECT team_id FROM resource_manager_scopes WHERE user_id = $1', [session.user_id]),
  ]);

  const roles = rolesRes.rows.map(r => r.role_code);
  const scopeMap = new Map();

  for (const s of scopesRes.rows) {
    scopeMap.set(`${s.scope_type}:${s.target_id}`, { scope_type: s.scope_type, target_id: s.target_id });
  }
  for (const pm of pmScopesRes.rows) {
    scopeMap.set(`PROJECT:${pm.project_id}`, { scope_type: 'PROJECT', target_id: pm.project_id });
  }
  for (const rm of rmScopesRes.rows) {
    scopeMap.set(`TEAM:${rm.team_id}`, { scope_type: 'TEAM', target_id: rm.team_id });
  }

  const scopes = Array.from(scopeMap.values());

  return {
    valid: true,
    session: {
      id: session.session_id,
      userId: session.user_id,
      csrfSecret: session.csrf_secret,
      tokenHash,
      createdAt: session.session_created_at,
      expiresAt: session.expires_at,
    },
    user: {
      id: session.user_id,
      email: session.email,
      fullName: session.full_name,
      isActive: session.is_active,
      mustChangePassword: session.must_change_password,
      roles,
      scopes,
    }
  };
}

/**
 * Revoke session by raw token (e.g. on logout)
 */
export async function revokeSession(rawToken) {
  if (!rawToken) return false;
  const tokenHash = hashSessionToken(rawToken);
  return revokeSessionByHash(tokenHash);
}

/**
 * Revoke session by token hash
 */
export async function revokeSessionByHash(tokenHash) {
  const sql = 'UPDATE user_sessions SET is_revoked = TRUE WHERE token_hash = $1';
  await query(sql, [tokenHash]);
  return true;
}

/**
 * Invalidate all sessions for a specific user (e.g. security reset)
 */
export async function revokeAllUserSessions(userId) {
  const sql = 'UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = $1';
  await query(sql, [userId]);
  return true;
}

/**
 * Rotate session: revoke existing session and issue a fresh session token
 */
export async function rotateSession(oldRawToken, userId, meta = {}) {
  if (oldRawToken) {
    await revokeSession(oldRawToken);
  }
  return createSession(userId, meta);
}

/**
 * Resolve cookie Secure flag according to environment and TLS state (Req 2)
 * Secure=true when HTTPS is enabled or non-development mode;
 * Secure=false allowed only in explicit local development mode without HTTPS.
 */
export function resolveSecureFlag(secure = null, req = null) {
  if (secure !== null) return secure;
  if (config.auth.cookieSecure) return true;
  if (config.env !== 'development') return true;
  if (req && (req.headers['x-forwarded-proto'] === 'https' || req.socket?.encrypted)) return true;
  return false;
}

/**
 * Build HTTP cookie header string
 */
export function buildSessionCookie(token, { secure = null, req = null, maxAgeSeconds = 8 * 3600 } = {}) {
  const isSecure = resolveSecureFlag(secure, req);
  const parts = [
    `session_id=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict'
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  if (maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }
  return parts.join('; ');
}

/**
 * Build CSRF cookie header string (client readable for Double Submit Cookie / Token synchronization)
 */
export function buildCsrfCookie(csrfToken, { secure = null, req = null, maxAgeSeconds = 8 * 3600 } = {}) {
  const isSecure = resolveSecureFlag(secure, req);
  const parts = [
    `csrf_token=${csrfToken}`,
    'Path=/',
    'SameSite=Strict'
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  if (maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }
  return parts.join('; ');
}

/**
 * Build cookie clearing header string
 */
export function buildClearSessionCookie() {
  return 'session_id=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

export function buildClearCsrfCookie() {
  return 'csrf_token=; Path=/; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
}
