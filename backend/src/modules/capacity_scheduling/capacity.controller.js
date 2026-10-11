/**
 * Capacity & Milestone Controller (Step 5)
 */
import {
  evaluateUserWorkload,
  evaluateCriticality,
  saveAssignmentWithCapacityValidation,
  getCaseResolutionOptions,
  resolveCapacityConflictCase,
  escalateCapacityConflictCase,
  checkAndEscalateOverdueCases,
  redactApprovedLeavesForRole,
  redactConflictCaseForRole,
  assertCanViewCaseOptions,
  assertCanEscalateCase,
} from './capacity.service.js';
import {
  listProjectMilestones,
  getMilestoneById,
  createMilestone,
  updateMilestoneCommittedStatus,
} from './milestone.service.js';
import { query } from '../../db/index.js';

async function getUserRoles(userId, user) {
  if (Array.isArray(user?.roles) && user.roles.length > 0) {
    return user.roles;
  }
  const res = await query('SELECT role_code FROM user_roles WHERE user_id = $1', [userId]);
  return res.rows.map(r => r.role_code);
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, code, message, details = null) {
  const payload = {
    error: {
      code,
      message,
    }
  };
  if (details) payload.details = details;
  sendJson(res, statusCode, payload);
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * POST /api/v1/capacity/evaluate
 */
export async function handleEvaluateCapacity(req, res) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const body = await parseBody(req);
    const { userId, activityId, projectId, startDate, endDate, plannedHours } = body;

    if (!userId || !startDate || !endDate) {
      return sendError(res, 400, 'BAD_REQUEST', 'userId, startDate, and endDate are required');
    }

    const roles = await getUserRoles(user.id, user);
    const isAdmin = roles.includes('SYSTEM_ADMIN');
    const isPM = roles.includes('PROJECT_MANAGER');
    const isRM = roles.includes('RESOURCE_MANAGER');
    const isTL = roles.includes('TEAM_LEAD');
    const isTM = roles.includes('TEAM_MEMBER');

    // Scoping authorization:
    // - SYSTEM_ADMIN may evaluate any member.
    // - PROJECT_MANAGER may evaluate only members for activities/projects within that PM’s assigned project scope.
    // - RESOURCE_MANAGER may evaluate only members inside that RM’s resource scope.
    // - TEAM_MEMBER may evaluate only their own capacity.
    // - TEAM_LEAD may evaluate only members within their own team scope.
    // - Deny all other access with HTTP 403.
    if (isAdmin) {
      // Allowed for all members
    } else if (isPM) {
      const pmScopeRes = await query(`
        SELECT project_id FROM project_manager_scopes WHERE user_id = $1
        UNION
        SELECT target_id::uuid FROM user_scopes WHERE user_id = $1 AND scope_type = 'PROJECT'
      `, [user.id]);
      const pmProjectIds = pmScopeRes.rows.map(r => r.project_id);

      if (pmProjectIds.length === 0) {
        return sendError(res, 403, 'FORBIDDEN', 'Project Manager has no assigned project scope');
      }

      let targetProjectId = projectId || null;
      if (activityId) {
        const actRes = await query('SELECT project_id FROM activities WHERE id = $1', [activityId]);
        if (!actRes.rows[0]) {
          return sendError(res, 404, 'NOT_FOUND', `Activity not found (ID: ${activityId})`);
        }
        targetProjectId = actRes.rows[0].project_id;
      }

      if (targetProjectId && !pmProjectIds.includes(targetProjectId)) {
        return sendError(res, 403, 'FORBIDDEN', 'Project Manager can evaluate only members for activities/projects within assigned project scope');
      }
    } else if (isRM) {
      const rmScopeRes = await query(`
        SELECT 1 FROM team_memberships tm
        WHERE tm.user_id = $1
          AND tm.archived_at IS NULL
          AND tm.team_id IN (
            SELECT team_id FROM resource_manager_scopes WHERE user_id = $2
            UNION
            SELECT target_id::uuid FROM user_scopes WHERE user_id = $2 AND scope_type = 'TEAM'
          )
      `, [userId, user.id]);
      if (rmScopeRes.rows.length === 0) {
        return sendError(res, 403, 'FORBIDDEN', 'Resource Manager can evaluate only members inside their resource scope');
      }
    } else if (isTL) {
      if (userId !== user.id) {
        const tlScopeRes = await query(`
          SELECT 1 FROM team_memberships tm
          WHERE tm.user_id = $1
            AND tm.archived_at IS NULL
            AND tm.team_id IN (
              SELECT team_id FROM team_memberships
              WHERE user_id = $2 AND is_team_lead = TRUE AND archived_at IS NULL
            )
        `, [userId, user.id]);
        if (tlScopeRes.rows.length === 0) {
          return sendError(res, 403, 'FORBIDDEN', 'Team Lead can evaluate only members within their own team scope');
        }
      }
    } else if (isTM) {
      if (userId !== user.id) {
        return sendError(res, 403, 'FORBIDDEN', 'Team Member may evaluate only their own capacity');
      }
    } else {
      return sendError(res, 403, 'FORBIDDEN', 'Access denied to capacity evaluation');
    }

    const workload = await evaluateUserWorkload({
      userId,
      startDate,
      endDate,
      proposedPlannedHours: Number(plannedHours || 0),
    });

    let criticality = { isCritical: false };
    if (activityId) {
      const actRes = await query('SELECT project_id, due_date FROM activities WHERE id = $1', [activityId]);
      if (actRes.rows[0]) {
        criticality = await evaluateCriticality({
          projectId: actRes.rows[0].project_id,
          activityId,
          activityStartDate: startDate,
          activityDueDate: endDate,
        });
      }
    }

    let finalLevel = workload.conflictStatus;
    let finalLabel = workload.conflictLabel;
    if (workload.conflictStatus === 'CAPACITY_CONFLICT' && criticality.isCritical) {
      finalLevel = 'CRITICAL_DELIVERY_AT_RISK';
      finalLabel = 'Critical — Delivery-at-Risk Conflict';
    }

    // Response redaction for privacy
    workload.approvedLeaves = redactApprovedLeavesForRole(workload.approvedLeaves, roles);
    if (workload.pendingLeaves) {
      workload.pendingLeaves = redactApprovedLeavesForRole(workload.pendingLeaves, roles);
    }

    sendJson(res, 200, {
      conflict_level: finalLevel,
      conflict_label: finalLabel,
      is_critical: criticality.isCritical,
      criticality,
      workload,
    });
  } catch (err) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
}

