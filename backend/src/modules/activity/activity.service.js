import crypto from 'node:crypto';
import { query, getPool } from '../../db/index.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { StaleVersionError } from '../iam/user.service.js';
import {
  isDateMaterialChange,
  isEstimateMaterialChange,
  isPriorityMaterialChange,
} from '../capacity_scheduling/calendar.service.js';

/**
 * Custom error classes for Activity domain
 */
export class ActivityValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ActivityValidationError';
    this.statusCode = 400;
    this.code = 'BAD_REQUEST';
    this.details = details;
  }
}

export class ActivityNotFoundError extends Error {
  constructor(message = 'Activity not found') {
    super(message);
    this.name = 'ActivityNotFoundError';
    this.statusCode = 404;
    this.code = 'NOT_FOUND';
  }
}

export class ActivityForbiddenError extends Error {
  constructor(message = 'Access denied: insufficient permission or out of scope') {
    super(message);
    this.name = 'ActivityForbiddenError';
    this.statusCode = 403;
    this.code = 'FORBIDDEN';
  }
}

/**
 * Fetch authoritative user permissions context for activity operations
 */
export async function fetchUserPermissions(userId) {
  if (!userId) {
    return {
      isAdmin: false,
      pmProjectIds: new Set(),
      tlTeamIds: new Set(),
      tlMemberUserIds: new Set(),
      tlProjectIds: new Set(),
      rmMemberUserIds: new Set(),
    };
  }

  const [rolesRes, pmRes, tlRes, tlMembersRes, rmMembersRes] = await Promise.all([
    query('SELECT role_code FROM user_roles WHERE user_id = $1', [userId]),
    query('SELECT project_id FROM project_manager_scopes WHERE user_id = $1', [userId]),
    query('SELECT team_id FROM team_memberships WHERE user_id = $1 AND is_team_lead = TRUE AND archived_at IS NULL', [userId]),
    query(`
      SELECT DISTINCT tm.user_id 
      FROM team_memberships tm
      WHERE tm.team_id IN (
        SELECT team_id FROM team_memberships WHERE user_id = $1 AND is_team_lead = TRUE AND archived_at IS NULL
      )
      AND tm.archived_at IS NULL;
    `, [userId]),
    query(`
      SELECT DISTINCT tm.user_id 
      FROM team_memberships tm
      WHERE tm.team_id IN (
        SELECT team_id FROM resource_manager_scopes WHERE user_id = $1
      )
      AND tm.archived_at IS NULL;
    `, [userId]),
  ]);

  const roles = new Set(rolesRes.rows.map(r => r.role_code));
  const isAdmin = roles.has('SYSTEM_ADMIN');
  const pmProjectIds = new Set(pmRes.rows.map(r => r.project_id));
  const tlTeamIds = new Set(tlRes.rows.map(r => r.team_id));
  const tlMemberUserIds = new Set(tlMembersRes.rows.map(r => r.user_id));
  // Include self for team lead
  tlMemberUserIds.add(userId);

  const rmMemberUserIds = new Set(rmMembersRes.rows.map(r => r.user_id));

  // TL projects: projects that have activities owned by their active team members
  let tlProjectIds = new Set();
  if (tlMemberUserIds.size > 0) {
    const tlUsersArray = Array.from(tlMemberUserIds);
    const tlProjRes = await query(`
      SELECT DISTINCT project_id FROM activities 
      WHERE owner_user_id = ANY($1::uuid[]) AND archived_at IS NULL
    `, [tlUsersArray]);
    tlProjectIds = new Set(tlProjRes.rows.map(r => r.project_id));
  }

  return {
    isAdmin,
    roles,
    pmProjectIds,
    tlTeamIds,
    tlMemberUserIds,
    tlProjectIds,
    rmMemberUserIds,
  };
}

/**
 * Check if requesting user can view an activity
 */
export function canViewActivity(user, activity, perms) {
  if (!user || !user.isActive) return false;
  if (perms.isAdmin) return true;

  if (perms.roles.has('PROJECT_MANAGER') && perms.pmProjectIds.has(activity.project_id)) {
    return true;
  }

  if (perms.roles.has('TEAM_LEAD')) {
    if (activity.owner_user_id && perms.tlMemberUserIds.has(activity.owner_user_id)) {
      return true;
    }
    if (perms.tlProjectIds.has(activity.project_id)) {
      return true;
    }
  }

  if (perms.roles.has('TEAM_MEMBER') && activity.owner_user_id === user.id) {
    return true;
  }

  if (perms.roles.has('RESOURCE_MANAGER') && activity.owner_user_id && perms.rmMemberUserIds.has(activity.owner_user_id)) {
    return true;
  }

  return false;
}

/**
 * Check if requesting user can create activities in a project
 */
export function canCreateActivity(user, projectId, perms) {
  if (!user || !user.isActive) return false;
  if (perms.isAdmin) return true;
  if (perms.roles.has('PROJECT_MANAGER') && perms.pmProjectIds.has(projectId)) return true;
  return false;
}

/**
 * Generate safe, database-backed immutable readable activity ID (e.g. EMS-G2-INT-1)
 */
export async function generateReadableActivityId(client, projectId) {
  const projRes = await client.query('SELECT code FROM projects WHERE id = $1', [projectId]);
  if (projRes.rows.length === 0) {
    throw new ActivityValidationError(`Project ${projectId} not found`);
  }
  const projectCode = projRes.rows[0].code;

  const seqRes = await client.query(`
    INSERT INTO project_activity_sequences (project_id, next_seq)
    VALUES ($1, 2)
    ON CONFLICT (project_id)
    DO UPDATE SET next_seq = project_activity_sequences.next_seq + 1
    RETURNING next_seq - 1 AS seq;
  `, [projectId]);

  const seq = seqRes.rows[0].seq;
  return `${projectCode}-${seq}`;
}

/**
 * Query an activity by ID with project and reference data details
 */
