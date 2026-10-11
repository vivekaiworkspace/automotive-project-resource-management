/**
 * Leave Management Service (Step 6)
 * Complete Core Pilot business logic for leave submission, approval, rejection,
 * cancellation, scope enforcement, database transactions, and audit logging.
 */

import { query, getPool } from '../../db/index.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/audit.service.js';
import { getWorkingDaysInRange, ORGANIZATION_CALENDAR, formatDateYmd } from '../capacity_scheduling/calendar.service.js';
import { serializeLeaveForRole, serializeLeaveListForRole } from './leave.serializer.js';

export const VALID_LEAVE_TYPES = ['ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'OTHER'];
export const VALID_LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export class LeaveValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'LeaveValidationError';
    this.statusCode = 400;
    this.code = 'BAD_REQUEST';
    this.details = details;
  }
}

export class LeaveNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LeaveNotFoundError';
    this.statusCode = 404;
    this.code = 'NOT_FOUND';
  }
}

export class LeaveForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LeaveForbiddenError';
    this.statusCode = 403;
    this.code = 'FORBIDDEN';
  }
}

/**
 * Retrieve user roles from DB or request context
 */
export async function getUserRoles(userId, user = null, client = null) {
  if (Array.isArray(user?.roles) && user.roles.length > 0) {
    return user.roles;
  }
  const runner = client || { query };
  const res = await runner.query('SELECT role_code FROM user_roles WHERE user_id = $1', [userId]);
  return res.rows.map(r => r.role_code);
}

/**
 * Check if target user is in a Team Lead's active team scope
 */
export async function isUserInTeamLeadScope(tlUserId, targetUserId, client = null) {
  if (!tlUserId || !targetUserId) return false;
  if (tlUserId === targetUserId) return true; // Team lead is part of their own team scope

  const runner = client || { query };
  const res = await runner.query(`
    SELECT 1 FROM team_memberships tm
    WHERE tm.user_id = $1
      AND tm.archived_at IS NULL
      AND tm.team_id IN (
        SELECT team_id FROM team_memberships WHERE user_id = $2 AND is_team_lead = TRUE AND archived_at IS NULL
        UNION
        SELECT target_id::uuid FROM user_scopes WHERE user_id = $2 AND scope_type = 'TEAM'
        UNION
        SELECT id FROM teams WHERE team_lead_member_id IN (SELECT id FROM members WHERE user_id = $2)
      )
  `, [targetUserId, tlUserId]);

  return res.rows.length > 0;
}

/**
 * Check if target user is in a Resource Manager's active resource scope
 */
export async function isUserInResourceManagerScope(rmUserId, targetUserId, client = null) {
  if (!rmUserId || !targetUserId) return false;
  if (rmUserId === targetUserId) return true;

  const runner = client || { query };
  const res = await runner.query(`
    SELECT 1 FROM team_memberships tm
    WHERE tm.user_id = $1
      AND tm.archived_at IS NULL
      AND tm.team_id IN (
        SELECT team_id FROM resource_manager_scopes WHERE user_id = $2
        UNION
        SELECT target_id::uuid FROM user_scopes WHERE user_id = $2 AND scope_type = 'TEAM'
      )
  `, [targetUserId, rmUserId]);

  return res.rows.length > 0;
}

/**
 * Get all user IDs in a Team Lead's team scope
 */
export async function getUserIdsInTeamLeadScope(tlUserId, client = null) {
  const runner = client || { query };
  const res = await runner.query(`
    SELECT DISTINCT tm.user_id FROM team_memberships tm
    WHERE tm.archived_at IS NULL
      AND tm.team_id IN (
        SELECT team_id FROM team_memberships WHERE user_id = $1 AND is_team_lead = TRUE AND archived_at IS NULL
        UNION
        SELECT target_id::uuid FROM user_scopes WHERE user_id = $1 AND scope_type = 'TEAM'
        UNION
        SELECT id FROM teams WHERE team_lead_member_id IN (SELECT id FROM members WHERE user_id = $1)
      )
  `, [tlUserId]);
  return res.rows.map(r => r.user_id);
}

