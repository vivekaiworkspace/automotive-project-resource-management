import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { getPool, query, closePool } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { 
  hashPassword, 
  validatePassword, 
  verifyPassword 
} from '../src/modules/iam/crypto.service.js';
import { bootstrapSystemAdmin } from '../src/modules/iam/bootstrap.service.js';
import { assignUserRole, removeUserRole } from '../src/modules/iam/role.service.js';
import { clearRateLimitState } from '../src/modules/iam/rateLimiter.service.js';

describe('Authentication & Authorization Suite (Step 2)', () => {
  let server;
  let baseUrl;
  const adminEmail = 'admin.pilot@ems-ecu.internal';
  const adminInitialPassword = 'InitialAdminPass_MustChangeOnFirstLogin123!';

  before(async () => {
    // Run all pending migrations
    await runMigrations();

    // Bootstrap initial admin
    await bootstrapSystemAdmin();

    // Start HTTP server on dynamic port
    server = createApp();
    await new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await closePool();
  });

  // Helper HTTP request function
  function httpRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(options.path || '/', baseUrl);
      const reqOpts = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      if (postData && !reqOpts.headers['Content-Type']) {
        reqOpts.headers['Content-Type'] = 'application/json';
      }

      const req = http.request(reqOpts, res => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }

          // Extract session cookie from Set-Cookie
          let sessionId = null;
          let csrfTokenCookie = null;
          const setCookieHeaders = res.headers['set-cookie'] || [];
          for (const c of setCookieHeaders) {
            if (c.startsWith('session_id=')) {
              sessionId = c.split(';')[0].replace('session_id=', '');
            }
            if (c.startsWith('csrf_token=')) {
              csrfTokenCookie = c.split(';')[0].replace('csrf_token=', '');
            }
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body,
            sessionId,
            csrfTokenCookie,
            raw,
          });
        });
      });

      req.on('error', reject);
      if (postData) {
        req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
      }
      req.end();
    });
  }

  // ----------------------------------------------------------------------------
  // 1. Password security & Argon2id checks
  // ----------------------------------------------------------------------------
  test('Password validation enforces min 12 characters and complexity', () => {
    assert.equal(validatePassword('short').valid, false);
    assert.equal(validatePassword('alllowercase123!').valid, false);
    assert.equal(validatePassword('ALLUPPERCASE123!').valid, false);
    assert.equal(validatePassword('NoSpecialChar1234').valid, false);
    assert.equal(validatePassword('NoDigitsHere!!!!').valid, false);
    assert.equal(validatePassword('ValidPassword2026!#').valid, true);
  });

  test('Password hash is Argon2id and never returned by an API', async () => {
    const dbRes = await query('SELECT password_hash FROM users WHERE email = $1', [adminEmail]);
    assert.ok(dbRes.rows.length > 0);
    const hash = dbRes.rows[0].password_hash;
    assert.ok(hash.startsWith('$argon2id$v=19$m=65536,t=3,p=4$'), `Hash must be Argon2id format, got: ${hash}`);

    // Verify login endpoint does not return password or hash
    clearRateLimitState();
    const loginRes = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/login'
    }, {
      email: adminEmail,
      password: adminInitialPassword,
    });

    assert.equal(loginRes.statusCode, 200);
    assert.equal(loginRes.body.user.password_hash, undefined);
    assert.equal(loginRes.body.user.password, undefined);
    assert.ok(loginRes.body.user.id);
    assert.equal(loginRes.body.user.email, adminEmail);

    // Verify GET /api/v1/auth/me does not return password or hash
    const meRes = await httpRequest({
      method: 'GET',
      path: '/api/v1/auth/me',
      headers: { 'Cookie': `session_id=${loginRes.sessionId}` }
    });
    assert.equal(meRes.statusCode, 200);
    assert.equal(meRes.body.user.password_hash, undefined);
    assert.equal(meRes.body.user.password, undefined);
  });

  // ----------------------------------------------------------------------------
  // 2. Correct login & Incorrect login with generic error response
  // ----------------------------------------------------------------------------
  test('Correct login sets HTTP-only, SameSite=Strict session cookie', async () => {
    clearRateLimitState();
    const res = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/login'
    }, {
      email: adminEmail,
      password: adminInitialPassword,
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.sessionId, 'Session cookie must be set');
    assert.ok(res.body.csrf_token, 'CSRF token must be returned in payload');

    const setCookie = res.headers['set-cookie'];
    const sessionCookieStr = setCookie.find(c => c.startsWith('session_id='));
    assert.ok(sessionCookieStr.includes('HttpOnly'), 'Cookie must be HttpOnly');
    assert.ok(sessionCookieStr.includes('SameSite=Strict'), 'Cookie must be SameSite=Strict');
    assert.ok(sessionCookieStr.includes('Path=/'), 'Cookie must have Path=/');
  });

  test('Incorrect password returns 401 with generic error response', async () => {
    clearRateLimitState();
    const res = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/login'
    }, {
      email: adminEmail,
      password: 'WrongPassword123!#',
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(res.body.error.message, 'Invalid email or password.');
  });

  test('Non-existent email returns identical 401 with generic error (no enumeration)', async () => {
    clearRateLimitState();
    const res = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/login'
    }, {
      email: 'does.not.exist@nowhere.internal',
      password: 'SomeRandomPassword123!',
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(res.body.error.message, 'Invalid email or password.');
  });

  // ----------------------------------------------------------------------------
  // 3. Account lockout after repeated failed attempts
  // ----------------------------------------------------------------------------
  test('Account lockout after repeated failed attempts', async () => {
    clearRateLimitState();
    // Create a temporary user for lockout testing
    const testEmail = 'lockout.test@ems-ecu.internal';
    const testPass = 'LockoutTestPass123!#';
    const passHash = await hashPassword(testPass);

    await query(`
      INSERT INTO users (email, password_hash, full_name, is_active, failed_login_attempts)
      VALUES ($1, $2, 'Lockout Tester', TRUE, 0)
      ON CONFLICT (email) DO UPDATE SET is_active = TRUE, failed_login_attempts = 0, lockout_until = NULL;
    `, [testEmail, passHash]);

    // Send 5 incorrect password attempts
    for (let i = 1; i <= 5; i++) {
      clearRateLimitState();
      const res = await httpRequest({
        method: 'POST',
        path: '/api/v1/auth/login'
      }, {
        email: testEmail,
        password: 'BadPasswordAttempt123!',
      });
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    }

    // Verify database record has lockout_until set and failed_login_attempts >= 5
    const checkDb = await query('SELECT failed_login_attempts, lockout_until FROM users WHERE email = $1', [testEmail]);
    assert.ok(checkDb.rows[0].failed_login_attempts >= 5);
    assert.ok(checkDb.rows[0].lockout_until !== null);
    assert.ok(new Date(checkDb.rows[0].lockout_until) > new Date());

    // Even with the CORRECT password now, it must fail because account is locked
    clearRateLimitState();
    const lockedRes = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/login'
    }, {
      email: testEmail,
      password: testPass,
    });
    assert.equal(lockedRes.statusCode, 401);
    assert.equal(lockedRes.body.error.code, 'INVALID_CREDENTIALS');

    // Clean up
    await query('DELETE FROM user_sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)', [testEmail]);
    await query('UPDATE users SET is_active = FALSE WHERE email = $1', [testEmail]);
  });

  // ----------------------------------------------------------------------------
  // 4. First-login password change requirement & Session rotation
  // ----------------------------------------------------------------------------
  test('First-login password change requirement and session rotation', async () => {
    clearRateLimitState();
    // Ensure seeded admin has must_change_password = true
    await query('UPDATE users SET must_change_password = TRUE, failed_login_attempts = 0, lockout_until = NULL WHERE email = $1', [adminEmail]);

    // Login with initial password
    const loginRes = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/login'
    }, {
      email: adminEmail,
      password: adminInitialPassword,
    });
    assert.equal(loginRes.statusCode, 200);
    assert.equal(loginRes.body.user.must_change_password, true);

    const oldSessionId = loginRes.sessionId;
    const csrfToken = loginRes.body.csrf_token;

    // Attempting to access protected test endpoint must be DENIED with PASSWORD_CHANGE_REQUIRED (403)
    const deniedRes = await httpRequest({
      method: 'GET',
      path: '/api/v1/auth/protected-test',
      headers: { 'Cookie': `session_id=${oldSessionId}` }
    });
    assert.equal(deniedRes.statusCode, 403);
    assert.equal(deniedRes.body.error.code, 'PASSWORD_CHANGE_REQUIRED');

    // Now change password
    const newAdminPass = 'BrandNewSecureAdminPass2026!#';
    const changeRes = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/change-password',
      headers: {
        'Cookie': `session_id=${oldSessionId}`,
        'X-CSRF-Token': csrfToken,
      }
    }, {
      current_password: adminInitialPassword,
      new_password: newAdminPass,
    });

    assert.equal(changeRes.statusCode, 200);
    assert.equal(changeRes.body.user.must_change_password, false);
    const newSessionId = changeRes.sessionId;
    assert.ok(newSessionId, 'New session must be issued');
    assert.notEqual(newSessionId, oldSessionId, 'Session ID must be rotated after password change');

    // The old session ID must now be invalidated / revoked!
    const oldSessionAttempt = await httpRequest({
      method: 'GET',
      path: '/api/v1/auth/me',
      headers: { 'Cookie': `session_id=${oldSessionId}` }
    });
    assert.equal(oldSessionAttempt.statusCode, 401);

    // The new session ID can now access the protected endpoint
    const protectedRes = await httpRequest({
      method: 'GET',
      path: '/api/v1/auth/protected-test',
      headers: { 'Cookie': `session_id=${newSessionId}` }
    });
    assert.equal(protectedRes.statusCode, 200);
    assert.equal(protectedRes.body.status, 'authorized');

    // Restore admin initial password for downstream tests
    const resetHash = await hashPassword(adminInitialPassword);
    await query('UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE email = $2', [resetHash, adminEmail]);
  });

  // ----------------------------------------------------------------------------
  // 5. Logout invalidates the session
  // ----------------------------------------------------------------------------
  test('Logout invalidates the session', async () => {
    clearRateLimitState();
    const loginRes = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/login'
    }, {
      email: adminEmail,
      password: adminInitialPassword,
    });
    assert.equal(loginRes.statusCode, 200);

    const sessionId = loginRes.sessionId;
    const csrfToken = loginRes.body.csrf_token;

    // Logout
    const logoutRes = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/logout',
      headers: {
        'Cookie': `session_id=${sessionId}`,
        'X-CSRF-Token': csrfToken,
      }
    });
    assert.equal(logoutRes.statusCode, 200);

    // Subsequent call with the same session cookie must be rejected
    const afterLogoutRes = await httpRequest({
      method: 'GET',
      path: '/api/v1/auth/me',
      headers: { 'Cookie': `session_id=${sessionId}` }
    });
    assert.equal(afterLogoutRes.statusCode, 401);
  });

  // ----------------------------------------------------------------------------
  // 6. Idle expiry and absolute expiry
  // ----------------------------------------------------------------------------
  test('Idle expiry rejects session after 30 minutes of inactivity', async () => {
    clearRateLimitState();
    const loginRes = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/login'
    }, {
      email: adminEmail,
      password: adminInitialPassword,
    });
    assert.equal(loginRes.statusCode, 200);

    const sessionId = loginRes.sessionId;

    // Manually age the session's last_active_at in DB by 31 minutes
    const thirtyOneMinsAgo = new Date(Date.now() - 31 * 60 * 1000);
    await query('UPDATE user_sessions SET last_active_at = $1', [thirtyOneMinsAgo]);

    const res = await httpRequest({
      method: 'GET',
      path: '/api/v1/auth/me',
      headers: { 'Cookie': `session_id=${sessionId}` }
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'SESSION_IDLE_TIMEOUT');
  });

  test('Absolute expiry rejects session after 8 hours', async () => {
    clearRateLimitState();
    const loginRes = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/login'
    }, {
      email: adminEmail,
      password: adminInitialPassword,
    });
    assert.equal(loginRes.statusCode, 200);

    const sessionId = loginRes.sessionId;

    // Manually age the session's expires_at into the past
    const pastExpiry = new Date(Date.now() - 1000);
    await query('UPDATE user_sessions SET expires_at = $1', [pastExpiry]);

    const res = await httpRequest({
      method: 'GET',
      path: '/api/v1/auth/me',
      headers: { 'Cookie': `session_id=${sessionId}` }
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'SESSION_ABSOLUTE_TIMEOUT');
  });

  // ----------------------------------------------------------------------------
  // 7. Unauthenticated request denied & Role-based authorization denial
  // ----------------------------------------------------------------------------
  test('Unauthenticated request is denied by default', async () => {
    const res = await httpRequest({
      method: 'GET',
      path: '/api/v1/auth/protected-test',
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
  });

  test('Protected endpoint denied to a user without required permission (RBAC)', async () => {
    // Create a user with TEAM_MEMBER role only
    const memberEmail = 'engineer.tm@ems-ecu.internal';
    const memberPass = 'EngineerPass2026!#';
    const mHash = await hashPassword(memberPass);

    const uRes = await query(`
      INSERT INTO users (email, password_hash, full_name, is_active, must_change_password)
      VALUES ($1, $2, 'Team Member Jane', TRUE, FALSE)
      ON CONFLICT (email) DO UPDATE SET password_hash = $2, is_active = TRUE, must_change_password = FALSE, failed_login_attempts = 0, lockout_until = NULL
      RETURNING id;
    `, [memberEmail, mHash]);

    const memberId = uRes.rows[0].id;
    await query('DELETE FROM user_roles WHERE user_id = $1', [memberId]);
    await query('INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2)', [memberId, 'TEAM_MEMBER']);

    // Login as TEAM_MEMBER
    clearRateLimitState();
    const loginRes = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/login'
    }, {
      email: memberEmail,
      password: memberPass,
    });
    assert.equal(loginRes.statusCode, 200);

    const memberSessionId = loginRes.sessionId;

    // General protected endpoint works for TEAM_MEMBER
    const generalRes = await httpRequest({
      method: 'GET',
      path: '/api/v1/auth/protected-test',
      headers: { 'Cookie': `session_id=${memberSessionId}` }
    });
    assert.equal(generalRes.statusCode, 200);

    // Administrative endpoint requires SYSTEM_ADMIN -> MUST return 403 FORBIDDEN_INSUFFICIENT_ROLE
    const adminEndpointRes = await httpRequest({
      method: 'GET',
      path: '/api/v1/auth/admin-test',
      headers: { 'Cookie': `session_id=${memberSessionId}` }
    });
    assert.equal(adminEndpointRes.statusCode, 403);
    assert.equal(adminEndpointRes.body.error.code, 'FORBIDDEN_INSUFFICIENT_ROLE');

    // Clean up
    await query('DELETE FROM user_sessions WHERE user_id = $1', [memberId]);
    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [memberId]);
  });

  // ----------------------------------------------------------------------------
  // 8. CSRF rejection on state-changing request without valid token
  // ----------------------------------------------------------------------------
  test('CSRF rejection on a state-changing request without a valid token', async () => {
    clearRateLimitState();
    const loginRes = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/login'
    }, {
      email: adminEmail,
      password: adminInitialPassword,
    });
    assert.equal(loginRes.statusCode, 200);

    const sessionId = loginRes.sessionId;

    // 1. Missing CSRF Token on state-changing request (POST logout)
    const missingCsrfRes = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/logout',
      headers: { 'Cookie': `session_id=${sessionId}` }
    });
    assert.equal(missingCsrfRes.statusCode, 403);
    assert.equal(missingCsrfRes.body.error.code, 'CSRF_MISSING');

    // 2. Invalid / forged CSRF Token
    const invalidCsrfRes = await httpRequest({
      method: 'POST',
      path: '/api/v1/auth/logout',
      headers: {
        'Cookie': `session_id=${sessionId}`,
        'X-CSRF-Token': 'forged_fake_token_0000000000000000000000000000000000000000000000000000000000000000',
      }
    });
    assert.equal(invalidCsrfRes.statusCode, 403);
    assert.equal(invalidCsrfRes.body.error.code, 'CSRF_INVALID');
  });

  // ----------------------------------------------------------------------------
  // 9. Audit events created for authentication actions
  // ----------------------------------------------------------------------------
  test('Audit events created for authentication and role lifecycle actions (append-only log)', async () => {
    // Exercise assignUserRole and removeUserRole (CPD-008, Req 4)
    const adminUserRes = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    const adminId = adminUserRes.rows[0].id;

    await assignUserRole(adminId, 'RESOURCE_MANAGER', adminId);
    await removeUserRole(adminId, 'RESOURCE_MANAGER', adminId);

    const auditRes = await query(`
      SELECT DISTINCT action 
      FROM audit_log 
      WHERE action IN (
        'LOGIN_SUCCESS',
        'LOGIN_FAILURE',
        'LOGOUT',
        'PASSWORD_CHANGE',
        'ACCOUNT_LOCKOUT',
        'ROLE_ASSIGNMENT',
        'ROLE_REMOVAL'
      )
    `);

    const recordedActions = auditRes.rows.map(r => r.action);

    // Verify all 7 required security & role actions were recorded in audit_log
    assert.ok(recordedActions.includes('LOGIN_SUCCESS'), 'Must have LOGIN_SUCCESS audit event');
    assert.ok(recordedActions.includes('LOGIN_FAILURE'), 'Must have LOGIN_FAILURE audit event');
    assert.ok(recordedActions.includes('LOGOUT'), 'Must have LOGOUT audit event');
    assert.ok(recordedActions.includes('PASSWORD_CHANGE'), 'Must have PASSWORD_CHANGE audit event');
    assert.ok(recordedActions.includes('ACCOUNT_LOCKOUT'), 'Must have ACCOUNT_LOCKOUT audit event');
    assert.ok(recordedActions.includes('ROLE_ASSIGNMENT'), 'Must have ROLE_ASSIGNMENT audit event');
    assert.ok(recordedActions.includes('ROLE_REMOVAL'), 'Must have ROLE_REMOVAL audit event');
  });
});
