import { query } from '../../db/index.js';
import { hashPassword, validatePassword } from './crypto.service.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { VALID_PILOT_ROLES } from '../../middleware/auth.js';
import { revokeAllUserSessions } from './session.service.js';

export class StaleVersionError extends Error {
  constructor(currentVersion, expectedVersion) {
    super(`Record was modified by another transaction. Expected version ${expectedVersion}, but current version is ${currentVersion}.`);
    this.name = 'StaleVersionError';
    this.code = 'CONFLICT_STALE_RECORD';
    this.statusCode = 409;
    this.currentVersion = currentVersion;
    this.expectedVersion = expectedVersion;
  }
}

/**
 * List all fixed roles
 */
export async function listRoles() {
  const res = await query('SELECT role_code, name, description FROM roles ORDER BY role_code ASC');
  return res.rows;
}

/**
 * List users (scoped by role)
 * - SYSTEM_ADMIN: All users
 * - RESOURCE_MANAGER: Only users in teams within RM scope
 */
export async function listUsers(requestingUser) {
  const isAdmin = requestingUser.roles.includes('SYSTEM_ADMIN');
  const isRM = requestingUser.roles.includes('RESOURCE_MANAGER');

  let sql;
  let params = [];

  if (isAdmin) {
    sql = `
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.is_active,
        u.must_change_password,
        u.version,
        u.created_at,
        u.updated_at,
        u.archived_at,
        COALESCE(
          (SELECT json_agg(ur.role_code ORDER BY ur.role_code) 
           FROM user_roles ur 
           WHERE ur.user_id = u.id),
          '[]'::json
        ) AS roles,
        COALESCE(
          (SELECT json_agg(json_build_object(
             'team_id', t.id,
             'team_code', t.code,
             'team_name', t.name,
             'is_team_lead', tm.is_team_lead
           ))
           FROM team_memberships tm
           JOIN teams t ON t.id = tm.team_id
           WHERE tm.user_id = u.id AND tm.archived_at IS NULL),
          '[]'::json
        ) AS teams
      FROM users u
      ORDER BY u.created_at ASC;
    `;
  } else if (isRM) {
    // RM can only see users in their scoped teams
    const rmTeamIds = (requestingUser.scopes || [])
      .filter(s => s.scope_type === 'TEAM')
      .map(s => s.target_id);

    if (rmTeamIds.length === 0) {
      return [];
    }

    sql = `
      SELECT DISTINCT
        u.id,
        u.email,
        u.full_name,
        u.is_active,
        u.must_change_password,
        u.version,
        u.created_at,
        u.updated_at,
        u.archived_at,
        COALESCE(
          (SELECT json_agg(ur.role_code ORDER BY ur.role_code) 
           FROM user_roles ur 
           WHERE ur.user_id = u.id),
          '[]'::json
        ) AS roles,
        COALESCE(
          (SELECT json_agg(json_build_object(
             'team_id', t.id,
             'team_code', t.code,
             'team_name', t.name,
             'is_team_lead', tm.is_team_lead
           ))
           FROM team_memberships tm
           JOIN teams t ON t.id = tm.team_id
           WHERE tm.user_id = u.id AND tm.archived_at IS NULL),
          '[]'::json
        ) AS teams
      FROM users u
      JOIN team_memberships tm ON tm.user_id = u.id
      WHERE tm.team_id = ANY($1::uuid[]) AND tm.archived_at IS NULL
      ORDER BY u.created_at ASC;
    `;
    params = [rmTeamIds];
  } else {
    // Other roles cannot view user directory
    return [];
  }

  const res = await query(sql, params);
  return res.rows;
}

/**
 * Get user by ID with roles and teams
 */
export async function getUserById(userId) {
  const sql = `
    SELECT 
      u.id,
      u.email,
      u.full_name,
      u.is_active,
      u.must_change_password,
      u.version,
      u.created_at,
      u.updated_at,
      u.archived_at,
      COALESCE(
        (SELECT json_agg(ur.role_code ORDER BY ur.role_code) 
         FROM user_roles ur 
         WHERE ur.user_id = u.id),
        '[]'::json
      ) AS roles,
      COALESCE(
        (SELECT json_agg(json_build_object(
           'team_id', t.id,
           'team_code', t.code,
           'team_name', t.name,
           'is_team_lead', tm.is_team_lead
         ))
         FROM team_memberships tm
         JOIN teams t ON t.id = tm.team_id
         WHERE tm.user_id = u.id AND tm.archived_at IS NULL),
        '[]'::json
      ) AS teams
    FROM users u
    WHERE u.id = $1;
  `;

  const res = await query(sql, [userId]);
  return res.rows[0] || null;
}

/**
 * Create a new user (System Admin only)
 */