/**
 * Get all user IDs in a Resource Manager's scope
 */
export async function getUserIdsInResourceManagerScope(rmUserId, client = null) {
  const runner = client || { query };
  const res = await runner.query(`
    SELECT DISTINCT tm.user_id FROM team_memberships tm
    WHERE tm.archived_at IS NULL
      AND tm.team_id IN (
        SELECT team_id FROM resource_manager_scopes WHERE user_id = $1
        UNION
        SELECT target_id::uuid FROM user_scopes WHERE user_id = $1 AND scope_type = 'TEAM'
      )
  `, [rmUserId]);
  return res.rows.map(r => r.user_id);
}

/**
 * Check whether a user is authorized to submit leave on behalf of target user
 */
export async function assertCanSubmitLeave(submittingUser, targetUserId, client = null) {
  if (!submittingUser) {
    throw new LeaveForbiddenError('Authentication required');
  }

  // Self-service leave is always permitted for any role
  if (submittingUser.id === targetUserId) {
    return true;
  }

  const roles = await getUserRoles(submittingUser.id, submittingUser, client);
  const isAdmin = roles.includes('SYSTEM_ADMIN');
  const isRM = roles.includes('RESOURCE_MANAGER');
  const isTL = roles.includes('TEAM_LEAD');

  if (isAdmin) {
    return true;
  }

  if (isRM) {
    const inScope = await isUserInResourceManagerScope(submittingUser.id, targetUserId, client);
    if (inScope) return true;
    throw new LeaveForbiddenError('Resource Manager cannot submit leave for a member outside authorized resource scope.');
  }

  if (isTL) {
    const inTeam = await isUserInTeamLeadScope(submittingUser.id, targetUserId, client);
    if (inTeam) return true;
    throw new LeaveForbiddenError('Team Lead cannot submit leave for a member outside their team.');
  }

  // TEAM_MEMBER and PROJECT_MANAGER cannot submit leave for another user
  throw new LeaveForbiddenError('You are not authorized to submit leave requests for other users.');
}

/**
 * Check whether a user is authorized to approve or reject leave
 */
export async function assertCanApproveOrRejectLeave(approverUser, leaveRecord, client = null) {
  if (!approverUser) {
    throw new LeaveForbiddenError('Authentication required');
  }

  const roles = await getUserRoles(approverUser.id, approverUser, client);
  const isAdmin = roles.includes('SYSTEM_ADMIN');
  const isRM = roles.includes('RESOURCE_MANAGER');
  const isTL = roles.includes('TEAM_LEAD');

  // SYSTEM_ADMIN may approve leave for any member
  if (isAdmin) {
    return { allowed: true, role: 'SYSTEM_ADMIN' };
  }

  // TEAM_LEAD may approve only for active members of the Team Lead's own team
  if (isTL) {
    const inTeam = await isUserInTeamLeadScope(approverUser.id, leaveRecord.user_id, client);
    if (inTeam) {
      return { allowed: true, role: 'TEAM_LEAD' };
    }
  }

  // RESOURCE_MANAGER may approve only for members within their authorized resource scope
  if (isRM) {
    const inScope = await isUserInResourceManagerScope(approverUser.id, leaveRecord.user_id, client);
    if (inScope) {
      return { allowed: true, role: 'RESOURCE_MANAGER' };
    }
  }

  // Explicit denials for PM without TL/RM/Admin authority, TM, and out-of-scope TL/RM
  if (roles.includes('PROJECT_MANAGER') && !isTL && !isRM && !isAdmin) {
    throw new LeaveForbiddenError('Project Managers are not authorized to approve leave requests.');
  }

  if (roles.includes('TEAM_MEMBER') && !isTL && !isRM && !isAdmin) {
    throw new LeaveForbiddenError('Team Members are not authorized to approve leave requests.');
  }

  throw new LeaveForbiddenError('User is not authorized to approve leave for this team member (outside authorized scope).');
}

/**
 * Check whether a user is authorized to view a specific leave record
 */
