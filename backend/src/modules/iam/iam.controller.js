import { query } from '../../db/index.js';
import { 
  hashPassword, 
  verifyPassword, 
  dummyVerify, 
  validatePassword, 
  generateCsrfToken 
} from './crypto.service.js';
import { 
  createSession, 
  revokeSession, 
  rotateSession, 
  buildSessionCookie, 
  buildCsrfCookie, 
  buildClearSessionCookie, 
  buildClearCsrfCookie 
} from './session.service.js';
import { checkIpLoginRateLimit } from './rateLimiter.service.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { sendError } from '../../middleware/errorHandler.js';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { parseCookies, verifyCsrf } from '../../middleware/csrf.js';
import {
  listRoles,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserRoles,
  setUserActivation,
  StaleVersionError,
} from './user.service.js';

/**
 * Read JSON body from HTTP request
 */
async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

/**
 * POST /api/v1/auth/login
 */
export async function handleLogin(req, res) {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Unknown';

  // 1. IP Rate Limiting Check
  const rateLimitResult = checkIpLoginRateLimit(ip);
  if (!rateLimitResult.allowed) {
    res.writeHead(429, { 
      'Content-Type': 'application/json',
      'Retry-After': String(rateLimitResult.retryAfterSeconds)
    });
    return res.end(JSON.stringify({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many login attempts. Please try again in ${rateLimitResult.retryAfterSeconds} seconds.`,
      }
    }));
  }

  // 2. Parse payload
  let body;
  try {
    body = await parseJsonBody(req);
  } catch {
    return sendError(res, 400, 'INVALID_JSON', 'Malformed JSON payload');
  }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  if (!email || !password) {
    return sendError(res, 400, 'BAD_REQUEST', 'Email and password are required');
  }

  // Generic credential error to prevent email enumeration
  const genericAuthFail = async (user = null, isLocked = false) => {
    await dummyVerify(password);
    await recordAuditEvent({
      entityName: 'USER',
      entityId: user ? user.id : null,
      action: AUDIT_ACTIONS.LOGIN_FAILURE,
      actorId: user ? user.id : null,
      afterState: { attempted_email: email, reason: isLocked ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS' },
      ipAddress: ip,
      userAgent,
    });

    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  };

  // 3. Query user by email
  const userRes = await query(`
    SELECT 
      id, email, password_hash, full_name, is_active, 
      must_change_password, failed_login_attempts, lockout_until
    FROM users 
    WHERE email = $1
  `, [email]);

  if (userRes.rows.length === 0) {
    return genericAuthFail(null, false);
  }

  const user = userRes.rows[0];

  // 4. Check Account Lockout
  const now = new Date();
  if (user.lockout_until && new Date(user.lockout_until) > now) {
    return genericAuthFail(user, true);
  }

  // 5. Verify Argon2id Password
  const isPasswordValid = await verifyPassword(password, user.password_hash);
  if (!isPasswordValid) {
    const newAttempts = (user.failed_login_attempts || 0) + 1;
    let lockoutSql = 'UPDATE users SET failed_login_attempts = $1 WHERE id = $2';
    let params = [newAttempts, user.id];

    if (newAttempts >= 5) {
      lockoutSql = `
        UPDATE users 
        SET failed_login_attempts = $1, 
            lockout_until = CURRENT_TIMESTAMP + INTERVAL '15 minutes' 
        WHERE id = $2
      `;
      // Record Account Lockout Audit Event
      await recordAuditEvent({
        entityName: 'USER',
        entityId: user.id,
        action: AUDIT_ACTIONS.ACCOUNT_LOCKOUT,
        actorId: user.id,
        afterState: { email, failed_attempts: newAttempts, lockout_duration_minutes: 15 },
        ipAddress: ip,
        userAgent,
      });
    }

    await query(lockoutSql, params);
    return genericAuthFail(user, false);
  }

  // 6. Check Active Status
  if (!user.is_active) {
    await recordAuditEvent({
      entityName: 'USER',
      entityId: user.id,
      action: AUDIT_ACTIONS.LOGIN_FAILURE,
      actorId: user.id,
      afterState: { email, reason: 'INACTIVE_USER' },
      ipAddress: ip,
      userAgent,
    });
    return sendError(res, 403, 'USER_INACTIVE', 'User account is inactive. Access denied.');
  }

  // 7. Reset failed attempts upon successful password authentication
  await query('UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = $1', [user.id]);

  // 8. Session Rotation: Revoke any old session in request cookie & create fresh session
  const cookies = parseCookies(req);
  if (cookies.session_id) {
    await revokeSession(cookies.session_id);
  }

  const newSession = await createSession(user.id, { userAgent, ipAddress: ip });

  // 9. Fetch Roles & Scopes
  const [rolesRes, scopesRes] = await Promise.all([
    query('SELECT role_code FROM user_roles WHERE user_id = $1', [user.id]),
    query('SELECT scope_type, target_id FROM user_scopes WHERE user_id = $1', [user.id]),
  ]);

  const roles = rolesRes.rows.map(r => r.role_code);
  const scopes = scopesRes.rows.map(s => ({ scope_type: s.scope_type, target_id: s.target_id }));

  // 10. Record LOGIN_SUCCESS Audit Event
  await recordAuditEvent({
    entityName: 'USER',
    entityId: user.id,
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    actorId: user.id,
    afterState: { email, session_id: newSession.sessionId },
    ipAddress: ip,
    userAgent,
  });

  // 11. Set HTTP-only SameSite=Strict session cookie + CSRF cookie
  const sessionCookie = buildSessionCookie(newSession.rawToken, { req });
  const csrfCookie = buildCsrfCookie(newSession.csrfToken, { req });

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': [sessionCookie, csrfCookie],
  });

  return res.end(JSON.stringify({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      roles,
      scopes,
      must_change_password: user.must_change_password,
    },
    csrf_token: newSession.csrfToken,
  }));
}

/**
 * POST /api/v1/auth/logout
 */
export async function handleLogout(req, res) {
  // CSRF verification on state-changing request
  if (!verifyCsrf(req, res)) return;

  const cookies = parseCookies(req);
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Unknown';

  if (cookies.session_id) {
    await revokeSession(cookies.session_id);
  }

  if (req.user) {
    await recordAuditEvent({
      entityName: 'USER_SESSION',
      entityId: req.session ? req.session.id : null,
      action: AUDIT_ACTIONS.LOGOUT,
      actorId: req.user.id,
      afterState: { email: req.user.email },
      ipAddress: ip,
      userAgent,
    });
  }

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': [buildClearSessionCookie(), buildClearCsrfCookie()],
  });

  return res.end(JSON.stringify({
    message: 'Logged out successfully',
  }));
}

/**
 * POST /api/v1/auth/change-password
 */
export async function handleChangePassword(req, res) {
  // Auth guard (allows users with mustChangePassword: true)
  if (!requireAuth(req, res, { allowPasswordChangeOnly: true })) return;

  // CSRF verification
  if (!verifyCsrf(req, res)) return;

  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Unknown';

  let body;
  try {
    body = await parseJsonBody(req);
  } catch {
    return sendError(res, 400, 'INVALID_JSON', 'Malformed JSON payload');
  }

  const currentPassword = body.current_password || '';
  const newPassword = body.new_password || '';

  if (!currentPassword || !newPassword) {
    return sendError(res, 400, 'BAD_REQUEST', 'Current password and new password are required');
  }

  // 1. Password Policy Validation
  const valResult = validatePassword(newPassword);
  if (!valResult.valid) {
    return sendError(res, 400, 'WEAK_PASSWORD', valResult.error);
  }

  // 2. Fetch stored hash for verification
  const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (userRes.rows.length === 0) {
    return sendError(res, 404, 'NOT_FOUND', 'User not found');
  }

  const storedHash = userRes.rows[0].password_hash;
  const isCurrentValid = await verifyPassword(currentPassword, storedHash);
  if (!isCurrentValid) {
    return sendError(res, 400, 'INVALID_CREDENTIALS', 'Current password does not match.');
  }

  // 3. Hash new password with Argon2id and unique salt
  const newHash = await hashPassword(newPassword);

  // 4. Update user record (clear must_change_password flag)
  await query(`
    UPDATE users 
    SET password_hash = $1, must_change_password = FALSE 
    WHERE id = $2
  `, [newHash, req.user.id]);

  // 5. Session Rotation: Revoke previous session, create brand new session
  const cookies = parseCookies(req);
  const newSession = await rotateSession(cookies.session_id, req.user.id, { userAgent, ipAddress: ip });

  // 6. Record PASSWORD_CHANGE Audit Event
  await recordAuditEvent({
    entityName: 'USER',
    entityId: req.user.id,
    action: AUDIT_ACTIONS.PASSWORD_CHANGE,
    actorId: req.user.id,
    afterState: { email: req.user.email, must_change_password: false },
    ipAddress: ip,
    userAgent,
  });

  const sessionCookie = buildSessionCookie(newSession.rawToken, { req });
  const csrfCookie = buildCsrfCookie(newSession.csrfToken, { req });

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': [sessionCookie, csrfCookie],
  });

  return res.end(JSON.stringify({
    message: 'Password changed successfully.',
    user: {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.fullName,
      roles: req.user.roles,
      scopes: req.user.scopes,
      must_change_password: false,
    },
    csrf_token: newSession.csrfToken,
  }));
}

/**
 * GET /api/v1/auth/me
 */
export async function handleGetMe(req, res) {
  if (!requireAuth(req, res, { allowPasswordChangeOnly: true })) return;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({
    user: {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.fullName,
      roles: req.user.roles,
      scopes: req.user.scopes,
      must_change_password: req.user.mustChangePassword,
    }
  }));
}

/**
 * GET /api/v1/auth/csrf-token
 */
export async function handleGetCsrfToken(req, res) {
  let token;
  if (req.session && req.session.csrfSecret) {
    token = req.session.csrfSecret;
  } else {
    token = generateCsrfToken();
  }

  const csrfCookie = buildCsrfCookie(token, { req });
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': csrfCookie,
  });

  return res.end(JSON.stringify({
    csrf_token: token,
  }));
}

/**
 * GET /api/v1/auth/protected-test
 * Demonstrates authorization denial without a valid session
 */
export async function handleProtectedTest(req, res) {
  if (!requireAuth(req, res)) return;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({
    status: 'authorized',
    message: 'Access granted to general protected endpoint.',
    user: {
      id: req.user.id,
      email: req.user.email,
      roles: req.user.roles,
    }
  }));
}

/**
 * GET /api/v1/auth/admin-test
 * Demonstrates role-based authorization denial for non-System-Admin users
 */
export async function handleAdminTest(req, res) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({
    status: 'authorized',
    message: 'Access granted to administrative endpoint.',
    user: {
      id: req.user.id,
      email: req.user.email,
      roles: req.user.roles,
    }
  }));
}

/**
 * GET /api/v1/roles
 */
export async function handleListRoles(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const roles = await listRoles();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ roles }));
  } catch (err) {
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
}

/**
 * GET /api/v1/users
 * SYSTEM_ADMIN: all users
 * RESOURCE_MANAGER: scoped users
 */
export async function handleListUsers(req, res) {
  const checkPerm = requireRoles(['SYSTEM_ADMIN', 'RESOURCE_MANAGER']);
  if (!checkPerm(req, res)) return;

  try {
    const users = await listUsers(req.user);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ users }));
  } catch (err) {
    console.error('handleListUsers error:', err);
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
}

/**
 * GET /api/v1/users/:id
 */
export async function handleGetUserById(req, res, userId) {
  if (!requireAuth(req, res)) return;

  const isAdmin = req.user.roles.includes('SYSTEM_ADMIN');
  const isSelf = req.user.id === userId;
  const isRM = req.user.roles.includes('RESOURCE_MANAGER');

  if (!isAdmin && !isSelf && !isRM) {
    return sendError(res, 403, 'FORBIDDEN', 'Access denied to user profile.');
  }

  try {
    const user = await getUserById(userId);
    if (!user) {
      return sendError(res, 404, 'NOT_FOUND', `User with ID ${userId} not found.`);
    }

    if (isRM && !isAdmin && !isSelf) {
      // Verify user is in RM's team scope
      const rmTeamIds = new Set((req.user.scopes || []).filter(s => s.scope_type === 'TEAM').map(s => s.target_id));
      const hasOverlap = (user.teams || []).some(t => rmTeamIds.has(t.team_id));
      if (!hasOverlap) {
        return sendError(res, 403, 'FORBIDDEN_OUT_OF_SCOPE', 'Target user is outside resource scope.');
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user }));
  } catch (err) {
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
}

/**
 * POST /api/v1/users
 * System Admin only user creation
 */
export async function handleCreateUser(req, res) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const user = await createUser({
      email: body.email,
      password: body.password,
      fullName: body.full_name || body.fullName,
      roles: body.roles || ['TEAM_MEMBER'],
      actorId: req.user.id,
    });

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user, message: 'User created successfully.' }));
  } catch (err) {
    const statusCode = err.message.includes('already exists') || err.message.includes('required') ? 400 : 500;
    sendError(res, statusCode, 'BAD_REQUEST', err.message);
  }
}

/**
 * PUT /api/v1/users/:id
 * System Admin only user update with optimistic locking
 */
export async function handleUpdateUser(req, res, userId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const updated = await updateUser(userId, {
      fullName: body.full_name || body.fullName,
      expectedVersion: body.version,
      actorId: req.user.id,
    });

    if (!updated) {
      return sendError(res, 404, 'NOT_FOUND', `User with ID ${userId} not found.`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user: updated, message: 'User updated successfully.' }));
  } catch (err) {
    if (err instanceof StaleVersionError || err.code === 'CONFLICT_STALE_RECORD') {
      return sendError(res, 409, 'CONFLICT_STALE_RECORD', err.message, {
        current_version: err.currentVersion,
        expected_version: err.expectedVersion,
      });
    }
    const statusCode = err.message.includes('required') || err.message.includes('must be') ? 400 : 500;
    sendError(res, statusCode, 'BAD_REQUEST', err.message);
  }
}

/**
 * PUT /api/v1/users/:id/roles
 * System Admin only role assignment/removal
 */
export async function handleUpdateUserRoles(req, res, userId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const roles = await updateUserRoles(userId, {
      roles: body.roles || [],
      actorId: req.user.id,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user_id: userId, roles, message: 'User roles updated successfully.' }));
  } catch (err) {
    sendError(res, 400, 'BAD_REQUEST', err.message);
  }
}

/**
 * PUT /api/v1/users/:id/activation
 * System Admin only user activation/deactivation with optimistic locking
 */
export async function handleSetUserActivation(req, res, userId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const updated = await setUserActivation(userId, {
      isActive: body.is_active !== undefined ? body.is_active : body.isActive,
      expectedVersion: body.version,
      actorId: req.user.id,
    });

    if (!updated) {
      return sendError(res, 404, 'NOT_FOUND', `User with ID ${userId} not found.`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user: updated, message: `User ${updated.is_active ? 'activated' : 'deactivated'} successfully.` }));
  } catch (err) {
    if (err instanceof StaleVersionError || err.code === 'CONFLICT_STALE_RECORD') {
      return sendError(res, 409, 'CONFLICT_STALE_RECORD', err.message, {
        current_version: err.currentVersion,
        expected_version: err.expectedVersion,
      });
    }
    sendError(res, 400, 'BAD_REQUEST', err.message);
  }
}
