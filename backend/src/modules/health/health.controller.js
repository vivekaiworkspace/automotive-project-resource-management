import { getSystemHealth } from './health.service.js';

/**
 * Handle GET /health (Liveness probe)
 */
export async function handleLiveness(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Handle GET /api/v1/health (Full system readiness probe)
 */
export async function handleReadiness(req, res) {
  try {
    const health = await getSystemHealth();
    res.writeHead(health.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: err.message,
        timestamp: new Date().toISOString(),
      }
    }, null, 2));
  }
}
