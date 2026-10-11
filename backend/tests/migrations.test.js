import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getMigrationFiles } from '../src/db/migrate.js';

describe('Versioned Database Migrations Tests', () => {
  test('Discovers all required migration files in correct sequential order', () => {
    const files = getMigrationFiles();

    assert.ok(files.length >= 2, `Expected at least 2 migrations, found ${files.length}`);
    assert.equal(files[0].version, '001');
    assert.equal(files[0].name, '001_initial_schema');
    assert.equal(files[1].version, '002');
    assert.equal(files[1].name, '002_seed_pilot_baseline');

    for (const m of files) {
      assert.ok(m.checksum && m.checksum.length === 64, `Migration ${m.file} must have valid SHA-256 checksum`);
      assert.ok(m.content.length > 50, `Migration ${m.file} must not be empty`);
    }
  });

  test('001_initial_schema contains all required Core Pilot physical entities', () => {
    const files = getMigrationFiles();
    const initialSchema = files.find(f => f.version === '001');
    assert.ok(initialSchema, '001_initial_schema must be present');

    const content = initialSchema.content;

    // Entities from DATA_MODEL.md
    const requiredTables = [
      'calendar_settings',
      'calendar_working_days',
      'public_holidays',
      'users',
      'roles',
      'user_roles',
      'user_scopes',
      'teams',
      'members',
      'leave_records',
      'products',
      'projects',
      'work_area_tags',
      'project_work_area_tags',
      'phases',
      'activities',
      'assignments',
      'conflict_overrides',
      'audit_log'
    ];

    for (const table of requiredTables) {
      assert.ok(
        content.includes(`CREATE TABLE ${table}`) || content.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
        `001_initial_schema must create table: ${table}`
      );
    }

    // Constraint triggers and partial indexes
    assert.ok(content.includes('trg_check_subactivity_depth'), 'Must enforce subactivity depth constraint trigger');
    assert.ok(content.includes('uq_assignments_one_active_per_activity'), 'Must enforce single active assignee partial index');
  });

  test('002_seed_pilot_baseline contains required seed records for EMS ECU Development', () => {
    const files = getMigrationFiles();
    const seed = files.find(f => f.version === '002');
    assert.ok(seed, '002_seed_pilot_baseline must be present');

    const content = seed.content;

    // Roles (CPD-008)
    const roles = ['SYSTEM_ADMIN', 'PROJECT_MANAGER', 'TEAM_LEAD', 'TEAM_MEMBER', 'RESOURCE_MANAGER'];
    for (const r of roles) {
      assert.ok(content.includes(r), `Seed must include role: ${r}`);
    }

    // Product (CPD-001)
    assert.ok(content.includes('PROD-EMS-ECU'), 'Seed must define PROD-EMS-ECU');
    assert.ok(content.includes('EMS ECU Development'), 'Seed must define EMS ECU Development product');

    // Calendar (CPD-003)
    assert.ok(content.includes('Asia/Kolkata'), 'Seed must configure Asia/Kolkata timezone');

    // 14 Tags (CPD-001)
    const tags = [
      'Customer Vehicle Program',
      'New ECU Development',
      'Hardware Variant',
      'Base Software',
      'Application Software',
      'Calibration & Tuning',
      'HIL / System Testing',
      'Vehicle Validation',
      'Functional Safety (ISO 26262)',
      'Cybersecurity (ISO/SAE 21434)',
      'Diagnostics (UDS / OBD-II)',
      'Production Release & Flashing',
      'Quality & Warranty',
      'Customer Change Request'
    ];

    for (const tag of tags) {
      assert.ok(content.includes(tag), `Seed must include work-area tag: ${tag}`);
    }
  });

  test('003_auth_sessions_and_audit contains user_sessions table and extended audit actions', () => {
    const files = getMigrationFiles();
    const authMigration = files.find(f => f.version === '003');
    assert.ok(authMigration, '003_auth_sessions_and_audit must be present');

    const content = authMigration.content;
    assert.ok(content.includes('user_sessions'), 'Must provision user_sessions table');
    assert.ok(content.includes('token_hash'), 'Must store session token_hash');
    assert.ok(content.includes('LOGIN_SUCCESS'), 'Must support LOGIN_SUCCESS audit action');
    assert.ok(content.includes('LOGIN_FAILURE'), 'Must support LOGIN_FAILURE audit action');
    assert.ok(content.includes('ACCOUNT_LOCKOUT'), 'Must support ACCOUNT_LOCKOUT audit action');
    assert.ok(content.includes('PASSWORD_CHANGE'), 'Must support PASSWORD_CHANGE audit action');
  });

  test('004_configurable_records_and_custom_fields contains reference_data, custom fields, and optimistic locking', () => {
    const files = getMigrationFiles();
    const mig004 = files.find(f => f.version === '004');
    assert.ok(mig004, '004_configurable_records_and_custom_fields must be present');

    const content = mig004.content;
    assert.ok(content.includes('reference_data'), 'Must create reference_data table');
    assert.ok(content.includes('custom_field_definitions'), 'Must create custom_field_definitions table');
    assert.ok(content.includes('custom_field_options'), 'Must create custom_field_options table');
    assert.ok(content.includes('project_custom_field_values'), 'Must create project_custom_field_values table');
    assert.ok(content.includes('team_memberships'), 'Must create team_memberships table');
    assert.ok(content.includes('project_manager_scopes'), 'Must create project_manager_scopes table');
    assert.ok(content.includes('resource_manager_scopes'), 'Must create resource_manager_scopes table');
    assert.ok(content.includes('version INT NOT NULL DEFAULT 1'), 'Must include optimistic locking version columns');
  });

  test('005_seed_pilot_teams_projects contains seeded teams, projects, phases, and scoped test users', () => {
    const files = getMigrationFiles();
    const mig005 = files.find(f => f.version === '005');
    assert.ok(mig005, '005_seed_pilot_teams_projects must be present');

    const content = mig005.content;
    assert.ok(content.includes('TEAM-PLAT-INT'), 'Must seed TEAM-PLAT-INT');
    assert.ok(content.includes('TEAM-VAL-CAL'), 'Must seed TEAM-VAL-CAL');
    assert.ok(content.includes('EMS-G2-INT'), 'Must seed EMS-G2-INT');
    assert.ok(content.includes('EMS-G2-VAL'), 'Must seed EMS-G2-VAL');
    assert.ok(content.includes('pm.integration@example.test'), 'Must seed pm.integration user');
    assert.ok(content.includes('pm.validation@example.test'), 'Must seed pm.validation user');
    assert.ok(content.includes('lead.integration@example.test'), 'Must seed lead.integration user');
    assert.ok(content.includes('lead.validation@example.test'), 'Must seed lead.validation user');
    assert.ok(content.includes('resource.manager@example.test'), 'Must seed resource.manager user');
  });

  test('010_leave_management contains leave audit actions and performance indexes', () => {
    const files = getMigrationFiles();
    const mig010 = files.find(f => f.version === '010');
    assert.ok(mig010, '010_leave_management must be present');

    const content = mig010.content;
    assert.ok(content.includes('LEAVE_SUBMITTED'), 'Must include LEAVE_SUBMITTED audit action');
    assert.ok(content.includes('LEAVE_APPROVED'), 'Must include LEAVE_APPROVED audit action');
    assert.ok(content.includes('LEAVE_REJECTED'), 'Must include LEAVE_REJECTED audit action');
    assert.ok(content.includes('LEAVE_CANCELLED'), 'Must include LEAVE_CANCELLED audit action');
    assert.ok(content.includes('idx_leave_records_user_dates'), 'Must include user dates index');
  });
});
