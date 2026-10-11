/**
 * Dedicated Background Worker for Automotive Project & Resource Management System
 * Core Pilot Foundation (CPD-010, Architecture § 5)
 *
 * Responsibilities:
 * - Runs checkAndEscalateOverdueCases on a 15-minute scheduled cadence
 * - Zero SMTP/email dependencies (uses in-app notifications and audit logs)
 * - Protected by database-level PostgreSQL advisory locks against concurrent execution
 * - Graceful shutdown handling for container lifecycles (SIGTERM/SIGINT)
 */
import { checkAndEscalateOverdueCases } from './modules/capacity_scheduling/capacity.service.js';
import { checkConnection, closePool } from './db/index.js';
import { config } from './config/index.js';

const ESCALATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let intervalTimer = null;
let isShuttingDown = false;
let isRunningJob = false;

export async function runWorkerJobCycle() {
  if (isShuttingDown || isRunningJob) return { skipped: true };
  isRunningJob = true;
  try {
    const result = await checkAndEscalateOverdueCases();
    return result;
  } catch (err) {
    console.error('[Worker] Scheduled job error:', err.message);
    throw err;
  } finally {
    isRunningJob = false;
  }
}

export async function startWorker() {
  console.log('================================================================');
  console.log(` Starting ${config.app.name} Background Worker`);
  console.log(` Timezone: ${config.app.timezone} | Interval: 15m (${ESCALATION_INTERVAL_MS}ms)`);
  console.log('================================================================');

  try {
    const dbStatus = await checkConnection();
    if (!dbStatus.connected) {
      console.warn(`[Worker] PostgreSQL pending or unavailable (${dbStatus.error || 'Waiting'}). Retrying in 5s...`);
      setTimeout(startWorker, 5000);
      return;
    }
  } catch (err) {
    console.error('[Worker] Database connection check error:', err.message);
    setTimeout(startWorker, 5000);
    return;
  }

  console.log('[Worker] Connected to PostgreSQL. Triggering initial escalation check...');
  try {
    await runWorkerJobCycle();
  } catch (e) {
    console.error('[Worker] Initial cycle error:', e.message);
  }

  // Schedule every 15 minutes
  intervalTimer = setInterval(async () => {
    try {
      await runWorkerJobCycle();
    } catch (e) {
      console.error('[Worker] Periodic cycle error:', e.message);
    }
  }, ESCALATION_INTERVAL_MS);

  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Worker] Received ${signal}. Gracefully stopping worker...`);
    if (intervalTimer) clearInterval(intervalTimer);

    // Wait up to 10s if a job is currently executing
    const startWait = Date.now();
    while (isRunningJob && Date.now() - startWait < 10000) {
      await new Promise(r => setTimeout(r, 200));
    }

    await closePool();
    console.log('[Worker] Database connections closed. Worker terminated cleanly.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Start worker when executed directly as script
if (process.argv[1]?.replace(/\\/g, '/').endsWith('worker.js')) {
  startWorker().catch(err => {
    console.error('[Worker] Fatal bootstrap error:', err);
    process.exit(1);
  });
}
