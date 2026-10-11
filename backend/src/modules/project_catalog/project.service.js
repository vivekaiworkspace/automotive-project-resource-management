import { query } from '../../db/index.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { StaleVersionError } from '../iam/user.service.js';
import { checkProjectScope, getProjectTags, assignProjectTag } from './tag.service.js';
import { getProjectCustomFields, saveProjectCustomFields } from './custom_field.service.js';

/**
 * List projects scoped by user role
 */
export async function listProjects(requestingUser) {
  const isAdmin = requestingUser.roles.includes('SYSTEM_ADMIN');
  const isPM = requestingUser.roles.includes('PROJECT_MANAGER');

  let whereClause = '';
  let params = [];

  if (isAdmin) {
    whereClause = '';
  } else if (isPM) {
    const pmProjectIds = (requestingUser.scopes || [])
      .filter(s => s.scope_type === 'PROJECT')
      .map(s => s.target_id);

    if (pmProjectIds.length === 0) return [];
    whereClause = 'WHERE p.id = ANY($1::uuid[])';
    params = [pmProjectIds];
  } else {
    return [];
  }

  const sql = `
    SELECT 
      p.id,
      p.code,
      p.name,
      p.description,
      p.product_id,
      prod.code AS product_code,
      prod.name AS product_name,
      prod.product_type_id,
      p.owner_user_id,
      u.full_name AS owner_name,
      p.project_priority_id,
      rp.name AS priority_name,
      rp.code AS priority_code,
      p.project_status_id,
      rs.name AS status_name,
      rs.code AS status_code,
      p.status,
      p.planned_start_date,
      p.planned_finish_date,
      p.version,
      p.created_at,
      p.updated_at,
      p.archived_at,
      COALESCE(
        (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'code', t.code))
         FROM project_work_area_tags pt
         JOIN work_area_tags t ON t.id = pt.tag_id
         WHERE pt.project_id = p.id),
        '[]'::json
      ) AS tags,
      (SELECT COUNT(*) FROM phases ph WHERE ph.project_id = p.id AND ph.archived_at IS NULL) AS phase_count
    FROM projects p
    JOIN products prod ON prod.id = p.product_id
    LEFT JOIN reference_data rp ON rp.id = p.project_priority_id
    LEFT JOIN reference_data rs ON rs.id = p.project_status_id
    LEFT JOIN users u ON u.id = p.owner_user_id
    ${whereClause}
    ORDER BY p.planned_start_date DESC, p.name ASC;
  `;

  const res = await query(sql, params);
  return res.rows;
}

/**
 * Get project by ID with full details
 */
export async function getProjectById(projectId, requestingUser) {
  if (!checkProjectScope(projectId, requestingUser)) {
    throw new Error('Access denied: project is outside assigned scope.');
  }

  const sql = `
    SELECT 
      p.id,
      p.code,
      p.name,
      p.description,
      p.product_id,
      prod.code AS product_code,
      prod.name AS product_name,
      prod.product_type_id,
      p.owner_user_id,
      u.full_name AS owner_name,
      p.project_priority_id,
      rp.name AS priority_name,
      rp.code AS priority_code,
      p.project_status_id,
      rs.name AS status_name,
      rs.code AS status_code,
      p.status,
      p.planned_start_date,
      p.planned_finish_date,
      p.version,
      p.created_at,
      p.updated_at,
      p.archived_at,
      COALESCE(
        (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'code', t.code))
         FROM project_work_area_tags pt
         JOIN work_area_tags t ON t.id = pt.tag_id
         WHERE pt.project_id = p.id),
        '[]'::json
      ) AS tags,
      COALESCE(
        (SELECT json_agg(json_build_object(
           'id', ph.id,
           'name', ph.name,
           'sequence_number', ph.sequence_number,
           'planned_start_date', ph.planned_start_date,
           'planned_finish_date', ph.planned_finish_date,
           'version', ph.version
         ) ORDER BY ph.sequence_number ASC)
         FROM phases ph
         WHERE ph.project_id = p.id AND ph.archived_at IS NULL),
        '[]'::json
      ) AS phases,
      COALESCE(
        (SELECT json_agg(json_build_object(
           'user_id', pms.user_id,
           'full_name', pmu.full_name,
           'email', pmu.email
         ))
         FROM project_manager_scopes pms
         JOIN users pmu ON pmu.id = pms.user_id
         WHERE pms.project_id = p.id),
        '[]'::json
      ) AS managers
    FROM projects p
    JOIN products prod ON prod.id = p.product_id
    LEFT JOIN reference_data rp ON rp.id = p.project_priority_id
    LEFT JOIN reference_data rs ON rs.id = p.project_status_id
    LEFT JOIN users u ON u.id = p.owner_user_id
    WHERE p.id = $1;
  `;

  const res = await query(sql, [projectId]);
  const project = res.rows[0] || null;
  if (!project) return null;

  // Fetch custom field values
  project.custom_fields = await getProjectCustomFields(projectId);

  return project;
}