export async function assertCanViewLeave(viewingUser, leaveRecord, client = null) {
  if (!viewingUser) {
    throw new LeaveForbiddenError('Authentication required');
  }

  if (viewingUser.id === leaveRecord.user_id) {
    return { isOwnRecord: true, isInTeam: true, isInResourceScope: true };
  }

  const roles = await getUserRoles(viewingUser.id, viewingUser, client);
  const isAdmin = roles.includes('SYSTEM_ADMIN');
  const isRM = roles.includes('RESOURCE_MANAGER');
  const isTL = roles.includes('TEAM_LEAD');

  if (isAdmin) {
    return { isOwnRecord: false, isInTeam: true, isInResourceScope: true };
  }

  let inScope = false;
  if (isRM) {
    inScope = await isUserInResourceManagerScope(viewingUser.id, leaveRecord.user_id, client);
    if (!inScope && !isTL) {
      throw new LeaveForbiddenError('Resource Manager cannot access leave records outside their resource scope.');
    }
  }

  let inTeam = false;
  if (isTL) {
    inTeam = await isUserInTeamLeadScope(viewingUser.id, leaveRecord.user_id, client);
    if (!inTeam && !isRM) {
      throw new LeaveForbiddenError('Team Lead cannot access leave records outside their team.');
    }
  }

  return { isOwnRecord: false, isInTeam: inTeam, isInResourceScope: inScope };
}

/**
 * Resolve target user and member records
 */
async function resolveTargetUserAndMember(userIdOrMemberId, client = null) {
  const runner = client || { query };

  // First check if it's a users.id
  const userRes = await runner.query('SELECT id, full_name, email FROM users WHERE id = $1', [userIdOrMemberId]);
  if (userRes.rows.length > 0) {
    const user = userRes.rows[0];
    const memberRes = await runner.query('SELECT id FROM members WHERE user_id = $1', [user.id]);
    return {
      userId: user.id,
      memberId: memberRes.rows[0]?.id || null,
      user,
    };
  }

  // Then check if it's a members.id
  const memberRes = await runner.query('SELECT id, user_id FROM members WHERE id = $1', [userIdOrMemberId]);
  if (memberRes.rows.length > 0) {
    const member = memberRes.rows[0];
    const userRowRes = await runner.query('SELECT id, full_name, email FROM users WHERE id = $1', [member.user_id]);
    return {
      userId: member.user_id,
      memberId: member.id,
      user: userRowRes.rows[0] || null,
    };
  }

  throw new LeaveValidationError(`Target user or member not found: ${userIdOrMemberId}`);
}

/**
 * Validate leave dates and type
 */
function validateLeavePayload({ startDate, endDate, leaveType, leaveReason }) {
  if (!startDate || !endDate) {
    throw new LeaveValidationError('Both start_date and end_date are required.');
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    throw new LeaveValidationError('Dates must be in valid YYYY-MM-DD format.');
  }

  if (endDate < startDate) {
    throw new LeaveValidationError('Invalid date range: end_date cannot be earlier than start_date.');
  }

  if (!leaveType) {
    throw new LeaveValidationError('leave_type is required.');
  }

  const upperType = String(leaveType).toUpperCase();
  if (!VALID_LEAVE_TYPES.includes(upperType)) {
    throw new LeaveValidationError(`Invalid leave_type: ${leaveType}. Must be one of: ${VALID_LEAVE_TYPES.join(', ')}.`);
  }

  if (!leaveReason || !String(leaveReason).trim()) {
    throw new LeaveValidationError('leave_reason is required.');
  }

  return {
    startDate,
    endDate,
    leaveType: upperType,
    leaveReason: String(leaveReason).trim(),
  };
}

/**
 * 1. Submit Leave Request (POST /api/v1/leave)
 */