/**
 * POST /api/v1/activities/:id/assignments
 */
export async function handleSaveAssignment(req, res, activityId) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const roles = await getUserRoles(user.id, user);
    const isAdmin = roles.includes('SYSTEM_ADMIN');
    const isPM = roles.includes('PROJECT_MANAGER');

    // Only SYSTEM_ADMIN and PROJECT_MANAGER may create, change, or save an activity assignment
    // TEAM_MEMBER, TEAM_LEAD, and RESOURCE_MANAGER must receive HTTP 403
    if (!isAdmin && !isPM) {
      const msg = roles.includes('RESOURCE_MANAGER')
        ? 'Resource Manager cannot directly assign activities. Only SYSTEM_ADMIN and PROJECT_MANAGER may create, change, or save an activity assignment.'
        : 'Only SYSTEM_ADMIN and PROJECT_MANAGER may create, change, or save an activity assignment';
      return sendError(res, 403, 'FORBIDDEN', msg);
    }

    const body = await parseBody(req);
    const { userId, startDate, endDate, plannedHours, override } = body;

    if (!userId || !startDate || !endDate || plannedHours === undefined) {
      return sendError(res, 400, 'BAD_REQUEST', 'userId, startDate, endDate, and plannedHours are required');
    }

    const result = await saveAssignmentWithCapacityValidation({
      activityId,
      userId,
      startDate,
      endDate,
      plannedHours: Number(plannedHours),
      override,
      currentUser: user,
    });

    sendJson(res, 201, result);
  } catch (err) {
    sendError(res, err.statusCode || 500, err.code || 'ASSIGNMENT_ERROR', err.message, err.conflictDetails);
  }
}

/**
 * GET /api/v1/capacity-conflicts
 */
