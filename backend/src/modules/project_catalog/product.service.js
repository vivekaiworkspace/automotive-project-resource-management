import { query } from '../../db/index.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { StaleVersionError } from '../iam/user.service.js';

/**
 * List products
 */
export async function listProducts({ activeOnly = false } = {}) {
  const conditions = [];
  if (activeOnly) {
    conditions.push("p.status = 'ACTIVE' AND p.archived_at IS NULL");
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      p.id,
      p.code,
      p.name,
      p.status,
      p.product_type_id,
      rt.name AS product_type_name,
      rt.code AS product_type_code,
      p.business_priority_id,
      rp.name AS business_priority_name,
      p.owner_user_id,
      u.full_name AS owner_name,
      p.version,
      p.created_at,
      p.updated_at,
      p.archived_at,
      (SELECT COUNT(*) FROM projects proj WHERE proj.product_id = p.id AND proj.status = 'ACTIVE' AND proj.archived_at IS NULL) AS active_project_count
    FROM products p
    LEFT JOIN reference_data rt ON rt.id = p.product_type_id
    LEFT JOIN reference_data rp ON rp.id = p.business_priority_id
    LEFT JOIN users u ON u.id = p.owner_user_id
    ${whereClause}
    ORDER BY p.name ASC;
  `;

  const res = await query(sql);
  return res.rows;
}

/**
 * Get product by ID
 */
export async function getProductById(productId) {
  const sql = `
    SELECT 
      p.id,
      p.code,
      p.name,
      p.status,
      p.product_type_id,
      rt.name AS product_type_name,
      rt.code AS product_type_code,
      p.business_priority_id,
      rp.name AS business_priority_name,
      p.owner_user_id,
      u.full_name AS owner_name,
      p.version,
      p.created_at,
      p.updated_at,
      p.archived_at
    FROM products p
    LEFT JOIN reference_data rt ON rt.id = p.product_type_id
    LEFT JOIN reference_data rp ON rp.id = p.business_priority_id
    LEFT JOIN users u ON u.id = p.owner_user_id
    WHERE p.id = $1;
  `;

  const res = await query(sql, [productId]);
  return res.rows[0] || null;
}

/**
 * Create product (System Admin only)
 */
export async function createProduct({
  code,
  name,
  productTypeId,
  businessPriorityId = null,
  ownerUserId = null,
  actorId,
}) {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode || cleanCode.length < 2) {
    throw new Error('Product code must be at least 2 characters.');
  }

  const cleanName = (name || '').trim();
  if (!cleanName || cleanName.length < 2) {
    throw new Error('Product name must be at least 2 characters.');
  }

  if (!productTypeId) {
    throw new Error('Product type is mandatory.');
  }

  // Validate product_type_id is active and not archived
  const ptRes = await query(
    "SELECT id, name FROM reference_data WHERE id = $1 AND category = 'PRODUCT_TYPE' AND is_active = TRUE AND archived_at IS NULL",
    [productTypeId]
  );
  if (ptRes.rows.length === 0) {
    throw new Error('Selected product type is invalid, inactive, or archived.');
  }

  // Validate business_priority_id if provided
  if (businessPriorityId) {
    const bpRes = await query(
      "SELECT id, name FROM reference_data WHERE id = $1 AND category = 'PRODUCT_PRIORITY' AND is_active = TRUE AND archived_at IS NULL",
      [businessPriorityId]
    );
    if (bpRes.rows.length === 0) {
      throw new Error('Selected business priority is invalid, inactive, or archived.');
    }
  }

  // Check unique code
  const existing = await query('SELECT id FROM products WHERE code = $1', [cleanCode]);
  if (existing.rows.length > 0) {
    throw new Error(`Product code "${cleanCode}" already exists.`);
  }

  const insertSql = `
    INSERT INTO products (
      code,
      name,
      product_type_id,
      business_priority_id,
      owner_user_id,
      status,
      version,
      created_by,
      updated_by
    ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 1, $6, $6)
    RETURNING id, code, name, product_type_id, business_priority_id, owner_user_id, status, version, created_at;
  `;

  const res = await query(insertSql, [cleanCode, cleanName, productTypeId, businessPriorityId, ownerUserId, actorId]);
  const product = res.rows[0];

  await recordAuditEvent({
    entityName: 'PRODUCT',
    entityId: product.id,
    action: AUDIT_ACTIONS.INSERT,
    actorId,
    afterState: { id: product.id, code: product.code, name: product.name, status: product.status },
    changeReason: 'Product created by System Administrator',
  });

  return product;
}

/**
 * Update product (System Admin only, optimistic locking)
 */
export async function updateProduct(productId, {
  name,
  productTypeId,
  businessPriorityId,
  ownerUserId,
  expectedVersion,
  actorId,
}) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query(
    'SELECT id, code, name, product_type_id, business_priority_id, owner_user_id, status, version FROM products WHERE id = $1',
    [productId]
  );
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const cleanName = name !== undefined ? name.trim() : row.name;
  const targetTypeId = productTypeId !== undefined ? productTypeId : row.product_type_id;
  const targetPriorityId = businessPriorityId !== undefined ? businessPriorityId : row.business_priority_id;
  const targetOwnerId = ownerUserId !== undefined ? ownerUserId : row.owner_user_id;

  // Validate active product type
  if (productTypeId && productTypeId !== row.product_type_id) {
    const ptRes = await query(
      "SELECT id FROM reference_data WHERE id = $1 AND category = 'PRODUCT_TYPE' AND is_active = TRUE AND archived_at IS NULL",
      [productTypeId]
    );
    if (ptRes.rows.length === 0) {
      throw new Error('Selected product type is invalid, inactive, or archived.');
    }
  }

  // Validate active priority
  if (businessPriorityId && businessPriorityId !== row.business_priority_id) {
    const bpRes = await query(
      "SELECT id FROM reference_data WHERE id = $1 AND category = 'PRODUCT_PRIORITY' AND is_active = TRUE AND archived_at IS NULL",
      [businessPriorityId]
    );
    if (bpRes.rows.length === 0) {
      throw new Error('Selected business priority is invalid, inactive, or archived.');
    }
  }

  const updateSql = `
    UPDATE products 
    SET 
      name = $1,
      product_type_id = $2,
      business_priority_id = $3,
      owner_user_id = $4,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $5
    WHERE id = $6 AND version = $7
    RETURNING id, code, name, product_type_id, business_priority_id, owner_user_id, status, version, updated_at;
  `;

  const res = await query(updateSql, [cleanName, targetTypeId, targetPriorityId, targetOwnerId, actorId, productId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM products WHERE id = $1', [productId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const updated = res.rows[0];

  await recordAuditEvent({
    entityName: 'PRODUCT',
    entityId: productId,
    action: AUDIT_ACTIONS.UPDATE,
    actorId,
    beforeState: { name: row.name, product_type_id: row.product_type_id, version: row.version },
    afterState: { name: updated.name, product_type_id: updated.product_type_id, version: updated.version },
    changeReason: 'Product updated by System Administrator',
  });

  return updated;
}

/**
 * Archive product (System Admin only)
 */
export async function archiveProduct(productId, { expectedVersion, actorId }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, code, name, status, version FROM products WHERE id = $1', [productId]);
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const updateSql = `
    UPDATE products 
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

  const res = await query(updateSql, [actorId, productId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM products WHERE id = $1', [productId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const archived = res.rows[0];

  await recordAuditEvent({
    entityName: 'PRODUCT',
    entityId: productId,
    action: AUDIT_ACTIONS.ARCHIVE,
    actorId,
    beforeState: { status: row.status, version: row.version },
    afterState: { status: archived.status, version: archived.version },
    changeReason: 'Product archived by System Administrator',
  });

  return archived;
}
