import { query } from '../../db/index.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { StaleVersionError } from '../iam/user.service.js';
import { checkProjectScope } from './tag.service.js';

/**
 * List phases for a project
 */
export async function listPhases(projectId, requestingUser) {
  if (!checkProjectScope(projectId, requestingUser)) {
    throw new Error('Access denied: project is outside assigned scope.');
  }

  const sql = `
    SELECT 
      id,
      project_id,
      name,
      sequence_number,
      planned_start_date,
      planned_finish_date,
      version,
      created_at,
      updated_at,
      archived_at
    FROM phases
    WHERE project_id = $1 AND archived_at IS NULL
    ORDER BY sequence_number ASC;
  `;

  const res = await query(sql, [projectId]);
  return res.rows;
}

/**
 * Get phase by ID
 */
export async function getPhaseById(phaseId, requestingUser) {
  const sql = `
    SELECT id, project_id, name, sequence_number, planned_start_date, planned_finish_date, version, created_at, updated_at, archived_at
    FROM phases
    WHERE id = $1;
  `;
  const res = await query(sql, [phaseId]);
  const phase = res.rows[0] || null;
  if (!phase) return null;

  if (!checkProjectScope(phase.project_id, requestingUser)) {
    throw new Error('Access denied: phase project is outside assigned scope.');
  }

  return phase;
}

/**
 * Create phase
 */
export async function createPhase(projectId, {
  name,
  sequenceNumber,
  plannedStartDate = null,
  plannedFinishDate = null,
  actorId,
  requestingUser,
}) {
  if (!checkProjectScope(projectId, requestingUser)) {
    throw new Error('Access denied: project is outside assigned scope.');
  }

  // Check project status
  const projRes = await query('SELECT id, status, archived_at FROM projects WHERE id = $1', [projectId]);
  if (projRes.rows.length === 0) throw new Error('Project not found.');
  const proj = projRes.rows[0];
  if (proj.status === 'ARCHIVED' || proj.status === 'CANCELLED' || proj.archived_at) {
    throw new Error('Archived or cancelled projects cannot receive new phases.');
  }

  const cleanName = (name || '').trim();
  if (!cleanName || cleanName.length < 2) {
    throw new Error('Phase name must be at least 2 characters.');
  }

  const seq = parseInt(sequenceNumber, 10);
  if (isNaN(seq) || seq < 1) {
    throw new Error('Phase sequence number must be a positive integer.');
  }

  // Date validation
  if (plannedStartDate && plannedFinishDate) {
    if (new Date(plannedFinishDate) < new Date(plannedStartDate)) {
      throw new Error('Planned finish date cannot precede planned start date.');
    }
  }

  // Check unique sequence number within project
  const seqExisting = await query(
    'SELECT id FROM phases WHERE project_id = $1 AND sequence_number = $2 AND archived_at IS NULL',
    [projectId, seq]
  );
  if (seqExisting.rows.length > 0) {
    throw new Error(`Phase sequence number ${seq} is already in use for this project.`);
  }

  const insertSql = `
    INSERT INTO phases (
      project_id,
      name,
      sequence_number,
      sequence_order,
      planned_start_date,
      planned_finish_date,
      version,
      created_by,
      updated_by
    ) VALUES ($1, $2, $3, $3, $4, $5, 1, $6, $6)
    RETURNING id, project_id, name, sequence_number, planned_start_date, planned_finish_date, version, created_at;
  `;

  const res = await query(insertSql, [projectId, cleanName, seq, plannedStartDate, plannedFinishDate, actorId]);
  const phase = res.rows[0];

  await recordAuditEvent({
    entityName: 'PROJECT_PHASE',
    entityId: phase.id,
    action: AUDIT_ACTIONS.INSERT,
    actorId,
    afterState: { id: phase.id, project_id: projectId, name: phase.name, sequence_number: phase.sequence_number },
    changeReason: 'Project phase created',
  });

  return phase;
}

