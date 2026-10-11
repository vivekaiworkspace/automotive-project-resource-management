import { query } from '../../db/index.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { StaleVersionError } from '../iam/user.service.js';

function checkTeamScopePermission(teamId, requestingUser) {
  const isAdmin = requestingUser.roles.includes('SYSTEM_ADMIN');
  if (isAdmin) return true;

  const isRM = requestingUser.roles.includes('RESOURCE_MANAGER');
  if (isRM) {
    const rmTeamIds = new Set((requestingUser.scopes || []).filter(s => s.scope_type === 'TEAM').map(s => s.target_id));
    if (rmTeamIds.has(teamId)) return true;
  }

  return false;
}

/**
 * List memberships for a team
 */
export async function listMemberships(teamId, requestingUser) {
  const isAdmin = requestingUser.roles.includes('SYSTEM_ADMIN');
  const isRM = requestingUser.roles.includes('RESOURCE_MANAGER');
  const isTL = requestingUser.roles.includes('TEAM_LEAD');
  const isTM = requestingUser.roles.includes('TEAM_MEMBER');

  if (isRM && !isAdmin) {
    const rmTeamIds = new Set((requestingUser.scopes || []).filter(s => s.scope_type === 'TEAM').map(s => s.target_id));
    if (!rmTeamIds.has(teamId)) {
      throw new Error('Access denied: team is outside assigned resource scope.');
    }
  } else if ((isTL || isTM) && !isAdmin) {
    const check = await query(
      'SELECT 1 FROM team_memberships WHERE team_id = $1 AND user_id = $2 AND archived_at IS NULL LIMIT 1',
      [teamId, requestingUser.id]
    );
    if (check.rows.length === 0) {
      throw new Error('Access denied: not a member of this team.');
    }
  }

  const sql = `
    SELECT 
      tm.id,
      tm.team_id,
      tm.user_id,
      u.email AS user_email,
      u.full_name AS user_full_name,
      u.is_active AS user_is_active,
      tm.is_team_lead,
      tm.active_from,
      tm.active_to,
      tm.version,
      tm.created_at,
      tm.updated_at,
      tm.archived_at
    FROM team_memberships tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = $1
    ORDER BY tm.is_team_lead DESC, u.full_name ASC;
  `;

  const res = await query(sql, [teamId]);
  return res.rows;
}

/**
 * Create a team membership
 */
export async function createMembership({
  teamId,
  userId,
  isTeamLead = false,
  activeFrom = null,
  activeTo = null,
  actorId,
  requestingUser,
}) {
  if (!checkTeamScopePermission(teamId, requestingUser)) {
    throw new Error('Access denied: insufficient permission to manage memberships for this team.');
  }

  // 1. Check team is active
  const teamRes = await query('SELECT id, status FROM teams WHERE id = $1', [teamId]);
  if (teamRes.rows.length === 0) {
    throw new Error('Team not found.');
  }
  if (teamRes.rows[0].status === 'ARCHIVED') {
    throw new Error('Archived teams cannot receive new memberships.');
  }

  // 2. Check user is active
  const userRes = await query('SELECT id, email, is_active FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) {
    throw new Error('User not found.');
  }
  if (!userRes.rows[0].is_active) {
    throw new Error('Only active users can receive active memberships.');
  }

  // 3. Prevent duplicate active membership
  const existingRes = await query(`
    SELECT id FROM team_memberships 
    WHERE team_id = $1 AND user_id = $2 AND archived_at IS NULL 
      AND (active_to IS NULL OR active_to >= CURRENT_DATE);
  `, [teamId, userId]);

  if (existingRes.rows.length > 0) {
    throw new Error('User already has an active membership in this team.');
  }

  const startDate = activeFrom || new Date().toISOString().slice(0, 10);

  const insertSql = `
    INSERT INTO team_memberships (
      team_id,
      user_id,
      is_team_lead,
      active_from,
      active_to,
      version,
      created_by,
      updated_by
    ) VALUES ($1, $2, $3, $4, $5, 1, $6, $6)
    RETURNING id, team_id, user_id, is_team_lead, active_from, active_to, version, created_at;
  `;

  const res = await query(insertSql, [teamId, userId, Boolean(isTeamLead), startDate, activeTo, actorId]);
  const membership = res.rows[0];

  await recordAuditEvent({
    entityName: 'TEAM_MEMBERSHIP',
    entityId: membership.id,
    action: AUDIT_ACTIONS.MEMBERSHIP_CREATE,
    actorId,
    afterState: { id: membership.id, team_id: teamId, user_id: userId, is_team_lead: membership.is_team_lead },
    changeReason: 'Team membership created',
  });

  return membership;
}

