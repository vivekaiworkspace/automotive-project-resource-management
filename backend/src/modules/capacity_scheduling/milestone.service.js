/**
 * Milestone Service (Step 5 § 2)
 * Manages project milestones and committed delivery gate rules.
 */
import { query } from '../../db/index.js';
import { recordAuditEvent } from '../audit/index.js';

export const COMMITTED_MILESTONE_CATEGORIES = [
  'Customer delivery or customer release',
  'Vehicle-program integration delivery',
  'Validation completion or test sign-off',
  'Compliance or regulatory submission',
  'Production release or start-of-production support'
];

export const COMMITTED_MILESTONE_CODES = {
  CUSTOMER_DELIVERY: 'Customer delivery or customer release',
  VEHICLE_PROGRAM_INTEGRATION: 'Vehicle-program integration delivery',
  VALIDATION_COMPLETION: 'Validation completion or test sign-off',
  COMPLIANCE_REGULATORY: 'Compliance or regulatory submission',
  PRODUCTION_RELEASE: 'Production release or start-of-production support'
};

/**
 * Checks if a type or category string matches one of the 5 approved committed categories
 */
export function isApprovedCommittedCategory(typeString) {
  if (!typeString) return false;
  const clean = String(typeString).trim();
  if (COMMITTED_MILESTONE_CATEGORIES.includes(clean)) return true;
  if (COMMITTED_MILESTONE_CODES[clean]) return true;
  
  // Case-insensitive match check
  const lower = clean.toLowerCase();
  for (const cat of COMMITTED_MILESTONE_CATEGORIES) {
    if (cat.toLowerCase() === lower) return true;
  }
  return false;
}

/**
 * Normalize committed category to canonical title
 */
export function normalizeCommittedCategory(typeString) {
  if (!typeString) return null;
  const clean = String(typeString).trim();
  if (COMMITTED_MILESTONE_CODES[clean]) return COMMITTED_MILESTONE_CODES[clean];
  const lower = clean.toLowerCase();
  for (const cat of COMMITTED_MILESTONE_CATEGORIES) {
    if (cat.toLowerCase() === lower) return cat;
  }
  return clean;
}

/**
 * Check if user is authorized to manage milestones for this project
 */
async function assertProjectManagerOrAdmin(projectId, user) {
  if (!user) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
  const rolesRes = await query('SELECT role_code FROM user_roles WHERE user_id = $1', [user.id]);
  const roles = new Set(rolesRes.rows.map(r => r.role_code));

  if (roles.has('SYSTEM_ADMIN')) {
    return { isAdmin: true, isPM: true };
  }

  if (roles.has('PROJECT_MANAGER')) {
    const scopeRes = await query(
      'SELECT 1 FROM project_manager_scopes WHERE user_id = $1 AND project_id = $2',
      [user.id, projectId]
    );
    if (scopeRes.rows.length > 0) {
      return { isAdmin: false, isPM: true };
    }
  }

  const err = new Error('Unauthorized: Only an assigned Project Manager or System Admin may manage milestones for this project');
  err.statusCode = 403;
  throw err;
}

/**
 * List all milestones for a project
 */
export async function listProjectMilestones(projectId) {
  const sql = `
    SELECT 
      m.id,
      m.project_id,
      m.name,
      m.milestone_type,
      TO_CHAR(m.target_date, 'YYYY-MM-DD') AS target_date,
      m.is_committed,
      m.committed_type,
      m.description,
      m.status,
      m.version,
      m.created_at,
      m.updated_at
    FROM milestones m
    WHERE m.project_id = $1
    ORDER BY m.target_date ASC, m.name ASC
  `;
  const res = await query(sql, [projectId]);
  return res.rows;
}

/**
 * Get milestone by ID
 */
export async function getMilestoneById(milestoneId) {
  const sql = `
    SELECT 
      m.id,
      m.project_id,
      m.name,
      m.milestone_type,
      TO_CHAR(m.target_date, 'YYYY-MM-DD') AS target_date,
      m.is_committed,
      m.committed_type,
      m.description,
      m.status,
      m.version,
      m.created_at,
      m.updated_at
    FROM milestones m
    WHERE m.id = $1
  `;
  const res = await query(sql, [milestoneId]);
  return res.rows[0] || null;
}

/**
 * Create a milestone
 */
