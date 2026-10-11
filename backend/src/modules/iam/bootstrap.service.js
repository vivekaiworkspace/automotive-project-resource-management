import { query } from '../../db/index.js';
import { hashPassword, validatePassword } from './crypto.service.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/index.js';
import { config } from '../../config/index.js';

/**
 * Bootstrap initial System Admin if no active SYSTEM_ADMIN exists.
 * Enforces:
 * - Minimum 12 character password policy
 * - Argon2id hashing with unique random salt
 * - must_change_password = TRUE
 * - Audit event generation for initial role assignment
 * - Strict non-logging of password, hash, or secrets
 */
export async function bootstrapSystemAdmin() {
  const adminEmail = (config.auth.adminEmail || '').trim().toLowerCase();
  const initialPassword = config.auth.adminInitialPassword;

  if (!adminEmail || !initialPassword) {
    console.warn('[Bootstrap] ADMIN_EMAIL or ADMIN_INITIAL_PASSWORD not configured. Skipping admin seeding.');
    return { bootstrapped: false, reason: 'MISSING_ENV_CREDENTIALS' };
  }

  // Check if any active SYSTEM_ADMIN exists
  const existingAdminRes = await query(`
    SELECT u.id, u.email 
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    WHERE ur.role_code = 'SYSTEM_ADMIN' AND u.is_active = TRUE
    LIMIT 1;
  `);

  if (existingAdminRes.rows.length > 0) {
    return { bootstrapped: false, reason: 'ADMIN_ALREADY_EXISTS' };
  }

  // Validate initial password length and complexity
  const valResult = validatePassword(initialPassword);
  if (!valResult.valid) {
    console.error(`[Bootstrap] ADMIN_INITIAL_PASSWORD fails policy: ${valResult.error}`);
    throw new Error(`Admin initial password fails policy: ${valResult.error}`);
  }

  // Check if user with that email already exists
  const userByEmailRes = await query('SELECT id, is_active FROM users WHERE email = $1', [adminEmail]);
  let userId;

  if (userByEmailRes.rows.length > 0) {
    userId = userByEmailRes.rows[0].id;
    // Assign SYSTEM_ADMIN role
    await query(`
      INSERT INTO user_roles (user_id, role_code) 
      VALUES ($1, 'SYSTEM_ADMIN') 
      ON CONFLICT (user_id, role_code) DO NOTHING;
    `, [userId]);
    await query('UPDATE users SET must_change_password = TRUE WHERE id = $1', [userId]);
  } else {
    // Hash password with Argon2id and unique salt
    const passwordHash = await hashPassword(initialPassword);

    const insertUserRes = await query(`
      INSERT INTO users (
        email,
        password_hash,
        full_name,
        is_active,
        must_change_password,
        failed_login_attempts
      ) VALUES ($1, $2, $3, TRUE, TRUE, 0)
      RETURNING id, email, full_name;
    `, [adminEmail, passwordHash, 'System Administrator']);

    userId = insertUserRes.rows[0].id;

    // Assign SYSTEM_ADMIN role
    await query(`
      INSERT INTO user_roles (user_id, role_code)
      VALUES ($1, 'SYSTEM_ADMIN');
    `, [userId]);
  }

  // Record append-only audit event for role assignment
  await recordAuditEvent({
    entityName: 'USER_ROLE',
    entityId: userId,
    action: AUDIT_ACTIONS.ROLE_ASSIGNMENT,
    actorId: userId,
    afterState: { role_code: 'SYSTEM_ADMIN', email: adminEmail },
    changeReason: 'First-run automated administrative bootstrap (CPD-010)',
  });

  console.log(`[Bootstrap] Initial System Admin bootstrapped: ${adminEmail} (Forced password change enabled)`);
  return { bootstrapped: true, userId, email: adminEmail };
}