export async function submitLeaveRequest({
  userId = null,
  memberId = null,
  startDate,
  endDate,
  leaveType,
  leaveReason,
  currentUser,
  client = null,
}) {
  if (!currentUser) {
    throw new LeaveForbiddenError('Authentication required');
  }

  const validated = validateLeavePayload({ startDate, endDate, leaveType, leaveReason });

  const targetIdentifier = userId || memberId || currentUser.id;
  const pool = getPool();
  const dbClient = client || await pool.connect();
  const isLocalTx = !client;

  try {
    if (isLocalTx) await dbClient.query('BEGIN');

    const target = await resolveTargetUserAndMember(targetIdentifier, dbClient);

    // Enforce submission authorization
    await assertCanSubmitLeave(currentUser, target.userId, dbClient);

    const insertSql = `
      INSERT INTO leave_records (
        user_id,
        member_id,
        start_date,
        end_date,
        leave_type,
        leave_reason,
        status,
        version
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 1)
      RETURNING 
        id,
        user_id,
        member_id,
        TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
        leave_type,
        leave_reason,
        status,
        approved_by_user_id,
        decided_at,
        created_at,
        version;
    `;

    const insertRes = await dbClient.query(insertSql, [
      target.userId,
      target.memberId,
      validated.startDate,
      validated.endDate,
      validated.leaveType,
      validated.leaveReason,
    ]);

    const createdRecord = insertRes.rows[0];

    // Record audit event
    await recordAuditEvent({
      entityName: 'leave_records',
      entityId: createdRecord.id,
      action: AUDIT_ACTIONS.LEAVE_SUBMITTED,
      actorId: currentUser.id,
      afterState: {
        id: createdRecord.id,
        user_id: createdRecord.user_id,
        member_id: createdRecord.member_id,
        start_date: createdRecord.start_date,
        end_date: createdRecord.end_date,
        leave_type: createdRecord.leave_type,
        status: createdRecord.status,
      },
      changeReason: 'Leave request submitted',
      client: dbClient,
    });

    if (isLocalTx) await dbClient.query('COMMIT');

    const callerRoles = await getUserRoles(currentUser.id, currentUser, dbClient);
    const isOwn = currentUser.id === createdRecord.user_id;
    const inTeam = await isUserInTeamLeadScope(currentUser.id, createdRecord.user_id, dbClient);
    const inRM = await isUserInResourceManagerScope(currentUser.id, createdRecord.user_id, dbClient);

    return serializeLeaveForRole(createdRecord, callerRoles, {
      isOwnRecord: isOwn,
      isInTeam: inTeam,
      isInResourceScope: inRM,
    });
  } catch (err) {
    if (isLocalTx) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (isLocalTx) dbClient.release();
  }
}

/**
 * 2. Approve Leave Request (POST /api/v1/leave/:id/approve)
 */
export async function approveLeaveRequest({
  leaveId,
  currentUser,
  client = null,
}) {
  if (!currentUser) {
    throw new LeaveForbiddenError('Authentication required');
  }

  const pool = getPool();
  const dbClient = client || await pool.connect();
  const isLocalTx = !client;

  try {
    if (isLocalTx) await dbClient.query('BEGIN');

    const selectSql = `
      SELECT 
        id,
        user_id,
        member_id,
        TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
        leave_type,
        leave_reason,
        status,
        approved_by_user_id,
        decided_at,
        created_at,
        version
      FROM leave_records
      WHERE id = $1
      FOR UPDATE;
    `;
    const selRes = await dbClient.query(selectSql, [leaveId]);
    const existing = selRes.rows[0];

    if (!existing) {
      throw new LeaveNotFoundError(`Leave request not found (ID: ${leaveId})`);
    }

    // Verify approval authority and scope
    await assertCanApproveOrRejectLeave(currentUser, existing, dbClient);

    if (existing.status !== 'PENDING') {
      throw new LeaveValidationError(`Cannot approve leave request in ${existing.status} status. Only PENDING requests may be approved.`);
    }

    const updateSql = `
      UPDATE leave_records
      SET 
        status = 'APPROVED',
        approved_by_user_id = $1,
        decided_at = CURRENT_TIMESTAMP,
        version = version + 1
      WHERE id = $2
      RETURNING 
        id,
        user_id,
        member_id,
        TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
        leave_type,
        leave_reason,
        status,
        approved_by_user_id,
        decided_at,
        created_at,
        version;
    `;

    const updateRes = await dbClient.query(updateSql, [currentUser.id, leaveId]);
    const updated = updateRes.rows[0];

    // Record audit event
    await recordAuditEvent({
      entityName: 'leave_records',
      entityId: updated.id,
      action: AUDIT_ACTIONS.LEAVE_APPROVED,
      actorId: currentUser.id,
      beforeState: {
        status: existing.status,
        version: existing.version,
      },
      afterState: {
        status: updated.status,
        approved_by_user_id: currentUser.id,
        decided_at: updated.decided_at,
        version: updated.version,
      },
      changeReason: 'Leave request approved',
      client: dbClient,
    });

    if (isLocalTx) await dbClient.query('COMMIT');

    const callerRoles = await getUserRoles(currentUser.id, currentUser, dbClient);
    const isOwn = currentUser.id === updated.user_id;
    const inTeam = await isUserInTeamLeadScope(currentUser.id, updated.user_id, dbClient);
    const inRM = await isUserInResourceManagerScope(currentUser.id, updated.user_id, dbClient);

    return serializeLeaveForRole(updated, callerRoles, {
      isOwnRecord: isOwn,
      isInTeam: inTeam,
      isInResourceScope: inRM,
    });
  } catch (err) {
    if (isLocalTx) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (isLocalTx) dbClient.release();
  }
}

