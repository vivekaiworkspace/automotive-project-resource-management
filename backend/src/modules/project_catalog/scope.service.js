import { query } from '../../db/index.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { checkProjectScope } from './tag.service.js';

/**
 * List all project manager scope mappings (System Admin only)
 */
export async function listAllProjectScopes() {
  const sql = `
    SELECT 
      pms.id,
      pms.user_id,
      u.email AS user_email,
      u.full_name AS user_name,
      pms.project_id,
      p.code AS project_code,
      p.name AS project_name,
      pms.created_at
    FROM project_manager_scopes pms
    JOIN users u ON u.id = pms.user_id
    JOIN projects p ON p.id = pms.project_id
    ORDER BY p.name ASC, u.full_name ASC;
  `;
  const res = await query(sql);
  return res.rows;
}

/**
 * Get project managers for a specific project
 */
export async function getProjectManagers(projectId, requestingUser) {
  if (!checkProjectScope(projectId, requestingUser)) {
    throw new Error('Access denied: project is outside assigned scope.');
  }

  const sql = `
    SELECT 
      pms.id,
      pms.user_id,
      u.email,
      u.full_name,
      u.is_active,
      pms.created_at AS assigned_at
    FROM project_manager_scopes pms
    JOIN users u ON u.id = pms.user_id
    WHERE pms.project_id = $1
    ORDER BY u.full_name ASC;
  `;
  const res = await query(sql, [projectId]);
  return res.rows;
}

/**
 * Assign Project Manager to a project (System Admin only)
 */
export async function assignProjectManager(projectId, userId, actorId) {
  // Check project exists
  const projRes = await query('SELECT id, code, name FROM projects WHERE id = $1', [projectId]);
  if (projRes.rows.length === 0) throw new Error('Project not found.');
  const proj = projRes.rows[0];

  // Check user exists, is active, and possesses PROJECT_MANAGER role
  const userRes = await query(`
    SELECT u.id, u.email, u.full_name, u.is_active,
      EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_code = 'PROJECT_MANAGER') AS has_pm_role
    FROM users u
    WHERE u.id = $1;
  `, [userId]);

  if (userRes.rows.length === 0) throw new Error('User not found.');
  const user = userRes.rows[0];

  if (!user.is_active) {
    throw new Error('Cannot assign scope to inactive user.');
  }

  if (!user.has_pm_role) {
    throw new Error(`User "${user.email}" does not have the PROJECT_MANAGER role.`);
  }

  // Check existing
  const existing = await query('SELECT id FROM project_manager_scopes WHERE user_id = $1 AND project_id = $2', [userId, projectId]);
  if (existing.rows.length > 0) {
    return { assigned: false, reason: 'ALREADY_ASSIGNED' };
  }

  const insertSql = `
    INSERT INTO project_manager_scopes (user_id, project_id, created_by)
    VALUES ($1, $2, $3)
    RETURNING id, user_id, project_id, created_at;
  `;
  const res = await query(insertSql, [userId, projectId, actorId]);
  const scope = res.rows[0];

  // Mirror into user_scopes
  await query(`
    INSERT INTO user_scopes (user_id, scope_type, target_id)
    VALUES ($1, 'PROJECT', $2)
    ON CONFLICT DO NOTHING;
  `, [userId, projectId]);

  await recordAuditEvent({
    entityName: 'PROJECT_MANAGER_SCOPE',
    entityId: scope.id,
    action: AUDIT_ACTIONS.SCOPE_GRANT,
    actorId,
    afterState: { user_id: userId, user_email: user.email, project_id: projectId, project_code: proj.code },
    changeReason: 'Project scope granted to Project Manager',
  });

  return { assigned: true, scope };
}

/**
 * Remove Project Manager from a project (System Admin only)
 */
export async function removeProjectManager(projectId, userId, actorId) {
  const current = await query(
    'SELECT id FROM project_manager_scopes WHERE user_id = $1 AND project_id = $2',
    [userId, projectId]
  );
  if (current.rows.length === 0) {
    return { removed: false, reason: 'SCOPE_NOT_FOUND' };
  }

  const scopeId = current.rows[0].id;
  await query('DELETE FROM project_manager_scopes WHERE id = $1', [scopeId]);
  await query('DELETE FROM user_scopes WHERE user_id = $1 AND scope_type = \'PROJECT\' AND target_id = $2', [userId, projectId]);

  await recordAuditEvent({
    entityName: 'PROJECT_MANAGER_SCOPE',
    entityId: scopeId,
    action: AUDIT_ACTIONS.SCOPE_REVOKE,
    actorId,
    beforeState: { user_id: userId, project_id: projectId },
    changeReason: 'Project scope removed from Project Manager',
  });

  return { removed: true };
}
