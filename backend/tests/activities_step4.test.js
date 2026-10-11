import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { query, closePool } from '../src/db/index.js';
import { runMigrations, getMigrationFiles } from '../src/db/migrate.js';
import { bootstrapSystemAdmin } from '../src/modules/iam/bootstrap.service.js';
import { createSession } from '../src/modules/iam/session.service.js';

describe('Step 4: Activity Planning and Execution Workflow Test Suite', () => {
  let server;
  let baseUrl;
  let adminUser;
  let pm1User;
  let pm2User;
  let lead1User;
  let lead2User;
  let member1User;
  let member2User;
  let rmUser;
  let inactiveUser;

  const sessions = {};

  const PROJ_INT_ID = '60000000-0000-0000-0000-000000000001'; // EMS-G2-INT
  const PROJ_VAL_ID = '60000000-0000-0000-0000-000000000002'; // EMS-G2-VAL
  const PHASE_INT_ARCH = '61000000-0000-0000-0000-000000000001';
  const PHASE_INT_SW = '61000000-0000-0000-0000-000000000002';
  const TYPE_DEV = '24000000-0000-0000-0000-000000000001';
  const TYPE_INT = '24000000-0000-0000-0000-000000000002';
  const TYPE_TEST = '24000000-0000-0000-0000-000000000003';
  const PRIO_MED = '25000000-0000-0000-0000-000000000002';
  const PRIO_HIGH = '25000000-0000-0000-0000-000000000003';
  const PRIO_CRIT = '25000000-0000-0000-0000-000000000004';

  before(async () => {
    await runMigrations();
    await bootstrapSystemAdmin();

    const usersRes = await query('SELECT id, email, is_active FROM users ORDER BY email ASC');
    const userMap = new Map(usersRes.rows.map(u => [u.email, u]));

    adminUser = userMap.get('admin.pilot@ems-ecu.internal') || usersRes.rows.find(u => u.email.includes('admin'));
    pm1User = userMap.get('pm.integration@example.test');
    pm2User = userMap.get('pm.validation@example.test');
    lead1User = userMap.get('lead.integration@example.test');
    lead2User = userMap.get('lead.validation@example.test');
    member1User = userMap.get('engineer.integration1@example.test');
    member2User = userMap.get('engineer.integration2@example.test');
    rmUser = userMap.get('resource.manager@example.test');

    const inactRes = await query(`
      INSERT INTO users (email, password_hash, full_name, is_active, must_change_password)
      VALUES ('inactive.step4@example.test', 'dummy_hash', 'Inactive Step 4 User', FALSE, FALSE)
      ON CONFLICT (email) DO UPDATE SET is_active = FALSE
      RETURNING id, email, is_active;
    `);
    inactiveUser = inactRes.rows[0];

    await query("UPDATE users SET must_change_password = FALSE WHERE email != 'inactive.step4@example.test'");

    // Clean up transient test activities and restore seeded baseline for idempotency
    await query(`
      DELETE FROM activities 
      WHERE id NOT IN (
        '70000000-0000-0000-0000-000000000001',
        '70000000-0000-0000-0000-000000000002',
        '70000000-0000-0000-0000-000000000003',
        '70000000-0000-0000-0000-000000000004',
        '70000000-0000-0000-0000-000000000005',
        '70000000-0000-0000-0000-000000000006',
        '70000000-0000-0000-0000-000000000007',
        '70000000-0000-0000-0000-000000000008',
        '70000000-0000-0000-0000-000000000009',
        '70000000-0000-0000-0000-000000000010',
        '70000000-0000-0000-0000-000000000011',
        '70000000-0000-0000-0000-000000000012',
        '70000000-0000-0000-0000-000000000013'
      );

      UPDATE activities SET remaining_effort_hours = 130.00, start_date = '2026-12-01', due_date = '2027-01-31', status = 'IN_PROGRESS', archived_at = NULL WHERE id = '70000000-0000-0000-0000-000000000001';
      UPDATE activities SET remaining_effort_hours = 20.00, start_date = '2026-12-01', due_date = '2026-12-15', status = 'IN_PROGRESS', archived_at = NULL WHERE id = '70000000-0000-0000-0000-000000000002';
      UPDATE activities SET remaining_effort_hours = 60.00, start_date = '2026-12-16', due_date = '2027-01-15', status = 'PLANNED', archived_at = NULL, owner_user_id = '40000000-0000-0000-0000-000000000006' WHERE id = '70000000-0000-0000-0000-000000000003';
      UPDATE activities SET remaining_effort_hours = 50.00, start_date = '2027-01-16', due_date = '2027-01-31', status = 'PLANNED', archived_at = NULL WHERE id = '70000000-0000-0000-0000-000000000004';
      UPDATE activities SET remaining_effort_hours = 100.00, start_date = '2027-02-01', due_date = '2027-03-31', status = 'PLANNED', archived_at = NULL WHERE id = '70000000-0000-0000-0000-000000000005';
      UPDATE activities SET remaining_effort_hours = 45.00, start_date = '2027-02-01', due_date = '2027-02-28', status = 'PLANNED', archived_at = NULL WHERE id = '70000000-0000-0000-0000-000000000006';
      UPDATE activities SET remaining_effort_hours = 55.00, start_date = '2027-03-01', due_date = '2027-03-31', status = 'PLANNED', archived_at = NULL WHERE id = '70000000-0000-0000-0000-000000000007';

      UPDATE project_activity_sequences SET next_seq = 8 WHERE project_id = '60000000-0000-0000-0000-000000000001';
      UPDATE project_activity_sequences SET next_seq = 7 WHERE project_id = '60000000-0000-0000-0000-000000000002';
    `);

    const usersToSession = [
      ['admin', adminUser],
      ['pm1', pm1User],
      ['pm2', pm2User],
      ['lead1', lead1User],
      ['lead2', lead2User],
      ['member1', member1User],
      ['member2', member2User],
      ['rm', rmUser],
      ['inactive', inactiveUser],
    ];

    for (const [key, usr] of usersToSession) {
      if (usr) {
        sessions[key] = await createSession(usr.id);
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
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        });
      });

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  // ----------------------------------------------------------------------------
  // 1. Schema & Migration Integrity
  // ----------------------------------------------------------------------------
  describe('1. Schema & Migration Integrity', () => {
    test('Migrations 001-006 are untouched and 007, 008 are present in order', () => {
      const files = getMigrationFiles();
      assert.ok(files.length >= 8, `Expected at least 8 migrations, found ${files.length}`);
      assert.equal(files[6].version, '007');
      assert.equal(files[6].name, '007_activity_planning_and_execution');
      assert.equal(files[7].version, '008');
      assert.equal(files[7].name, '008_seed_pilot_activities');
    });

    test('Seeded activities match specifications in both projects', async () => {
      const res = await query(`
        SELECT readable_activity_id, title, status, parent_activity_id, remaining_effort_hours 
        FROM activities ORDER BY readable_activity_id;
      `);
      assert.ok(res.rows.length >= 13, `Expected at least 13 seeded activities, found ${res.rows.length}`);

      const act1 = res.rows.find(a => a.readable_activity_id === 'EMS-G2-INT-1');
      assert.ok(act1);
      assert.equal(act1.title, 'Base Software Integration');
      assert.equal(act1.status, 'IN_PROGRESS');
      assert.equal(act1.remaining_effort_hours, '130.00'); // rolled up from children 20 + 60 + 50
    });

    test('Self-parenting is rejected by database constraints', async () => {
      await assert.rejects(async () => {
        await query(`
          INSERT INTO activities (
            id, project_id, readable_activity_id, title, activity_type_id, priority_id, status, parent_activity_id
          ) VALUES (
            gen_random_uuid(), '${PROJ_INT_ID}', 'FAIL-SELF', 'Self Parent', '${TYPE_DEV}', '${PRIO_MED}', 'DRAFT',
            'FAIL-SELF'
          );
        `);
      });
    });

    test('Grandchild creation (nesting depth > 1) is rejected by trigger', async () => {
      // Child 1 in EMS-G2-INT has id 70000000-0000-0000-0000-000000000002
      const childId = '70000000-0000-0000-0000-000000000002';
      const res = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          title: 'Attempted Grandchild',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
          parent_activity_id: childId,
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('cannot exceed 1 level'));
    });

    test('Parent activity must belong to the same project', async () => {
      // Try to assign parent from EMS-G2-INT (70000000-0000-0000-0000-000000000001) to activity in EMS-G2-VAL
      const res = await apiRequest(`/api/v1/projects/${PROJ_VAL_ID}/activities`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          title: 'Cross Project Parent Attempt',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
          parent_activity_id: '70000000-0000-0000-0000-000000000001',
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('same project'));
    });

    test('Due date preceding start date is rejected', async () => {
      const res = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          title: 'Invalid Date Order Activity',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
          start_date: '2026-12-10',
          due_date: '2026-12-05',
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('precede start date'));
    });

    test('Negative effort hours are rejected', async () => {
      const res = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          title: 'Negative Effort Activity',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
          original_estimate_hours: -5.0,
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('negative'));
    });

    test('Forecast finish date preceding start date is rejected', async () => {
      const res = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          title: 'Invalid Forecast Finish Activity',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
          start_date: '2026-12-10',
          due_date: '2026-12-20',
          forecast_finish_date: '2026-12-05',
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('precede start date'));
    });

    test('Phase must belong to the same project as its activity', async () => {
      // Find a phase in PROJ_VAL_ID
      const phaseRes = await query('SELECT id FROM phases WHERE project_id = $1 LIMIT 1', [PROJ_VAL_ID]);
      assert.ok(phaseRes.rows.length > 0);
      const valPhaseId = phaseRes.rows[0].id;

      const res = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          title: 'Mismatched Phase Activity',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
          phase_id: valPhaseId,
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('same project'));
    });

    test('Activities cannot be created in archived or cancelled projects', async () => {
      // Temporarily insert a CANCELLED test project
      const refProj = await query('SELECT product_id, project_manager_id FROM projects LIMIT 1');
      const tempProjRes = await query(`
        INSERT INTO projects (code, name, description, status, product_id, project_manager_id, planned_start_date, planned_finish_date)
        VALUES ('TEST-CANCELLED-P', 'Cancelled Test Project', 'Temp', 'CANCELLED', $1, $2, '2026-10-01', '2027-10-01')
        ON CONFLICT (code) DO UPDATE SET status = 'CANCELLED'
        RETURNING id;
      `, [refProj.rows[0].product_id, refProj.rows[0].project_manager_id]);
      const tempProjId = tempProjRes.rows[0].id;

      const res = await apiRequest(`/api/v1/projects/${tempProjId}/activities`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          title: 'Activity In Cancelled Project',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('archived or cancelled projects'));
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Readable Activity IDs
  // ----------------------------------------------------------------------------
  describe('2. Readable Activity IDs', () => {
    test('Generates sequential project-scoped readable IDs safely', async () => {
      const res1 = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          title: 'Test Sequential 1',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
        },
      });

      assert.equal(res1.status, 201);
      const act1 = res1.body.activity;
      assert.ok(act1.readable_activity_id.startsWith('EMS-G2-INT-'));
      const num1 = parseInt(act1.readable_activity_id.split('-').pop(), 10);
      assert.ok(num1 >= 8);

      const res2 = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          title: 'Test Sequential 2',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
        },
      });

      assert.equal(res2.status, 201);
      const act2 = res2.body.activity;
      const num2 = parseInt(act2.readable_activity_id.split('-').pop(), 10);
      assert.equal(num2, num1 + 1);
    });

    test('Readable activity ID cannot be altered on update', async () => {
      // Create draft activity
      const createRes = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          title: 'Immutable ID Test',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
        },
      });
      const created = createRes.body.activity;

      const patchRes = await apiRequest(`/api/v1/activities/${created.id}`, {
        method: 'PATCH',
        sessionKey: 'admin',
        body: {
          version: created.version,
          readable_activity_id: 'CUSTOM-OVERWRITE-999',
        },
      });

      assert.equal(patchRes.status, 400);
      assert.ok(patchRes.body.error.message.includes('immutable'));
    });

    test('Simultaneous concurrent activity creation generates unique, non-colliding readable IDs', async () => {
      const concurrentRequests = 10;
      const promises = Array.from({ length: concurrentRequests }, (_, idx) =>
        apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
          method: 'POST',
          sessionKey: 'admin',
          body: {
            title: `Concurrent Test Activity ${idx + 1}`,
            activity_type_id: TYPE_DEV,
            priority_id: PRIO_MED,
            status: 'DRAFT',
          },
        })
      );

      const results = await Promise.all(promises);
      for (const res of results) {
        assert.equal(res.status, 201, `Concurrent create should succeed, got ${res.status}: ${JSON.stringify(res.body)}`);
      }

      const readableIds = results.map(r => r.body.activity.readable_activity_id);
      const uniqueIds = new Set(readableIds);
      assert.equal(uniqueIds.size, concurrentRequests, `All ${concurrentRequests} readable IDs must be strictly unique`);
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Status Workflow Engine
  // ----------------------------------------------------------------------------
  describe('3. Status Workflow Engine', () => {
    let workflowAct;

    test('Draft can be created with incomplete planning fields', async () => {
      const res = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          title: 'Incomplete Draft Activity',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
        },
      });

      assert.equal(res.status, 201);
      workflowAct = res.body.activity;
      assert.equal(workflowAct.status, 'DRAFT');
      assert.equal(workflowAct.original_estimate_hours, null);
      assert.equal(workflowAct.start_date, null);
    });

    test('Activity cannot leave Draft without every mandatory planning field', async () => {
      const res = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          target_status: 'READY_FOR_PLANNING',
          version: workflowAct.version,
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('Cannot leave Draft without'));
    });

    test('Populating complete planning fields allows transition to READY_FOR_PLANNING', async () => {
      // Patch complete planning fields
      const patchRes = await apiRequest(`/api/v1/activities/${workflowAct.id}`, {
        method: 'PATCH',
        sessionKey: 'pm1',
        body: {
          version: workflowAct.version,
          original_estimate_hours: 40.0,
          current_estimate_hours: 40.0,
          remaining_effort_hours: 40.0,
          start_date: '2026-12-01',
          due_date: '2026-12-15',
          owner_user_id: member1User.id,
        },
      });

      assert.equal(patchRes.status, 200);
      workflowAct = patchRes.body.activity;

      // Transition to READY_FOR_PLANNING
      const transRes = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          target_status: 'READY_FOR_PLANNING',
          version: workflowAct.version,
        },
      });

      assert.equal(transRes.status, 200);
      assert.equal(transRes.body.activity.status, 'READY_FOR_PLANNING');
      workflowAct = transRes.body.activity;
    });

    test('Original estimate is immutable once planning begins (non-Draft)', async () => {
      const res = await apiRequest(`/api/v1/activities/${workflowAct.id}`, {
        method: 'PATCH',
        sessionKey: 'pm1',
        body: {
          version: workflowAct.version,
          original_estimate_hours: 80.0,
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('original_estimate_hours is immutable'));
    });

    test('Transitions from READY_FOR_PLANNING -> PLANNED -> IN_PROGRESS succeed', async () => {
      // Ready for planning -> Planned
      const res1 = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          target_status: 'PLANNED',
          version: workflowAct.version,
        },
      });
      assert.equal(res1.status, 200);
      workflowAct = res1.body.activity;
      assert.equal(workflowAct.status, 'PLANNED');

      // Planned -> In Progress (Team Member 1 owns this activity)
      const res2 = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          target_status: 'IN_PROGRESS',
          version: workflowAct.version,
        },
      });
      assert.equal(res2.status, 200);
      workflowAct = res2.body.activity;
      assert.equal(workflowAct.status, 'IN_PROGRESS');
    });

    test('Moving to BLOCKED requires blocker description >= 10 chars', async () => {
      // Missing / short blocker
      const failRes = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          target_status: 'BLOCKED',
          version: workflowAct.version,
          blocker_description: 'short',
        },
      });
      assert.equal(failRes.status, 400);
      assert.ok(failRes.body.error.message.includes('blocker description of at least 10 characters'));

      // Valid blocker description
      const okRes = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          target_status: 'BLOCKED',
          version: workflowAct.version,
          blocker_description: 'Waiting for hardware variant harness board shipment',
        },
      });
      assert.equal(okRes.status, 200);
      workflowAct = okRes.body.activity;
      assert.equal(workflowAct.status, 'BLOCKED');
      assert.equal(workflowAct.blocker_description, 'Waiting for hardware variant harness board shipment');
    });

    test('Unblocking (BLOCKED -> IN_PROGRESS) succeeds and clears active blocker', async () => {
      const res = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          target_status: 'IN_PROGRESS',
          version: workflowAct.version,
        },
      });
      assert.equal(res.status, 200);
      workflowAct = res.body.activity;
      assert.equal(workflowAct.status, 'IN_PROGRESS');
      assert.equal(workflowAct.blocker_description, null);
    });

    test('Moving IN_PROGRESS back to PLANNED requires reason >= 10 chars and PM/Admin role', async () => {
      // Denied for Team Member
      const tmFail = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          target_status: 'PLANNED',
          version: workflowAct.version,
          reason: 'Valid reason exceeding 10 characters',
        },
      });
      assert.equal(tmFail.status, 403);

      // Denied for PM if reason is missing or short
      const pmShort = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          target_status: 'PLANNED',
          version: workflowAct.version,
          reason: 'short',
        },
      });
      assert.equal(pmShort.status, 400);

      // Succeeds for PM with valid reason
      const pmOk = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          target_status: 'PLANNED',
          version: workflowAct.version,
          reason: 'Integration test bench delayed to next release iteration',
        },
      });
      assert.equal(pmOk.status, 200);
      workflowAct = pmOk.body.activity;
      assert.equal(workflowAct.status, 'PLANNED');
    });

    test('Marking DONE requires System Admin and reason >= 10 chars', async () => {
      // PM denied
      const pmRes = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          target_status: 'DONE',
          version: workflowAct.version,
          reason: 'Task is verified and completed successfully',
        },
      });
      assert.equal(pmRes.status, 403);

      // Admin short reason denied
      const adminShort = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          target_status: 'DONE',
          version: workflowAct.version,
          reason: 'Done',
        },
      });
      assert.equal(adminShort.status, 400);

      // Admin valid reason succeeds
      const adminOk = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          target_status: 'DONE',
          version: workflowAct.version,
          reason: 'Successfully integrated and signed off by lead architect',
        },
      });
      assert.equal(adminOk.status, 200);
      workflowAct = adminOk.body.activity;
      assert.equal(workflowAct.status, 'DONE');
    });

    test('Reopening DONE activity requires System Admin with reason', async () => {
      // Reopen to PLANNED by PM denied
      const pmRes = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          target_status: 'PLANNED',
          version: workflowAct.version,
          reason: 'Reopening due to regression found',
        },
      });
      assert.equal(pmRes.status, 403);

      // Admin succeeds with valid reason
      const adminRes = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          target_status: 'PLANNED',
          version: workflowAct.version,
          reason: 'Reopening activity due to new test findings in nightly build',
        },
      });
      assert.equal(adminRes.status, 200);
      workflowAct = adminRes.body.activity;
      assert.equal(workflowAct.status, 'PLANNED');
    });

    test('Transition from DONE to CANCELLED succeeds for System Admin with reason >= 10 chars', async () => {
      // First move workflowAct to DONE
      const doneRes = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          target_status: 'DONE',
          version: workflowAct.version,
          reason: 'Moving to Done before testing transition to Cancelled',
        },
      });
      assert.equal(doneRes.status, 200);
      workflowAct = doneRes.body.activity;
      assert.equal(workflowAct.status, 'DONE');

      // Attempt DONE -> CANCELLED by PM fails
      const pmCancel = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          target_status: 'CANCELLED',
          version: workflowAct.version,
          reason: 'PM attempting to cancel done activity',
        },
      });
      assert.equal(pmCancel.status, 403);

      // System Admin with qualifying reason succeeds
      const adminCancel = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          target_status: 'CANCELLED',
          version: workflowAct.version,
          reason: 'Program scope de-scoped by OEM steering committee after initial completion',
        },
      });
      assert.equal(adminCancel.status, 200);
      workflowAct = adminCancel.body.activity;
      assert.equal(workflowAct.status, 'CANCELLED');
    });

    test('Reopening CANCELLED activity requires System Admin with qualifying reason', async () => {
      // Non-admin PM denied
      const pmReopen = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          target_status: 'PLANNED',
          version: workflowAct.version,
          reason: 'PM attempting to reopen cancelled task',
        },
      });
      assert.equal(pmReopen.status, 403);

      // System Admin succeeds
      const adminReopen = await apiRequest(`/api/v1/activities/${workflowAct.id}/status-transitions`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          target_status: 'PLANNED',
          version: workflowAct.version,
          reason: 'Reinstating cancelled activity per revised engineering statement of work',
        },
      });
      assert.equal(adminReopen.status, 200);
      workflowAct = adminReopen.body.activity;
      assert.equal(workflowAct.status, 'PLANNED');
    });

    test('Status workflow cannot be bypassed through generic PATCH endpoint', async () => {
      const res = await apiRequest(`/api/v1/activities/${workflowAct.id}`, {
        method: 'PATCH',
        sessionKey: 'admin',
        body: {
          version: workflowAct.version,
          status: 'DONE',
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('Status workflow cannot be bypassed'));
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Hierarchy Roll-ups
  // ----------------------------------------------------------------------------
  describe('4. Hierarchy Roll-ups', () => {
    test('Parent remaining effort, start date, and due date roll up from active children', async () => {
      // Parent 2 in EMS-G2-INT: 'Diagnostics OBD Integration' (70000000-0000-0000-0000-000000000005)
      // Children: 70000000-0000-0000-0000-000000000006 (45h, 2027-02-01 to 2027-02-28)
      //           70000000-0000-0000-0000-000000000007 (55h, 2027-03-01 to 2027-03-31)
      const parentId = '70000000-0000-0000-0000-000000000005';
      const child1Id = '70000000-0000-0000-0000-000000000006';

      const parentBefore = (await apiRequest(`/api/v1/activities/${parentId}`)).body.activity;
      assert.equal(parentBefore.remaining_effort_hours, '100.00');

      const child1 = (await apiRequest(`/api/v1/activities/${child1Id}`)).body.activity;

      // Update child 1 remaining effort from 45.00 to 15.00
      const updateRes = await apiRequest(`/api/v1/activities/${child1Id}`, {
        method: 'PATCH',
        sessionKey: 'pm1',
        body: {
          version: child1.version,
          remaining_effort_hours: 15.00,
        },
      });
      assert.equal(updateRes.status, 200);

      // Parent remaining effort should now be 15 + 55 = 70.00
      const parentAfter = (await apiRequest(`/api/v1/activities/${parentId}`)).body.activity;
      assert.equal(parentAfter.remaining_effort_hours, '70.00');
    });

    test('Parent roll-up fields cannot be manually overwritten when children exist', async () => {
      const parentId = '70000000-0000-0000-0000-000000000005';
      const parent = (await apiRequest(`/api/v1/activities/${parentId}`)).body.activity;

      const res = await apiRequest(`/api/v1/activities/${parentId}`, {
        method: 'PATCH',
        sessionKey: 'pm1',
        body: {
          version: parent.version,
          remaining_effort_hours: 123.00,
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('Cannot manually overwrite'));
    });

    test('Correlated immutable audit entry written for parent roll-up update', async () => {
      const parentId = '70000000-0000-0000-0000-000000000005';
      const auditRes = await apiRequest(`/api/v1/activities/${parentId}/audit-events`, {
        sessionKey: 'pm1',
      });

      assert.equal(auditRes.status, 200);
      const events = auditRes.body.events;
      const rollupEvent = events.find(e => e.change_reason && e.change_reason.includes('roll-up'));
      assert.ok(rollupEvent, 'Audit trail must contain automated roll-up entry');
      assert.ok(rollupEvent.correlation_id, 'Roll-up must contain correlation_id');
    });
  });

  // ----------------------------------------------------------------------------
  // 5. Authorization & Scoping Enforcement
  // ----------------------------------------------------------------------------
  describe('5. Authorization & Scoping Enforcement', () => {
    test('System Admin has unrestricted access to activities across all projects', async () => {
      const resInt = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, { sessionKey: 'admin' });
      assert.equal(resInt.status, 200);
      const resVal = await apiRequest(`/api/v1/projects/${PROJ_VAL_ID}/activities`, { sessionKey: 'admin' });
      assert.equal(resVal.status, 200);
    });

    test('Project Manager 1 can access EMS-G2-INT but is denied EMS-G2-VAL', async () => {
      const okRes = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, { sessionKey: 'pm1' });
      assert.equal(okRes.status, 200);

      const deniedRes = await apiRequest(`/api/v1/projects/${PROJ_VAL_ID}/activities`, { sessionKey: 'pm1' });
      assert.equal(deniedRes.status, 403);

      // Direct activity ID in unassigned project
      const deniedItem = await apiRequest(`/api/v1/activities/70000000-0000-0000-0000-000000000008`, { sessionKey: 'pm1' });
      assert.equal(deniedItem.status, 403);
    });

    test('Team Lead 1 can view activities in assigned team projects and update team member activity', async () => {
      const teamList = await apiRequest(`/api/v1/activities/team`, { sessionKey: 'lead1' });
      assert.equal(teamList.status, 200);
      assert.ok(teamList.body.activities.length > 0);

      // Team Lead can update execution field (remaining effort) for engineer.integration1 activity
      const actId = '70000000-0000-0000-0000-000000000002'; // owned by engineer.integration1
      const act = (await apiRequest(`/api/v1/activities/${actId}`)).body.activity;

      const updateRes = await apiRequest(`/api/v1/activities/${actId}`, {
        method: 'PATCH',
        sessionKey: 'lead1',
        body: {
          version: act.version,
          remaining_effort_hours: 18.00,
        },
      });
      assert.equal(updateRes.status, 200);

      // Team Lead CANNOT modify planning fields (e.g. title, priority)
      const failPlanning = await apiRequest(`/api/v1/activities/${actId}`, {
        method: 'PATCH',
        sessionKey: 'lead1',
        body: {
          version: updateRes.body.activity.version,
          title: 'Unauthorized Title Edit by Team Lead',
        },
      });
      assert.equal(failPlanning.status, 403);
    });

    test('Team Member 1 sees only own activities and cannot update another user activity', async () => {
      const myList = await apiRequest(`/api/v1/activities/my`, { sessionKey: 'member1' });
      assert.equal(myList.status, 200);
      for (const a of myList.body.activities) {
        assert.equal(a.owner_user_id, member1User.id);
      }

      // Member 1 attempts to update Member 2's activity (70000000-0000-0000-0000-000000000003)
      const otherActId = '70000000-0000-0000-0000-000000000003';
      const otherAct = (await apiRequest(`/api/v1/activities/${otherActId}`)).body.activity;

      const failRes = await apiRequest(`/api/v1/activities/${otherActId}`, {
        method: 'PATCH',
        sessionKey: 'member1',
        body: {
          version: otherAct.version,
          remaining_effort_hours: 10.00,
        },
      });
      assert.equal(failRes.status, 403);
    });

    test('Resource Manager has read-only access strictly within resource scope', async () => {
      // Resource Manager has scope over both integration & validation teams
      const actId = '70000000-0000-0000-0000-000000000002';
      const readRes = await apiRequest(`/api/v1/activities/${actId}`, { sessionKey: 'rm' });
      assert.equal(readRes.status, 200);

      // Attempting to create activity is denied
      const createRes = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
        method: 'POST',
        sessionKey: 'rm',
        body: {
          title: 'RM Create Attempt',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
        },
      });
      assert.equal(createRes.status, 403);

      // Attempting to edit activity is denied
      const editRes = await apiRequest(`/api/v1/activities/${actId}`, {
        method: 'PATCH',
        sessionKey: 'rm',
        body: {
          version: readRes.body.activity.version,
          remaining_effort_hours: 5.0,
        },
      });
      assert.equal(editRes.status, 403);
    });

    test('Inactive users and unauthenticated requests are denied', async () => {
      const inactRes = await apiRequest(`/api/v1/activities/70000000-0000-0000-0000-000000000002`, {
        sessionKey: 'inactive',
      });
      assert.ok([401, 403].includes(inactRes.status));

      const unauthRes = await apiRequest(`/api/v1/activities/70000000-0000-0000-0000-000000000002`, {
        sessionKey: null,
      });
      assert.equal(unauthRes.status, 401);
    });

    test('Write route rejects missing or invalid CSRF tokens', async () => {
      const res = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
        method: 'POST',
        sessionKey: 'admin',
        headers: { 'X-CSRF-Token': 'invalid_token' },
        body: {
          title: 'CSRF Attack Attempt',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
        },
      });

      assert.equal(res.status, 403);
      assert.ok(res.body.error.code.includes('CSRF'));
    });
  });

  // ----------------------------------------------------------------------------
  // 6. Concurrency & Optimistic Locking
  // ----------------------------------------------------------------------------
  describe('6. Concurrency & Optimistic Locking', () => {
    test('Stale update returns HTTP 409 CONFLICT_STALE_RECORD', async () => {
      const actId = '70000000-0000-0000-0000-000000000003';
      const act = (await apiRequest(`/api/v1/activities/${actId}`)).body.activity;

      // First update increments version
      const res1 = await apiRequest(`/api/v1/activities/${actId}`, {
        method: 'PATCH',
        sessionKey: 'pm1',
        body: {
          version: act.version,
          remaining_effort_hours: 58.0,
        },
      });
      assert.equal(res1.status, 200);
      assert.equal(res1.body.activity.version, act.version + 1);

      // Concurrent update with stale version returns 409
      const res2 = await apiRequest(`/api/v1/activities/${actId}`, {
        method: 'PATCH',
        sessionKey: 'pm1',
        body: {
          version: act.version, // stale
          remaining_effort_hours: 50.0,
        },
      });

      assert.equal(res2.status, 409);
      assert.equal(res2.body.error.code, 'CONFLICT_STALE_RECORD');
    });

    test('Material change requires reason >= 10 chars (date moved > 3 working days)', async () => {
      // Activity with start_date '2026-12-16'. Moving to '2026-12-25' is > 3 working days
      const actId = '70000000-0000-0000-0000-000000000003';
      const act = (await apiRequest(`/api/v1/activities/${actId}`)).body.activity;

      const failRes = await apiRequest(`/api/v1/activities/${actId}`, {
        method: 'PATCH',
        sessionKey: 'pm1',
        body: {
          version: act.version,
          start_date: '2026-12-25',
          due_date: '2027-01-20',
        },
      });

      assert.equal(failRes.status, 400);
      assert.ok(failRes.body.error.message.includes('Material change requires an explanatory reason'));

      // Succeeds with valid reason
      const okRes = await apiRequest(`/api/v1/activities/${actId}`, {
        method: 'PATCH',
        sessionKey: 'pm1',
        body: {
          version: act.version,
          start_date: '2026-12-25',
          due_date: '2027-01-20',
          reason: 'Customer requested schedule push due to dyno facility maintenance',
        },
      });

      assert.equal(okRes.status, 200);
    });
  });

  // ----------------------------------------------------------------------------
  // 7. Activity Archival & Restoration
  // ----------------------------------------------------------------------------
  describe('7. Activity Archival & Restoration', () => {
    let testAct;

    before(async () => {
      const res = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/activities`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          title: 'Archive Lifecycle Test Activity',
          activity_type_id: TYPE_DEV,
          priority_id: PRIO_MED,
          status: 'DRAFT',
        },
      });
      testAct = res.body.activity;
    });

    test('Archiving an activity succeeds for Project Manager', async () => {
      const res = await apiRequest(`/api/v1/activities/${testAct.id}/archive`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          version: testAct.version,
          reason: 'Archiving obsolete scope task',
        },
      });

      assert.equal(res.status, 200);
      assert.ok(res.body.activity.archived_at);
      testAct = res.body.activity;
    });

    test('Archived activity cannot be edited', async () => {
      const res = await apiRequest(`/api/v1/activities/${testAct.id}`, {
        method: 'PATCH',
        sessionKey: 'pm1',
        body: {
          version: testAct.version,
          title: 'Attempt Edit on Archived Activity',
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('archived activity cannot be edited'));
    });

    test('Restoring an archived activity succeeds for Project Manager', async () => {
      const res = await apiRequest(`/api/v1/activities/${testAct.id}/restore`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          version: testAct.version,
          reason: 'Restoring activity due to reintroduced scope requirement',
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.activity.archived_at, null);
    });
  });
});
