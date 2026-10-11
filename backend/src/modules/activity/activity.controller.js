import { requireAuth } from '../../middleware/auth.js';
import { sendError } from '../../middleware/errorHandler.js';
import { StaleVersionError } from '../iam/user.service.js';
import {
  createActivity,
  updateActivity,
  transitionActivityStatus,
  archiveActivity,
  restoreActivity,
  getActivityById,
  listProjectActivities,
  getActivityChildren,
  getActivityAuditEvents,
  listMyActivities,
  listTeamActivities,
  fetchUserPermissions,
  canViewActivity,
  ActivityValidationError,
  ActivityNotFoundError,
  ActivityForbiddenError,
} from './activity.service.js';

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function handleControllerError(res, err) {
  if (err instanceof StaleVersionError || err.code === 'CONFLICT_STALE_RECORD') {
    return sendError(res, 409, 'CONFLICT_STALE_RECORD', err.message, {
      current_version: err.currentVersion,
      expected_version: err.expectedVersion,
    });
  }

  if (err instanceof ActivityNotFoundError) {
    return sendError(res, 404, 'NOT_FOUND', err.message);
  }

  if (err instanceof ActivityForbiddenError) {
    return sendError(res, 403, 'FORBIDDEN', err.message);
  }

  if (err instanceof ActivityValidationError) {
    return sendError(res, 400, 'BAD_REQUEST', err.message, err.details);
  }

  const msg = err.message || '';
  if (msg.includes('Access denied') || msg.includes('not authorized')) {
    return sendError(res, 403, 'FORBIDDEN', msg);
  }
  if (msg.includes('not found') || msg.includes('Not found')) {
    return sendError(res, 404, 'NOT_FOUND', msg);
  }
  if (
    msg.includes('mandatory') ||
    msg.includes('cannot exceed') ||
    msg.includes('immutable') ||
    msg.includes('cannot be') ||
    msg.includes('must belong') ||
    msg.includes('Invalid') ||
    msg.includes('violates') ||
    msg.includes('CHECK')
  ) {
    return sendError(res, 400, 'BAD_REQUEST', msg);
  }

  console.error('[ActivityController Error]:', err);
  return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred while processing activity.');
}

/**
 * GET /projects/:projectId/activities
 */
export async function handleListProjectActivities(req, res, projectId) {
  if (!requireAuth(req, res)) return;

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const phaseId = url.searchParams.get('phase_id');
    const status = url.searchParams.get('status');
    const activityTypeId = url.searchParams.get('activity_type_id');
    const priorityId = url.searchParams.get('priority_id');
    const ownerUserId = url.searchParams.get('owner_user_id');
    const isParent = url.searchParams.get('is_parent');
    const includeArchived = url.searchParams.get('include_archived') === 'true';
    const limit = url.searchParams.get('limit') || 100;
    const offset = url.searchParams.get('offset') || 0;

    const data = await listProjectActivities({
      projectId,
      phaseId,
      status,
      activityTypeId,
      priorityId,
      ownerUserId,
      isParent,
      includeArchived,
      limit,
      offset,
      user: req.user,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(data));
  } catch (err) {
    return handleControllerError(res, err);
  }
}

/**
 * POST /projects/:projectId/activities
 */
export async function handleCreateActivity(req, res, projectId) {
  if (!requireAuth(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const ipAddress = req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const activity = await createActivity({
      projectId,
      title: body.title,
      activityTypeId: body.activity_type_id,
      priorityId: body.priority_id,
      status: body.status || 'DRAFT',
      originalEstimateHours: body.original_estimate_hours,
      currentEstimateHours: body.current_estimate_hours,
      remainingEffortHours: body.remaining_effort_hours,
      startDate: body.start_date,
      dueDate: body.due_date,
      ownerUserId: body.owner_user_id,
      phaseId: body.phase_id,
      parentActivityId: body.parent_activity_id,
      forecastFinishDate: body.forecast_finish_date,
      blockerDescription: body.blocker_description,
      user: req.user,
      ipAddress,
      userAgent,
    });

    res.writeHead(201, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ activity }));
  } catch (err) {
    return handleControllerError(res, err);
  }
}