/**
 * Update phase with optimistic locking
 */
export async function updatePhase(phaseId, {
  name,
  sequenceNumber,
  plannedStartDate,
  plannedFinishDate,
  expectedVersion,
  actorId,
  requestingUser,
}) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query(
    'SELECT id, project_id, name, sequence_number, planned_start_date, planned_finish_date, version FROM phases WHERE id = $1',
    [phaseId]
  );
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (!checkProjectScope(row.project_id, requestingUser)) {
    throw new Error('Access denied: phase project is outside assigned scope.');
  }

  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const cleanName = name !== undefined ? name.trim() : row.name;
  const seq = sequenceNumber !== undefined ? parseInt(sequenceNumber, 10) : row.sequence_number;
  const startDate = plannedStartDate !== undefined ? plannedStartDate : row.planned_start_date;
  const finishDate = plannedFinishDate !== undefined ? plannedFinishDate : row.planned_finish_date;

  if (startDate && finishDate) {
    if (new Date(finishDate) < new Date(startDate)) {
      throw new Error('Planned finish date cannot precede planned start date.');
    }
  }

  if (seq !== row.sequence_number) {
    const seqExisting = await query(
      'SELECT id FROM phases WHERE project_id = $1 AND sequence_number = $2 AND id != $3 AND archived_at IS NULL',
      [row.project_id, seq, phaseId]
    );
    if (seqExisting.rows.length > 0) {
      throw new Error(`Phase sequence number ${seq} is already in use for this project.`);
    }
  }

  const updateSql = `
    UPDATE phases
    SET 
      name = $1,
      sequence_number = $2,
      sequence_order = $2,
      planned_start_date = $3,
      planned_finish_date = $4,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $5
    WHERE id = $6 AND version = $7
    RETURNING id, project_id, name, sequence_number, planned_start_date, planned_finish_date, version, updated_at;
  `;

  const res = await query(updateSql, [cleanName, seq, startDate, finishDate, actorId, phaseId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM phases WHERE id = $1', [phaseId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const updated = res.rows[0];

  await recordAuditEvent({
    entityName: 'PROJECT_PHASE',
    entityId: phaseId,
    action: AUDIT_ACTIONS.UPDATE,
    actorId,
    beforeState: { name: row.name, sequence_number: row.sequence_number, version: row.version },
    afterState: { name: updated.name, sequence_number: updated.sequence_number, version: updated.version },
    changeReason: 'Project phase updated',
  });

  return updated;
}

/**
 * Archive phase
 */
export async function archivePhase(phaseId, { expectedVersion, actorId, requestingUser }) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Error('Expected record version is required for optimistic concurrency control.');
  }

  const current = await query('SELECT id, project_id, name, version FROM phases WHERE id = $1', [phaseId]);
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  if (!checkProjectScope(row.project_id, requestingUser)) {
    throw new Error('Access denied: phase project is outside assigned scope.');
  }

  if (row.version !== Number(expectedVersion)) {
    throw new StaleVersionError(row.version, expectedVersion);
  }

  const updateSql = `
    UPDATE phases
    SET 
      archived_at = CURRENT_TIMESTAMP,
      archived_by = $1,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $1
    WHERE id = $2 AND version = $3
    RETURNING id, project_id, name, version, archived_at;
  `;

  const res = await query(updateSql, [actorId, phaseId, expectedVersion]);
  if (res.rowCount === 0) {
    const refreshed = await query('SELECT version FROM phases WHERE id = $1', [phaseId]);
    throw new StaleVersionError(refreshed.rows[0]?.version, expectedVersion);
  }

  const archived = res.rows[0];

  await recordAuditEvent({
    entityName: 'PROJECT_PHASE',
    entityId: phaseId,
    action: AUDIT_ACTIONS.ARCHIVE,
    actorId,
    beforeState: { name: row.name, version: row.version },
    afterState: { archived_at: archived.archived_at, version: archived.version },
    changeReason: 'Project phase archived',
  });

  return archived;
}