export async function getActivityById(activityId) {
  const sql = `
    SELECT 
      a.id,
      a.project_id,
      p.code AS project_code,
      p.name AS project_name,
      p.status AS project_status,
      a.readable_activity_id,
      a.title,
      a.activity_type_id,
      rt.name AS activity_type_name,
      a.priority_id,
      rp.name AS priority_name,
      a.status,
      a.original_estimate_hours,
      a.current_estimate_hours,
      a.remaining_effort_hours,
      a.actual_effort_hours,
      a.start_date,
      a.due_date,
      a.owner_user_id,
      u.full_name AS owner_name,
      u.email AS owner_email,
      a.phase_id,
      ph.name AS phase_name,
      a.parent_activity_id,
      pa.readable_activity_id AS parent_readable_id,
      pa.title AS parent_title,
      a.blocker_description,
      a.forecast_finish_date,
      a.version,
      a.created_at,
      a.created_by,
      cb.full_name AS created_by_name,
      a.updated_at,
      a.updated_by,
      ub.full_name AS updated_by_name,
      a.archived_at,
      a.archived_by,
      ab.full_name AS archived_by_name,
      EXISTS(SELECT 1 FROM activities c WHERE c.parent_activity_id = a.id AND c.archived_at IS NULL) AS has_active_children
    FROM activities a
    JOIN projects p ON p.id = a.project_id
    LEFT JOIN reference_data rt ON rt.id = a.activity_type_id
    LEFT JOIN reference_data rp ON rp.id = a.priority_id
    LEFT JOIN users u ON u.id = a.owner_user_id
    LEFT JOIN phases ph ON ph.id = a.phase_id
    LEFT JOIN activities pa ON pa.id = a.parent_activity_id
    LEFT JOIN users cb ON cb.id = a.created_by
    LEFT JOIN users ub ON ub.id = a.updated_by
    LEFT JOIN users ab ON ab.id = a.archived_by
    WHERE a.id = $1;
  `;
  const res = await query(sql, [activityId]);
  if (!res.rows[0]) return null;
  const row = res.rows[0];
  if (row.start_date) row.start_date = new Date(row.start_date).toISOString().split('T')[0];
  if (row.due_date) row.due_date = new Date(row.due_date).toISOString().split('T')[0];
  if (row.forecast_finish_date) row.forecast_finish_date = new Date(row.forecast_finish_date).toISOString().split('T')[0];
  return row;
}

/**
 * Check if reference data ID is an active value in the given category
 */
async function validateReferenceData(client, id, expectedCategory) {
  const res = await client.query(`
    SELECT id, is_active, category FROM reference_data 
    WHERE id = $1 AND category = $2 AND archived_at IS NULL;
  `, [id, expectedCategory]);

  if (res.rows.length === 0 || !res.rows[0].is_active) {
    throw new ActivityValidationError(
      `Invalid or inactive reference data for category "${expectedCategory}" (ID: ${id})`
    );
  }
}

/**
 * Validate owner is an active user
 */
async function validateOwner(client, ownerUserId) {
  if (!ownerUserId) return;
  const res = await client.query('SELECT id, is_active FROM users WHERE id = $1', [ownerUserId]);
  if (res.rows.length === 0) {
    throw new ActivityValidationError(`Owner user not found (ID: ${ownerUserId})`);
  }
  if (!res.rows[0].is_active) {
    throw new ActivityValidationError('Owner must be an active user');
  }
}

/**
 * Roll up child values to parent activity
 */
export async function recalculateParentRollups(client, parentActivityId, actorId, correlationId) {
  if (!parentActivityId) return null;

  // 1. Fetch parent current state with lock
  const parentRes = await client.query(`
    SELECT id, remaining_effort_hours, start_date, due_date, status, version 
    FROM activities 
    WHERE id = $1 FOR UPDATE;
  `, [parentActivityId]);

  if (parentRes.rows.length === 0) return null;
  const parent = parentRes.rows[0];

  // 2. Aggregate active children
  const aggRes = await client.query(`
    SELECT 
      COALESCE(SUM(remaining_effort_hours), 0.00) AS total_remaining,
      MIN(start_date) AS min_start,
      MAX(due_date) AS max_due,
      BOOL_OR(status = 'IN_PROGRESS') AS has_in_progress,
      COUNT(*) AS child_count
    FROM activities
    WHERE parent_activity_id = $1 AND archived_at IS NULL;
  `, [parentActivityId]);

  const agg = aggRes.rows[0];
  if (Number(agg.child_count) === 0) {
    return null;
  }

  const newRemaining = Number(agg.total_remaining).toFixed(2);
  const newStart = agg.min_start ? new Date(agg.min_start).toISOString().split('T')[0] : parent.start_date;
  const newDue = agg.max_due ? new Date(agg.max_due).toISOString().split('T')[0] : parent.due_date;

  let newStatus = parent.status;
  // If parent is PLANNED or READY_FOR_PLANNING and any child is IN_PROGRESS, advance to IN_PROGRESS
  if (agg.has_in_progress && ['PLANNED', 'READY_FOR_PLANNING'].includes(parent.status)) {
    newStatus = 'IN_PROGRESS';
  }

  const oldRemaining = parent.remaining_effort_hours ? Number(parent.remaining_effort_hours).toFixed(2) : null;
  const oldStart = parent.start_date ? new Date(parent.start_date).toISOString().split('T')[0] : null;
  const oldDue = parent.due_date ? new Date(parent.due_date).toISOString().split('T')[0] : null;

  const hasChanged = oldRemaining !== newRemaining || oldStart !== newStart || oldDue !== newDue || parent.status !== newStatus;

  if (hasChanged) {
    const updateRes = await client.query(`
      UPDATE activities
      SET 
        remaining_effort_hours = $1,
        start_date = $2,
        due_date = $3,
        status = $4,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $5
      WHERE id = $6
      RETURNING *;
    `, [newRemaining, newStart, newDue, newStatus, actorId, parentActivityId]);

    const updatedParent = updateRes.rows[0];

    // Correlated audit log entry for roll-up
    await recordAuditEvent({
      correlationId: correlationId || crypto.randomUUID(),
      entityName: 'activities',
      entityId: parentActivityId,
      action: 'UPDATE',
      actorId,
      beforeState: {
        remaining_effort_hours: oldRemaining,
        start_date: oldStart,
        due_date: oldDue,
        status: parent.status,
      },
      afterState: {
        remaining_effort_hours: newRemaining,
        start_date: newStart,
        due_date: newDue,
        status: newStatus,
        rollup: true,
      },
      changeReason: 'Automated roll-up from child activity updates',
    });

    return updatedParent;
  }

  return null;
}

/**
 * Create a new Activity
 */
