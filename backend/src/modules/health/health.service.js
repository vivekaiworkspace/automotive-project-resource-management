import { checkConnection, getPool } from '../../db/index.js';
import { config } from '../../config/index.js';

export async function getSystemHealth() {
  const dbHealth = await checkConnection();
  
  let migrationStatus = { applied: 0, verified: false };
  let productSeeded = false;

  if (dbHealth.connected) {
    try {
      const pool = getPool();
      const migRes = await pool.query('SELECT COUNT(*)::int AS count FROM schema_migrations');
      migrationStatus = {
        applied: migRes.rows[0]?.count || 0,
        verified: true,
      };

      const prodRes = await pool.query("SELECT code, name, status FROM products WHERE code = 'PROD-EMS-ECU'");
      if (prodRes.rows.length > 0) {
        productSeeded = true;
      }
    } catch (e) {
      // Migrations table may not yet be initialized
      migrationStatus.error = e.message;
    }
  }

  const memory = process.memoryUsage();
  const uptimeSeconds = Math.floor(process.uptime());

  const isHealthy = dbHealth.connected;

  return {
    status: isHealthy ? 'healthy' : 'degraded',
    statusCode: isHealthy ? 200 : 503,
    timestamp: new Date().toISOString(),
    service: {
      name: config.app.name,
      version: config.app.version,
      environment: config.env,
      timezone: config.app.timezone,
      uptimeSeconds,
      memory: {
        rssMb: Math.round(memory.rss / (1024 * 1024) * 100) / 100,
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024) * 100) / 100,
        heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024) * 100) / 100,
      }
    },
    database: {
      status: dbHealth.connected ? 'connected' : 'disconnected',
      host: config.db.host,
      database: config.db.database,
      latencyMs: dbHealth.latencyMs ?? null,
      serverVersion: dbHealth.version ?? null,
      driverAvailable: dbHealth.driverAvailable,
      migrationsApplied: migrationStatus.applied,
      productCatalogSeeded: productSeeded,
      error: dbHealth.error ?? null,
    },
    pilotBaseline: {
      product: 'EMS ECU Development (PROD-EMS-ECU)',
      workingCalendar: 'Asia/Kolkata (40h/week, 8h/day, Mon-Fri)',
      capacityRules: '90% Soft Warning / 100% Hard Block with Override',
      rolesConfigured: 5,
      workAreaTagsCount: 14,
    }
  };
}