/**
 * GET /activities/:activityId
 */
export async function handleGetActivityById(req, res, activityId) {
  if (!requireAuth(req, res)) return;

  try {
    const activity = await getActivityById(activityId);
    if (!activity) {
      return sendError(res, 404, 'NOT_FOUND', `Activity ${activityId} not found`);
    }

    const perms = await fetchUserPermissions(req.user.id);
    if (!canViewActivity(req.user, activity, perms)) {
      return sendError(res, 403, 'FORBIDDEN', 'Access denied: activity is outside assigned scope.');
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ activity }));
  } catch (err) {
    return handleControllerError(res, err);
  }
}

/**
 * PATCH /activities/:activityId
 */
export async function handleUpdateActivity(req, res, activityId) {
  if (!requireAuth(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const ipAddress = req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const updated = await updateActivity({
      activityId,
      expectedVersion: body.version !== undefined ? body.version : body.expected_version,
      updates: body,
      reason: body.reason,
      user: req.user,
      ipAddress,
      userAgent,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ activity: updated }));
  } catch (err) {
    return handleControllerError(res, err);
  }
}

/**
 * POST /activities/:activityId/status-transitions
 */
export async function handleTransitionStatus(req, res, activityId) {
  if (!requireAuth(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const ipAddress = req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const updated = await transitionActivityStatus({
      activityId,
      targetStatus: body.target_status || body.to_status || body.status,
      expectedVersion: body.version !== undefined ? body.version : body.expected_version,
      reason: body.reason,
      blockerDescription: body.blocker_description,
      user: req.user,
      ipAddress,
      userAgent,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ activity: updated }));
  } catch (err) {
    return handleControllerError(res, err);
  }
}

/**
 * POST /activities/:activityId/archive
 */
export async function handleArchiveActivity(req, res, activityId) {
  if (!requireAuth(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const ipAddress = req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const archived = await archiveActivity({
      activityId,
      expectedVersion: body.version !== undefined ? body.version : body.expected_version,
      reason: body.reason,
      user: req.user,
      ipAddress,
      userAgent,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ activity: archived }));
  } catch (err) {
    return handleControllerError(res, err);
  }
}

/**
 * POST /activities/:activityId/restore
 */
export async function handleRestoreActivity(req, res, activityId) {
  if (!requireAuth(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const ipAddress = req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const restored = await restoreActivity({
      activityId,
      expectedVersion: body.version !== undefined ? body.version : body.expected_version,
      reason: body.reason,
      user: req.user,
      ipAddress,
      userAgent,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ activity: restored }));
  } catch (err) {
    return handleControllerError(res, err);
  }
}

/**
 * GET /activities/:activityId/children
 */
export async function handleGetActivityChildren(req, res, activityId) {
  if (!requireAuth(req, res)) return;

  try {
    const children = await getActivityChildren(activityId, req.user);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ children, total: children.length }));
  } catch (err) {
    return handleControllerError(res, err);
  }
}

/**
 * GET /activities/:activityId/audit-events
 */
export async function handleGetActivityAuditEvents(req, res, activityId) {
  if (!requireAuth(req, res)) return;

  try {
    const events = await getActivityAuditEvents(activityId, req.user);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ events, total: events.length }));
  } catch (err) {
    return handleControllerError(res, err);
  }
}

/**
 * GET /activities/my
 */
export async function handleListMyActivities(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const limit = url.searchParams.get('limit') || 100;
    const offset = url.searchParams.get('offset') || 0;

    const data = await listMyActivities({ user: req.user, limit, offset });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(data));
  } catch (err) {
    return handleControllerError(res, err);
  }
}

/**
 * GET /activities/team
 */
export async function handleListTeamActivities(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const limit = url.searchParams.get('limit') || 100;
    const offset = url.searchParams.get('offset') || 0;

    const data = await listTeamActivities({ user: req.user, limit, offset });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(data));
  } catch (err) {
    return handleControllerError(res, err);
  }
}
