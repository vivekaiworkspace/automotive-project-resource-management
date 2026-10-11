import crypto from 'node:crypto';
import { query } from '../../db/index.js';

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  ACCOUNT_LOCKOUT: 'ACCOUNT_LOCKOUT',
  ROLE_ASSIGNMENT: 'ROLE_ASSIGNMENT',
  ROLE_REMOVAL: 'ROLE_REMOVAL',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  OVERRIDE: 'OVERRIDE',
  ARCHIVE: 'ARCHIVE',
  REACTIVATE: 'REACTIVATE',
  SCOPE_GRANT: 'SCOPE_GRANT',
  SCOPE_REVOKE: 'SCOPE_REVOKE',
  MEMBERSHIP_CREATE: 'MEMBERSHIP_CREATE',
  MEMBERSHIP_UPDATE: 'MEMBERSHIP_UPDATE',
  MEMBERSHIP_ARCHIVE: 'MEMBERSHIP_ARCHIVE',
  TAG_ASSIGN: 'TAG_ASSIGN',
  TAG_REMOVE: 'TAG_REMOVE',
  CUSTOM_FIELD_CREATE: 'CUSTOM_FIELD_CREATE',
  CUSTOM_FIELD_UPDATE: 'CUSTOM_FIELD_UPDATE',
  CUSTOM_FIELD_ARCHIVE: 'CUSTOM_FIELD_ARCHIVE',
  CUSTOM_FIELD_VALUE_UPDATE: 'CUSTOM_FIELD_VALUE_UPDATE',
  REFERENCE_DATA_CREATE: 'REFERENCE_DATA_CREATE',
  REFERENCE_DATA_UPDATE: 'REFERENCE_DATA_UPDATE',
  REFERENCE_DATA_ARCHIVE: 'REFERENCE_DATA_ARCHIVE',
  USER_ACTIVATE: 'USER_ACTIVATE',
  USER_DEACTIVATE: 'USER_DEACTIVATE',
};

/**
 * Append-only immutable audit event logger
 */
export async function recordAuditEvent({
  correlationId = crypto.randomUUID(),
  entityName,
  entityId = null,
  action,
  actorId = null,
  beforeState = null,
  afterState = null,
  changeReason = null,
  ipAddress = null,
  userAgent = null,
  client = null,
}) {
  const sql = `
    INSERT INTO audit_log (
      correlation_id,
      entity_name,
      entity_id,
      action,
      actor_id,
      before_state,
      after_state,
      change_reason,
      ip_address,
      user_agent,
      recorded_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
    RETURNING id, correlation_id, action, recorded_at;
  `;

  const values = [
    correlationId,
    entityName,
    entityId,
    action,
    actorId,
    beforeState ? JSON.stringify(beforeState) : null,
    afterState ? JSON.stringify(afterState) : null,
    changeReason,
    ipAddress,
    userAgent,
  ];

  try {
    const runner = client || { query };
    const result = await runner.query(sql, values);
    return result.rows[0];
  } catch (err) {
    if (client) {
      // In an active transaction, rethrow to ensure caller can rollback atomically
      throw err;
    }
    // If DB is not available in unit test environments without DB, log warning
    console.error('[AuditService] Failed to write audit event:', err.message);
    return null;
  }
}

/**
 * Fetch paginated audit events for System Administrator inspection
 */
export async function getAuditEvents({
  entityName = null,
  action = null,
  actorId = null,
  limit = 50,
  offset = 0,
} = {}) {
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (entityName) {
    conditions.push(`a.entity_name = $${paramIdx++}`);
    params.push(entityName);
  }

  if (action) {
    conditions.push(`a.action = $${paramIdx++}`);
    params.push(action);
  }

  if (actorId) {
    conditions.push(`a.actor_id = $${paramIdx++}`);
    params.push(actorId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) AS total FROM audit_log a ${whereClause}`;
  const countRes = await query(countSql, params);
  const total = parseInt(countRes.rows[0].total, 10);

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const queryParams = [...params, safeLimit, safeOffset];
  const listSql = `
    SELECT 
      a.id,
      a.correlation_id,
      a.entity_name,
      a.entity_id,
      a.action,
      a.actor_id,
      u.email AS actor_email,
      u.full_name AS actor_name,
      a.before_state,
      a.after_state,
      a.change_reason,
      a.ip_address,
      a.user_agent,
      a.recorded_at
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.actor_id
    ${whereClause}
    ORDER BY a.recorded_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;

  const listRes = await query(listSql, queryParams);

  return {
    events: listRes.rows,
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}