/**
 * Create project (System Admin only)
 */
export async function createProject({
  code,
  name,
  description = null,
  productId,
  ownerUserId = null,
  projectPriorityId,
  projectStatusId,
  plannedStartDate,
  plannedFinishDate,
  tagIds = [],
  customFieldValues = {},
  actorId,
}) {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode || cleanCode.length < 2) {
    throw new Error('Project code must be at least 2 characters.');
  }

  const cleanName = (name || '').trim();
  if (!cleanName || cleanName.length < 2) {
    throw new Error('Project name must be at least 2 characters.');
  }

  if (!productId) {
    throw new Error('Product is mandatory.');
  }

  // 1. Validate Product exists, is ACTIVE, and is NOT archived
  const prodRes = await query('SELECT id, code, status, archived_at FROM products WHERE id = $1', [productId]);
  if (prodRes.rows.length === 0) {
    throw new Error('Selected product does not exist.');
  }
  const prod = prodRes.rows[0];
  if (prod.status === 'ARCHIVED' || prod.archived_at) {
    throw new Error('Archived products cannot receive new active projects.');
  }

  // 2. Validate dates: planned finish cannot precede planned start
  if (!plannedStartDate || !plannedFinishDate) {
    throw new Error('Planned start date and planned finish date are mandatory.');
  }
  if (new Date(plannedFinishDate) < new Date(plannedStartDate)) {
    throw new Error('Planned finish date cannot precede planned start date.');
  }

  // 3. Validate Priority and Status
  if (!projectPriorityId) {
    throw new Error('Project priority is mandatory.');
  }
  const prioRes = await query(
    "SELECT id FROM reference_data WHERE id = $1 AND category = 'PROJECT_PRIORITY' AND is_active = TRUE AND archived_at IS NULL",
    [projectPriorityId]
  );
  if (prioRes.rows.length === 0) {
    throw new Error('Selected project priority is invalid, inactive, or archived.');
  }

  if (!projectStatusId) {
    throw new Error('Project status is mandatory.');
  }
  const statRes = await query(
    "SELECT id, code FROM reference_data WHERE id = $1 AND category = 'PROJECT_STATUS' AND is_active = TRUE AND archived_at IS NULL",
    [projectStatusId]
  );
  if (statRes.rows.length === 0) {
    throw new Error('Selected project status is invalid, inactive, or archived.');
  }
  const statusCode = statRes.rows[0].code;

  // 4. Check unique project code
  const existing = await query('SELECT id FROM projects WHERE code = $1', [cleanCode]);
  if (existing.rows.length > 0) {
    throw new Error(`Project code "${cleanCode}" already exists.`);
  }

  const insertSql = `
    INSERT INTO projects (
      code,
      name,
      description,
      product_id,
      owner_user_id,
      project_priority_id,
      project_status_id,
      status,
      planned_start_date,
      planned_finish_date,
      version,
      created_by,
      updated_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, $11)
    RETURNING id, code, name, description, product_id, owner_user_id, project_priority_id, project_status_id, status, planned_start_date, planned_finish_date, version, created_at;
  `;

  const res = await query(insertSql, [
    cleanCode,
    cleanName,
    description,
    productId,
    ownerUserId,
    projectPriorityId,
    projectStatusId,
    statusCode,
    plannedStartDate,
    plannedFinishDate,
    actorId,
  ]);

  const project = res.rows[0];

  // Assign tags if provided
  if (Array.isArray(tagIds) && tagIds.length > 0) {
    for (const tagId of tagIds) {
      await assignProjectTag(project.id, tagId, { actorId, requestingUser: { roles: ['SYSTEM_ADMIN'] } });
    }
  }

  // Save custom fields if provided
  if (customFieldValues && Object.keys(customFieldValues).length > 0) {
    await saveProjectCustomFields(project.id, customFieldValues, { actorId });
  }

  await recordAuditEvent({
    entityName: 'PROJECT',
    entityId: project.id,
    action: AUDIT_ACTIONS.INSERT,
    actorId,
    afterState: { id: project.id, code: project.code, name: project.name, product_id: productId, status: project.status },
    changeReason: 'Project created by System Administrator',
  });

  return project;
}

