import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Lightweight, zero-dependency .env loader with fallback to process.loadEnvFile
 */
function loadEnv() {
  const rootPath = path.resolve(__dirname, '../../../');
  const backendPath = path.resolve(__dirname, '../../');
  
  const envPaths = [
    path.join(rootPath, '.env'),
    path.join(backendPath, '.env')
  ];

  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            // Strip surrounding quotes
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (process.env[key] === undefined) {
              process.env[key] = val;
            }
          }
        }
        break;
      } catch (err) {
        // Fallback silently if process.env already populated
      }
    }
  }
}

loadEnv();

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  app: {
    name: process.env.APP_NAME || 'Automotive-RPM-Core-Pilot',
    version: '0.1.0',
    port: parseInt(process.env.APP_PORT || process.env.PORT || '3000', 10),
    host: process.env.APP_HOST || '0.0.0.0',
    timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'automotive_rpm',
    user: process.env.DB_USER || 'rpm_app',
    password: process.env.DB_PASSWORD || 'rpm_secure_dev_password_2026!',
    ssl: process.env.DB_SSL === 'true',
    max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
  },
  auth: {
    sessionSecret: process.env.SESSION_SECRET || 'dev_insecure_secret_key_change_in_production_min_32_chars!',
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    adminEmail: process.env.ADMIN_EMAIL || 'admin.pilot@ems-ecu.internal',
    adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD || 'InitialAdminPass_MustChangeOnFirstLogin123!',
  },
  calendar: {
    defaultTimezone: 'Asia/Kolkata',
    standardHoursPerDay: 8.0,
    workingDaysPerWeek: 5,
    standardWeeklyHours: 40.0,
    softWarningUtilizationPercent: 90.0,
    hardBlockUtilizationPercent: 100.0,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  }
};