/**
 * Update team membership with optimistic locking
 */
export async function updateMembership(membershipId, {
  isTeamLead,
  activeFrom,
  activeTo,
  expectedVersion,
  actorId,
  requestingUser,
}) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query(
    'SELECT id, team_id, user_id, is_team_lead, active_from, active_to, version FROM team_memberships WHERE id = $1',
    [membershipId]
  );
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (!checkTeamScopePermission(row.team_id, requestingUser)) {
    throw new Error('Access denied: insufficient permission to manage this membership.');
  }

  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const targetIsLead = isTeamLead !== undefined ? Boolean(isTeamLead) : row.is_team_lead;
  const targetFrom = activeFrom !== undefined ? activeFrom : row.active_from;
  const targetTo = activeTo !== undefined ? activeTo : row.active_to;

  const updateSql = `
    UPDATE team_memberships
    SET 
      is_team_lead = $1,
      active_from = $2,
      active_to = $3,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $4
    WHERE id = $5 AND version = $6
    RETURNING id, team_id, user_id, is_team_lead, active_from, active_to, version, updated_at;
  `;

  const res = await query(updateSql, [targetIsLead, targetFrom, targetTo, actorId, membershipId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM team_memberships WHERE id = $1', [membershipId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const updated = res.rows[0];

  await recordAuditEvent({
    entityName: 'TEAM_MEMBERSHIP',
    entityId: membershipId,
    action: AUDIT_ACTIONS.MEMBERSHIP_UPDATE,
    actorId,
    beforeState: { is_team_lead: row.is_team_lead, active_from: row.active_from, active_to: row.active_to, version: row.version },
    afterState: { is_team_lead: updated.is_team_lead, active_from: updated.active_from, active_to: updated.active_to, version: updated.version },
    changeReason: 'Team membership updated',
  });

  return updated;
}

/**
 * Archive team membership
 */
export async function archiveMembership(membershipId, { expectedVersion, actorId, requestingUser }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query(
    'SELECT id, team_id, user_id, is_team_lead, version FROM team_memberships WHERE id = $1',
    [membershipId]
  );
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (!checkTeamScopePermission(row.team_id, requestingUser)) {
    throw new Error('Access denied: insufficient permission to archive this membership.');
  }

  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const sql = `
    UPDATE team_memberships 
    SET 
      archived_at = CURRENT_TIMESTAMP,
      archived_by = $1,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $1
    WHERE id = $2 AND version = $3
    RETURNING id, team_id, user_id, version, archived_at;
  `;

  const res = await query(sql, [actorId, membershipId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM team_memberships WHERE id = $1', [membershipId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const archived = res.rows[0];

  await recordAuditEvent({
    entityName: 'TEAM_MEMBERSHIP',
    entityId: membershipId,
    action: AUDIT_ACTIONS.MEMBERSHIP_ARCHIVE,
    actorId,
    beforeState: { is_team_lead: row.is_team_lead, version: row.version },
    afterState: { archived_at: archived.archived_at, version: archived.version },
    changeReason: 'Team membership archived',
  });

  return archived;
}