/**
 * 3. Reject Leave Request (POST /api/v1/leave/:id/reject)
 */
export async function rejectLeaveRequest({
  leaveId,
  rejectionReason = null,
  currentUser,
  client = null,
}) {
  if (!currentUser) {
    throw new LeaveForbiddenError('Authentication required');
  }

  const pool = getPool();
  const dbClient = client || await pool.connect();
  const isLocalTx = !client;

  try {
    if (isLocalTx) await dbClient.query('BEGIN');

    const selectSql = `
      SELECT 
        id,
        user_id,
        member_id,
        TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
        leave_type,
        leave_reason,
        status,
        approved_by_user_id,
        decided_at,
        created_at,
        version
      FROM leave_records
      WHERE id = $1
      FOR UPDATE;
    `;
    const selRes = await dbClient.query(selectSql, [leaveId]);
    const existing = selRes.rows[0];

    if (!existing) {
      throw new LeaveNotFoundError(`Leave request not found (ID: ${leaveId})`);
    }

    // Verify rejection authority and scope
    await assertCanApproveOrRejectLeave(currentUser, existing, dbClient);

    if (existing.status !== 'PENDING') {
      throw new LeaveValidationError(`Cannot reject leave request in ${existing.status} status. Only PENDING requests may be rejected.`);
    }

    const updateSql = `
      UPDATE leave_records
      SET 
        status = 'REJECTED',
        approved_by_user_id = $1,
        decided_at = CURRENT_TIMESTAMP,
        version = version + 1
      WHERE id = $2
      RETURNING 
        id,
        user_id,
        member_id,
        TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
        leave_type,
        leave_reason,
        status,
        approved_by_user_id,
        decided_at,
        created_at,
        version;
    `;

    const updateRes = await dbClient.query(updateSql, [currentUser.id, leaveId]);
    const updated = updateRes.rows[0];

    // Record audit event
    await recordAuditEvent({
      entityName: 'leave_records',
      entityId: updated.id,
      action: AUDIT_ACTIONS.LEAVE_REJECTED,
      actorId: currentUser.id,
      beforeState: {
        status: existing.status,
        version: existing.version,
      },
      afterState: {
        status: updated.status,
        decided_by_user_id: currentUser.id,
        decided_at: updated.decided_at,
        version: updated.version,
      },
      changeReason: rejectionReason || 'Leave request rejected',
      client: dbClient,
    });

    if (isLocalTx) await dbClient.query('COMMIT');

    const callerRoles = await getUserRoles(currentUser.id, currentUser, dbClient);
    const isOwn = currentUser.id === updated.user_id;
    const inTeam = await isUserInTeamLeadScope(currentUser.id, updated.user_id, dbClient);
    const inRM = await isUserInResourceManagerScope(currentUser.id, updated.user_id, dbClient);

    return serializeLeaveForRole(updated, callerRoles, {
      isOwnRecord: isOwn,
      isInTeam: inTeam,
      isInResourceScope: inRM,
    });
  } catch (err) {
    if (isLocalTx) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (isLocalTx) dbClient.release();
  }
}