export async function createUser({
  email,
  password,
  fullName,
  roles = ['TEAM_MEMBER'],
  actorId,
}) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('A valid email address is required.');
  }

  const cleanName = (fullName || '').trim();
  if (!cleanName || cleanName.length < 2) {
    throw new Error('Full name must be at least 2 characters.');
  }

  // Validate roles
  for (const r of roles) {
    if (!VALID_PILOT_ROLES.has(r)) {
      throw new Error(`Invalid role code: ${r}`);
    }
  }

  // Validate password
  const valResult = validatePassword(password);
  if (!valResult.valid) {
    throw new Error(valResult.error);
  }

  // Check email uniqueness
  const existing = await query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
  if (existing.rows.length > 0) {
    throw new Error(`User with email "${cleanEmail}" already exists.`);
  }

  const passwordHash = await hashPassword(password);

  const insertSql = `
    INSERT INTO users (
      email,
      password_hash,
      full_name,
      is_active,
      must_change_password,
      created_by,
      updated_by,
      version
    ) VALUES ($1, $2, $3, TRUE, TRUE, $4, $4, 1)
    RETURNING id, email, full_name, is_active, must_change_password, version, created_at;
  `;

  const userRes = await query(insertSql, [cleanEmail, passwordHash, cleanName, actorId]);
  const user = userRes.rows[0];

  // Assign roles
  for (const r of roles) {
    await query('INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2)', [user.id, r]);
    await recordAuditEvent({
      entityName: 'USER_ROLE',
      entityId: user.id,
      action: AUDIT_ACTIONS.ROLE_ASSIGNMENT,
      actorId,
      afterState: { role_code: r, email: cleanEmail },
      changeReason: 'Initial role assignment on user creation',
    });
  }

  await recordAuditEvent({
    entityName: 'USER',
    entityId: user.id,
    action: AUDIT_ACTIONS.INSERT,
    actorId,
    afterState: { id: user.id, email: user.email, full_name: user.full_name, roles },
    changeReason: 'User created by System Administrator',
  });

  user.roles = roles;
  return user;
}

/**
 * Update user details with optimistic locking (System Admin only)
 */
export async function updateUser(userId, { fullName, expectedVersion, actorId }) {
  const cleanName = (fullName || '').trim();
  if (!cleanName || cleanName.length < 2) {
    throw new Error('Full name must be at least 2 characters.');
  }

  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, email, full_name, version FROM users WHERE id = $1', [userId]);
  if (current.rows.length === 0) {
    return null;
  }

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const updateSql = `
    UPDATE users 
    SET 
      full_name = $1,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $2
    WHERE id = $3 AND version = $4
    RETURNING id, email, full_name, is_active, must_change_password, version, updated_at;
  `;

  const res = await query(updateSql, [cleanName, actorId, userId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM users WHERE id = $1', [userId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const updated = res.rows[0];

  await recordAuditEvent({
    entityName: 'USER',
    entityId: userId,
    action: AUDIT_ACTIONS.UPDATE,
    actorId,
    beforeState: { full_name: row.full_name, version: row.version },
    afterState: { full_name: updated.full_name, version: updated.version },
    changeReason: 'User profile updated',
  });

  return updated;
}

/**
 * Update user roles (System Admin only)
 */
export async function updateUserRoles(userId, { roles = [], actorId }) {
  for (const r of roles) {
    if (!VALID_PILOT_ROLES.has(r)) {
      throw new Error(`Invalid role code: ${r}`);
    }
  }

  const existingRes = await query('SELECT role_code FROM user_roles WHERE user_id = $1', [userId]);
  const currentRoles = new Set(existingRes.rows.map(r => r.role_code));
  const newRoles = new Set(roles);

  // Remove roles no longer present
  for (const r of currentRoles) {
    if (!newRoles.has(r)) {
      await query('DELETE FROM user_roles WHERE user_id = $1 AND role_code = $2', [userId, r]);
      await recordAuditEvent({
        entityName: 'USER_ROLE',
        entityId: userId,
        action: AUDIT_ACTIONS.ROLE_REMOVAL,
        actorId,
        beforeState: { role_code: r },
        changeReason: 'Role removed by System Administrator',
      });
    }
  }

  // Add new roles
  for (const r of newRoles) {
    if (!currentRoles.has(r)) {
      await query('INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, r]);
      await recordAuditEvent({
        entityName: 'USER_ROLE',
        entityId: userId,
        action: AUDIT_ACTIONS.ROLE_ASSIGNMENT,
        actorId,
        afterState: { role_code: r },
        changeReason: 'Role assigned by System Administrator',
      });
    }
  }

  return Array.from(newRoles);
}

/**
 * Set user activation status with optimistic locking (System Admin only)
 */
export async function setUserActivation(userId, { isActive, expectedVersion, actorId }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, email, is_active, version FROM users WHERE id = $1', [userId]);
  if (current.rows.length === 0) {
    return null;
  }

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const targetActive = Boolean(isActive);

  const updateSql = `
    UPDATE users 
    SET 
      is_active = $1,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $2
    WHERE id = $3 AND version = $4
    RETURNING id, email, is_active, version, updated_at;
  `;

  const res = await query(updateSql, [targetActive, actorId, userId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM users WHERE id = $1', [userId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const updated = res.rows[0];

  // If user deactivated, revoke all their active sessions immediately
  if (!targetActive) {
    await revokeAllUserSessions(userId);
  }

  await recordAuditEvent({
    entityName: 'USER',
    entityId: userId,
    action: targetActive ? AUDIT_ACTIONS.USER_ACTIVATE : AUDIT_ACTIONS.USER_DEACTIVATE,
    actorId,
    beforeState: { is_active: row.is_active, version: row.version },
    afterState: { is_active: updated.is_active, version: updated.version },
    changeReason: targetActive ? 'User account activated' : 'User account deactivated (sessions revoked)',
  });

  return updated;
}
