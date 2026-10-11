import { createApp } from './app.js';
import { config } from './config/index.js';
import { runMigrations } from './db/migrate.js';
import { closePool, checkConnection } from './db/index.js';
import { bootstrapSystemAdmin } from './modules/iam/bootstrap.service.js';

const app = createApp();

async function bootstrap() {
  console.log('================================================================');
  console.log(` Starting ${config.app.name} v${config.app.version}`);
  console.log(` Environment: ${config.env} | Timezone: ${config.app.timezone}`);
  console.log('================================================================');

  // Attempt database migrations if database is reachable
  try {
    const dbStatus = await checkConnection();
    if (dbStatus.connected) {
      console.log(`[Database] Connected to PostgreSQL at ${config.db.host}:${config.db.port}/${config.db.database}`);
      console.log('[Database] Checking schema migrations...');
      const migResult = await runMigrations();
      console.log(`[Database] Migrations verified (${migResult.alreadyApplied + migResult.newlyApplied.length} total).`);

      console.log('[IAM] Checking administrative bootstrap...');
      await bootstrapSystemAdmin();
    } else {
      console.warn(`[Database] PostgreSQL connection pending or unavailable (${dbStatus.error || 'Driver waiting'}).`);
      console.warn('[Database] Server will start; health endpoint will reflect degraded status until DB connects.');
    }
  } catch (err) {
    console.error('[Database] Migration, bootstrap or connection check warning:', err.message);
  }

  // Listen
  const port = config.app.port;
  const host = config.app.host;

  app.listen(port, host, () => {
    console.log(`[HTTP Server] Listening on http://${host}:${port}`);
    console.log(`[Health Probe] http://${host}:${port}/health`);
    console.log(`[Readiness API] http://${host}:${port}/api/v1/health`);
    console.log('================================================================');
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    app.close(async () => {
      console.log('[HTTP Server] Closed HTTP server.');
      await closePool();
      console.log('[Database] Closed database connections.');
      process.exit(0);
    });

    // Force exit after 10s timeout
    setTimeout(() => {
      console.error('Forced shutdown timeout reached. Terminating.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch(err => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
