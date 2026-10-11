import { query } from '../../db/index.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { StaleVersionError } from '../iam/user.service.js';

/**
 * List teams scoped by user role
 */
export async function listTeams(requestingUser) {
  const isAdmin = requestingUser.roles.includes('SYSTEM_ADMIN');
  const isRM = requestingUser.roles.includes('RESOURCE_MANAGER');
  const isTL = requestingUser.roles.includes('TEAM_LEAD');
  const isTM = requestingUser.roles.includes('TEAM_MEMBER');

  let sql;
  let params = [];

  if (isAdmin) {
    sql = `
      SELECT 
        t.id,
        t.code,
        t.name,
        t.description,
        t.status,
        t.version,
        t.created_at,
        t.updated_at,
        t.archived_at,
        COUNT(tm.id) FILTER (WHERE tm.archived_at IS NULL AND (tm.active_to IS NULL OR tm.active_to >= CURRENT_DATE)) AS active_member_count
      FROM teams t
      LEFT JOIN team_memberships tm ON tm.team_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at ASC;
    `;
  } else if (isRM) {
    const rmTeamIds = (requestingUser.scopes || [])
      .filter(s => s.scope_type === 'TEAM')
      .map(s => s.target_id);

    if (rmTeamIds.length === 0) return [];

    sql = `
      SELECT 
        t.id,
        t.code,
        t.name,
        t.description,
        t.status,
        t.version,
        t.created_at,
        t.updated_at,
        t.archived_at,
        COUNT(tm.id) FILTER (WHERE tm.archived_at IS NULL AND (tm.active_to IS NULL OR tm.active_to >= CURRENT_DATE)) AS active_member_count
      FROM teams t
      LEFT JOIN team_memberships tm ON tm.team_id = t.id
      WHERE t.id = ANY($1::uuid[])
      GROUP BY t.id
      ORDER BY t.created_at ASC;
    `;
    params = [rmTeamIds];
  } else if (isTL || isTM) {
    sql = `
      SELECT DISTINCT
        t.id,
        t.code,
        t.name,
        t.description,
        t.status,
        t.version,
        t.created_at,
        t.updated_at,
        t.archived_at,
        (SELECT COUNT(*) FROM team_memberships sub WHERE sub.team_id = t.id AND sub.archived_at IS NULL AND (sub.active_to IS NULL OR sub.active_to >= CURRENT_DATE)) AS active_member_count
      FROM teams t
      JOIN team_memberships tm ON tm.team_id = t.id
      WHERE tm.user_id = $1 AND tm.archived_at IS NULL
      ORDER BY t.created_at ASC;
    `;
    params = [requestingUser.id];
  } else {
    return [];
  }

  const res = await query(sql, params);
  return res.rows;
}

/**
 * Get team by ID
 */
export async function getTeamById(teamId, requestingUser = null) {
  const sql = `
    SELECT 
      t.id,
      t.code,
      t.name,
      t.description,
      t.status,
      t.version,
      t.created_at,
      t.updated_at,
      t.archived_at
    FROM teams t
    WHERE t.id = $1;
  `;
  const res = await query(sql, [teamId]);
  const team = res.rows[0] || null;

  if (!team || !requestingUser) return team;

  const isAdmin = requestingUser.roles.includes('SYSTEM_ADMIN');
  if (isAdmin) return team;

  const isRM = requestingUser.roles.includes('RESOURCE_MANAGER');
  if (isRM) {
    const rmTeamIds = new Set((requestingUser.scopes || []).filter(s => s.scope_type === 'TEAM').map(s => s.target_id));
    if (!rmTeamIds.has(teamId)) {
      throw new Error('Access denied: team is outside assigned resource scope.');
    }
    return team;
  }

  // TL or TM
  const memCheck = await query(
    'SELECT 1 FROM team_memberships WHERE team_id = $1 AND user_id = $2 AND archived_at IS NULL LIMIT 1',
    [teamId, requestingUser.id]
  );
  if (memCheck.rows.length === 0) {
    throw new Error('Access denied: user is not a member of this team.');
  }

  return team;
}

