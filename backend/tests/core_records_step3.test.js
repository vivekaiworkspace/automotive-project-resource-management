import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { query, closePool } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { bootstrapSystemAdmin } from '../src/modules/iam/bootstrap.service.js';
import { createSession } from '../src/modules/iam/session.service.js';

describe('Step 3: Configurable Core Records & Admin Setup Test Suite', () => {
  let server;
  let baseUrl;
  let adminUser;
  let pm1User;
  let pm2User;
  let lead1User;
  let lead2User;
  let member1User;
  let rmUser;
  let inactiveUser;

  // Sessions map
  const sessions = {};

  before(async () => {
    await runMigrations();
    await bootstrapSystemAdmin();

    // Fetch users
    const usersRes = await query('SELECT id, email, is_active FROM users ORDER BY email ASC');
    const userMap = new Map(usersRes.rows.map(u => [u.email, u]));

    adminUser = userMap.get('admin.pilot@ems-ecu.internal') || usersRes.rows.find(u => u.email.includes('admin'));
    pm1User = userMap.get('pm.integration@example.test');
    pm2User = userMap.get('pm.validation@example.test');
    lead1User = userMap.get('lead.integration@example.test');
    lead2User = userMap.get('lead.validation@example.test');
    member1User = userMap.get('engineer.integration1@example.test');
    rmUser = userMap.get('resource.manager@example.test');

    // Create a deactivated test user for inactive user tests
    const inactRes = await query(`
      INSERT INTO users (email, password_hash, full_name, is_active, must_change_password)
      VALUES ('inactive.user@example.test', 'dummy_hash', 'Inactive Test User', FALSE, FALSE)
      ON CONFLICT (email) DO UPDATE SET is_active = FALSE
      RETURNING id, email, is_active;
    `);
    inactiveUser = inactRes.rows[0];

    // Ensure test operational users don't have must_change_password flag blocking test runs
    await query("UPDATE users SET must_change_password = FALSE WHERE email != 'inactive.user@example.test'");

    // Clean up transient test records to ensure idempotent test runs
    await query("DELETE FROM reference_data WHERE code IN ('URGENT_TIER', 'ARCH_TAG')");
    await query("DELETE FROM custom_field_definitions WHERE code IN ('TEST_SAFETY_INTEGRITY')");
    await query("DELETE FROM project_work_area_tags WHERE tag_id IN (SELECT id FROM work_area_tags WHERE code = 'ARCH_TAG')");
    await query("DELETE FROM work_area_tags WHERE code IN ('ARCH_TAG')");
    await query("DELETE FROM project_work_area_tags WHERE project_id = '60000000-0000-0000-0000-000000000001' AND tag_id IN (SELECT id FROM work_area_tags WHERE code = 'QUALITY')");
    await query("DELETE FROM teams WHERE code = 'TEAM-OUT-SCOPE'");

    // Create sessions
    const usersToSession = [
      ['admin', adminUser],
      ['pm1', pm1User],
      ['pm2', pm2User],
      ['lead1', lead1User],
      ['lead2', lead2User],
      ['member1', member1User],
      ['rm', rmUser],
      ['inactive', inactiveUser],
    ];

    for (const [key, usr] of usersToSession) {
      if (usr) {
        const sess = await createSession(usr.id);
        sessions[key] = sess;
      }
    }

    server = createApp();
    await new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await closePool();
  });

  function apiRequest(path, { method = 'GET', sessionKey = 'admin', body = null, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      let reqHeaders = {};

      if (sessionKey && sessions[sessionKey]) {
        reqHeaders['Cookie'] = `session_id=${sessions[sessionKey].rawToken}`;
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
          reqHeaders['X-CSRF-Token'] = sessions[sessionKey].csrfToken;
        }
      }

      reqHeaders = { ...reqHeaders, ...headers };

      let payload = null;
      if (body) {
        payload = typeof body === 'string' ? body : JSON.stringify(body);
        reqHeaders['Content-Type'] = 'application/json';
        reqHeaders['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: reqHeaders,
      }, res => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            json = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        });
      });

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  // ===========================================================================
  // 1. Seed Validation Tests
  // ===========================================================================
  describe('1. Seed Baseline Validation (§ 7)', () => {
    test('Both seeded teams exist in database', async () => {
      const res = await apiRequest('/api/v1/teams', { sessionKey: 'admin' });
      assert.equal(res.status, 200);
      const codes = res.body.teams.map(t => t.code);
      assert.ok(codes.includes('TEAM-PLAT-INT'), 'TEAM-PLAT-INT must exist');
      assert.ok(codes.includes('TEAM-VAL-CAL'), 'TEAM-VAL-CAL must exist');
    });

    test('Both seeded projects exist under EMS ECU Development', async () => {
      const res = await apiRequest('/api/v1/projects', { sessionKey: 'admin' });
      assert.equal(res.status, 200);
      const intProj = res.body.projects.find(p => p.code === 'EMS-G2-INT');
      const valProj = res.body.projects.find(p => p.code === 'EMS-G2-VAL');

      assert.ok(intProj, 'EMS-G2-INT must exist');
      assert.ok(valProj, 'EMS-G2-VAL must exist');
      assert.equal(intProj.product_name, 'EMS ECU Development');
      assert.equal(valProj.product_name, 'EMS ECU Development');
      assert.equal(intProj.priority_code, 'HIGH');
      assert.equal(valProj.priority_code, 'HIGH');
      assert.equal(intProj.status, 'ACTIVE');
      assert.equal(valProj.status, 'ACTIVE');
    });

    test('Seeded projects have phases, tags, and required custom fields', async () => {
      const resInt = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000001', { sessionKey: 'admin' });
      assert.equal(resInt.status, 200);
      const p = resInt.body.project;

      assert.equal(p.phases.length, 3, 'Must have 3 phases');
      assert.ok(p.phases.map(ph => ph.name).includes('Architecture & Planning'));
      assert.ok(p.tags.length >= 4, 'Must have multiple tags');

      const customMap = new Map((p.custom_fields || []).map(cf => [cf.code, cf.value]));
      assert.ok(customMap.get('VEHICLE_PLATFORM')?.includes('EMS Gen2 Platform'));
    });

    test('Resource Manager has scope over both seeded teams', async () => {
      const res = await apiRequest('/api/v1/teams', { sessionKey: 'rm' });
      assert.equal(res.status, 200);
      const codes = res.body.teams.map(t => t.code);
      assert.ok(codes.includes('TEAM-PLAT-INT'), 'RM must see TEAM-PLAT-INT');
      assert.ok(codes.includes('TEAM-VAL-CAL'), 'RM must see TEAM-VAL-CAL');
    });
  });

  // ===========================================================================
  // 2. Authentication & Security Tests (§ 8)
  // ===========================================================================
  describe('2. Authentication & Security Guarding (§ 8)', () => {
    test('Authentication is required on protected routes', async () => {
      const res = await apiRequest('/api/v1/projects', { sessionKey: null });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    });

    test('CSRF token is required on state-changing write routes', async () => {
      // Send write without CSRF header
      const res = await apiRequest('/api/v1/projects', {
        method: 'POST',
        sessionKey: 'admin',
        body: { code: 'FAIL-CSRF', name: 'Test' },
        headers: { 'X-CSRF-Token': 'invalid_or_missing' }
      });
      assert.equal(res.status, 403);
      assert.ok(res.body.error.code === 'CSRF_INVALID' || res.body.error.code === 'FORBIDDEN_CSRF');
    });

    test('Inactive users are denied access to protected endpoints', async () => {
      const res = await apiRequest('/api/v1/projects', { sessionKey: 'inactive' });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'USER_INACTIVE');
    });

    test('Sensitive values (password_hash, raw tokens) are never returned', async () => {
      const res = await apiRequest('/api/v1/users', { sessionKey: 'admin' });
      assert.equal(res.status, 200);
      const usersStr = JSON.stringify(res.body);
      assert.ok(!usersStr.includes('password_hash'), 'Password hash must never be returned');
      assert.ok(!usersStr.includes('token_hash'), 'Session token hash must never be returned');
    });
  });

  // ===========================================================================
  // 3. Roles and Scope-Based Access Control Tests (§ 5 & 8)
  // ===========================================================================
  describe('3. Roles & Scoping Enforcement (§ 5 & 8)', () => {
    test('System Admin can manage all Step 3 records', async () => {
      const res = await apiRequest('/api/v1/products', { sessionKey: 'admin' });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.products));
    });

    test('Project Manager 1 can read only assigned project (EMS-G2-INT)', async () => {
      const res = await apiRequest('/api/v1/projects', { sessionKey: 'pm1' });
      assert.equal(res.status, 200);
      assert.equal(res.body.projects.length, 1);
      assert.equal(res.body.projects[0].code, 'EMS-G2-INT');
    });

    test('Project Manager 1 cannot read Project Manager 2 project (EMS-G2-VAL)', async () => {
      const res = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000002', { sessionKey: 'pm1' });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    test('Project Manager cannot manage products, users, teams, or reference data', async () => {
      const resProd = await apiRequest('/api/v1/products', {
        method: 'POST',
        sessionKey: 'pm1',
        body: { code: 'ILLEGAL', name: 'Illegal', product_type_id: '20000000-0000-0000-0000-000000000001' }
      });
      assert.equal(resProd.status, 403);

      const resUser = await apiRequest('/api/v1/users', {
        method: 'POST',
        sessionKey: 'pm1',
        body: { email: 'illegal@test.com' }
      });
      assert.equal(resUser.status, 403);

      const resRef = await apiRequest('/api/v1/reference-data', {
        method: 'POST',
        sessionKey: 'pm1',
        body: { category: 'PROJECT_PRIORITY', code: 'ILLEGAL', name: 'Illegal' }
      });
      assert.equal(resRef.status, 403);
    });

    test('Team Lead can read own team but not another team', async () => {
      // Lead 1 is lead of TEAM-PLAT-INT (50000000-0000-0000-0000-000000000001)
      const resOwn = await apiRequest('/api/v1/teams/50000000-0000-0000-0000-000000000001', { sessionKey: 'lead1' });
      assert.equal(resOwn.status, 200);

      const resOther = await apiRequest('/api/v1/teams/50000000-0000-0000-0000-000000000002', { sessionKey: 'lead1' });
      assert.equal(resOther.status, 403);
    });

    test('Team Member cannot access admin data or user directory', async () => {
      const res = await apiRequest('/api/v1/users', { sessionKey: 'member1' });
      assert.equal(res.status, 403);
    });

    test('Resource Manager cannot create or archive products or projects', async () => {
      const resProd = await apiRequest('/api/v1/products', {
        method: 'POST',
        sessionKey: 'rm',
        body: { code: 'RM-PROD', name: 'RM Product' }
      });
      assert.equal(resProd.status, 403);

      const resProj = await apiRequest('/api/v1/projects', {
        method: 'POST',
        sessionKey: 'rm',
        body: { code: 'RM-PROJ', name: 'RM Project' }
      });
      assert.equal(resProj.status, 403);
    });

    test('Resource Manager cannot edit teams outside resource scope', async () => {
      // Create a third team not in RM scope
      const newTeam = await apiRequest('/api/v1/teams', {
        method: 'POST',
        sessionKey: 'admin',
        body: { code: 'TEAM-OUT-SCOPE', name: 'Out of Scope Team' }
      });
      assert.equal(newTeam.status, 201);
      const teamId = newTeam.body.team.id;

      // RM attempts to update team outside scope
      const res = await apiRequest(`/api/v1/teams/${teamId}`, {
        method: 'PUT',
        sessionKey: 'rm',
        body: { name: 'Attempted Change', version: 1 }
      });
      assert.equal(res.status, 403);
    });
  });

  // ===========================================================================
  // 4. Data Integrity & Validation Tests (§ 8)
  // ===========================================================================
  describe('4. Data Integrity Invariants (§ 8)', () => {
    test('Active project requires a valid active product', async () => {
      const res = await apiRequest('/api/v1/projects', {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          code: 'PROJ-NOPROD',
          name: 'No Product Project',
          productId: '00000000-0000-0000-0000-999999999999',
          projectPriorityId: '22000000-0000-0000-0000-000000000002',
          projectStatusId: '23000000-0000-0000-0000-000000000002',
          plannedStartDate: '2026-11-01',
          plannedFinishDate: '2026-11-30',
        }
      });
      assert.equal(res.status, 400);
    });

    test('Duplicate product and project codes are rejected', async () => {
      const resProd = await apiRequest('/api/v1/products', {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          code: 'PROD-EMS-ECU',
          name: 'Duplicate Product Code',
          productTypeId: '20000000-0000-0000-0000-000000000001'
        }
      });
      assert.equal(resProd.status, 400);

      const resProj = await apiRequest('/api/v1/projects', {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          code: 'EMS-G2-INT',
          name: 'Duplicate Project Code',
          productId: '10000000-0000-0000-0000-000000000001',
          projectPriorityId: '22000000-0000-0000-0000-000000000002',
          projectStatusId: '23000000-0000-0000-0000-000000000002',
          plannedStartDate: '2026-11-01',
          plannedFinishDate: '2026-11-30',
        }
      });
      assert.equal(resProj.status, 400);
    });

    test('Invalid date ordering is rejected (planned finish < start)', async () => {
      const res = await apiRequest('/api/v1/projects', {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          code: 'PROJ-DATE-FAIL',
          name: 'Bad Dates Project',
          productId: '10000000-0000-0000-0000-000000000001',
          projectPriorityId: '22000000-0000-0000-0000-000000000002',
          projectStatusId: '23000000-0000-0000-0000-000000000002',
          plannedStartDate: '2026-12-01',
          plannedFinishDate: '2026-11-01',
        }
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('cannot precede'));
    });

    test('Duplicate active team membership is rejected', async () => {
      // engineer.integration1 (40000000-0000-0000-0000-000000000005) already in TEAM-PLAT-INT (50000000-0000-0000-0000-000000000001)
      const res = await apiRequest('/api/v1/teams/50000000-0000-0000-0000-000000000001/memberships', {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          userId: '40000000-0000-0000-0000-000000000005',
          isTeamLead: false,
        }
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('already has an active membership'));
    });

    test('Duplicate phase sequence number in a project is rejected', async () => {
      // Project 1 already has sequence 1
      const res = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000001/phases', {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          name: 'Duplicate Sequence Phase',
          sequenceNumber: 1,
        }
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('already in use'));
    });

    test('Duplicate project-tag assignment is rejected', async () => {
      // Assign tag to Project 1
      const allTagsRes = await apiRequest('/api/v1/tags', { sessionKey: 'admin' });
      const tagToAssign = allTagsRes.body.tags.find(t => t.code === 'QUALITY');

      const resFirst = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000001/tags', {
        method: 'POST',
        sessionKey: 'pm1',
        body: { tagId: tagToAssign.id }
      });
      assert.equal(resFirst.status, 201);

      // Duplicate assignment
      const resDup = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000001/tags', {
        method: 'POST',
        sessionKey: 'pm1',
        body: { tagId: tagToAssign.id }
      });
      assert.equal(resDup.status, 400);
      assert.ok(resDup.body.error.message.includes('already assigned'));
    });

    test('Inactive or archived tags cannot be newly assigned', async () => {
      // Create and archive a tag
      const newTagRes = await apiRequest('/api/v1/tags', {
        method: 'POST',
        sessionKey: 'admin',
        body: { name: 'To Archive Tag', code: 'ARCH_TAG' }
      });
      assert.equal(newTagRes.status, 201);
      const tagId = newTagRes.body.tag.id;

      const archRes = await apiRequest(`/api/v1/tags/${tagId}/archive`, {
        method: 'POST',
        sessionKey: 'admin',
        body: { version: 1 }
      });
      assert.equal(archRes.status, 200);

      // Try assigning archived tag
      const assignRes = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000001/tags', {
        method: 'POST',
        sessionKey: 'pm1',
        body: { tagId }
      });
      assert.equal(assignRes.status, 400);
      assert.ok(assignRes.body.error.message.includes('Inactive/archived'));
    });
  });

  // ===========================================================================
  // 5. Configurability & Custom Fields Tests (§ 8)
  // ===========================================================================
  describe('5. Configurability & Custom Fields (§ 8)', () => {
    test('System Admin can create, update, archive, and reactivate reference-data values', async () => {
      // 1. Create
      const createRes = await apiRequest('/api/v1/reference-data', {
        method: 'POST',
        sessionKey: 'admin',
        body: { category: 'PROJECT_PRIORITY', code: 'URGENT_TIER', name: 'Urgent Tier', display_order: 5 }
      });
      assert.equal(createRes.status, 201);
      const refId = createRes.body.item.id;

      // 2. Update
      const updateRes = await apiRequest(`/api/v1/reference-data/${refId}`, {
        method: 'PUT',
        sessionKey: 'admin',
        body: { name: 'Urgent Tier Updated', display_order: 6, version: 1 }
      });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.item.name, 'Urgent Tier Updated');
      assert.equal(updateRes.body.item.version, 2);

      // 3. Archive
      const archRes = await apiRequest(`/api/v1/reference-data/${refId}/archive`, {
        method: 'POST',
        sessionKey: 'admin',
        body: { version: 2 }
      });
      assert.equal(archRes.status, 200);
      assert.equal(archRes.body.item.is_active, false);

      // 4. Reactivate
      const reactRes = await apiRequest(`/api/v1/reference-data/${refId}/reactivate`, {
        method: 'POST',
        sessionKey: 'admin',
        body: { version: 3 }
      });
      assert.equal(reactRes.status, 200);
      assert.equal(reactRes.body.item.is_active, true);
    });

    test('System Admin can create and archive product-type custom fields', async () => {
      const defRes = await apiRequest('/api/v1/custom-fields/definitions', {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          productTypeId: '20000000-0000-0000-0000-000000000001',
          code: 'TEST_SAFETY_INTEGRITY',
          label: 'Test Safety Integrity',
          fieldType: 'single_select',
          isRequired: false,
          displayOrder: 20,
          options: [
            { code: 'SIL_1', label: 'SIL 1' },
            { code: 'SIL_2', label: 'SIL 2' }
          ]
        }
      });
      assert.equal(defRes.status, 201);
      const defId = defRes.body.definition.id;

      // Archive definition
      const archRes = await apiRequest(`/api/v1/custom-fields/definitions/${defId}/archive`, {
        method: 'POST',
        sessionKey: 'admin',
        body: { version: 1 }
      });
      assert.equal(archRes.status, 200);
      assert.equal(archRes.body.definition.is_active, false);
    });

    test('Required custom fields are validated server-side on project custom-fields update', async () => {
      // Clear required field VEHICLE_PLATFORM
      const res = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000001/custom-fields', {
        method: 'PUT',
        sessionKey: 'pm1',
        body: {
          values: {
            VEHICLE_PLATFORM: '', // Blank required field
          }
        }
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('required'));
    });

    test('Custom-field type validation rejects invalid values', async () => {
      // TARGET_SOP_DATE is a date type
      const res = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000001/custom-fields', {
        method: 'PUT',
        sessionKey: 'pm1',
        body: {
          values: {
            TARGET_SOP_DATE: 'not-a-valid-date-format',
          }
        }
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('valid date'));
    });

    test('Project Manager can edit custom-field values only inside their project scope', async () => {
      // PM1 manages Project 1 (EMS-G2-INT)
      const resAllowed = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000001/custom-fields', {
        method: 'PUT',
        sessionKey: 'pm1',
        body: {
          values: {
            PROJECT_NOTES: 'Updated by PM1 within assigned scope',
          }
        }
      });
      assert.equal(resAllowed.status, 200);

      // PM1 tries editing Project 2 (EMS-G2-VAL)
      const resDenied = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000002/custom-fields', {
        method: 'PUT',
        sessionKey: 'pm1',
        body: {
          values: {
            PROJECT_NOTES: 'Attempted cross-scope edit',
          }
        }
      });
      assert.equal(resDenied.status, 403);
    });

    test('Non-Admin users cannot alter custom-field definitions or options', async () => {
      const res = await apiRequest('/api/v1/custom-fields/definitions', {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          productTypeId: '20000000-0000-0000-0000-000000000001',
          code: 'ILLEGAL_CF',
          label: 'Illegal',
          fieldType: 'text'
        }
      });
      assert.equal(res.status, 403);
    });
  });

  // ===========================================================================
  // 6. Concurrency & Optimistic Locking Tests (§ 8)
  // ===========================================================================
  describe('6. Concurrency & Optimistic Locking (§ 8)', () => {
    test('Stale update returns HTTP 409 and increments version on success', async () => {
      // Get current version of Project 1
      const pRes = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000001', { sessionKey: 'admin' });
      assert.equal(pRes.status, 200);
      const initialVersion = pRes.body.project.version;

      // 1. Successful update with expected version
      const updateRes = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000001', {
        method: 'PUT',
        sessionKey: 'admin',
        body: {
          name: 'EMS Gen2 Platform Integration - Synchronized',
          version: initialVersion,
        }
      });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.project.version, initialVersion + 1, 'Version must increment exactly once');

      // 2. Stale update with old version returns 409
      const staleRes = await apiRequest('/api/v1/projects/60000000-0000-0000-0000-000000000001', {
        method: 'PUT',
        sessionKey: 'admin',
        body: {
          name: 'Conflicting Concurrent Edit',
          version: initialVersion, // Stale!
        }
      });
      assert.equal(staleRes.status, 409);
      assert.equal(staleRes.body.error.code, 'CONFLICT_STALE_RECORD');
    });
  });

  // ===========================================================================
  // 7. Audit Log Tests (§ 8)
  // ===========================================================================
  describe('7. Append-Only Audit Trail (§ 8)', () => {
    test('Audit events created for Step 3 lifecycle actions', async () => {
      const res = await apiRequest('/api/v1/audit/events?limit=20', { sessionKey: 'admin' });
      assert.equal(res.status, 200);
      assert.ok(res.body.events.length > 0);

      const actions = res.body.events.map(e => e.action);
      assert.ok(actions.includes('INSERT') || actions.includes('UPDATE') || actions.includes('REFERENCE_DATA_CREATE'));
    });

    test('Non-Admin users cannot access full audit log', async () => {
      const resPM = await apiRequest('/api/v1/audit/events', { sessionKey: 'pm1' });
      assert.equal(resPM.status, 403);

      const resRM = await apiRequest('/api/v1/audit/events', { sessionKey: 'rm' });
      assert.equal(resRM.status, 403);

      const resMem = await apiRequest('/api/v1/audit/events', { sessionKey: 'member1' });
      assert.equal(resMem.status, 403);
    });
  });
});
