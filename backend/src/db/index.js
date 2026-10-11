import { config } from '../config/index.js';

let pool = null;
let pgModule = null;

// Dynamically attempt to load pg if present
try {
  const pg = await import('pg');
  pgModule = pg.default || pg;
} catch (e) {
  // pg will be available inside the container or when installed
}

export function getPool() {
  if (pool) return pool;

  if (!pgModule || !pgModule.Pool) {
    return null;
  }

  pool = new pgModule.Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
    max: config.db.max,
    idleTimeoutMillis: config.db.idleTimeoutMillis,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected database pool client error:', err.message);
  });

  return pool;
}

/**
 * Execute query against pool
 */
export async function query(text, params) {
  const p = getPool();
  if (!p) {
    throw new Error('PostgreSQL client (pg) is not initialized or database driver is unavailable');
  }
  return p.query(text, params);
}

/**
 * Health check probe for PostgreSQL database connectivity
 */
export async function checkConnection() {
  const p = getPool();
  if (!p) {
    return {
      connected: false,
      driverAvailable: false,
      error: 'PostgreSQL driver (pg) is not available in current environment',
    };
  }

  const start = Date.now();
  try {
    const res = await p.query('SELECT 1 AS alive, current_database() AS db, version() AS version');
    const latencyMs = Date.now() - start;
    return {
      connected: true,
      driverAvailable: true,
      latencyMs,
      database: res.rows[0]?.db || config.db.database,
      version: res.rows[0]?.version?.split(' ')[0] || 'PostgreSQL 16',
    };
  } catch (err) {
    return {
      connected: false,
      driverAvailable: true,
      error: err.message,
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
    };
  }
}

/**
 * Graceful shutdown for database pool
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