/**
 * Update project (System Admin or scoped Project Manager, optimistic locking)
 */
export async function updateProject(projectId, {
  name,
  description,
  ownerUserId,
  projectPriorityId,
  projectStatusId,
  plannedStartDate,
  plannedFinishDate,
  expectedVersion,
  actorId,
  requestingUser,
}) {
  if (!checkProjectScope(projectId, requestingUser)) {
    throw new Error('Access denied: project is outside assigned scope.');
  }

  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query(`
    SELECT id, code, name, description, product_id, owner_user_id, project_priority_id, project_status_id, status, planned_start_date, planned_finish_date, version, archived_at
    FROM projects WHERE id = $1
  `, [projectId]);

  if (current.rows.length === 0) return null;
  const row = current.rows[0];

  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const cleanName = name !== undefined ? name.trim() : row.name;
  const cleanDesc = description !== undefined ? description : row.description;
  const targetOwnerId = ownerUserId !== undefined ? ownerUserId : row.owner_user_id;
  const targetPriorityId = projectPriorityId !== undefined ? projectPriorityId : row.project_priority_id;
  const targetStatusId = projectStatusId !== undefined ? projectStatusId : row.project_status_id;
  const targetStart = plannedStartDate !== undefined ? plannedStartDate : row.planned_start_date;
  const targetFinish = plannedFinishDate !== undefined ? plannedFinishDate : row.planned_finish_date;

  if (new Date(targetFinish) < new Date(targetStart)) {
    throw new Error('Planned finish date cannot precede planned start date.');
  }

  // Validate active priority if changed
  if (projectPriorityId && projectPriorityId !== row.project_priority_id) {
    const prioRes = await query(
      "SELECT id FROM reference_data WHERE id = $1 AND category = 'PROJECT_PRIORITY' AND is_active = TRUE AND archived_at IS NULL",
      [projectPriorityId]
    );
    if (prioRes.rows.length === 0) throw new Error('Selected project priority is invalid, inactive, or archived.');
  }

  // Validate active status if changed
  let targetStatusCode = row.status;
  if (projectStatusId && projectStatusId !== row.project_status_id) {
    const statRes = await query(
      "SELECT id, code FROM reference_data WHERE id = $1 AND category = 'PROJECT_STATUS' AND is_active = TRUE AND archived_at IS NULL",
      [projectStatusId]
    );
    if (statRes.rows.length === 0) throw new Error('Selected project status is invalid, inactive, or archived.');
    targetStatusCode = statRes.rows[0].code;
  }

  const updateSql = `
    UPDATE projects
    SET 
      name = $1,
      description = $2,
      owner_user_id = $3,
      project_priority_id = $4,
      project_status_id = $5,
      status = $6,
      planned_start_date = $7,
      planned_finish_date = $8,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $9
    WHERE id = $10 AND version = $11
    RETURNING id, code, name, description, product_id, owner_user_id, project_priority_id, project_status_id, status, planned_start_date, planned_finish_date, version, updated_at;
  `;

  const res = await query(updateSql, [
    cleanName,
    cleanDesc,
    targetOwnerId,
    targetPriorityId,
    targetStatusId,
    targetStatusCode,
    targetStart,
    targetFinish,
    actorId,
    projectId,
    expectedVersion,
  ]);

  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM projects WHERE id = $1', [projectId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const updated = res.rows[0];

  await recordAuditEvent({
    entityName: 'PROJECT',
    entityId: projectId,
    action: AUDIT_ACTIONS.UPDATE,
    actorId,
    beforeState: { name: row.name, status: row.status, version: row.version },
    afterState: { name: updated.name, status: updated.status, version: updated.version },
    changeReason: 'Project updated',
  });

  return updated;
}

/**
 * Archive project (System Admin only)
 */
export async function archiveProject(projectId, { expectedVersion, actorId }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, code, name, status, version FROM projects WHERE id = $1', [projectId]);
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const updateSql = `
    UPDATE projects
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

  const res = await query(updateSql, [actorId, projectId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM projects WHERE id = $1', [projectId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const archived = res.rows[0];

  await recordAuditEvent({
    entityName: 'PROJECT',
    entityId: projectId,
    action: AUDIT_ACTIONS.ARCHIVE,
    actorId,
    beforeState: { status: row.status, version: row.version },
    afterState: { status: archived.status, version: archived.version },
    changeReason: 'Project archived by System Administrator',
  });

  return archived;
}
