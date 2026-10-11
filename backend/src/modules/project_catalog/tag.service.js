import { query } from '../../db/index.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { StaleVersionError } from '../iam/user.service.js';

export function checkProjectScope(projectId, requestingUser) {
  const isAdmin = requestingUser.roles.includes('SYSTEM_ADMIN');
  if (isAdmin) return true;

  const isPM = requestingUser.roles.includes('PROJECT_MANAGER');
  if (isPM) {
    const pmProjectIds = new Set((requestingUser.scopes || []).filter(s => s.scope_type === 'PROJECT').map(s => s.target_id));
    if (pmProjectIds.has(projectId)) return true;
  }

  return false;
}

/**
 * List all tags
 */
export async function listTags({ activeOnly = false } = {}) {
  const conditions = [];
  if (activeOnly) {
    conditions.push('is_active = TRUE AND archived_at IS NULL');
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT 
      id,
      code,
      name,
      is_active,
      display_order,
      version,
      created_at,
      updated_at,
      archived_at
    FROM work_area_tags
    ${where}
    ORDER BY display_order ASC, name ASC;
  `;
  const res = await query(sql);
  return res.rows;
}

/**
 * Create a new tag (System Admin only)
 */
export async function createTag({ code, name, displayOrder = 1, actorId }) {
  const cleanName = (name || '').trim();
  if (!cleanName || cleanName.length < 2) {
    throw new Error('Tag name must be at least 2 characters.');
  }

  const cleanCode = (code || cleanName).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');

  const existing = await query('SELECT id FROM work_area_tags WHERE name = $1 OR code = $2', [cleanName, cleanCode]);
  if (existing.rows.length > 0) {
    throw new Error(`Tag with name "${cleanName}" or code "${cleanCode}" already exists.`);
  }

  const insertSql = `
    INSERT INTO work_area_tags (
      code,
      name,
      is_active,
      display_order,
      version,
      created_by,
      updated_by
    ) VALUES ($1, $2, TRUE, $3, 1, $4, $4)
    RETURNING id, code, name, is_active, display_order, version, created_at;
  `;

  const res = await query(insertSql, [cleanCode, cleanName, Number(displayOrder) || 1, actorId]);
  const tag = res.rows[0];

  // Also sync to reference_data
  await query(`
    INSERT INTO reference_data (id, category, code, name, is_active, display_order, version, created_by, updated_by)
    VALUES ($1, 'WORK_AREA_TAG', $2, $3, TRUE, $4, 1, $5, $5)
    ON CONFLICT (category, code) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
  `, [tag.id, cleanCode, cleanName, tag.display_order, actorId]);

  await recordAuditEvent({
    entityName: 'WORK_AREA_TAG',
    entityId: tag.id,
    action: AUDIT_ACTIONS.INSERT,
    actorId,
    afterState: { id: tag.id, code: tag.code, name: tag.name },
    changeReason: 'Work-area tag created by System Administrator',
  });

  return tag;
}

/**
 * Update tag with optimistic locking (System Admin only)
 */
export async function updateTag(tagId, { name, displayOrder, expectedVersion, actorId }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, code, name, display_order, version FROM work_area_tags WHERE id = $1', [tagId]);
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const cleanName = name !== undefined ? name.trim() : row.name;
  const cleanOrder = displayOrder !== undefined ? Number(displayOrder) : row.display_order;

  const updateSql = `
    UPDATE work_area_tags
    SET 
      name = $1,
      display_order = $2,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $3
    WHERE id = $4 AND version = $5
    RETURNING id, code, name, is_active, display_order, version, updated_at;
  `;

  const res = await query(updateSql, [cleanName, cleanOrder, actorId, tagId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM work_area_tags WHERE id = $1', [tagId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const updated = res.rows[0];

  // Sync to reference_data
  await query('UPDATE reference_data SET name = $1, display_order = $2 WHERE category = \'WORK_AREA_TAG\' AND code = $3', [cleanName, cleanOrder, row.code]);

  await recordAuditEvent({
    entityName: 'WORK_AREA_TAG',
    entityId: tagId,
    action: AUDIT_ACTIONS.UPDATE,
    actorId,
    beforeState: { name: row.name, display_order: row.display_order, version: row.version },
    afterState: { name: updated.name, display_order: updated.display_order, version: updated.version },
    changeReason: 'Work-area tag updated by System Administrator',
  });

  return updated;
}

/**
 * Archive tag (System Admin only)
 */
export async function archiveTag(tagId, { expectedVersion, actorId }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, code, name, is_active, version FROM work_area_tags WHERE id = $1', [tagId]);
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const updateSql = `
    UPDATE work_area_tags
    SET 
      is_active = FALSE,
      archived_at = CURRENT_TIMESTAMP,
      archived_by = $1,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $1
    WHERE id = $2 AND version = $3
    RETURNING id, code, name, is_active, version, archived_at;
  `;

  const res = await query(updateSql, [actorId, tagId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM work_area_tags WHERE id = $1', [tagId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const archived = res.rows[0];

  await query('UPDATE reference_data SET is_active = FALSE, archived_at = CURRENT_TIMESTAMP, archived_by = $1 WHERE category = \'WORK_AREA_TAG\' AND code = $2', [actorId, row.code]);

  await recordAuditEvent({
    entityName: 'WORK_AREA_TAG',
    entityId: tagId,
    action: AUDIT_ACTIONS.ARCHIVE,
    actorId,
    beforeState: { is_active: row.is_active, version: row.version },
    afterState: { is_active: false, version: archived.version },
    changeReason: 'Work-area tag archived by System Administrator',
  });

  return archived;
}

/**
 * Get project's assigned tags
 */
export async function getProjectTags(projectId, requestingUser) {
  if (!checkProjectScope(projectId, requestingUser)) {
    throw new Error('Access denied: project is outside assigned scope.');
  }

  const sql = `
    SELECT 
      t.id,
      t.code,
      t.name,
      t.is_active,
      t.display_order,
      pt.created_at AS assigned_at
    FROM project_work_area_tags pt
    JOIN work_area_tags t ON t.id = pt.tag_id
    WHERE pt.project_id = $1
    ORDER BY t.display_order ASC, t.name ASC;
  `;

  const res = await query(sql, [projectId]);
  return res.rows;
}

/**
 * Assign tag to project
 */
export async function assignProjectTag(projectId, tagId, { actorId, requestingUser }) {
  if (!checkProjectScope(projectId, requestingUser)) {
    throw new Error('Access denied: project is outside assigned scope.');
  }

  // Check project is not archived or cancelled
  const projRes = await query('SELECT id, status, archived_at FROM projects WHERE id = $1', [projectId]);
  if (projRes.rows.length === 0) throw new Error('Project not found.');
  const proj = projRes.rows[0];
  if (proj.status === 'ARCHIVED' || proj.status === 'CANCELLED' || proj.archived_at) {
    throw new Error('Archived or cancelled projects cannot receive new tags.');
  }

  // Check tag exists, is active, and is not archived
  const tagRes = await query('SELECT id, name, is_active, archived_at FROM work_area_tags WHERE id = $1', [tagId]);
  if (tagRes.rows.length === 0) throw new Error('Tag not found.');
  const tag = tagRes.rows[0];
  if (!tag.is_active || tag.archived_at) {
    throw new Error('Inactive/archived tags cannot be newly assigned.');
  }

  // Check duplicate
  const existing = await query('SELECT project_id FROM project_work_area_tags WHERE project_id = $1 AND tag_id = $2', [projectId, tagId]);
  if (existing.rows.length > 0) {
    throw new Error('Tag is already assigned to this project.');
  }

  await query('INSERT INTO project_work_area_tags (project_id, tag_id, created_by) VALUES ($1, $2, $3)', [projectId, tagId, actorId]);

  await recordAuditEvent({
    entityName: 'PROJECT_TAG',
    entityId: projectId,
    action: AUDIT_ACTIONS.TAG_ASSIGN,
    actorId,
    afterState: { project_id: projectId, tag_id: tagId, tag_name: tag.name },
    changeReason: 'Work-area tag assigned to project',
  });

  return { project_id: projectId, tag_id: tagId, tag_name: tag.name };
}

/**
 * Remove tag from project
 */
export async function removeProjectTag(projectId, tagId, { actorId, requestingUser }) {
  if (!checkProjectScope(projectId, requestingUser)) {
    throw new Error('Access denied: project is outside assigned scope.');
  }

  const res = await query('DELETE FROM project_work_area_tags WHERE project_id = $1 AND tag_id = $2 RETURNING project_id, tag_id', [projectId, tagId]);
  if (res.rowCount === 0) {
    throw new Error('Tag is not assigned to this project.');
  }

  await recordAuditEvent({
    entityName: 'PROJECT_TAG',
    entityId: projectId,
    action: AUDIT_ACTIONS.TAG_REMOVE,
    actorId,
    beforeState: { project_id: projectId, tag_id: tagId },
    changeReason: 'Work-area tag removed from project',
  });

  return { project_id: projectId, tag_id: tagId };
}
