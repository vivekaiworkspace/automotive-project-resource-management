import { parseCookies } from './csrf.js';
import { validateSession } from '../modules/iam/session.service.js';
import { sendError } from './errorHandler.js';

export const VALID_PILOT_ROLES = new Set([
  'SYSTEM_ADMIN',
  'PROJECT_MANAGER',
  'TEAM_LEAD',
  'TEAM_MEMBER',
  'RESOURCE_MANAGER',
]);

/**
 * Authentication Middleware:
 * Resolves session token from HTTP-only cookie, validates in PostgreSQL,
 * and attaches req.session and req.user.
 */
export async function authenticateRequest(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.session_id;

  if (!sessionId) {
    req.session = null;
    req.user = null;
    return;
  }

  const result = await validateSession(sessionId);
  if (result.valid) {
    req.session = result.session;
    req.user = result.user;
    req.authError = null;
  } else {
    req.session = null;
    req.user = null;
    req.authError = result.error;
  }
}

/**
 * Authorization Guard: Deny unauthenticated requests
 */
export function requireAuth(req, res, { allowPasswordChangeOnly = false } = {}) {
  if (!req.user) {
    if (req.authError === 'USER_INACTIVE') {
      sendError(res, 403, 'USER_INACTIVE', 'User account is inactive. Access denied.');
      return false;
    }

    const message = req.authError === 'IDLE_EXPIRED' 
      ? 'Session expired due to inactivity. Please log in again.'
      : req.authError === 'ABSOLUTE_EXPIRED'
      ? 'Session expired. Please log in again.'
      : 'Authentication required. Please log in.';
    
    const code = req.authError === 'IDLE_EXPIRED' ? 'SESSION_IDLE_TIMEOUT'
      : req.authError === 'ABSOLUTE_EXPIRED' ? 'SESSION_ABSOLUTE_TIMEOUT'
      : 'UNAUTHENTICATED';

    sendError(res, 401, code, message);
    return false;
  }

  if (!req.user.isActive) {
    sendError(res, 403, 'USER_INACTIVE', 'User account is inactive. Access denied.');
    return false;
  }

  // Enforce password change requirement
  if (req.user.mustChangePassword && !allowPasswordChangeOnly) {
    sendError(
      res,
      403,
      'PASSWORD_CHANGE_REQUIRED',
      'Password change is required immediately after first login before accessing system resources.'
    );
    return false;
  }

  return true;
}

/**
 * Role-Based Access Control (RBAC) Guard
 * Denies by default if caller lacks any of the permitted roles.
 */
export function requireRoles(allowedRoles = []) {
  return (req, res, options = {}) => {
    if (!requireAuth(req, res, options)) {
      return false;
    }

    const userRoles = req.user.roles || [];
    const hasRole = allowedRoles.some(r => userRoles.includes(r));

    if (!hasRole) {
      sendError(
        res,
        403,
        'FORBIDDEN_INSUFFICIENT_ROLE',
        `Access denied. Requires one of the following roles: [${allowedRoles.join(', ')}].`
      );
      return false;
    }

    return true;
  };
}

/**
 * Scope-Based Access Control (SBAC) Guard
 * Denies by default if target is outside user's assigned scope.
 * SYSTEM_ADMIN bypasses scope limits (global scope).
 */
export function requireScope({ scopeType, targetIdGetter }) {
  return (req, res, options = {}) => {
    if (!requireAuth(req, res, options)) {
      return false;
    }

    // SYSTEM_ADMIN possesses global system-wide scope
    if (req.user.roles.includes('SYSTEM_ADMIN')) {
      return true;
    }

    const targetId = typeof targetIdGetter === 'function' ? targetIdGetter(req) : null;
    if (!targetId) {
      sendError(res, 400, 'BAD_REQUEST', 'Missing scope identifier for evaluation.');
      return false;
    }

    const scopes = req.user.scopes || [];
    const isScoped = scopes.some(s => s.scope_type === scopeType && s.target_id === targetId);

    if (!isScoped) {
      sendError(
        res,
        403,
        'FORBIDDEN_OUT_OF_SCOPE',
        `Access denied. Target ${scopeType} (${targetId}) is outside user's permitted organizational scope.`
      );
      return false;
    }

    return true;
  };
}