export async function createActivity({
  projectId,
  title,
  activityTypeId,
  priorityId,
  status = 'DRAFT',
  originalEstimateHours = null,
  currentEstimateHours = null,
  remainingEffortHours = null,
  startDate = null,
  dueDate = null,
  ownerUserId = null,
  phaseId = null,
  parentActivityId = null,
  forecastFinishDate = null,
  blockerDescription = null,
  user,
  ipAddress = null,
  userAgent = null,
}) {
  const perms = await fetchUserPermissions(user?.id);
  if (!canCreateActivity(user, projectId, perms)) {
    throw new ActivityForbiddenError('You are not authorized to create activities in this project.');
  }

  // Validate clean title
  const cleanTitle = (title || '').trim();
  if (!cleanTitle || cleanTitle.length < 2) {
    throw new ActivityValidationError('Activity title is mandatory and must be at least 2 characters.');
  }

  // Ensure status is valid
  const cleanStatus = (status || 'DRAFT').toUpperCase();
  const validStatuses = ['DRAFT', 'READY_FOR_PLANNING', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];
  if (!validStatuses.includes(cleanStatus)) {
    throw new ActivityValidationError(`Invalid status: ${cleanStatus}`);
  }

  // Dates sanity check
  if (startDate && dueDate && dueDate < startDate) {
    throw new ActivityValidationError('Due date cannot precede start date.');
  }
  if (startDate && forecastFinishDate && forecastFinishDate < startDate) {
    throw new ActivityValidationError('Forecast finish date cannot precede start date.');
  }

  // Non-negative effort checks
  if (originalEstimateHours !== null && Number(originalEstimateHours) < 0) {
    throw new ActivityValidationError('Original estimate hours cannot be negative.');
  }
  if (currentEstimateHours !== null && Number(currentEstimateHours) < 0) {
    throw new ActivityValidationError('Current estimate hours cannot be negative.');
  }
  if (remainingEffortHours !== null && Number(remainingEffortHours) < 0) {
    throw new ActivityValidationError('Remaining effort hours cannot be negative.');
  }

  // Defaults on first entry:
  let finalOrig = originalEstimateHours !== null && originalEstimateHours !== '' ? Number(originalEstimateHours) : null;
  let finalCurr = currentEstimateHours !== null && currentEstimateHours !== '' ? Number(currentEstimateHours) : null;
  let finalRem = remainingEffortHours !== null && remainingEffortHours !== '' ? Number(remainingEffortHours) : null;

  if (finalCurr === null && finalOrig !== null) finalCurr = finalOrig;
  if (finalRem === null && finalCurr !== null) finalRem = finalCurr;

  // If status is not Draft, mandatory planning fields must be present
  if (cleanStatus !== 'DRAFT') {
    if (finalOrig === null || finalCurr === null || finalRem === null || !startDate || !dueDate) {
      throw new ActivityValidationError('Cannot create non-Draft activity without complete estimates and dates.');
    }
  }

  const pool = getPool();
  const client = await pool.connect();
  const correlationId = crypto.randomUUID();

  try {
    await client.query('BEGIN');

    // Check project status
    const projRes = await client.query('SELECT id, status, archived_at FROM projects WHERE id = $1', [projectId]);
    if (projRes.rows.length === 0) {
      throw new ActivityValidationError('Project not found');
    }
    if (projRes.rows[0].archived_at || ['ARCHIVED', 'CANCELLED'].includes(projRes.rows[0].status)) {
      throw new ActivityValidationError('Activities cannot be created in archived or cancelled projects');
    }

    // Validate reference data
    await validateReferenceData(client, activityTypeId, 'ACTIVITY_TYPE');
    await validateReferenceData(client, priorityId, 'ACTIVITY_PRIORITY');
    await validateOwner(client, ownerUserId);

    // Validate phase belongs to project if specified
    if (phaseId) {
      const phaseRes = await client.query('SELECT id FROM phases WHERE id = $1 AND project_id = $2', [phaseId, projectId]);
      if (phaseRes.rows.length === 0) {
        throw new ActivityValidationError('Phase must belong to the same project');
      }
    }

    // Validate parent belongs to project and hierarchy limits
    if (parentActivityId) {
      const parentRes = await client.query(`
        SELECT id, project_id, parent_activity_id, archived_at 
        FROM activities 
        WHERE id = $1;
      `, [parentActivityId]);

      if (parentRes.rows.length === 0) {
        throw new ActivityValidationError('Parent activity not found');
      }
      const parent = parentRes.rows[0];
      if (parent.project_id !== projectId) {
        throw new ActivityValidationError('Parent activity must belong to the same project');
      }
      if (parent.archived_at) {
        throw new ActivityValidationError('An archived activity cannot receive a child or be used as a parent');
      }
      if (parent.parent_activity_id) {
        throw new ActivityValidationError('Sub-activity nesting depth cannot exceed 1 level (grandchild creation rejected)');
      }
    }

    // Generate atomic readable ID
    const readableId = await generateReadableActivityId(client, projectId);

    const insertSql = `
      INSERT INTO activities (
        project_id,
        readable_activity_id,
        title,
        activity_type_id,
        priority_id,
        status,
        original_estimate_hours,
        current_estimate_hours,
        remaining_effort_hours,
        start_date,
        due_date,
        owner_user_id,
        phase_id,
        parent_activity_id,
        blocker_description,
        forecast_finish_date,
        version,
        created_by,
        updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 1, $17, $17
      ) RETURNING id;
    `;

    const insertRes = await client.query(insertSql, [
      projectId,
      readableId,
      cleanTitle,
      activityTypeId,
      priorityId,
      cleanStatus,
      finalOrig,
      finalCurr,
      finalRem,
      startDate || null,
      dueDate || null,
      ownerUserId || null,
      phaseId || null,
      parentActivityId || null,
      blockerDescription || null,
      forecastFinishDate || null,
      user.id,
    ]);

    const newActivityId = insertRes.rows[0].id;

    // Trigger parent roll-up if child
    if (parentActivityId) {
      await recalculateParentRollups(client, parentActivityId, user.id, correlationId);
    }

    await client.query('COMMIT');

    const createdActivity = await getActivityById(newActivityId);

    // Record immutable audit event
    await recordAuditEvent({
      correlationId,
      entityName: 'activities',
      entityId: newActivityId,
      action: 'INSERT',
      actorId: user.id,
      afterState: createdActivity,
      ipAddress,
      userAgent,
    });

    return createdActivity;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Update an existing Activity (PATCH)
 */
export async function updateActivity({
  activityId,
  expectedVersion,
  updates = {},
  reason = null,
  user,
  ipAddress = null,
  userAgent = null,
}) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new ActivityValidationError('Expected version is mandatory for optimistic locking');
  }

  const current = await getActivityById(activityId);
  if (!current) {
    throw new ActivityNotFoundError(`Activity ${activityId} not found`);
  }

  if (current.archived_at) {
    throw new ActivityValidationError('An archived activity cannot be edited');
  }

  if (current.project_status === 'CANCELLED' || current.project_status === 'ARCHIVED') {
    throw new ActivityValidationError('Activities in archived or cancelled projects cannot be updated');
  }

  const perms = await fetchUserPermissions(user.id);

  // Role authorization evaluation
  const isSysAdmin = perms.isAdmin;
  const isPM = perms.roles.has('PROJECT_MANAGER') && perms.pmProjectIds.has(current.project_id);
  const isTL = perms.roles.has('TEAM_LEAD') && current.owner_user_id && perms.tlMemberUserIds.has(current.owner_user_id);
  const isTM = perms.roles.has('TEAM_MEMBER') && current.owner_user_id === user.id;

  if (!isSysAdmin && !isPM && !isTL && !isTM) {
    throw new ActivityForbiddenError('You are not authorized to update this activity.');
  }

  // Version check (Optimistic Locking)
  if (Number(current.version) !== Number(expectedVersion)) {
    throw new StaleVersionError(
      `Conflict: activity was modified by another operation (expected version ${expectedVersion}, current version ${current.version})`
    );
  }

  // Status changes are prohibited via PATCH (must use status-transitions endpoint)
  if (updates.status !== undefined && updates.status !== current.status) {
    throw new ActivityValidationError(
      'Status workflow cannot be bypassed through the update endpoint. Use /status-transitions.'
    );
  }

  // Readable activity ID is immutable
  if (updates.readable_activity_id !== undefined && updates.readable_activity_id !== current.readable_activity_id) {
    throw new ActivityValidationError('Readable activity ID is immutable.');
  }

  // Original estimate is immutable after planning begins
  if (current.status !== 'DRAFT' && updates.original_estimate_hours !== undefined) {
    if (Number(updates.original_estimate_hours) !== Number(current.original_estimate_hours)) {
      throw new ActivityValidationError('original_estimate_hours is immutable once planning begins.');
    }
  }

  // Roll-up fields protection: cannot manually overwrite if children exist
  if (current.has_active_children) {
    if (updates.remaining_effort_hours !== undefined && Number(updates.remaining_effort_hours) !== Number(current.remaining_effort_hours)) {
      throw new ActivityValidationError(
        'Cannot manually overwrite remaining effort hours on a parent activity with active children.'
      );
    }
    if (updates.start_date !== undefined && updates.start_date !== current.start_date) {
      throw new ActivityValidationError(
        'Cannot manually overwrite start date on a parent activity with active children.'
      );
    }
    if (updates.due_date !== undefined && updates.due_date !== current.due_date) {
      throw new ActivityValidationError(
        'Cannot manually overwrite due date on a parent activity with active children.'
      );
    }
  }

  // TL and TM can ONLY update remaining_effort_hours, forecast_finish_date, and blocker_description
  if (!isSysAdmin && !isPM) {
    const restrictedFields = [
      'title', 'activity_type_id', 'priority_id', 'original_estimate_hours',
      'current_estimate_hours', 'start_date', 'due_date', 'owner_user_id',
      'phase_id', 'parent_activity_id', 'project_id'
    ];
    for (const f of restrictedFields) {
      if (updates[f] !== undefined && updates[f] !== current[f]) {
        throw new ActivityForbiddenError(
          `Your role (${isTL ? 'TEAM_LEAD' : 'TEAM_MEMBER'}) cannot modify planning field: "${f}".`
        );
      }
    }
  }

  // Material change evaluation
  const materialReasons = [];
  const newStartDate = updates.start_date !== undefined ? updates.start_date : current.start_date;
  const newDueDate = updates.due_date !== undefined ? updates.due_date : current.due_date;
  const newCurrEstimate = updates.current_estimate_hours !== undefined ? updates.current_estimate_hours : current.current_estimate_hours;
  const newPriorityId = updates.priority_id !== undefined ? updates.priority_id : current.priority_id;

  if (updates.start_date && isDateMaterialChange(current.start_date, newStartDate)) {
    materialReasons.push('Start date moved by more than 3 working days');
  }
  if (updates.due_date && isDateMaterialChange(current.due_date, newDueDate)) {
    materialReasons.push('Due date moved by more than 3 working days');
  }
  if (updates.current_estimate_hours !== undefined && isEstimateMaterialChange(current.current_estimate_hours, newCurrEstimate)) {
    materialReasons.push('Current estimate changed by more than 20%');
  }
  if (updates.priority_id && isPriorityMaterialChange(current.status, current.priority_id, newPriorityId)) {
    materialReasons.push(`Priority changed while status is ${current.status}`);
  }

  if (materialReasons.length > 0) {
    const cleanReason = (reason || '').trim();
    if (!cleanReason || cleanReason.length < 10) {
      throw new ActivityValidationError(
        `Material change requires an explanatory reason of at least 10 characters. (${materialReasons.join('; ')})`
      );
    }
  }

  // Date ordering validation
  if (newStartDate && newDueDate && newDueDate < newStartDate) {
    throw new ActivityValidationError('Due date cannot precede start date.');
  }

  const newForecast = updates.forecast_finish_date !== undefined ? updates.forecast_finish_date : current.forecast_finish_date;
  if (newStartDate && newForecast && newForecast < newStartDate) {
    throw new ActivityValidationError('Forecast finish date cannot precede start date.');
  }

  const pool = getPool();
  const client = await pool.connect();
  const correlationId = crypto.randomUUID();

  try {
    await client.query('BEGIN');

    // Validate foreign keys if changed
    if (updates.activity_type_id && updates.activity_type_id !== current.activity_type_id) {
      await validateReferenceData(client, updates.activity_type_id, 'ACTIVITY_TYPE');
    }
    if (updates.priority_id && updates.priority_id !== current.priority_id) {
      await validateReferenceData(client, updates.priority_id, 'ACTIVITY_PRIORITY');
    }
    if (updates.owner_user_id !== undefined && updates.owner_user_id !== current.owner_user_id) {
      await validateOwner(client, updates.owner_user_id);
    }
    if (updates.phase_id && updates.phase_id !== current.phase_id) {
      const phaseRes = await client.query('SELECT id FROM phases WHERE id = $1 AND project_id = $2', [updates.phase_id, current.project_id]);
      if (phaseRes.rows.length === 0) throw new ActivityValidationError('Phase must belong to the same project');
    }
    if (updates.parent_activity_id && updates.parent_activity_id !== current.parent_activity_id) {
      if (updates.parent_activity_id === activityId) {
        throw new ActivityValidationError('An activity cannot be its own parent');
      }
      const parentRes = await client.query('SELECT id, project_id, parent_activity_id, archived_at FROM activities WHERE id = $1', [updates.parent_activity_id]);
      if (parentRes.rows.length === 0) throw new ActivityValidationError('Parent activity not found');
      const parent = parentRes.rows[0];
      if (parent.project_id !== current.project_id) throw new ActivityValidationError('Parent activity must belong to the same project');
      if (parent.archived_at) throw new ActivityValidationError('Archived activity cannot be used as a parent');
      if (parent.parent_activity_id) throw new ActivityValidationError('Sub-activity nesting depth cannot exceed 1 level');
      if (current.has_active_children) throw new ActivityValidationError('An activity with children cannot become a child of another activity');
    }

    // Prepare fields
    const updatedTitle = updates.title !== undefined ? (updates.title || '').trim() : current.title;
    const updatedTypeId = updates.activity_type_id !== undefined ? updates.activity_type_id : current.activity_type_id;
    const updatedPriorityId = updates.priority_id !== undefined ? updates.priority_id : current.priority_id;
    const updatedOrigEst = updates.original_estimate_hours !== undefined ? updates.original_estimate_hours : current.original_estimate_hours;
    const updatedCurrEst = updates.current_estimate_hours !== undefined ? updates.current_estimate_hours : current.current_estimate_hours;
    const updatedRemEff = updates.remaining_effort_hours !== undefined ? updates.remaining_effort_hours : current.remaining_effort_hours;
    const updatedStart = newStartDate;
    const updatedDue = newDueDate;
    const updatedOwner = updates.owner_user_id !== undefined ? updates.owner_user_id : current.owner_user_id;
    const updatedPhase = updates.phase_id !== undefined ? updates.phase_id : current.phase_id;
    const updatedParent = updates.parent_activity_id !== undefined ? updates.parent_activity_id : current.parent_activity_id;
    const updatedBlocker = updates.blocker_description !== undefined ? updates.blocker_description : current.blocker_description;
    const updatedForecast = newForecast;

    const updateSql = `
      UPDATE activities
      SET
        title = $1,
        activity_type_id = $2,
        priority_id = $3,
        original_estimate_hours = $4,
        current_estimate_hours = $5,
        remaining_effort_hours = $6,
        start_date = $7,
        due_date = $8,
        owner_user_id = $9,
        phase_id = $10,
        parent_activity_id = $11,
        blocker_description = $12,
        forecast_finish_date = $13,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $14
      WHERE id = $15 AND version = $16
      RETURNING *;
    `;

    const updateRes = await client.query(updateSql, [
      updatedTitle,
      updatedTypeId,
      updatedPriorityId,
      updatedOrigEst,
      updatedCurrEst,
      updatedRemEff,
      updatedStart,
      updatedDue,
      updatedOwner,
      updatedPhase,
      updatedParent,
      updatedBlocker,
      updatedForecast,
      user.id,
      activityId,
      expectedVersion,
    ]);

    if (updateRes.rows.length === 0) {
      throw new StaleVersionError(`Conflict: activity version ${expectedVersion} is stale.`);
    }

    // Trigger parent roll-up if this activity has a parent
    if (updatedParent) {
      await recalculateParentRollups(client, updatedParent, user.id, correlationId);
    }
    // Also if parent was changed, recalculate old parent
    if (current.parent_activity_id && current.parent_activity_id !== updatedParent) {
      await recalculateParentRollups(client, current.parent_activity_id, user.id, correlationId);
    }

    await client.query('COMMIT');

    const updatedActivity = await getActivityById(activityId);

    // Record immutable audit event
    await recordAuditEvent({
      correlationId,
      entityName: 'activities',
      entityId: activityId,
      action: 'UPDATE',
      actorId: user.id,
      beforeState: current,
      afterState: updatedActivity,
      changeReason: reason || null,
      ipAddress,
      userAgent,
    });

    return updatedActivity;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Perform a controlled Status Transition
 */
export async function transitionActivityStatus({
  activityId,
  targetStatus,
  expectedVersion,
  reason = null,
  blockerDescription = null,
  user,
  ipAddress = null,
  userAgent = null,
}) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new ActivityValidationError('Expected version is mandatory for status transitions');
  }

  const current = await getActivityById(activityId);
  if (!current) {
    throw new ActivityNotFoundError(`Activity ${activityId} not found`);
  }

  if (current.archived_at) {
    throw new ActivityValidationError('Cannot transition status of an archived activity');
  }

  if (current.project_status === 'CANCELLED' || current.project_status === 'ARCHIVED') {
    throw new ActivityValidationError('Cannot transition status in an archived or cancelled project');
  }

  const fromStatus = current.status;
  const toStatus = (targetStatus || '').toUpperCase();

  if (fromStatus === toStatus) {
    throw new ActivityValidationError(`Activity is already in status "${toStatus}"`);
  }

  const perms = await fetchUserPermissions(user.id);
  const isSysAdmin = perms.isAdmin;
  const isPM = perms.roles.has('PROJECT_MANAGER') && perms.pmProjectIds.has(current.project_id);
  const isTL = perms.roles.has('TEAM_LEAD') && current.owner_user_id && perms.tlMemberUserIds.has(current.owner_user_id);
  const isTM = perms.roles.has('TEAM_MEMBER') && current.owner_user_id === user.id;

  if (!isSysAdmin && !isPM && !isTL && !isTM) {
    throw new ActivityForbiddenError('You are not authorized to transition this activity status.');
  }

  // 1. Allowed state transitions mapping:
  const allowedTransitions = {
    DRAFT: ['READY_FOR_PLANNING', 'DONE', 'CANCELLED'],
    READY_FOR_PLANNING: ['PLANNED', 'DRAFT', 'DONE', 'CANCELLED'],
    PLANNED: ['IN_PROGRESS', 'BLOCKED', 'READY_FOR_PLANNING', 'DONE', 'CANCELLED'],
    IN_PROGRESS: ['BLOCKED', 'PLANNED', 'DONE', 'CANCELLED'],
    BLOCKED: ['IN_PROGRESS', 'PLANNED', 'DONE', 'CANCELLED'],
    DONE: ['CANCELLED', 'PLANNED', 'READY_FOR_PLANNING', 'IN_PROGRESS'],
    CANCELLED: ['PLANNED', 'READY_FOR_PLANNING', 'IN_PROGRESS'],
  };

  const validTargets = allowedTransitions[fromStatus] || [];
  if (!validTargets.includes(toStatus)) {
    throw new ActivityValidationError(`Invalid transition from ${fromStatus} to ${toStatus}`);
  }

  // Check Done / Cancelled role restriction before version check
  if (toStatus === 'DONE' || toStatus === 'CANCELLED') {
    if (!isSysAdmin) {
      throw new ActivityForbiddenError(`Only a System Administrator may mark an activity ${toStatus}.`);
    }
  }

  // Reopening Done or Cancelled role restriction before version check
  if (fromStatus === 'DONE' || fromStatus === 'CANCELLED') {
    if (toStatus !== 'CANCELLED' && !isSysAdmin) {
      throw new ActivityForbiddenError(`Only a System Administrator may reopen an activity from ${fromStatus}.`);
    }
  }

  // Version check (Optimistic Locking)
  if (Number(current.version) !== Number(expectedVersion)) {
    throw new StaleVersionError(
      `Conflict: activity was modified by another operation (expected version ${expectedVersion}, current version ${current.version})`
    );
  }

  // 2. Draft exit validation
  if (fromStatus === 'DRAFT' && toStatus !== 'CANCELLED') {
    if (!current.title || !current.project_id || !current.activity_type_id || !current.priority_id) {
      throw new ActivityValidationError('Cannot leave Draft without title, project, type, and priority.');
    }
    if (current.original_estimate_hours === null || Number(current.original_estimate_hours) < 0) {
      throw new ActivityValidationError('Cannot leave Draft without valid original estimate hours.');
    }
    if (current.current_estimate_hours === null || current.remaining_effort_hours === null) {
      throw new ActivityValidationError('Cannot leave Draft without current estimate and remaining effort.');
    }
    if (!current.start_date || !current.due_date) {
      throw new ActivityValidationError('Cannot leave Draft without start date and due date.');
    }
  }

  // 3. DONE and CANCELLED rules
  if (toStatus === 'DONE' || toStatus === 'CANCELLED') {
    const cleanReason = (reason || '').trim();
    if (!cleanReason || cleanReason.length < 10) {
      throw new ActivityValidationError(`Marking ${toStatus} requires a reason of at least 10 characters.`);
    }
  }

  // 4. Reopening DONE or CANCELLED rules
  if (fromStatus === 'DONE' || fromStatus === 'CANCELLED') {
    if (toStatus !== 'CANCELLED') {
      if (!isSysAdmin) {
        throw new ActivityForbiddenError(`Only a System Administrator may reopen an activity from ${fromStatus}.`);
      }
      const cleanReason = (reason || '').trim();
      if (!cleanReason || cleanReason.length < 10) {
        throw new ActivityValidationError(`Reopening from ${fromStatus} requires a reason of at least 10 characters.`);
      }
    }
  }

  // 5. IN_PROGRESS -> PLANNED rules
  if (fromStatus === 'IN_PROGRESS' && toStatus === 'PLANNED') {
    if (!isSysAdmin && !isPM) {
      throw new ActivityForbiddenError('Moving from IN_PROGRESS back to PLANNED requires Project Manager or System Admin.');
    }
    const cleanReason = (reason || '').trim();
    if (!cleanReason || cleanReason.length < 10) {
      throw new ActivityValidationError('Moving from IN_PROGRESS back to PLANNED requires a reason of at least 10 characters.');
    }
  }

  // 6. BLOCKED rules
  let newBlocker = current.blocker_description;
  if (toStatus === 'BLOCKED') {
    const cleanBlocker = (blockerDescription || reason || '').trim();
    if (!cleanBlocker || cleanBlocker.length < 10) {
      throw new ActivityValidationError('Moving an activity to Blocked requires a blocker description of at least 10 characters.');
    }
    newBlocker = cleanBlocker;
  } else if (fromStatus === 'BLOCKED') {
    // When unblocking, clear active blocker description
    newBlocker = null;
  }

  // 7. Role check for normal progress transitions
  if (!isSysAdmin && !isPM) {
    if (isTL || isTM) {
      // TL/TM can only move PLANNED <-> IN_PROGRESS, IN_PROGRESS <-> BLOCKED, PLANNED <-> BLOCKED
      const permittedPairs = [
        ['PLANNED', 'IN_PROGRESS'],
        ['IN_PROGRESS', 'BLOCKED'],
        ['BLOCKED', 'IN_PROGRESS'],
        ['PLANNED', 'BLOCKED'],
        ['BLOCKED', 'PLANNED'],
      ];
      const isPermitted = permittedPairs.some(([f, t]) => f === fromStatus && t === toStatus);
      if (!isPermitted) {
        throw new ActivityForbiddenError(`Your role is not authorized to perform the transition ${fromStatus} -> ${toStatus}.`);
      }
    } else {
      throw new ActivityForbiddenError('You are not authorized to transition this activity.');
    }
  }

  const pool = getPool();
  const client = await pool.connect();
  const correlationId = crypto.randomUUID();

  try {
    await client.query('BEGIN');

    const updateSql = `
      UPDATE activities
      SET 
        status = $1,
        blocker_description = $2,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $3
      WHERE id = $4 AND version = $5
      RETURNING *;
    `;

    const updateRes = await client.query(updateSql, [
      toStatus,
      newBlocker,
      user.id,
      activityId,
      expectedVersion,
    ]);

    if (updateRes.rows.length === 0) {
      throw new StaleVersionError(`Conflict: activity version ${expectedVersion} is stale.`);
    }

    // Trigger parent roll-up if child
    if (current.parent_activity_id) {
      await recalculateParentRollups(client, current.parent_activity_id, user.id, correlationId);
    }

    await client.query('COMMIT');

    const updatedActivity = await getActivityById(activityId);

    // Record immutable audit event
    await recordAuditEvent({
      correlationId,
      entityName: 'activities',
      entityId: activityId,
      action: 'STATUS_CHANGE',
      actorId: user.id,
      beforeState: {
        status: fromStatus,
        blocker_description: current.blocker_description,
      },
      afterState: {
        status: toStatus,
        blocker_description: newBlocker,
      },
      changeReason: reason || blockerDescription || null,
      ipAddress,
      userAgent,
    });

    return updatedActivity;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Archive an Activity
 */
export async function archiveActivity({
  activityId,
  expectedVersion,
  reason = null,
  user,
  ipAddress = null,
  userAgent = null,
}) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new ActivityValidationError('Expected version is mandatory for archiving');
  }

  const current = await getActivityById(activityId);
  if (!current) throw new ActivityNotFoundError(`Activity ${activityId} not found`);
  if (current.archived_at) throw new ActivityValidationError('Activity is already archived');

  if (Number(current.version) !== Number(expectedVersion)) {
    throw new StaleVersionError(
      `Conflict: activity was modified by another operation (expected version ${expectedVersion}, current version ${current.version})`
    );
  }

  const perms = await fetchUserPermissions(user.id);
  const isSysAdmin = perms.isAdmin;
  const isPM = perms.roles.has('PROJECT_MANAGER') && perms.pmProjectIds.has(current.project_id);

  if (!isSysAdmin && !isPM) {
    throw new ActivityForbiddenError('Only Project Managers or System Admins may archive activities.');
  }

  const pool = getPool();
  const client = await pool.connect();
  const correlationId = crypto.randomUUID();

  try {
    await client.query('BEGIN');

    const archiveSql = `
      UPDATE activities
      SET
        archived_at = CURRENT_TIMESTAMP,
        archived_by = $1,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $1
      WHERE id = $2 AND version = $3
      RETURNING *;
    `;

    const res = await client.query(archiveSql, [user.id, activityId, expectedVersion]);
    if (res.rows.length === 0) {
      throw new StaleVersionError(`Conflict: activity version ${expectedVersion} is stale.`);
    }

    // If child is archived, recalculate parent roll-ups
    if (current.parent_activity_id) {
      await recalculateParentRollups(client, current.parent_activity_id, user.id, correlationId);
    }

    await client.query('COMMIT');

    const updated = await getActivityById(activityId);

    await recordAuditEvent({
      correlationId,
      entityName: 'activities',
      entityId: activityId,
      action: 'ARCHIVE',
      actorId: user.id,
      beforeState: { archived_at: null },
      afterState: { archived_at: updated.archived_at },
      changeReason: reason || null,
      ipAddress,
      userAgent,
    });

    return updated;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Restore an archived Activity
 */
export async function restoreActivity({
  activityId,
  expectedVersion,
  reason = null,
  user,
  ipAddress = null,
  userAgent = null,
}) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new ActivityValidationError('Expected version is mandatory for restoring');
  }

  const current = await getActivityById(activityId);
  if (!current) throw new ActivityNotFoundError(`Activity ${activityId} not found`);
  if (!current.archived_at) throw new ActivityValidationError('Activity is not archived');

  if (current.project_status === 'CANCELLED' || current.project_status === 'ARCHIVED') {
    throw new ActivityValidationError('Cannot restore activities in archived or cancelled projects');
  }

  if (Number(current.version) !== Number(expectedVersion)) {
    throw new StaleVersionError(
      `Conflict: activity was modified by another operation (expected version ${expectedVersion}, current version ${current.version})`
    );
  }

  const perms = await fetchUserPermissions(user.id);
  const isSysAdmin = perms.isAdmin;
  const isPM = perms.roles.has('PROJECT_MANAGER') && perms.pmProjectIds.has(current.project_id);

  if (!isSysAdmin && !isPM) {
    throw new ActivityForbiddenError('Only Project Managers or System Admins may restore activities.');
  }

  const pool = getPool();
  const client = await pool.connect();
  const correlationId = crypto.randomUUID();

  try {
    await client.query('BEGIN');

    // Check parent is not archived if activity has a parent
    if (current.parent_activity_id) {
      const parentRes = await client.query('SELECT archived_at FROM activities WHERE id = $1', [current.parent_activity_id]);
      if (parentRes.rows.length > 0 && parentRes.rows[0].archived_at) {
        throw new ActivityValidationError('Cannot restore child activity while parent activity is archived.');
      }
    }

    const restoreSql = `
      UPDATE activities
      SET
        archived_at = NULL,
        archived_by = NULL,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $1
      WHERE id = $2 AND version = $3
      RETURNING *;
    `;

    const res = await client.query(restoreSql, [user.id, activityId, expectedVersion]);
    if (res.rows.length === 0) {
      throw new StaleVersionError(`Conflict: activity version ${expectedVersion} is stale.`);
    }

    // Recalculate parent roll-ups
    if (current.parent_activity_id) {
      await recalculateParentRollups(client, current.parent_activity_id, user.id, correlationId);
    }

    await client.query('COMMIT');

    const updated = await getActivityById(activityId);

    await recordAuditEvent({
      correlationId,
      entityName: 'activities',
      entityId: activityId,
      action: 'REACTIVATE',
      actorId: user.id,
      beforeState: { archived_at: current.archived_at },
      afterState: { archived_at: null },
      changeReason: reason || null,
      ipAddress,
      userAgent,
    });

    return updated;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * List activities for a project with server-side scoping and filters
 */
export async function listProjectActivities({
  projectId,
  phaseId = null,
  status = null,
  activityTypeId = null,
  priorityId = null,
  ownerUserId = null,
  isParent = null,
  includeArchived = false,
  limit = 100,
  offset = 0,
  user,
}) {
  const perms = await fetchUserPermissions(user.id);

  // Validate project scope
  if (!perms.isAdmin) {
    if (perms.roles.has('PROJECT_MANAGER')) {
      if (!perms.pmProjectIds.has(projectId)) {
        throw new ActivityForbiddenError('Access denied: project is outside assigned scope.');
      }
    } else if (perms.roles.has('TEAM_LEAD')) {
      // Allowed if project involves their team
      if (!perms.tlProjectIds.has(projectId)) {
        // May still check if they have team members in project
      }
    }
  }

  const conditions = ['a.project_id = $1'];
  const params = [projectId];
  let paramIdx = 2;

  // Archival filter
  if (!includeArchived) {
    conditions.push('a.archived_at IS NULL');
  }

  // Scoping restrictions on list items
  if (!perms.isAdmin && !perms.pmProjectIds.has(projectId)) {
    if (perms.roles.has('TEAM_MEMBER') && !perms.roles.has('TEAM_LEAD')) {
      // Team members only see activities they own
      conditions.push(`a.owner_user_id = $${paramIdx++}`);
      params.push(user.id);
    } else if (perms.roles.has('RESOURCE_MANAGER') && !perms.roles.has('TEAM_LEAD')) {
      // Resource manager only sees activities owned by users in their resource scope
      const rmUsers = Array.from(perms.rmMemberUserIds);
      if (rmUsers.length === 0) {
        return { activities: [], total: 0, limit, offset };
      }
      conditions.push(`a.owner_user_id = ANY($${paramIdx++}::uuid[])`);
      params.push(rmUsers);
    }
  }

  // Optional query filters
  if (phaseId) {
    conditions.push(`a.phase_id = $${paramIdx++}`);
    params.push(phaseId);
  }
  if (status) {
    conditions.push(`a.status = $${paramIdx++}`);
    params.push(status);
  }
  if (activityTypeId) {
    conditions.push(`a.activity_type_id = $${paramIdx++}`);
    params.push(activityTypeId);
  }
  if (priorityId) {
    conditions.push(`a.priority_id = $${paramIdx++}`);
    params.push(priorityId);
  }
  if (ownerUserId) {
    conditions.push(`a.owner_user_id = $${paramIdx++}`);
    params.push(ownerUserId);
  }
  if (isParent === 'true' || isParent === true) {
    conditions.push('a.parent_activity_id IS NULL');
  } else if (isParent === 'false' || isParent === false) {
    conditions.push('a.parent_activity_id IS NOT NULL');
  }

  const whereClause = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM activities a WHERE ${whereClause};`;
  const countRes = await query(countSql, params);
  const total = parseInt(countRes.rows[0].total, 10);

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const listSql = `
    SELECT 
      a.id,
      a.project_id,
      p.code AS project_code,
      p.name AS project_name,
      a.readable_activity_id,
      a.title,
      a.activity_type_id,
      rt.name AS activity_type_name,
      a.priority_id,
      rp.name AS priority_name,
      a.status,
      a.original_estimate_hours,
      a.current_estimate_hours,
      a.remaining_effort_hours,
      a.actual_effort_hours,
      a.start_date,
      a.due_date,
      a.owner_user_id,
      u.full_name AS owner_name,
      u.email AS owner_email,
      a.phase_id,
      ph.name AS phase_name,
      a.parent_activity_id,
      pa.readable_activity_id AS parent_readable_id,
      pa.title AS parent_title,
      a.blocker_description,
      a.forecast_finish_date,
      a.version,
      a.created_at,
      a.updated_at,
      a.archived_at,
      EXISTS(SELECT 1 FROM activities c WHERE c.parent_activity_id = a.id AND c.archived_at IS NULL) AS has_active_children
    FROM activities a
    JOIN projects p ON p.id = a.project_id
    LEFT JOIN reference_data rt ON rt.id = a.activity_type_id
    LEFT JOIN reference_data rp ON rp.id = a.priority_id
    LEFT JOIN users u ON u.id = a.owner_user_id
    LEFT JOIN phases ph ON ph.id = a.phase_id
    LEFT JOIN activities pa ON pa.id = a.parent_activity_id
    WHERE ${whereClause}
    ORDER BY a.readable_activity_id ASC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;

  const listRes = await query(listSql, [...params, safeLimit, safeOffset]);

  return {
    activities: listRes.rows,
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

/**
 * Get direct children of a parent activity
 */
export async function getActivityChildren(activityId, user) {
  const parent = await getActivityById(activityId);
  if (!parent) throw new ActivityNotFoundError(`Parent activity ${activityId} not found`);

  const perms = await fetchUserPermissions(user.id);
  if (!canViewActivity(user, parent, perms)) {
    throw new ActivityForbiddenError('Access denied: activity is outside permitted scope.');
  }

  const sql = `
    SELECT 
      a.id,
      a.project_id,
      p.code AS project_code,
      a.readable_activity_id,
      a.title,
      a.activity_type_id,
      rt.name AS activity_type_name,
      a.priority_id,
      rp.name AS priority_name,
      a.status,
      a.original_estimate_hours,
      a.current_estimate_hours,
      a.remaining_effort_hours,
      a.actual_effort_hours,
      a.start_date,
      a.due_date,
      a.owner_user_id,
      u.full_name AS owner_name,
      u.email AS owner_email,
      a.phase_id,
      ph.name AS phase_name,
      a.parent_activity_id,
      a.blocker_description,
      a.forecast_finish_date,
      a.version,
      a.created_at,
      a.updated_at,
      a.archived_at
    FROM activities a
    JOIN projects p ON p.id = a.project_id
    LEFT JOIN reference_data rt ON rt.id = a.activity_type_id
    LEFT JOIN reference_data rp ON rp.id = a.priority_id
    LEFT JOIN users u ON u.id = a.owner_user_id
    LEFT JOIN phases ph ON ph.id = a.phase_id
    WHERE a.parent_activity_id = $1 AND a.archived_at IS NULL
    ORDER BY a.readable_activity_id ASC;
  `;
  const res = await query(sql, [activityId]);
  return res.rows;
}

/**
 * Get audit events for a specific activity
 */
export async function getActivityAuditEvents(activityId, user) {
  const activity = await getActivityById(activityId);
  if (!activity) throw new ActivityNotFoundError(`Activity ${activityId} not found`);

  const perms = await fetchUserPermissions(user.id);
  if (!canViewActivity(user, activity, perms)) {
    throw new ActivityForbiddenError('Access denied: activity is outside permitted scope.');
  }

  const sql = `
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
    WHERE a.entity_name = 'activities' AND a.entity_id = $1
    ORDER BY a.recorded_at DESC;
  `;
  const res = await query(sql, [activityId]);
  return res.rows;
}

/**
 * List "My Activities" for Team Members (or any authenticated user)
 */
export async function listMyActivities({ user, limit = 100, offset = 0 }) {
  if (!user || !user.isActive) {
    throw new ActivityForbiddenError('Active user account required');
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const countSql = 'SELECT COUNT(*) AS total FROM activities WHERE owner_user_id = $1 AND archived_at IS NULL;';
  const countRes = await query(countSql, [user.id]);
  const total = parseInt(countRes.rows[0].total, 10);

  const sql = `
    SELECT 
      a.id,
      a.project_id,
      p.code AS project_code,
      p.name AS project_name,
      a.readable_activity_id,
      a.title,
      a.activity_type_id,
      rt.name AS activity_type_name,
      a.priority_id,
      rp.name AS priority_name,
      a.status,
      a.original_estimate_hours,
      a.current_estimate_hours,
      a.remaining_effort_hours,
      a.actual_effort_hours,
      a.start_date,
      a.due_date,
      a.owner_user_id,
      u.full_name AS owner_name,
      a.phase_id,
      ph.name AS phase_name,
      a.parent_activity_id,
      pa.readable_activity_id AS parent_readable_id,
      a.blocker_description,
      a.forecast_finish_date,
      a.version,
      a.created_at,
      a.updated_at
    FROM activities a
    JOIN projects p ON p.id = a.project_id
    LEFT JOIN reference_data rt ON rt.id = a.activity_type_id
    LEFT JOIN reference_data rp ON rp.id = a.priority_id
    LEFT JOIN users u ON u.id = a.owner_user_id
    LEFT JOIN phases ph ON ph.id = a.phase_id
    LEFT JOIN activities pa ON pa.id = a.parent_activity_id
    WHERE a.owner_user_id = $1 AND a.archived_at IS NULL
    ORDER BY a.readable_activity_id ASC
    LIMIT $2 OFFSET $3;
  `;
  const res = await query(sql, [user.id, safeLimit, safeOffset]);

  return {
    activities: res.rows,
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

/**
 * List "Team Activities" for Team Leads (restricted to active team members)
 */
export async function listTeamActivities({ user, limit = 100, offset = 0 }) {
  const perms = await fetchUserPermissions(user.id);
  if (!perms.isAdmin && !perms.roles.has('TEAM_LEAD')) {
    throw new ActivityForbiddenError('Only Team Leads or System Admins may view team activities.');
  }

  const teamMemberIds = Array.from(perms.tlMemberUserIds);
  if (teamMemberIds.length === 0) {
    return { activities: [], total: 0, limit, offset };
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const countSql = 'SELECT COUNT(*) AS total FROM activities WHERE owner_user_id = ANY($1::uuid[]) AND archived_at IS NULL;';
  const countRes = await query(countSql, [teamMemberIds]);
  const total = parseInt(countRes.rows[0].total, 10);

  const sql = `
    SELECT 
      a.id,
      a.project_id,
      p.code AS project_code,
      p.name AS project_name,
      a.readable_activity_id,
      a.title,
      a.activity_type_id,
      rt.name AS activity_type_name,
      a.priority_id,
      rp.name AS priority_name,
      a.status,
      a.original_estimate_hours,
      a.current_estimate_hours,
      a.remaining_effort_hours,
      a.actual_effort_hours,
      a.start_date,
      a.due_date,
      a.owner_user_id,
      u.full_name AS owner_name,
      a.phase_id,
      ph.name AS phase_name,
      a.parent_activity_id,
      pa.readable_activity_id AS parent_readable_id,
      a.blocker_description,
      a.forecast_finish_date,
      a.version,
      a.created_at,
      a.updated_at
    FROM activities a
    JOIN projects p ON p.id = a.project_id
    LEFT JOIN reference_data rt ON rt.id = a.activity_type_id
    LEFT JOIN reference_data rp ON rp.id = a.priority_id
    LEFT JOIN users u ON u.id = a.owner_user_id
    LEFT JOIN phases ph ON ph.id = a.phase_id
    LEFT JOIN activities pa ON pa.id = a.parent_activity_id
    WHERE a.owner_user_id = ANY($1::uuid[]) AND a.archived_at IS NULL
    ORDER BY a.readable_activity_id ASC
    LIMIT $2 OFFSET $3;
  `;
  const res = await query(sql, [teamMemberIds, safeLimit, safeOffset]);

  return {
    activities: res.rows,
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}
