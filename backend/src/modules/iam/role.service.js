import { query } from '../../db/index.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { VALID_PILOT_ROLES } from '../../middleware/auth.js';

/**
 * Assign a pilot role to a user and record append-only audit event (CPD-008, Req 3 & 4)
 */
export async function assignUserRole(userId, roleCode, actorId = null) {
  if (!VALID_PILOT_ROLES.has(roleCode)) {
    throw new Error(`Invalid role code: ${roleCode}. Permitted roles: ${Array.from(VALID_PILOT_ROLES).join(', ')}`);
  }

  const sql = `
    INSERT INTO user_roles (user_id, role_code) 
    VALUES ($1, $2) 
    ON CONFLICT (user_id, role_code) DO NOTHING
    RETURNING user_id, role_code;
  `;
  const res = await query(sql, [userId, roleCode]);

  await recordAuditEvent({
    entityName: 'USER_ROLE',
    entityId: userId,
    action: AUDIT_ACTIONS.ROLE_ASSIGNMENT,
    actorId,
    afterState: { role_code: roleCode },
  });

  return res.rows[0] || { user_id: userId, role_code: roleCode };
}

/**
 * Remove a pilot role from a user and record append-only audit event (CPD-008, Req 3 & 4)
 */
export async function removeUserRole(userId, roleCode, actorId = null) {
  const sql = `
    DELETE FROM user_roles 
    WHERE user_id = $1 AND role_code = $2
    RETURNING user_id, role_code;
  `;
  const res = await query(sql, [userId, roleCode]);

  await recordAuditEvent({
    entityName: 'USER_ROLE',
    entityId: userId,
    action: AUDIT_ACTIONS.ROLE_REMOVAL,
    actorId,
    beforeState: { role_code: roleCode },
  });

  return res.rows.length > 0;
}
