import { query } from '../../db/index.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { StaleVersionError } from '../iam/user.service.js';

export const VALID_REFERENCE_CATEGORIES = new Set([
  'PRODUCT_TYPE',
  'PRODUCT_PRIORITY',
  'PROJECT_PRIORITY',
  'PROJECT_STATUS',
  'ACTIVITY_TYPE',
  'ACTIVITY_PRIORITY',
  'WORK_AREA_TAG',
]);

/**
 * List distinct categories
 */
export async function listCategories() {
  const res = await query(`
    SELECT DISTINCT category 
    FROM reference_data 
    ORDER BY category ASC;
  `);
  return res.rows.map(r => r.category);
}

/**
 * List reference data items, optionally filtered by category
 */
export async function listReferenceData({ category = null, activeOnly = false } = {}) {
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (category) {
    conditions.push(`category = $${paramIdx++}`);
    params.push(category);
  }

  if (activeOnly) {
    conditions.push(`is_active = TRUE AND archived_at IS NULL`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT 
      id,
      category,
      code,
      name,
      is_active,
      display_order,
      version,
      created_at,
      updated_at,
      archived_at
    FROM reference_data
    ${whereClause}
    ORDER BY category ASC, display_order ASC, name ASC;
  `;

  const res = await query(sql, params);
  return res.rows;
}

/**
 * Get reference data by ID
 */
export async function getReferenceDataById(id) {
  const res = await query('SELECT * FROM reference_data WHERE id = $1', [id]);
  return res.rows[0] || null;
}

/**
 * Create configurable reference data item (System Admin only)
 */
export async function createReferenceData({ category, code, name, displayOrder = 1, actorId }) {
  if (!VALID_REFERENCE_CATEGORIES.has(category)) {
    throw new Error(`Invalid category: ${category}. Permitted categories: ${Array.from(VALID_REFERENCE_CATEGORIES).join(', ')}`);
  }

  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode || cleanCode.length < 2) {
    throw new Error('Code must be at least 2 characters.');
  }

  const cleanName = (name || '').trim();
  if (!cleanName || cleanName.length < 2) {
    throw new Error('Name must be at least 2 characters.');
  }

  // Check unique (category, code)
  const existing = await query('SELECT id FROM reference_data WHERE category = $1 AND code = $2', [category, cleanCode]);
  if (existing.rows.length > 0) {
    throw new Error(`Item with code "${cleanCode}" already exists in category "${category}".`);
  }

  const insertSql = `
    INSERT INTO reference_data (
      category,
      code,
      name,
      is_active,
      display_order,
      version,
      created_by,
      updated_by
    ) VALUES ($1, $2, $3, TRUE, $4, 1, $5, $5)
    RETURNING id, category, code, name, is_active, display_order, version, created_at;
  `;

  const res = await query(insertSql, [category, cleanCode, cleanName, Number(displayOrder) || 1, actorId]);
  const item = res.rows[0];

  // If this is WORK_AREA_TAG, also sync to work_area_tags table
  if (category === 'WORK_AREA_TAG') {
    await query(`
      INSERT INTO work_area_tags (id, name, code, is_active, display_order)
      VALUES ($1, $2, $3, TRUE, $4)
      ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, display_order = EXCLUDED.display_order;
    `, [item.id, cleanName, cleanCode, Number(displayOrder) || 1]);
  }

  await recordAuditEvent({
    entityName: 'REFERENCE_DATA',
    entityId: item.id,
    action: AUDIT_ACTIONS.REFERENCE_DATA_CREATE,
    actorId,
    afterState: { id: item.id, category, code: cleanCode, name: cleanName },
    changeReason: 'Reference data created by System Administrator',
  });

  return item;
}

/**
 * Update reference data item with optimistic locking (System Admin only)
 */
export async function updateReferenceData(id, { name, displayOrder, expectedVersion, actorId }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, category, code, name, display_order, is_active, version FROM reference_data WHERE id = $1', [id]);
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const cleanName = name !== undefined ? name.trim() : row.name;
  const cleanOrder = displayOrder !== undefined ? Number(displayOrder) : row.display_order;

  const updateSql = `
    UPDATE reference_data
    SET 
      name = $1,
      display_order = $2,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $3
    WHERE id = $4 AND version = $5
    RETURNING id, category, code, name, is_active, display_order, version, updated_at;
  `;

  const res = await query(updateSql, [cleanName, cleanOrder, actorId, id, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM reference_data WHERE id = $1', [id]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const updated = res.rows[0];

  if (row.category === 'WORK_AREA_TAG') {
    await query('UPDATE work_area_tags SET name = $1, display_order = $2 WHERE code = $3', [cleanName, cleanOrder, row.code]);
  }

  await recordAuditEvent({
    entityName: 'REFERENCE_DATA',
    entityId: id,
    action: AUDIT_ACTIONS.REFERENCE_DATA_UPDATE,
    actorId,
    beforeState: { name: row.name, display_order: row.display_order, version: row.version },
    afterState: { name: updated.name, display_order: updated.display_order, version: updated.version },
    changeReason: 'Reference data updated by System Administrator',
  });

  return updated;
}

/**
 * Archive reference data item (System Admin only)
 * Logical archive; historical records retain references
 */
export async function archiveReferenceData(id, { expectedVersion, actorId }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, category, code, is_active, version FROM reference_data WHERE id = $1', [id]);
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const updateSql = `
    UPDATE reference_data
    SET 
      is_active = FALSE,
      archived_at = CURRENT_TIMESTAMP,
      archived_by = $1,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $1
    WHERE id = $2 AND version = $3
    RETURNING id, category, code, is_active, version, archived_at;
  `;

  const res = await query(updateSql, [actorId, id, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM reference_data WHERE id = $1', [id]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const archived = res.rows[0];

  if (row.category === 'WORK_AREA_TAG') {
    await query('UPDATE work_area_tags SET is_active = FALSE WHERE code = $1', [row.code]);
  }

  await recordAuditEvent({
    entityName: 'REFERENCE_DATA',
    entityId: id,
    action: AUDIT_ACTIONS.REFERENCE_DATA_ARCHIVE,
    actorId,
    beforeState: { is_active: row.is_active, version: row.version },
    afterState: { is_active: false, version: archived.version },
    changeReason: 'Reference data archived by System Administrator',
  });

  return archived;
}

/**
 * Reactivate archived reference data item (System Admin only)
 */
export async function reactivateReferenceData(id, { expectedVersion, actorId }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, category, code, is_active, version FROM reference_data WHERE id = $1', [id]);
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const updateSql = `
    UPDATE reference_data
    SET 
      is_active = TRUE,
      archived_at = NULL,
      archived_by = NULL,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $1
    WHERE id = $2 AND version = $3
    RETURNING id, category, code, is_active, version, updated_at;
  `;

  const res = await query(updateSql, [actorId, id, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM reference_data WHERE id = $1', [id]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const reactivated = res.rows[0];

  if (row.category === 'WORK_AREA_TAG') {
    await query('UPDATE work_area_tags SET is_active = TRUE WHERE code = $1', [row.code]);
  }

  await recordAuditEvent({
    entityName: 'REFERENCE_DATA',
    entityId: id,
    action: AUDIT_ACTIONS.REACTIVATE,
    actorId,
    beforeState: { is_active: row.is_active, version: row.version },
    afterState: { is_active: true, version: reactivated.version },
    changeReason: 'Reference data reactivated by System Administrator',
  });

  return reactivated;
}
