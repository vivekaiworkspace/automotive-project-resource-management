import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { sendError } from '../../middleware/errorHandler.js';
import { listTeams, getTeamById, createTeam, updateTeam, archiveTeam } from './team.service.js';
import { listMemberships, createMembership, updateMembership, archiveMembership } from './membership.service.js';
import { StaleVersionError } from '../iam/user.service.js';

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

/**
 * GET /api/v1/teams
 */
export async function handleListTeams(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const teams = await listTeams(req.user);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ teams }));
  } catch (err) {
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
}

/**
 * GET /api/v1/teams/:id
 */
export async function handleGetTeamById(req, res, teamId) {
  if (!requireAuth(req, res)) return;
  try {
    const team = await getTeamById(teamId, req.user);
    if (!team) {
      return sendError(res, 404, 'NOT_FOUND', `Team with ID ${teamId} not found.`);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ team }));
  } catch (err) {
    const status = err.message.includes('Access denied') ? 403 : 500;
    sendError(res, status, status === 403 ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR', err.message);
  }
}

/**
 * POST /api/v1/teams
 * System Admin only
 */
export async function handleCreateTeam(req, res) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const team = await createTeam({
      code: body.code,
      name: body.name,
      description: body.description,
      actorId: req.user.id,
    });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ team, message: 'Team created successfully.' }));
  } catch (err) {
    const status = err.message.includes('already exists') || err.message.includes('required') || err.message.includes('least') ? 400 : 500;
    sendError(res, status, 'BAD_REQUEST', err.message);
  }
}

/**
 * PUT /api/v1/teams/:id
 * System Admin or scoped Resource Manager
 */
export async function handleUpdateTeam(req, res, teamId) {
  const checkPerm = requireRoles(['SYSTEM_ADMIN', 'RESOURCE_MANAGER']);
  if (!checkPerm(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const updated = await updateTeam(teamId, {
      name: body.name,
      description: body.description,
      status: body.status,
      expectedVersion: body.version,
      actorId: req.user.id,
      requestingUser: req.user,
    });

    if (!updated) {
      return sendError(res, 404, 'NOT_FOUND', `Team with ID ${teamId} not found.`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ team: updated, message: 'Team updated successfully.' }));
  } catch (err) {
    if (err instanceof StaleVersionError || err.code === 'CONFLICT_STALE_RECORD') {
      return sendError(res, 409, 'CONFLICT_STALE_RECORD', err.message, {
        current_version: err.currentVersion,
        expected_version: err.expectedVersion,
      });
    }
    const status = err.message.includes('Access denied') ? 403 : 400;
    sendError(res, status, status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST', err.message);
  }
}

/**
 * POST /api/v1/teams/:id/archive
 * System Admin only
 */
export async function handleArchiveTeam(req, res, teamId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const archived = await archiveTeam(teamId, {
      expectedVersion: body.version,
      actorId: req.user.id,
    });

    if (!archived) {
      return sendError(res, 404, 'NOT_FOUND', `Team with ID ${teamId} not found.`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ team: archived, message: 'Team archived successfully.' }));
  } catch (err) {
    if (err instanceof StaleVersionError || err.code === 'CONFLICT_STALE_RECORD') {
      return sendError(res, 409, 'CONFLICT_STALE_RECORD', err.message, {
        current_version: err.currentVersion,
        expected_version: err.expectedVersion,
      });
    }
    sendError(res, 400, 'BAD_REQUEST', err.message);
  }
}

/**
 * GET /api/v1/teams/:id/memberships
 */
export async function handleListMemberships(req, res, teamId) {
  if (!requireAuth(req, res)) return;
  try {
    const memberships = await listMemberships(teamId, req.user);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ memberships }));
  } catch (err) {
    const status = err.message.includes('Access denied') ? 403 : 500;
    sendError(res, status, status === 403 ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR', err.message);
  }
}

/**
 * POST /api/v1/teams/:id/memberships
 */
export async function handleCreateMembership(req, res, teamId) {
  const checkPerm = requireRoles(['SYSTEM_ADMIN', 'RESOURCE_MANAGER']);
  if (!checkPerm(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const membership = await createMembership({
      teamId,
      userId: body.user_id || body.userId,
      isTeamLead: body.is_team_lead !== undefined ? body.is_team_lead : body.isTeamLead,
      activeFrom: body.active_from || body.activeFrom,
      activeTo: body.active_to || body.activeTo,
      actorId: req.user.id,
      requestingUser: req.user,
    });

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ membership, message: 'Membership created successfully.' }));
  } catch (err) {
    const status = err.message.includes('Access denied') ? 403 : 400;
    sendError(res, status, status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST', err.message);
  }
}

/**
 * PUT /api/v1/teams/:id/memberships/:membershipId
 */
export async function handleUpdateMembership(req, res, teamId, membershipId) {
  const checkPerm = requireRoles(['SYSTEM_ADMIN', 'RESOURCE_MANAGER']);
  if (!checkPerm(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const updated = await updateMembership(membershipId, {
      isTeamLead: body.is_team_lead !== undefined ? body.is_team_lead : body.isTeamLead,
      activeFrom: body.active_from || body.activeFrom,
      activeTo: body.active_to || body.activeTo,
      expectedVersion: body.version,
      actorId: req.user.id,
      requestingUser: req.user,
    });

    if (!updated) {
      return sendError(res, 404, 'NOT_FOUND', `Membership with ID ${membershipId} not found.`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ membership: updated, message: 'Membership updated successfully.' }));
  } catch (err) {
    if (err instanceof StaleVersionError || err.code === 'CONFLICT_STALE_RECORD') {
      return sendError(res, 409, 'CONFLICT_STALE_RECORD', err.message, {
        current_version: err.currentVersion,
        expected_version: err.expectedVersion,
      });
    }
    const status = err.message.includes('Access denied') ? 403 : 400;
    sendError(res, status, status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST', err.message);
  }
}

/**
 * POST /api/v1/teams/:id/memberships/:membershipId/archive
 */
export async function handleArchiveMembership(req, res, teamId, membershipId) {
  const checkPerm = requireRoles(['SYSTEM_ADMIN', 'RESOURCE_MANAGER']);
  if (!checkPerm(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const archived = await archiveMembership(membershipId, {
      expectedVersion: body.version,
      actorId: req.user.id,
      requestingUser: req.user,
    });

    if (!archived) {
      return sendError(res, 404, 'NOT_FOUND', `Membership with ID ${membershipId} not found.`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ membership: archived, message: 'Membership archived successfully.' }));
  } catch (err) {
    if (err instanceof StaleVersionError || err.code === 'CONFLICT_STALE_RECORD') {
      return sendError(res, 409, 'CONFLICT_STALE_RECORD', err.message, {
        current_version: err.currentVersion,
        expected_version: err.expectedVersion,
      });
    }
    const status = err.message.includes('Access denied') ? 403 : 400;
    sendError(res, status, status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST', err.message);
  }
}