/**
 * Create a new team (System Admin only)
 */
export async function createTeam({ code, name, description = null, actorId }) {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode || cleanCode.length < 2) {
    throw new Error('Team code must be at least 2 characters.');
  }

  const cleanName = (name || '').trim();
  if (!cleanName || cleanName.length < 2) {
    throw new Error('Team name must be at least 2 characters.');
  }

  const existing = await query('SELECT id FROM teams WHERE code = $1', [cleanCode]);
  if (existing.rows.length > 0) {
    throw new Error(`Team code "${cleanCode}" already exists.`);
  }

  const insertSql = `
    INSERT INTO teams (
      code,
      name,
      description,
      status,
      version,
      created_by,
      updated_by
    ) VALUES ($1, $2, $3, 'ACTIVE', 1, $4, $4)
    RETURNING id, code, name, description, status, version, created_at;
  `;

  const res = await query(insertSql, [cleanCode, cleanName, description, actorId]);
  const team = res.rows[0];

  await recordAuditEvent({
    entityName: 'TEAM',
    entityId: team.id,
    action: AUDIT_ACTIONS.INSERT,
    actorId,
    afterState: { id: team.id, code: team.code, name: team.name, status: team.status },
    changeReason: 'Team created by System Administrator',
  });

  return team;
}

/**
 * Update team with optimistic locking
 */
export async function updateTeam(teamId, { name, description, status, expectedVersion, actorId, requestingUser }) {
  const isAdmin = requestingUser.roles.includes('SYSTEM_ADMIN');
  const isRM = requestingUser.roles.includes('RESOURCE_MANAGER');

  if (!isAdmin && !isRM) {
    throw new Error('Access denied: insufficient permission to update team.');
  }

  if (isRM && !isAdmin) {
    const rmTeamIds = new Set((requestingUser.scopes || []).filter(s => s.scope_type === 'TEAM').map(s => s.target_id));
    if (!rmTeamIds.has(teamId)) {
      throw new Error('Access denied: team is outside assigned resource scope.');
    }
  }

  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, code, name, description, status, version FROM teams WHERE id = $1', [teamId]);
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const cleanName = name !== undefined ? name.trim() : row.name;
  const cleanDesc = description !== undefined ? description : row.description;
  const cleanStatus = status !== undefined ? status : row.status;

  const updateSql = `
    UPDATE teams 
    SET 
      name = $1,
      description = $2,
      status = $3,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $4
    WHERE id = $5 AND version = $6
    RETURNING id, code, name, description, status, version, updated_at;
  `;

  const res = await query(updateSql, [cleanName, cleanDesc, cleanStatus, actorId, teamId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM teams WHERE id = $1', [teamId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const updated = res.rows[0];

  await recordAuditEvent({
    entityName: 'TEAM',
    entityId: teamId,
    action: AUDIT_ACTIONS.UPDATE,
    actorId,
    beforeState: { name: row.name, description: row.description, status: row.status, version: row.version },
    afterState: { name: updated.name, description: updated.description, status: updated.status, version: updated.version },
    changeReason: 'Team updated',
  });

  return updated;
}

/**
 * Archive team (System Admin only)
 */
export async function archiveTeam(teamId, { expectedVersion, actorId }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, code, name, status, version FROM teams WHERE id = $1', [teamId]);
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const sql = `
    UPDATE teams 
    SET 
      status = 'ARCHIVED',
      version = version + 1,
      archived_at = CURRENT_TIMESTAMP,
      archived_by = $1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $1
    WHERE id = $2 AND version = $3
    RETURNING id, code, name, status, version, archived_at;
  `;

  const res = await query(sql, [actorId, teamId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM teams WHERE id = $1', [teamId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const archived = res.rows[0];

  await recordAuditEvent({
    entityName: 'TEAM',
    entityId: teamId,
    action: AUDIT_ACTIONS.ARCHIVE,
    actorId,
    beforeState: { status: row.status, version: row.version },
    afterState: { status: archived.status, version: archived.version },
    changeReason: 'Team archived by System Administrator',
  });

  return archived;
}