/**
 * 4. Cancel Leave Request (POST /api/v1/leave/:id/cancel)
 */
export async function cancelLeaveRequest({
  leaveId,
  currentUser,
  client = null,
}) {
  if (!currentUser) {
    throw new LeaveForbiddenError('Authentication required');
  }

  const pool = getPool();
  const dbClient = client || await pool.connect();
  const isLocalTx = !client;

  try {
    if (isLocalTx) await dbClient.query('BEGIN');

    const selectSql = `
      SELECT 
        id,
        user_id,
        member_id,
        TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
        leave_type,
        leave_reason,
        status,
        approved_by_user_id,
        decided_at,
        created_at,
        version
      FROM leave_records
      WHERE id = $1
      FOR UPDATE;
    `;
    const selRes = await dbClient.query(selectSql, [leaveId]);
    const existing = selRes.rows[0];

    if (!existing) {
      throw new LeaveNotFoundError(`Leave request not found (ID: ${leaveId})`);
    }

    const isOwn = currentUser.id === existing.user_id;
    const roles = await getUserRoles(currentUser.id, currentUser, dbClient);
    const isAdmin = roles.includes('SYSTEM_ADMIN');
    const isRM = roles.includes('RESOURCE_MANAGER') && await isUserInResourceManagerScope(currentUser.id, existing.user_id, dbClient);
    const isTL = roles.includes('TEAM_LEAD') && await isUserInTeamLeadScope(currentUser.id, existing.user_id, dbClient);

    if (!isOwn && !isAdmin && !isRM && !isTL) {
      throw new LeaveForbiddenError('You are not authorized to cancel this leave request.');
    }

    if (existing.status === 'CANCELLED') {
      throw new LeaveValidationError('Leave request is already cancelled.');
    }
    if (existing.status === 'REJECTED') {
      throw new LeaveValidationError('Cannot cancel a rejected leave request.');
    }

    const updateSql = `
      UPDATE leave_records
      SET 
        status = 'CANCELLED',
        decided_at = CURRENT_TIMESTAMP,
        version = version + 1
      WHERE id = $1
      RETURNING 
        id,
        user_id,
        member_id,
        TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
        leave_type,
        leave_reason,
        status,
        approved_by_user_id,
        decided_at,
        created_at,
        version;
    `;

    const updateRes = await dbClient.query(updateSql, [leaveId]);
    const updated = updateRes.rows[0];

    // Record audit event
    await recordAuditEvent({
      entityName: 'leave_records',
      entityId: updated.id,
      action: AUDIT_ACTIONS.LEAVE_CANCELLED,
      actorId: currentUser.id,
      beforeState: {
        status: existing.status,
        version: existing.version,
      },
      afterState: {
        status: updated.status,
        decided_at: updated.decided_at,
        version: updated.version,
      },
      changeReason: 'Leave request cancelled',
      client: dbClient,
    });

    if (isLocalTx) await dbClient.query('COMMIT');

    const callerRoles = await getUserRoles(currentUser.id, currentUser, dbClient);
    const inTeam = await isUserInTeamLeadScope(currentUser.id, updated.user_id, dbClient);
    const inRM = await isUserInResourceManagerScope(currentUser.id, updated.user_id, dbClient);

    return serializeLeaveForRole(updated, callerRoles, {
      isOwnRecord: isOwn,
      isInTeam: inTeam,
      isInResourceScope: inRM,
    });
  } catch (err) {
    if (isLocalTx) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (isLocalTx) dbClient.release();
  }
}

/**
 * 5. Get Leave Record by ID (GET /api/v1/leave/:id)
 */
