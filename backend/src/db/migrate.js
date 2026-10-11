import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getPool, closePool } from './index.js';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

/**
 * Compute SHA256 checksum of file content
 */
function computeChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Discover and parse all migration files from migrations directory
 */
export function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found at: ${MIGRATIONS_DIR}`);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return files.map(file => {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const versionMatch = file.match(/^(\d+)_/);
    const version = versionMatch ? versionMatch[1] : file.replace('.sql', '');

    return {
      file,
      version,
      name: file.replace('.sql', ''),
      path: fullPath,
      content,
      checksum: computeChecksum(content),
    };
  });
}

/**
 * Ensure schema_migrations table exists
 */
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64)
    );
  `);
}

/**
 * Get list of already applied migrations
 */
export async function getAppliedMigrations(client) {
  await ensureMigrationsTable(client);
  const res = await client.query('SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY version ASC');
  return res.rows;
}

/**
 * Print migration status report
 */
export async function printMigrationStatus() {
  const pool = getPool();
  if (!pool) {
    console.error('Cannot check status: Database driver (pg) is not loaded.');
    return;
  }

  const client = await pool.connect();
  try {
    const applied = await getAppliedMigrations(client);
    const appliedMap = new Map(applied.map(m => [m.version, m]));
    const available = getMigrationFiles();

    console.log('\n=== Database Migration Status ===');
    console.log(`Database: ${config.db.database} @ ${config.db.host}:${config.db.port}`);
    console.log('--------------------------------------------------------------------------------');
    console.log(
      'Version'.padEnd(10) +
      'Name'.padEnd(35) +
      'Status'.padEnd(15) +
      'Applied At'
    );
    console.log('--------------------------------------------------------------------------------');

    for (const m of available) {
      const isApplied = appliedMap.has(m.version);
      const appliedRecord = appliedMap.get(m.version);
      const statusText = isApplied ? '[APPLIED]' : '[PENDING]';
      const appliedAt = isApplied ? new Date(appliedRecord.applied_at).toISOString() : '-';

      console.log(
        m.version.padEnd(10) +
        m.name.padEnd(35) +
        statusText.padEnd(15) +
        appliedAt
      );
    }
    console.log('--------------------------------------------------------------------------------\n');
  } finally {
    client.release();
    await closePool();
  }
}

/**
 * Execute pending database migrations in sequential order
 */
export async function runMigrations() {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database connection pool is unavailable. Cannot execute migrations.');
  }

  const client = await pool.connect();
  const results = {
    totalAvailable: 0,
    alreadyApplied: 0,
    newlyApplied: [],
  };

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const appliedVersions = new Set(applied.map(m => m.version));
    const available = getMigrationFiles();

    results.totalAvailable = available.length;
    results.alreadyApplied = applied.length;

    const pending = available.filter(m => !appliedVersions.has(m.version));

    if (pending.length === 0) {
      console.log(`[Migrations] Database schema is up to date (${applied.length}/${available.length} migrations applied).`);
      return results;
    }

    console.log(`[Migrations] Found ${pending.length} pending migration(s) to execute.`);

    for (const migration of pending) {
      console.log(`[Migrations] Applying ${migration.file}...`);
      await client.query('BEGIN');
      try {
        await client.query(migration.content);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
          [migration.version, migration.name, migration.checksum]
        );
        await client.query('COMMIT');
        console.log(`[Migrations] Successfully applied ${migration.file}`);
        results.newlyApplied.push(migration.name);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrations] Failed applying ${migration.file}. Transaction rolled back.`);
        throw new Error(`Migration ${migration.file} failed: ${err.message}`);
      }
    }

    return results;
  } finally {
    client.release();
  }
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  const isStatus = process.argv.includes('--status');
  if (isStatus) {
    printMigrationStatus().catch(err => {
      console.error('Migration status check failed:', err.message);
      process.exit(1);
    });
  } else {
    runMigrations()
      .then(res => {
        console.log(`[Migrations] Completed successfully. Newly applied: ${res.newlyApplied.length}`);
        return closePool();
      })
      .then(() => process.exit(0))
      .catch(err => {
        console.error('[Migrations] Fatal migration error:', err.message);
        closePool().finally(() => process.exit(1));
      });
  }
}
