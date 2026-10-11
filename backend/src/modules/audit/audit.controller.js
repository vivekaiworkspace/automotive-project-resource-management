import { requireRoles } from '../../middleware/auth.js';
import { sendError } from '../../middleware/errorHandler.js';
import { getAuditEvents } from './audit.service.js';

const requireAdmin = requireRoles(['SYSTEM_ADMIN']);

/**
 * Handle GET /api/v1/audit/events
 * System Admin only audit viewer
 */
export async function handleGetAuditEvents(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const entityName = url.searchParams.get('entity_name') || null;
    const action = url.searchParams.get('action') || null;
    const actorId = url.searchParams.get('actor_id') || null;
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const result = await getAuditEvents({ entityName, action, actorId, limit, offset });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      events: result.events,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      }
    }));
  } catch (err) {
    console.error('Failed to get audit events:', err);
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to retrieve audit events.');
  }
}