export async function getLeaveById({
  leaveId,
  currentUser,
  client = null,
}) {
  if (!currentUser) {
    throw new LeaveForbiddenError('Authentication required');
  }

  const runner = client || { query };
  const selectSql = `
    SELECT 
      id,
      user_id,
      member_id,
      TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
      TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
      leave_type,
      leave_reason,
      status,
      approved_by_user_id,
      decided_at,
      created_at,
      version
    FROM leave_records
    WHERE id = $1;
  `;
  const res = await runner.query(selectSql, [leaveId]);
  const leave = res.rows[0];

  if (!leave) {
    throw new LeaveNotFoundError(`Leave request not found (ID: ${leaveId})`);
  }

  const scopeInfo = await assertCanViewLeave(currentUser, leave, runner);
  const callerRoles = await getUserRoles(currentUser.id, currentUser, runner);

  return serializeLeaveForRole(leave, callerRoles, scopeInfo);
}

/**
 * 6. List Leave Records (GET /api/v1/leave)
 */
export async function listLeaveRecords({
  startDate = null,
  endDate = null,
  userId = null,
  memberId = null,
  status = null,
  currentUser,
  client = null,
}) {
  if (!currentUser) {
    throw new LeaveForbiddenError('Authentication required');
  }

  const runner = client || { query };
  const callerRoles = await getUserRoles(currentUser.id, currentUser, runner);
  const isAdmin = callerRoles.includes('SYSTEM_ADMIN');
  const isRM = callerRoles.includes('RESOURCE_MANAGER');
  const isTL = callerRoles.includes('TEAM_LEAD');
  const isPM = callerRoles.includes('PROJECT_MANAGER');
  const isTM = callerRoles.includes('TEAM_MEMBER');

  let sql = `
    SELECT 
      id,
      user_id,
      member_id,
      TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
      TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
      leave_type,
      leave_reason,
      status,
      approved_by_user_id,
      decided_at,
      created_at,
      version
    FROM leave_records
    WHERE 1=1
  `;
  const params = [];
  let paramIdx = 1;

  if (startDate) {
    sql += ` AND end_date >= $${paramIdx++}::date`;
    params.push(startDate);
  }
  if (endDate) {
    sql += ` AND start_date <= $${paramIdx++}::date`;
    params.push(endDate);
  }
  if (status) {
    sql += ` AND status = $${paramIdx++}`;
    params.push(status.toUpperCase());
  }

  // Handle explicit user/member filter if passed
  if (userId) {
    sql += ` AND user_id = $${paramIdx++}`;
    params.push(userId);
  } else if (memberId) {
    sql += ` AND (member_id = $${paramIdx} OR user_id = $${paramIdx})`;
    paramIdx++;
    params.push(memberId);
  }

  // Scope enforcement for caller roles
  if (!isAdmin) {
    if (isRM && !isTL && !isPM) {
      // Resource Manager: strictly scoped to authorized resource scope + self
      const inScopeUserIds = await getUserIdsInResourceManagerScope(currentUser.id, runner);
      inScopeUserIds.push(currentUser.id);
      sql += ` AND user_id = ANY($${paramIdx++}::uuid[])`;
      params.push(inScopeUserIds);
    } else if (isTL && !isRM && !isAdmin) {
      // Team Lead: strictly scoped to own team members + self
      const teamUserIds = await getUserIdsInTeamLeadScope(currentUser.id, runner);
      teamUserIds.push(currentUser.id);
      sql += ` AND user_id = ANY($${paramIdx++}::uuid[])`;
      params.push(teamUserIds);
    }
  }

  sql += ` ORDER BY start_date ASC, created_at ASC;`;

  const res = await runner.query(sql, params);
  const rows = res.rows;

  // Retrieve user team memberships for accurate serialization
  const tlUserIds = isTL ? await getUserIdsInTeamLeadScope(currentUser.id, runner) : [];
  const tlSet = new Set(tlUserIds);

  const rmUserIds = isRM ? await getUserIdsInResourceManagerScope(currentUser.id, runner) : [];
  const rmSet = new Set(rmUserIds);

  return serializeLeaveListForRole(rows, callerRoles, (record) => {
    const isOwn = record.user_id === currentUser.id;
    const inTeam = isOwn || tlSet.has(record.user_id);
    const inRM = isOwn || rmSet.has(record.user_id);
    return {
      isOwnRecord: isOwn,
      isInTeam: inTeam,
      isInResourceScope: inRM,
    };
  });
}