export async function handleListConflictCases(req, res) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const roles = await getUserRoles(user.id, user);
    const isAdmin = roles.includes('SYSTEM_ADMIN');
    const isPM = roles.includes('PROJECT_MANAGER');
    const isRM = roles.includes('RESOURCE_MANAGER');

    // TEAM_LEAD and TEAM_MEMBER must not access these cross-project conflict endpoints; return HTTP 403
    if (!isAdmin && !isPM && !isRM) {
      return sendError(res, 403, 'FORBIDDEN', 'Access denied. Cross-project conflict cases are restricted to System Admin, Project Manager, and Resource Manager.');
    }

    const url = new URL(req.url, 'http://localhost');
    const filterProjectId = url.searchParams.get('projectId');
    const status = url.searchParams.get('status');

    let sql = `
      SELECT 
        c.id, c.case_code, c.activity_id, c.affected_user_id, c.project_id,
        c.status, c.severity, c.created_at, c.deadline, c.escalated_at,
        c.resolved_at, c.resolution_type, c.case_data
      FROM capacity_conflict_cases c
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    // Apply role-based scoping filters server-side
    if (!isAdmin) {
      if (isPM) {
        // Project Manager: only cases for assigned projects
        const pmScopeRes = await query(`
          SELECT project_id FROM project_manager_scopes WHERE user_id = $1
          UNION
          SELECT target_id::uuid FROM user_scopes WHERE user_id = $1 AND scope_type = 'PROJECT'
        `, [user.id]);
        const pmProjectIds = pmScopeRes.rows.map(r => r.project_id);

        if (filterProjectId && !pmProjectIds.includes(filterProjectId)) {
          return sendError(res, 403, 'FORBIDDEN', 'Access denied to project outside assigned scope.');
        }

        if (pmProjectIds.length === 0) {
          return sendJson(res, 200, { cases: [], count: 0 });
        }

        sql += ` AND c.project_id = ANY($${idx++}::uuid[])`;
        params.push(pmProjectIds);
      } else if (isRM) {
        // Resource Manager: only cases concerning members within their resource scope
        const rmScopeRes = await query(`
          SELECT DISTINCT tm.user_id
          FROM team_memberships tm
          WHERE tm.archived_at IS NULL
            AND tm.team_id IN (
              SELECT team_id FROM resource_manager_scopes WHERE user_id = $1
              UNION
              SELECT target_id::uuid FROM user_scopes WHERE user_id = $1 AND scope_type = 'TEAM'
            )
        `, [user.id]);
        const rmUserIds = rmScopeRes.rows.map(r => r.user_id);

        if (rmUserIds.length === 0) {
          return sendJson(res, 200, { cases: [], count: 0 });
        }

        sql += ` AND c.affected_user_id = ANY($${idx++}::uuid[])`;
        params.push(rmUserIds);
      }
    }

    if (filterProjectId && (!isPM || isAdmin)) {
      sql += ` AND c.project_id = $${idx++}`;
      params.push(filterProjectId);
    }
    if (status) {
      sql += ` AND c.status = $${idx++}`;
      params.push(status);
    }

    sql += ` ORDER BY c.created_at DESC`;
    const casesRes = await query(sql, params);

    // Redaction for non-authorized resource roles (e.g. PROJECT_MANAGER)
    const sanitizedCases = casesRes.rows.map(c => redactConflictCaseForRole(c, roles));

    sendJson(res, 200, {
      cases: sanitizedCases,
      count: sanitizedCases.length,
    });
  } catch (err) {
    sendError(res, err.statusCode || 500, 'INTERNAL_ERROR', err.message);
  }
}

/**
 * GET /api/v1/capacity-conflicts/:id
 */
export async function handleGetConflictCase(req, res, caseId) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const roles = await getUserRoles(user.id, user);
    const isAdmin = roles.includes('SYSTEM_ADMIN');
    const isPM = roles.includes('PROJECT_MANAGER');
    const isRM = roles.includes('RESOURCE_MANAGER');

    // TEAM_LEAD and TEAM_MEMBER must not access these cross-project conflict endpoints; return HTTP 403
    if (!isAdmin && !isPM && !isRM) {
      return sendError(res, 403, 'FORBIDDEN', 'Access denied. Cross-project conflict cases are restricted to System Admin, Project Manager, and Resource Manager.');
    }

    const caseRes = await query('SELECT * FROM capacity_conflict_cases WHERE id = $1', [caseId]);
    const conflictCase = caseRes.rows[0];
    if (!conflictCase) {
      return sendError(res, 404, 'NOT_FOUND', `Conflict case not found (ID: ${caseId})`);
    }

    // Role-based scope check
    if (!isAdmin) {
      if (isPM) {
        const pmScopeRes = await query(`
          SELECT 1 FROM project_manager_scopes WHERE user_id = $1 AND project_id = $2
          UNION
          SELECT 1 FROM user_scopes WHERE user_id = $1 AND scope_type = 'PROJECT' AND target_id = $2
        `, [user.id, conflictCase.project_id]);
        if (pmScopeRes.rows.length === 0) {
          return sendError(res, 403, 'FORBIDDEN', 'Project Manager can access only cases for assigned projects');
        }
      } else if (isRM) {
        const rmScopeRes = await query(`
          SELECT 1 FROM team_memberships tm
          WHERE tm.user_id = $1
            AND tm.archived_at IS NULL
            AND tm.team_id IN (
              SELECT team_id FROM resource_manager_scopes WHERE user_id = $2
              UNION
              SELECT target_id::uuid FROM user_scopes WHERE user_id = $2 AND scope_type = 'TEAM'
            )
        `, [conflictCase.affected_user_id, user.id]);
        if (rmScopeRes.rows.length === 0) {
          return sendError(res, 403, 'FORBIDDEN', 'Resource Manager can access only cases concerning members within their resource scope');
        }
      }
    }

    const sanitizedCase = redactConflictCaseForRole(conflictCase, roles);

    sendJson(res, 200, {
      case: sanitizedCase,
    });
  } catch (err) {
    sendError(res, err.statusCode || 500, 'INTERNAL_ERROR', err.message);
  }
}

/**
 * GET /api/v1/capacity-conflicts/:id/options
 */
export async function handleGetCaseResolutionOptions(req, res, caseId) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const caseRes = await query('SELECT * FROM capacity_conflict_cases WHERE id = $1', [caseId]);
    const conflictCase = caseRes.rows[0];
    if (!conflictCase) {
      return sendError(res, 404, 'NOT_FOUND', `Conflict case not found (ID: ${caseId})`);
    }

    await assertCanViewCaseOptions(conflictCase, user);

    const options = await getCaseResolutionOptions(caseId, user);
    sendJson(res, 200, {
      case_id: caseId,
      options,
    });
  } catch (err) {
    sendError(res, err.statusCode || 500, err.code || 'FORBIDDEN', err.message);
  }
}

/**
 * POST /api/v1/capacity-conflicts/:id/resolve
 */
export async function handleResolveCase(req, res, caseId) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const body = await parseBody(req);
    const resolvedCase = await resolveCapacityConflictCase(caseId, body, user);
    sendJson(res, 200, {
      message: 'Capacity conflict resolved successfully',
      case: resolvedCase,
    });
  } catch (err) {
    sendError(res, err.statusCode || 500, err.code || 'RESOLUTION_ERROR', err.message);
  }
}

/**
 * POST /api/v1/capacity-conflicts/:id/escalate
 */
export async function handleEscalateCase(req, res, caseId) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const caseRes = await query('SELECT * FROM capacity_conflict_cases WHERE id = $1', [caseId]);
    const conflictCase = caseRes.rows[0];
    if (!conflictCase) {
      return sendError(res, 404, 'NOT_FOUND', `Conflict case not found (ID: ${caseId})`);
    }

    await assertCanEscalateCase(conflictCase, user);

    const body = await parseBody(req);
    const escalatedCase = await escalateCapacityConflictCase(caseId, body, user);
    sendJson(res, 200, {
      message: 'Capacity conflict escalated successfully',
      case: escalatedCase,
    });
  } catch (err) {
    sendError(res, err.statusCode || 500, err.code || 'ESCALATION_ERROR', err.message);
  }
}

/**
 * POST /api/v1/capacity-conflicts/check-escalations
 */
export async function handleCheckEscalations(req, res) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const escalated = await checkAndEscalateOverdueCases();
    sendJson(res, 200, {
      escalated_count: escalated.length,
      escalated_cases: escalated,
    });
  } catch (err) {
    sendError(res, err.statusCode || 500, 'INTERNAL_ERROR', err.message);
  }
}

/**
 * GET /api/v1/projects/:id/milestones
 */
export async function handleListMilestones(req, res, projectId) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const milestones = await listProjectMilestones(projectId);
    sendJson(res, 200, {
      milestones,
      count: milestones.length,
    });
  } catch (err) {
    sendError(res, err.statusCode || 500, 'INTERNAL_ERROR', err.message);
  }
}

/**
 * POST /api/v1/projects/:id/milestones
 */
export async function handleCreateMilestone(req, res, projectId) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const body = await parseBody(req);
    const milestone = await createMilestone({ ...body, projectId }, user);
    sendJson(res, 201, {
      milestone,
    });
  } catch (err) {
    sendError(res, err.statusCode || 500, err.code || 'MILESTONE_ERROR', err.message);
  }
}

/**
 * PATCH /api/v1/milestones/:id/committed
 */
export async function handleUpdateMilestoneCommitted(req, res, milestoneId) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const body = await parseBody(req);
    const updated = await updateMilestoneCommittedStatus(milestoneId, body, user);
    sendJson(res, 200, {
      message: 'Milestone committed status updated successfully',
      milestone: updated,
    });
  } catch (err) {
    sendError(res, err.statusCode || 500, err.code || 'MILESTONE_ERROR', err.message);
  }
}

/**
 * GET /api/v1/milestones/:id
 */
export async function handleGetMilestone(req, res, milestoneId) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const milestone = await getMilestoneById(milestoneId);
    if (!milestone) return sendError(res, 404, 'NOT_FOUND', `Milestone not found (ID: ${milestoneId})`);

    sendJson(res, 200, { milestone });
  } catch (err) {
    sendError(res, err.statusCode || 500, 'INTERNAL_ERROR', err.message);
  }
}

/**
 * GET /api/v1/notifications
 */
export async function handleListNotifications(req, res) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const sql = `
      SELECT id, user_id, case_id, type, title, message, is_read, read_at, created_at
      FROM in_app_notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50;
    `;
    const notifs = await query(sql, [user.id]);
    sendJson(res, 200, {
      notifications: notifs.rows,
      count: notifs.rows.length,
    });
  } catch (err) {
    sendError(res, err.statusCode || 500, 'INTERNAL_ERROR', err.message);
  }
}