export async function createMilestone({
  projectId,
  name,
  milestoneType,
  targetDate,
  isCommitted = false,
  committedType = null,
  description = null,
}, user) {
  await assertProjectManagerOrAdmin(projectId, user);

  if (!name || name.trim().length === 0) {
    const err = new Error('Milestone name is required');
    err.statusCode = 400;
    throw err;
  }

  if (!milestoneType) {
    const err = new Error('Milestone type is required');
    err.statusCode = 400;
    throw err;
  }

  if (!targetDate) {
    const err = new Error('Milestone target date is required');
    err.statusCode = 400;
    throw err;
  }

  let finalCommitted = Boolean(isCommitted);
  let finalCommittedType = committedType || (finalCommitted ? milestoneType : null);

  if (finalCommitted) {
    if (!isApprovedCommittedCategory(finalCommittedType)) {
      const err = new Error(
        `A milestone may be marked as Committed only for: ${COMMITTED_MILESTONE_CATEGORIES.join(', ')}`
      );
      err.statusCode = 400;
      throw err;
    }
    finalCommittedType = normalizeCommittedCategory(finalCommittedType);
  }

  const insertSql = `
    INSERT INTO milestones (
      project_id, name, milestone_type, target_date, is_committed, committed_type, description, created_by, updated_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
    RETURNING id, project_id, name, milestone_type, TO_CHAR(target_date, 'YYYY-MM-DD') as target_date, is_committed, committed_type, description, status, version, created_at, updated_at
  `;

  const res = await query(insertSql, [
    projectId,
    name.trim(),
    milestoneType.trim(),
    targetDate,
    finalCommitted,
    finalCommitted ? finalCommittedType : null,
    description ? description.trim() : null,
    user.id
  ]);

  const newMilestone = res.rows[0];

  await recordAuditEvent({
    entityName: 'milestone',
    entityId: newMilestone.id,
    action: 'INSERT',
    actorId: user.id,
    afterState: newMilestone,
    changeReason: 'Initial milestone creation'
  });

  return newMilestone;
}

/**
 * Update milestone committed status (Step 5 § 2)
 * Requires reason >= 10 chars and writes immutable audit entry.
 */
export async function updateMilestoneCommittedStatus(milestoneId, {
  isCommitted,
  committedType = null,
  reason
}, user) {
  const current = await getMilestoneById(milestoneId);
  if (!current) {
    const err = new Error(`Milestone not found (ID: ${milestoneId})`);
    err.statusCode = 404;
    throw err;
  }

  await assertProjectManagerOrAdmin(current.project_id, user);

  if (!reason || reason.trim().length < 10) {
    const err = new Error('Changing milestone committed status requires a reason of at least 10 characters');
    err.statusCode = 400;
    throw err;
  }

  const newIsCommitted = Boolean(isCommitted);
  let newCommittedType = committedType || (newIsCommitted ? current.milestone_type : null);

  if (newIsCommitted) {
    if (!isApprovedCommittedCategory(newCommittedType)) {
      const err = new Error(
        `A milestone may be marked as Committed only for: ${COMMITTED_MILESTONE_CATEGORIES.join(', ')}`
      );
      err.statusCode = 400;
      throw err;
    }
    newCommittedType = normalizeCommittedCategory(newCommittedType);
  } else {
    newCommittedType = null;
  }

  const updateSql = `
    UPDATE milestones
    SET 
      is_committed = $1,
      committed_type = $2,
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = $3
    WHERE id = $4
    RETURNING id, project_id, name, milestone_type, TO_CHAR(target_date, 'YYYY-MM-DD') as target_date, is_committed, committed_type, description, status, version, created_at, updated_at
  `;

  const res = await query(updateSql, [
    newIsCommitted,
    newCommittedType,
    user.id,
    milestoneId
  ]);

  const updatedMilestone = res.rows[0];

  await recordAuditEvent({
    entityName: 'milestone',
    entityId: milestoneId,
    action: 'STATUS_CHANGE',
    actorId: user.id,
    beforeState: current,
    afterState: updatedMilestone,
    changeReason: reason.trim()
  });

  return updatedMilestone;
}

/**
 * Find the nearest committed milestone in a project relative to an activity's due date
 */
export async function findNearestCommittedMilestone(projectId, activityDueDate = null) {
  let sql = `
    SELECT 
      id,
      project_id,
      name,
      milestone_type,
      TO_CHAR(target_date, 'YYYY-MM-DD') AS target_date,
      is_committed,
      committed_type,
      description,
      status
    FROM milestones
    WHERE project_id = $1 
      AND is_committed = TRUE
      AND status NOT IN ('CANCELLED', 'ACHIEVED')
  `;
  const params = [projectId];

  if (activityDueDate) {
    sql += ` ORDER BY ABS(target_date - $2::date) ASC, target_date ASC LIMIT 1`;
    params.push(activityDueDate);
  } else {
    sql += ` ORDER BY target_date ASC LIMIT 1`;
  }

  const res = await query(sql, params);
  return res.rows[0] || null;
}
