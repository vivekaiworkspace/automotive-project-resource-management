/**
 * Leave Management Controller (Step 6)
 * REST API handlers for Leave Lifecycle & Privacy Serialization
 */

import {
  submitLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  getLeaveById,
  listLeaveRecords,
  LeaveValidationError,
  LeaveNotFoundError,
  LeaveForbiddenError,
} from './leave.service.js';

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
  if (details) payload.error.details = details;
  sendJson(res, statusCode, payload);
}

async function parseBody(req) {
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
        reject(new LeaveValidationError('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function handleLeaveError(res, err) {
  if (err instanceof LeaveValidationError) {
    return sendError(res, 400, 'BAD_REQUEST', err.message, err.details);
  }
  if (err instanceof LeaveNotFoundError) {
    return sendError(res, 404, 'NOT_FOUND', err.message);
  }
  if (err instanceof LeaveForbiddenError) {
    return sendError(res, 403, 'FORBIDDEN', err.message);
  }

  const msg = err.message || '';
  if (msg.includes('Access denied') || msg.includes('not authorized') || msg.includes('FORBIDDEN')) {
    return sendError(res, 403, 'FORBIDDEN', msg);
  }
  if (msg.includes('not found') || msg.includes('Not found')) {
    return sendError(res, 404, 'NOT_FOUND', msg);
  }
  if (msg.includes('required') || msg.includes('Invalid') || msg.includes('violates') || msg.includes('CHECK')) {
    return sendError(res, 400, 'BAD_REQUEST', msg);
  }

  console.error('[LeaveController Error]:', err);
  return sendError(res, err.statusCode || 500, err.code || 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred while processing leave request.');
}

/**
 * POST /api/v1/leave
 */
export async function handleCreateLeave(req, res) {
  try {
    if (!req.user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    }

    const body = await parseBody(req);
    const result = await submitLeaveRequest({
      userId: body.user_id || null,
      memberId: body.member_id || null,
      startDate: body.start_date,
      endDate: body.end_date,
      leaveType: body.leave_type,
      leaveReason: body.leave_reason,
      currentUser: req.user,
    });

    sendJson(res, 201, {
      ...result,
      leave: result,
      data: result,
    });
  } catch (err) {
    handleLeaveError(res, err);
  }
}

/**
 * GET /api/v1/leave
 */
export async function handleListLeave(req, res) {
  try {
    if (!req.user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    const userId = url.searchParams.get('user_id');
    const memberId = url.searchParams.get('member_id');
    const status = url.searchParams.get('status');

    const leaves = await listLeaveRecords({
      startDate,
      endDate,
      userId,
      memberId,
      status,
      currentUser: req.user,
    });

    sendJson(res, 200, {
      data: leaves,
      leaves,
      count: leaves.length,
    });
  } catch (err) {
    handleLeaveError(res, err);
  }
}

/**
 * GET /api/v1/leave/:id
 */
export async function handleGetLeaveById(req, res, leaveId) {
  try {
    if (!req.user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    }

    const leave = await getLeaveById({
      leaveId,
      currentUser: req.user,
    });

    sendJson(res, 200, {
      ...leave,
      leave,
      data: leave,
    });
  } catch (err) {
    handleLeaveError(res, err);
  }
}

/**
 * POST /api/v1/leave/:id/approve
 */
export async function handleApproveLeave(req, res, leaveId) {
  try {
    if (!req.user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    }

    const updated = await approveLeaveRequest({
      leaveId,
      currentUser: req.user,
    });

    sendJson(res, 200, {
      message: 'Leave request approved successfully',
      ...updated,
      leave: updated,
      data: updated,
    });
  } catch (err) {
    handleLeaveError(res, err);
  }
}

/**
 * POST /api/v1/leave/:id/reject
 */
export async function handleRejectLeave(req, res, leaveId) {
  try {
    if (!req.user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    }

    const body = await parseBody(req);
    const updated = await rejectLeaveRequest({
      leaveId,
      rejectionReason: body.rejection_reason || body.reason || null,
      currentUser: req.user,
    });

    sendJson(res, 200, {
      message: 'Leave request rejected successfully',
      ...updated,
      leave: updated,
      data: updated,
    });
  } catch (err) {
    handleLeaveError(res, err);
  }
}

/**
 * POST /api/v1/leave/:id/cancel
 */
export async function handleCancelLeave(req, res, leaveId) {
  try {
    if (!req.user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    }

    const updated = await cancelLeaveRequest({
      leaveId,
      currentUser: req.user,
    });

    sendJson(res, 200, {
      message: 'Leave request cancelled successfully',
      ...updated,
      leave: updated,
      data: updated,
    });
  } catch (err) {
    handleLeaveError(res, err);
  }
}
