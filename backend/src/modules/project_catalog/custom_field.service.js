import { query } from '../../db/index.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { StaleVersionError } from '../iam/user.service.js';

export const VALID_FIELD_TYPES = new Set([
  'text',
  'number',
  'date',
  'yes_no',
  'single_select',
  'multi_select',
]);

/**
 * List custom field definitions, optionally by product_type_id
 */
export async function listCustomFieldDefinitions({ productTypeId = null, activeOnly = false } = {}) {
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (productTypeId) {
    conditions.push(`cfd.product_type_id = $${paramIdx++}`);
    params.push(productTypeId);
  }

  if (activeOnly) {
    conditions.push(`cfd.is_active = TRUE AND cfd.archived_at IS NULL`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      cfd.id,
      cfd.product_type_id,
      rt.name AS product_type_name,
      cfd.code,
      cfd.label,
      cfd.help_text,
      cfd.field_type,
      cfd.is_required,
      cfd.is_active,
      cfd.display_order,
      cfd.version,
      cfd.created_at,
      cfd.updated_at,
      cfd.archived_at,
      COALESCE(
        (SELECT json_agg(json_build_object(
           'id', cfo.id,
           'code', cfo.code,
           'label', cfo.label,
           'display_order', cfo.display_order,
           'is_active', cfo.is_active,
           'version', cfo.version,
           'archived_at', cfo.archived_at
         ) ORDER BY cfo.display_order ASC)
         FROM custom_field_options cfo
         WHERE cfo.custom_field_definition_id = cfd.id
         AND (NOT $${paramIdx} OR (cfo.is_active = TRUE AND cfo.archived_at IS NULL))),
        '[]'::json
      ) AS options
    FROM custom_field_definitions cfd
    JOIN reference_data rt ON rt.id = cfd.product_type_id
    ${whereClause}
    ORDER BY cfd.display_order ASC, cfd.label ASC;
  `;

  params.push(activeOnly);
  const res = await query(sql, params);
  return res.rows;
}

/**
 * Get single custom field definition with options
 */
export async function getCustomFieldDefinitionById(id) {
  const sql = `
    SELECT 
      cfd.id,
      cfd.product_type_id,
      rt.name AS product_type_name,
      cfd.code,
      cfd.label,
      cfd.help_text,
      cfd.field_type,
      cfd.is_required,
      cfd.is_active,
      cfd.display_order,
      cfd.version,
      cfd.created_at,
      cfd.updated_at,
      cfd.archived_at,
      COALESCE(
        (SELECT json_agg(json_build_object(
           'id', cfo.id,
           'code', cfo.code,
           'label', cfo.label,
           'display_order', cfo.display_order,
           'is_active', cfo.is_active,
           'version', cfo.version,
           'archived_at', cfo.archived_at
         ) ORDER BY cfo.display_order ASC)
         FROM custom_field_options cfo
         WHERE cfo.custom_field_definition_id = cfd.id),
        '[]'::json
      ) AS options
    FROM custom_field_definitions cfd
    JOIN reference_data rt ON rt.id = cfd.product_type_id
    WHERE cfd.id = $1;
  `;

  const res = await query(sql, [id]);
  return res.rows[0] || null;
}

/**
 * Create custom field definition (System Admin only)
 */
export async function createCustomFieldDefinition({
  productTypeId,
  code,
  label,
  helpText = null,
  fieldType,
  isRequired = false,
  displayOrder = 1,
  options = [],
  actorId,
}) {
  if (!productTypeId) throw new Error('Product type is required.');

  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode || cleanCode.length < 2) {
    throw new Error('Field code must be at least 2 characters.');
  }

  const cleanLabel = (label || '').trim();
  if (!cleanLabel || cleanLabel.length < 2) {
    throw new Error('Field label must be at least 2 characters.');
  }

  if (!VALID_FIELD_TYPES.has(fieldType)) {
    throw new Error(`Invalid field type "${fieldType}". Supported types: ${Array.from(VALID_FIELD_TYPES).join(', ')}`);
  }

  // Prevent duplicate definition with same code for same product type
  const existing = await query(
    'SELECT id FROM custom_field_definitions WHERE product_type_id = $1 AND code = $2',
    [productTypeId, cleanCode]
  );
  if (existing.rows.length > 0) {
    throw new Error(`Custom field with code "${cleanCode}" already exists for this product type.`);
  }

  const insertSql = `
    INSERT INTO custom_field_definitions (
      product_type_id,
      code,
      label,
      help_text,
      field_type,
      is_required,
      is_active,
      display_order,
      version,
      created_by,
      updated_by
    ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, 1, $8, $8)
    RETURNING id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order, version, created_at;
  `;

  const res = await query(insertSql, [
    productTypeId,
    cleanCode,
    cleanLabel,
    helpText,
    fieldType,
    Boolean(isRequired),
    Number(displayOrder) || 1,
    actorId,
  ]);

  const def = res.rows[0];

  // Insert options if select type
  const insertedOptions = [];
  if ((fieldType === 'single_select' || fieldType === 'multi_select') && Array.isArray(options)) {
    let order = 1;
    for (const opt of options) {
      const optCode = (opt.code || opt.label || '').trim().toUpperCase().replace(/\s+/g, '_');
      const optLabel = (opt.label || opt.code || '').trim();
      if (!optCode || !optLabel) continue;

      const optRes = await query(`
        INSERT INTO custom_field_options (
          custom_field_definition_id,
          code,
          label,
          display_order,
          version,
          created_by,
          updated_by
        ) VALUES ($1, $2, $3, $4, 1, $5, $5)
        RETURNING id, code, label, display_order, version;
      `, [def.id, optCode, optLabel, order++, actorId]);

      insertedOptions.push(optRes.rows[0]);
    }
  }

  def.options = insertedOptions;

  await recordAuditEvent({
    entityName: 'CUSTOM_FIELD_DEFINITION',
    entityId: def.id,
    action: AUDIT_ACTIONS.CUSTOM_FIELD_CREATE,
    actorId,
    afterState: { id: def.id, code: def.code, label: def.label, field_type: def.field_type, is_required: def.is_required },
    changeReason: 'Custom field definition created by System Administrator',
  });

  return def;
}

/**
 * Update custom field definition with optimistic locking
 */
export async function updateCustomFieldDefinition(id, {
  label,
  helpText,
  isRequired,
  displayOrder,
  expectedVersion,
  actorId,
}) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query(
    'SELECT id, label, help_text, is_required, display_order, version FROM custom_field_definitions WHERE id = $1',
    [id]
  );
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const cleanLabel = label !== undefined ? label.trim() : row.label;
  const cleanHelp = helpText !== undefined ? helpText : row.help_text;
  const cleanReq = isRequired !== undefined ? Boolean(isRequired) : row.is_required;
  const cleanOrder = displayOrder !== undefined ? Number(displayOrder) : row.display_order;

  const updateSql = `
    UPDATE custom_field_definitions
    SET 
      label = $1,
      help_text = $2,
      is_required = $3,
      display_order = $4,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $5
    WHERE id = $6 AND version = $7
    RETURNING id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order, version, updated_at;
  `;

  const res = await query(updateSql, [cleanLabel, cleanHelp, cleanReq, cleanOrder, actorId, id, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM custom_field_definitions WHERE id = $1', [id]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const updated = res.rows[0];

  await recordAuditEvent({
    entityName: 'CUSTOM_FIELD_DEFINITION',
    entityId: id,
    action: AUDIT_ACTIONS.CUSTOM_FIELD_UPDATE,
    actorId,
    beforeState: { label: row.label, is_required: row.is_required, version: row.version },
    afterState: { label: updated.label, is_required: updated.is_required, version: updated.version },
    changeReason: 'Custom field definition updated by System Administrator',
  });

  return updated;
}

/**
 * Archive custom field definition
 */
export async function archiveCustomFieldDefinition(id, { expectedVersion, actorId }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query(
    'SELECT id, is_active, version FROM custom_field_definitions WHERE id = $1',
    [id]
  );
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const updateSql = `
    UPDATE custom_field_definitions
    SET 
      is_active = FALSE,
      archived_at = CURRENT_TIMESTAMP,
      archived_by = $1,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $1
    WHERE id = $2 AND version = $3
    RETURNING id, is_active, version, archived_at;
  `;

  const res = await query(updateSql, [actorId, id, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM custom_field_definitions WHERE id = $1', [id]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const archived = res.rows[0];

  await recordAuditEvent({
    entityName: 'CUSTOM_FIELD_DEFINITION',
    entityId: id,
    action: AUDIT_ACTIONS.CUSTOM_FIELD_ARCHIVE,
    actorId,
    beforeState: { is_active: row.is_active, version: row.version },
    afterState: { is_active: false, version: archived.version },
    changeReason: 'Custom field definition archived by System Administrator',
  });

  return archived;
}

/**
 * Add option to select-type custom field definition
 */
export async function addCustomFieldOption(definitionId, { code, label, displayOrder = 1, actorId }) {
  const defRes = await query('SELECT id, field_type FROM custom_field_definitions WHERE id = $1', [definitionId]);
  if (defRes.rows.length === 0) throw new Error('Custom field definition not found.');

  const def = defRes.rows[0];
  if (def.field_type !== 'single_select' && def.field_type !== 'multi_select') {
    throw new Error('Options can only be added to single_select or multi_select fields.');
  }

  const cleanCode = (code || label || '').trim().toUpperCase().replace(/\s+/g, '_');
  const cleanLabel = (label || code || '').trim();
  if (!cleanCode || !cleanLabel) throw new Error('Option code and label are required.');

  const existing = await query(
    'SELECT id FROM custom_field_options WHERE custom_field_definition_id = $1 AND code = $2',
    [definitionId, cleanCode]
  );
  if (existing.rows.length > 0) {
    throw new Error(`Option with code "${cleanCode}" already exists for this field.`);
  }

  const insertSql = `
    INSERT INTO custom_field_options (
      custom_field_definition_id,
      code,
      label,
      display_order,
      version,
      created_by,
      updated_by
    ) VALUES ($1, $2, $3, $4, 1, $5, $5)
    RETURNING id, custom_field_definition_id, code, label, display_order, version, created_at;
  `;

  const res = await query(insertSql, [definitionId, cleanCode, cleanLabel, Number(displayOrder) || 1, actorId]);
  const option = res.rows[0];

  await recordAuditEvent({
    entityName: 'CUSTOM_FIELD_OPTION',
    entityId: option.id,
    action: AUDIT_ACTIONS.INSERT,
    actorId,
    afterState: { id: option.id, definition_id: definitionId, code: cleanCode, label: cleanLabel },
    changeReason: 'Custom field option created by System Administrator',
  });

  return option;
}

/**
 * Update option with optimistic locking
 */
export async function updateCustomFieldOption(optionId, { label, displayOrder, expectedVersion, actorId }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, label, display_order, version FROM custom_field_options WHERE id = $1', [optionId]);
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const cleanLabel = label !== undefined ? label.trim() : row.label;
  const cleanOrder = displayOrder !== undefined ? Number(displayOrder) : row.display_order;

  const updateSql = `
    UPDATE custom_field_options
    SET 
      label = $1,
      display_order = $2,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $3
    WHERE id = $4 AND version = $5
    RETURNING id, custom_field_definition_id, code, label, display_order, version, updated_at;
  `;

  const res = await query(updateSql, [cleanLabel, cleanOrder, actorId, optionId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM custom_field_options WHERE id = $1', [optionId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const updated = res.rows[0];

  await recordAuditEvent({
    entityName: 'CUSTOM_FIELD_OPTION',
    entityId: optionId,
    action: AUDIT_ACTIONS.UPDATE,
    actorId,
    beforeState: { label: row.label, display_order: row.display_order, version: row.version },
    afterState: { label: updated.label, display_order: updated.display_order, version: updated.version },
    changeReason: 'Custom field option updated by System Administrator',
  });

  return updated;
}

/**
 * Archive option with optimistic locking
 */
export async function archiveCustomFieldOption(optionId, { expectedVersion, actorId }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, is_active, version FROM custom_field_options WHERE id = $1', [optionId]);
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const updateSql = `
    UPDATE custom_field_options
    SET 
      is_active = FALSE,
      archived_at = CURRENT_TIMESTAMP,
      archived_by = $1,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $1
    WHERE id = $2 AND version = $3
    RETURNING id, is_active, version, archived_at;
  `;

  const res = await query(updateSql, [actorId, optionId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM custom_field_options WHERE id = $1', [optionId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const archived = res.rows[0];

  await recordAuditEvent({
    entityName: 'CUSTOM_FIELD_OPTION',
    entityId: optionId,
    action: AUDIT_ACTIONS.ARCHIVE,
    actorId,
    beforeState: { is_active: row.is_active, version: row.version },
    afterState: { is_active: false, version: archived.version },
    changeReason: 'Custom field option archived by System Administrator',
  });

  return archived;
}

/**
 * Get project custom field values
 */
export async function getProjectCustomFields(projectId) {
  // 1. Get project's product type
  const projRes = await query(`
    SELECT p.id, p.code, p.name, p.product_id, prod.product_type_id
    FROM projects p
    JOIN products prod ON prod.id = p.product_id
    WHERE p.id = $1;
  `, [projectId]);

  if (projRes.rows.length === 0) return null;
  const project = projRes.rows[0];

  // 2. Fetch definitions for this product type
  const defs = await listCustomFieldDefinitions({ productTypeId: project.product_type_id, activeOnly: false });

  // 3. Fetch stored values for project
  const valRes = await query(`
    SELECT 
      v.id,
      v.custom_field_definition_id,
      v.text_value,
      v.number_value,
      v.date_value,
      v.boolean_value,
      v.option_id,
      v.version,
      v.created_at,
      v.updated_at,
      opt.label AS option_label,
      COALESCE(
        (SELECT json_agg(json_build_object('id', mo.option_id, 'label', mo_opt.label))
         FROM project_custom_field_multi_options mo
         JOIN custom_field_options mo_opt ON mo_opt.id = mo.option_id
         WHERE mo.project_custom_field_value_id = v.id),
        '[]'::json
      ) AS multi_options
    FROM project_custom_field_values v
    LEFT JOIN custom_field_options opt ON opt.id = v.option_id
    WHERE v.project_id = $1;
  `, [projectId]);

  const valueMap = new Map(valRes.rows.map(v => [v.custom_field_definition_id, v]));

  // Combine definitions with project values
  return defs.map(def => {
    const val = valueMap.get(def.id) || null;
    let formattedValue = null;

    if (val) {
      switch (def.field_type) {
        case 'text':
          formattedValue = val.text_value;
          break;
        case 'number':
          formattedValue = val.number_value !== null ? Number(val.number_value) : null;
          break;
        case 'date':
          formattedValue = val.date_value ? val.date_value.toISOString().slice(0, 10) : null;
          break;
        case 'yes_no':
          formattedValue = val.boolean_value;
          break;
        case 'single_select':
          formattedValue = val.option_id;
          break;
        case 'multi_select':
          formattedValue = (val.multi_options || []).map(o => o.id);
          break;
      }
    }

    return {
      definition_id: def.id,
      code: def.code,
      label: def.label,
      help_text: def.help_text,
      field_type: def.field_type,
      is_required: def.is_required,
      is_active: def.is_active,
      display_order: def.display_order,
      options: def.options,
      value_id: val?.id || null,
      value_version: val?.version || null,
      value: formattedValue,
      option_label: val?.option_label || null,
      multi_options: val?.multi_options || [],
    };
  });
}

/**
 * Validate and save custom field values for a project
 */
export async function saveProjectCustomFields(projectId, valuesObject = {}, { actorId }) {
  // Fetch project's product type
  const projRes = await query(`
    SELECT p.id, p.product_id, prod.product_type_id
    FROM projects p
    JOIN products prod ON prod.id = p.product_id
    WHERE p.id = $1;
  `, [projectId]);

  if (projRes.rows.length === 0) throw new Error('Project not found.');
  const project = projRes.rows[0];

  const defs = await listCustomFieldDefinitions({ productTypeId: project.product_type_id, activeOnly: false });
  const defByCode = new Map();
  const defById = new Map();

  for (const d of defs) {
    defByCode.set(d.code, d);
    defById.set(d.id, d);
  }

  // Fetch existing stored values for project to support partial updates
  const existingValuesRes = await query(`
    SELECT custom_field_definition_id
    FROM project_custom_field_values
    WHERE project_id = $1;
  `, [projectId]);
  const existingDefsMap = new Set(existingValuesRes.rows.map(r => r.custom_field_definition_id));

  // Validate values
  for (const def of defs) {
    if (!def.is_active || def.archived_at) continue;

    const providedVal = valuesObject[def.code] !== undefined ? valuesObject[def.code] : valuesObject[def.id];

    // Check required
    if (def.is_required) {
      if (providedVal === undefined) {
        // If omitted in partial update, verify it is already present in DB
        if (!existingDefsMap.has(def.id)) {
          throw new Error(`Custom field "${def.label}" (${def.code}) is required.`);
        }
      } else if (providedVal === null || providedVal === '' || (Array.isArray(providedVal) && providedVal.length === 0)) {
        throw new Error(`Custom field "${def.label}" (${def.code}) is required.`);
      }
    }

    // Type validation if provided
    if (providedVal !== undefined && providedVal !== null && providedVal !== '') {
      validateFieldValue(def, providedVal);
    }
  }

  // Persist normalized values
  for (const [key, val] of Object.entries(valuesObject)) {
    const def = defByCode.get(key) || defById.get(key);
    if (!def) continue;

    if (val === undefined || val === null || val === '') {
      // Clear value if set to empty
      await query('DELETE FROM project_custom_field_values WHERE project_id = $1 AND custom_field_definition_id = $2', [projectId, def.id]);
      continue;
    }

    let textVal = null;
    let numVal = null;
    let dateVal = null;
    let boolVal = null;
    let optId = null;
    let multiOptIds = [];

    switch (def.field_type) {
      case 'text':
        textVal = String(val);
        break;
      case 'number':
        numVal = Number(val);
        break;
      case 'date':
        dateVal = String(val).slice(0, 10);
        break;
      case 'yes_no':
        boolVal = val === true || val === 'true' || val === 1;
        break;
      case 'single_select':
        optId = resolveOptionId(def, val);
        break;
      case 'multi_select':
        multiOptIds = resolveMultiOptionIds(def, val);
        break;
    }

    // Upsert value
    const upsertSql = `
      INSERT INTO project_custom_field_values (
        project_id,
        custom_field_definition_id,
        text_value,
        number_value,
        date_value,
        boolean_value,
        option_id,
        version,
        created_by,
        updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $8)
      ON CONFLICT (project_id, custom_field_definition_id) DO UPDATE SET
        text_value = EXCLUDED.text_value,
        number_value = EXCLUDED.number_value,
        date_value = EXCLUDED.date_value,
        boolean_value = EXCLUDED.boolean_value,
        option_id = EXCLUDED.option_id,
        version = project_custom_field_values.version + 1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = EXCLUDED.updated_by
      RETURNING id, version;
    `;

    const valRes = await query(upsertSql, [projectId, def.id, textVal, numVal, dateVal, boolVal, optId, actorId]);
    const valRow = valRes.rows[0];

    // Handle multi options
    if (def.field_type === 'multi_select') {
      await query('DELETE FROM project_custom_field_multi_options WHERE project_custom_field_value_id = $1', [valRow.id]);
      for (const mId of multiOptIds) {
        await query(
          'INSERT INTO project_custom_field_multi_options (project_custom_field_value_id, option_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [valRow.id, mId]
        );
      }
    }
  }

  await recordAuditEvent({
    entityName: 'PROJECT_CUSTOM_FIELDS',
    entityId: projectId,
    action: AUDIT_ACTIONS.CUSTOM_FIELD_VALUE_UPDATE,
    actorId,
    afterState: { project_id: projectId, fields_updated: Object.keys(valuesObject) },
    changeReason: 'Project custom field values updated',
  });

  return await getProjectCustomFields(projectId);
}

function validateFieldValue(def, val) {
  switch (def.field_type) {
    case 'text':
      if (typeof val !== 'string' && typeof val !== 'number') {
        throw new Error(`Field "${def.label}" must be a text string.`);
      }
      break;
    case 'number':
      if (isNaN(Number(val))) {
        throw new Error(`Field "${def.label}" must be a valid number.`);
      }
      break;
    case 'date': {
      const dStr = String(val);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr) || isNaN(Date.parse(dStr))) {
        throw new Error(`Field "${def.label}" must be a valid date in YYYY-MM-DD format.`);
      }
      break;
    }
    case 'yes_no':
      if (typeof val !== 'boolean' && val !== 'true' && val !== 'false' && val !== 1 && val !== 0) {
        throw new Error(`Field "${def.label}" must be a boolean (yes/no).`);
      }
      break;
    case 'single_select': {
      const optId = resolveOptionId(def, val);
      if (!optId) {
        throw new Error(`Value "${val}" is not a valid option for field "${def.label}".`);
      }
      break;
    }
    case 'multi_select': {
      if (!Array.isArray(val)) {
        throw new Error(`Field "${def.label}" must be an array of selected options.`);
      }
      for (const item of val) {
        const optId = resolveOptionId(def, item);
        if (!optId) {
          throw new Error(`Option "${item}" is not a valid option for field "${def.label}".`);
        }
      }
      break;
    }
  }
}

function resolveOptionId(def, val) {
  if (!val) return null;
  const str = String(val).trim().toUpperCase();
  const options = def.options || [];

  // Match by ID, code, or label
  const match = options.find(o => 
    o.id === val || 
    o.code.toUpperCase() === str || 
    o.label.toUpperCase() === str
  );
  return match ? match.id : null;
}

function resolveMultiOptionIds(def, valList) {
  if (!Array.isArray(valList)) return [];
  const ids = [];
  for (const item of valList) {
    const id = resolveOptionId(def, item);
    if (id) ids.push(id);
  }
  return ids;
}
