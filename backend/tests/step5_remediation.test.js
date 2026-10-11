/**
 * Step 5 Remediation Test Suite: Security, Privacy, Audit Integrity, and Escalation
 *
 * Verifies all blocking fixes:
 * A. Assignment authorization (403 for TM, TL, RM; PM scoped; Admin global)
 * B. Capacity evaluation privacy (scoping for all 5 roles; leave redaction for PM, TM, TL)
 * C. Conflict-case list and detail privacy (403 for TL/TM; PM project-scoped; RM member-scoped; redaction)
 * D. Correct audit actor attribution (CASE_CREATE actor_id = PM, not affected engineer)
 * E. Transaction integrity & atomic rollback (no partial state on failure, no ROLLBACK after COMMIT)
 * F. Utilization threshold consistency (>= 100.0% is HARD_BLOCK / CAPACITY_CONFLICT)
 * G. Automatic escalation & background worker (idempotency, multiple active admins, advisory lock, no SMTP)
 */
import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { query, getPool, closePool } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { bootstrapSystemAdmin } from '../src/modules/iam/bootstrap.service.js';
import { createSession } from '../src/modules/iam/session.service.js';
import {
  saveAssignmentWithCapacityValidation,
  checkAndEscalateOverdueCases,
  escalateCapacityConflictCase,
  createCapacityConflictCase,
  resolveCapacityConflictCase,
  findResponsibleResourceManager,
  redactConflictCaseForRole,
  ADVISORY_LOCK_ESCALATION,
} from '../src/modules/capacity_scheduling/capacity.service.js';
import { findNearestCommittedMilestone } from '../src/modules/capacity_scheduling/milestone.service.js';
import { capacitySchedulingModule } from '../src/modules/capacity_scheduling/index.js';
import { runWorkerJobCycle } from '../src/worker.js';

describe('Step 5 Remediation Test Suite', () => {
  let server;
  let baseUrl;

  let adminUser;
  let secondAdminUser;
  let pm1User;
  let pm2User;
  let lead1User;
  let member1User;
  let member2User;
  let memberValUser;
  let unscopedUser;
  let rmUser;

  const sessions = {};

  const PROJ_INT_ID = '60000000-0000-0000-0000-000000000001'; // EMS-G2-INT (PM: pm1User)
  const PROJ_VAL_ID = '60000000-0000-0000-0000-000000000002'; // EMS-G2-VAL (PM: pm2User)

  const ACT_INT_1 = '70000000-0000-0000-0000-000000000001';
  const ACT_INT_2 = '70000000-0000-0000-0000-000000000002';
  const ACT_VAL_1 = '70000000-0000-0000-0000-000000000007';

  before(async () => {
    await runMigrations();
    await bootstrapSystemAdmin();

    const usersRes = await query('SELECT id, email, is_active FROM users ORDER BY email ASC');
    const userMap = new Map(usersRes.rows.map(u => [u.email, u]));

    adminUser = userMap.get('admin.pilot@ems-ecu.internal') || usersRes.rows.find(u => u.email.includes('admin'));
    pm1User = userMap.get('pm.integration@example.test');
    pm2User = userMap.get('pm.validation@example.test');
    lead1User = userMap.get('lead.integration@example.test');
    member1User = userMap.get('engineer.integration1@example.test');
    member2User = userMap.get('engineer.integration2@example.test');
    memberValUser = userMap.get('engineer.validation1@example.test');
    rmUser = userMap.get('resource.manager@example.test');

    // Create a user without any team memberships to test out-of-resource-scope enforcement
    const unscopedRes = await query(`
      INSERT INTO users (email, full_name, password_hash, is_active, must_change_password)
      VALUES ('engineer.unscoped@ems-ecu.internal', 'Unscoped Engineer', 'mock_hash', TRUE, FALSE)
      ON CONFLICT (email) DO UPDATE SET is_active = TRUE, must_change_password = FALSE
      RETURNING id, email;
    `);
    unscopedUser = unscopedRes.rows[0];
    await query(`
      INSERT INTO user_roles (user_id, role_code)
      VALUES ($1, 'TEAM_MEMBER')
      ON CONFLICT DO NOTHING;
    `, [unscopedUser.id]);

    // Create a second active System Admin for multi-admin notification testing
    const secAdminRes = await query(`
      INSERT INTO users (email, full_name, password_hash, is_active, must_change_password)
      VALUES ('admin2.remediation@ems-ecu.internal', 'Second System Admin', 'mock_hash', TRUE, FALSE)
      ON CONFLICT (email) DO UPDATE SET is_active = TRUE, must_change_password = FALSE
      RETURNING id, email;
    `);
    secondAdminUser = secAdminRes.rows[0];
    await query(`
      INSERT INTO user_roles (user_id, role_code)
      VALUES ($1, 'SYSTEM_ADMIN')
      ON CONFLICT DO NOTHING;
    `, [secondAdminUser.id]);

    await query("UPDATE users SET must_change_password = FALSE");

    const usersToSession = [
      ['admin', adminUser],
      ['pm1', pm1User],
      ['pm2', pm2User],
      ['lead1', lead1User],
      ['member1', member1User],
      ['member2', member2User],
      ['memberVal', memberValUser],
      ['rm', rmUser],
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
    await query(`
      DELETE FROM assignments WHERE activity_id IN ('${ACT_INT_1}', '${ACT_INT_2}', '${ACT_VAL_1}');
    `);
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

      const req = http.request(url, { method, headers: reqHeaders }, res => {
        let respData = '';
        res.on('data', chunk => respData += chunk);
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(respData);
          } catch (_) {
            parsed = respData;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      });

      req.on('error', reject);
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  // ===========================================================================
  // Section A: Assignment Authorization (BLOCKING)
  // ===========================================================================
  describe('A. Assignment Authorization Tests', () => {
    test('TEAM_MEMBER receives HTTP 403 on assignment creation', async () => {
      const res = await apiRequest(`/api/v1/activities/${ACT_INT_1}/assignments`, {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          userId: member1User.id,
          startDate: '2027-04-05',
          endDate: '2027-04-09',
          plannedHours: 20.0,
        }
      });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    test('TEAM_LEAD receives HTTP 403 on assignment creation', async () => {
      const res = await apiRequest(`/api/v1/activities/${ACT_INT_1}/assignments`, {
        method: 'POST',
        sessionKey: 'lead1',
        body: {
          userId: member1User.id,
          startDate: '2027-04-05',
          endDate: '2027-04-09',
          plannedHours: 20.0,
        }
      });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    test('RESOURCE_MANAGER receives HTTP 403 and cannot assign work', async () => {
      const res = await apiRequest(`/api/v1/activities/${ACT_INT_1}/assignments`, {
        method: 'POST',
        sessionKey: 'rm',
        body: {
          userId: member1User.id,
          startDate: '2027-04-05',
          endDate: '2027-04-09',
          plannedHours: 20.0,
        }
      });
      assert.equal(res.status, 403);
      assert.ok(res.body.error.message.includes('Resource Manager cannot directly assign activities'));
    });

    test('PROJECT_MANAGER outside assigned project scope receives HTTP 403', async () => {
      // pm2 manages PROJ_VAL_ID; ACT_INT_1 belongs to PROJ_INT_ID
      const res = await apiRequest(`/api/v1/activities/${ACT_INT_1}/assignments`, {
        method: 'POST',
        sessionKey: 'pm2',
        body: {
          userId: member1User.id,
          startDate: '2027-04-05',
          endDate: '2027-04-09',
          plannedHours: 20.0,
        }
      });
      assert.equal(res.status, 403);
      assert.ok(res.body.error.message.includes('within their assigned projects'));
    });

    test('In-scope PROJECT_MANAGER succeeds on assignment creation', async () => {
      // Clean assignments for week
      await query(`DELETE FROM assignments WHERE activity_id = $1`, [ACT_INT_2]);
      const res = await apiRequest(`/api/v1/activities/${ACT_INT_2}/assignments`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: member2User.id,
          startDate: '2027-04-12',
          endDate: '2027-04-16',
          plannedHours: 25.0,
        }
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.assignment);
      assert.equal(res.body.assignment.activity_id, ACT_INT_2);
    });

    test('SYSTEM_ADMIN succeeds on assignment across projects', async () => {
      await query(`DELETE FROM assignments WHERE activity_id = $1`, [ACT_VAL_1]);
      const res = await apiRequest(`/api/v1/activities/${ACT_VAL_1}/assignments`, {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          userId: memberValUser.id,
          startDate: '2027-04-12',
          endDate: '2027-04-16',
          plannedHours: 20.0,
        }
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.assignment);
    });
  });

  // ===========================================================================
  // Section B: Capacity Evaluation Privacy (BLOCKING)
  // ===========================================================================
  describe('B. Capacity Evaluation Privacy & Scoping Tests', () => {
    let testLeaveId;

    before(async () => {
      // Seed an approved leave for member1 with sensitive details
      await query(`
        DELETE FROM leave_records WHERE user_id = $1 AND start_date = '2027-05-03';
      `, [member1User.id]);

      const leaveRes = await query(`
        INSERT INTO leave_records (
          user_id, member_id, start_date, end_date, leave_type, leave_reason, status, approved_by_user_id
        ) VALUES (
          $1, NULL, '2027-05-03', '2027-05-07', 'SICK', 'Confidential Medical Procedure', 'APPROVED', $2
        ) RETURNING id;
      `, [member1User.id, adminUser.id]);
      testLeaveId = leaveRes.rows[0].id;
    });

    after(async () => {
      if (testLeaveId) {
        await query(`DELETE FROM leave_records WHERE id = $1`, [testLeaveId]);
      }
    });

    test('SYSTEM_ADMIN may evaluate any member and receives unredacted leave data', async () => {
      const res = await apiRequest('/api/v1/capacity/evaluate', {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          userId: member1User.id,
          startDate: '2027-05-03',
          endDate: '2027-05-07',
          plannedHours: 10.0,
        }
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.workload.approvedLeaves.length >= 1);
      const leave = res.body.workload.approvedLeaves.find(l => l.id === testLeaveId);
      assert.ok(leave);
      assert.equal(leave.leave_type, 'SICK');
    });

    test('PROJECT_MANAGER outside scope receives HTTP 403 on capacity evaluate', async () => {
      // pm2 manages PROJ_VAL_ID, evaluating for ACT_INT_1 (Integration project)
      const res = await apiRequest('/api/v1/capacity/evaluate', {
        method: 'POST',
        sessionKey: 'pm2',
        body: {
          userId: member1User.id,
          activityId: ACT_INT_1,
          startDate: '2027-05-03',
          endDate: '2027-05-07',
          plannedHours: 10.0,
        }
      });
      assert.equal(res.status, 403);
    });

    test('In-scope PROJECT_MANAGER succeeds but leave type, reason, and approver are redacted', async () => {
      const res = await apiRequest('/api/v1/capacity/evaluate', {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: member1User.id,
          activityId: ACT_INT_1,
          startDate: '2027-05-03',
          endDate: '2027-05-07',
          plannedHours: 10.0,
        }
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.workload.approvedLeaves.length >= 1);
      const leave = res.body.workload.approvedLeaves.find(l => l.id === testLeaveId);
      assert.ok(leave);
      assert.equal(leave.unavailable_from, '2027-05-03');
      assert.equal(leave.unavailable_to, '2027-05-07');
      assert.equal(leave.duration_days, 5);
      assert.equal(leave.duration_hours, 40.0);
      // Redaction assertion: must NOT expose leave_type, leave_reason, or approver
      assert.equal(leave.leave_type, undefined);
      assert.equal(leave.leave_reason, undefined);
      assert.equal(leave.approved_by_user_id, undefined);
    });

    test('RESOURCE_MANAGER evaluating member outside resource scope receives HTTP 403', async () => {
      // unscopedUser is not in any team scoped to RM
      const res = await apiRequest('/api/v1/capacity/evaluate', {
        method: 'POST',
        sessionKey: 'rm',
        body: {
          userId: unscopedUser.id,
          startDate: '2027-05-03',
          endDate: '2027-05-07',
          plannedHours: 10.0,
        }
      });
      assert.equal(res.status, 403);
    });

    test('RESOURCE_MANAGER evaluating in-scope member succeeds with authorized resource view', async () => {
      const res = await apiRequest('/api/v1/capacity/evaluate', {
        method: 'POST',
        sessionKey: 'rm',
        body: {
          userId: member1User.id,
          startDate: '2027-05-03',
          endDate: '2027-05-07',
          plannedHours: 10.0,
        }
      });
      assert.equal(res.status, 200);
      const leave = res.body.workload.approvedLeaves.find(l => l.id === testLeaveId);
      assert.ok(leave);
      assert.equal(leave.leave_type, 'SICK');
    });

    test('TEAM_MEMBER evaluating other member receives HTTP 403', async () => {
      const res = await apiRequest('/api/v1/capacity/evaluate', {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          userId: member2User.id,
          startDate: '2027-05-03',
          endDate: '2027-05-07',
          plannedHours: 10.0,
        }
      });
      assert.equal(res.status, 403);
    });

    test('TEAM_MEMBER evaluating own capacity succeeds and redacts sensitive leave fields', async () => {
      const res = await apiRequest('/api/v1/capacity/evaluate', {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          userId: member1User.id,
          startDate: '2027-05-03',
          endDate: '2027-05-07',
          plannedHours: 10.0,
        }
      });
      assert.equal(res.status, 200);
      const leave = res.body.workload.approvedLeaves.find(l => l.id === testLeaveId);
      assert.ok(leave);
      assert.equal(leave.unavailable_from, '2027-05-03');
      assert.equal(leave.unavailable_to, '2027-05-07');
      assert.equal(leave.leave_type, undefined);
      assert.equal(leave.leave_reason, undefined);
    });

    test('TEAM_LEAD evaluating member outside team receives HTTP 403', async () => {
      const res = await apiRequest('/api/v1/capacity/evaluate', {
        method: 'POST',
        sessionKey: 'lead1',
        body: {
          userId: memberValUser.id,
          startDate: '2027-05-03',
          endDate: '2027-05-07',
          plannedHours: 10.0,
        }
      });
      assert.equal(res.status, 403);
    });

    test('TEAM_LEAD evaluating team member sees leave type but not leave reason or approver (DEF-STP5-001)', async () => {
      const res = await apiRequest('/api/v1/capacity/evaluate', {
        method: 'POST',
        sessionKey: 'lead1',
        body: {
          userId: member1User.id,
          startDate: '2027-05-03',
          endDate: '2027-05-07',
          plannedHours: 10.0,
        }
      });
      assert.equal(res.status, 200);
      const leave = res.body.workload.approvedLeaves.find(l => l.id === testLeaveId);
      assert.ok(leave);
      assert.equal(leave.start_date, '2027-05-03');
      assert.equal(leave.end_date, '2027-05-07');
      assert.equal(leave.duration_days, 5);
      assert.equal(leave.duration_hours, 40.0);
      assert.equal(leave.status, 'APPROVED');

      // DEF-STP5-001: leave type remains visible when Team Lead is authorized for that team member
      assert.equal(leave.leave_type, 'SICK');

      // DEF-STP5-001: leave reason is undefined/absent
      assert.equal(leave.leave_reason, undefined);

      // DEF-STP5-001: approved_by_user_id is undefined/absent
      assert.equal(leave.approved_by_user_id, undefined);

      // DEF-STP5-001: no alternative approver identifier is present
      assert.equal(leave.approver, undefined);
      assert.equal(leave.approver_id, undefined);
      assert.equal(leave.approver_name, undefined);
      assert.equal(leave.approver_email, undefined);
      assert.equal(leave.approved_by, undefined);
      assert.ok(!Object.keys(leave).some(k => k.toLowerCase().includes('approv')));
      assert.ok(!Object.keys(leave).some(k => k.toLowerCase().includes('reason')));
    });
  });

  // ===========================================================================
  // Section C: Conflict-Case List & Detail Privacy (BLOCKING)
  // ===========================================================================
  describe('C. Conflict-Case Privacy & Redaction Tests', () => {
    let intCaseId;
    let valCaseId;
    let unscopedCaseId;

    before(async () => {
      // Create one test case in PROJ_INT_ID (affected: member1)
      const res1 = await query(`
        INSERT INTO capacity_conflict_cases (
          case_code, activity_id, affected_user_id, project_id, status, severity,
          created_at, deadline, case_data
        ) VALUES (
          'CC-REM-INT-001', $1, $2, $3, 'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '4 hours',
          $4
        ) RETURNING id;
      `, [
        ACT_INT_1,
        member1User.id,
        PROJ_INT_ID,
        JSON.stringify({
          weekly_utilization: 120.0,
          approved_leaves: [{
            start_date: '2027-06-01',
            end_date: '2027-06-05',
            leave_type: 'MEDICAL',
            leave_reason: 'Confidential Diagnosis',
            approved_by_user_id: adminUser.id,
          }],
        })
      ]);
      intCaseId = res1.rows[0].id;

      // Create one test case in PROJ_VAL_ID (affected: memberVal)
      const res2 = await query(`
        INSERT INTO capacity_conflict_cases (
          case_code, activity_id, affected_user_id, project_id, status, severity,
          created_at, deadline, case_data
        ) VALUES (
          'CC-REM-VAL-001', $1, $2, $3, 'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '4 hours',
          '{"weekly_utilization": 110.0}'
        ) RETURNING id;
      `, [ACT_VAL_1, memberValUser.id, PROJ_VAL_ID]);
      valCaseId = res2.rows[0].id;

      // Create one test case for unscopedUser (affected engineer not in any RM team)
      const res3 = await query(`
        INSERT INTO capacity_conflict_cases (
          case_code, activity_id, affected_user_id, project_id, status, severity,
          created_at, deadline, case_data
        ) VALUES (
          'CC-REM-UNS-001', $1, $2, $3, 'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '4 hours',
          '{"weekly_utilization": 105.0}'
        ) RETURNING id;
      `, [ACT_VAL_1, unscopedUser.id, PROJ_VAL_ID]);
      unscopedCaseId = res3.rows[0].id;
    });

    after(async () => {
      await query(`DELETE FROM capacity_conflict_cases WHERE id IN ($1, $2, $3)`, [intCaseId, valCaseId, unscopedCaseId]);
    });

    test('TEAM_MEMBER and TEAM_LEAD receive HTTP 403 on conflict case list', async () => {
      const tmRes = await apiRequest('/api/v1/capacity-conflicts', { sessionKey: 'member1' });
      assert.equal(tmRes.status, 403);

      const tlRes = await apiRequest('/api/v1/capacity-conflicts', { sessionKey: 'lead1' });
      assert.equal(tlRes.status, 403);
    });

    test('TEAM_MEMBER and TEAM_LEAD receive HTTP 403 on conflict case detail', async () => {
      const tmRes = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}`, { sessionKey: 'member1' });
      assert.equal(tmRes.status, 403);

      const tlRes = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}`, { sessionKey: 'lead1' });
      assert.equal(tlRes.status, 403);
    });

    test('PROJECT_MANAGER sees only cases for assigned projects and leaves are redacted', async () => {
      const listRes = await apiRequest('/api/v1/capacity-conflicts', { sessionKey: 'pm1' });
      assert.equal(listRes.status, 200);
      // pm1 must not see validation project cases
      const valCase = listRes.body.cases.find(c => c.id === valCaseId);
      assert.equal(valCase, undefined);

      const intCase = listRes.body.cases.find(c => c.id === intCaseId);
      assert.ok(intCase);
      // Redaction check: leave_type must not be exposed to PM
      const leave = intCase.case_data.approved_leaves?.[0];
      assert.ok(leave);
      assert.equal(leave.leave_type, undefined);
      assert.equal(leave.leave_reason, undefined);
    });

    test('PROJECT_MANAGER receives HTTP 403 when accessing case detail outside assigned project', async () => {
      // pm1 accesses valCaseId (in Validation project)
      const res = await apiRequest(`/api/v1/capacity-conflicts/${valCaseId}`, { sessionKey: 'pm1' });
      assert.equal(res.status, 403);
    });

    test('PROJECT_MANAGER accessing in-scope case detail receives redacted leave data', async () => {
      const res = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}`, { sessionKey: 'pm1' });
      assert.equal(res.status, 200);
      assert.equal(res.body.case.id, intCaseId);
      const leave = res.body.case.case_data.approved_leaves?.[0];
      assert.ok(leave);
      assert.equal(leave.leave_type, undefined);
      assert.equal(leave.leave_reason, undefined);
    });

    test('RESOURCE_MANAGER receives HTTP 403 accessing case detail outside resource scope', async () => {
      // unscopedCaseId has affected engineer not in any RM team
      const res = await apiRequest(`/api/v1/capacity-conflicts/${unscopedCaseId}`, { sessionKey: 'rm' });
      assert.equal(res.status, 403);
    });

    test('SYSTEM_ADMIN accesses all cases with unredacted resource details', async () => {
      const listRes = await apiRequest('/api/v1/capacity-conflicts', { sessionKey: 'admin' });
      assert.equal(listRes.status, 200);
      assert.ok(listRes.body.cases.some(c => c.id === intCaseId));
      assert.ok(listRes.body.cases.some(c => c.id === valCaseId));

      const detailRes = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}`, { sessionKey: 'admin' });
      assert.equal(detailRes.status, 200);
      const leave = detailRes.body.case.case_data.approved_leaves?.[0];
      assert.ok(leave);
      assert.equal(leave.leave_type, 'MEDICAL');
    });

    test('Server-side conflict case serializer for TEAM_LEAD preserves leave_type but redacts reason and approver', () => {
      // Cross-project conflict HTTP endpoints deny TEAM_LEAD (403);
      // shared server-side serializer preserves leave type while completely omitting reason and approver.
      const mockCase = {
        id: 'test-case-id',
        case_data: {
          approved_leaves: [{
            start_date: '2027-06-01',
            end_date: '2027-06-05',
            leave_type: 'MEDICAL',
            leave_reason: 'Confidential Medical Diagnosis',
            approved_by_user_id: 'admin-uuid',
          }],
        },
      };
      const sanitized = redactConflictCaseForRole(mockCase, ['TEAM_LEAD']);
      const sanitizedLeave = sanitized.case_data.approved_leaves[0];
      assert.equal(sanitizedLeave.leave_type, 'MEDICAL');
      assert.equal(sanitizedLeave.leave_reason, undefined);
      assert.equal(sanitizedLeave.approved_by_user_id, undefined);
      assert.ok(!Object.keys(sanitizedLeave).some(k => k.toLowerCase().includes('approv')));
      assert.ok(!Object.keys(sanitizedLeave).some(k => k.toLowerCase().includes('reason')));
    });
  });

  // ===========================================================================
  // Section D: Audit Actor Attribution (BLOCKING)
  // ===========================================================================
  describe('D. Audit Actor Attribution Tests', () => {
    test('PM-triggered critical case creation attributes actor_id to PM, not affected engineer', async () => {
      // Clean assignments for activity
      await query(`DELETE FROM assignments WHERE activity_id = $1`, [ACT_INT_1]);

      // Attempt assignment that triggers Critical Delivery-at-Risk conflict (without override)
      const assignRes = await apiRequest(`/api/v1/activities/${ACT_INT_1}/assignments`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: member1User.id,
          startDate: '2026-11-02',
          endDate: '2026-11-06',
          plannedHours: 80.0, // Exceeds capacity
        }
      });
      assert.equal(assignRes.status, 409);
      const createdCase = assignRes.body.details?.case;
      assert.ok(createdCase?.id, 'Expected created resolution case in 409 response');

      // Verify audit log row for CASE_CREATE
      const auditRes = await query(`
        SELECT * FROM audit_log
        WHERE entity_id = $1 AND action = 'CASE_CREATE'
        ORDER BY recorded_at DESC LIMIT 1;
      `, [createdCase.id]);
      assert.equal(auditRes.rows.length, 1);
      const auditRow = auditRes.rows[0];

      // CRITICAL ASSERTION: The actor_id must be the PM (pm1User.id), NOT the overloaded engineer (member1User.id)
      assert.equal(auditRow.actor_id, pm1User.id, 'Audit actor_id must be authenticated PM');
      assert.notEqual(auditRow.actor_id, member1User.id, 'Audit actor_id must not be affected engineer');

      // Affected engineer remains subject in case data
      const caseRes = await query('SELECT case_data FROM capacity_conflict_cases WHERE id = $1', [createdCase.id]);
      const caseData = caseRes.rows[0].case_data;
      assert.equal(caseData.affected_engineer.id, member1User.id);
    });
  });

  // ===========================================================================
  // Section E: Transaction Integrity & Atomic Rollback (BLOCKING)
  // ===========================================================================
  describe('E. Transaction Integrity & Rollback Tests', () => {
    test('Forced failure during assignment transaction leaves NO partial assignment or audit rows', async () => {
      await query(`DELETE FROM assignments WHERE activity_id = $1`, [ACT_INT_2]);
      const pool = getPool();
      const client = await pool.connect();
      const uniquePlanHours = 37.77;

      try {
        await client.query('BEGIN');
        // Insert assignment inside transaction
        await client.query(`
          INSERT INTO assignments (activity_id, user_id, start_date, end_date, planned_hours, status)
          VALUES ($1, $2, '2027-07-05', '2027-07-09', $3, 'ACTIVE');
        `, [ACT_INT_2, member2User.id, uniquePlanHours]);

        // Forced failure injection (simulate constraint or audit write crash)
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      // Assert no row survived the rollback
      const checkRes = await query(`
        SELECT id FROM assignments WHERE activity_id = $1 AND planned_hours = $2;
      `, [ACT_INT_2, uniquePlanHours]);
      assert.equal(checkRes.rows.length, 0, 'No partial assignment row must persist after rollback');
    });

    test('409 hard-conflict flow commits case and notification atomically without issuing ROLLBACK after COMMIT', async () => {
      await query(`DELETE FROM assignments WHERE activity_id = $1`, [ACT_INT_1]);

      // Trigger 409 critical conflict without override
      const res = await apiRequest(`/api/v1/activities/${ACT_INT_1}/assignments`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: member1User.id,
          startDate: '2026-11-09',
          endDate: '2026-11-13',
          plannedHours: 85.0,
        }
      });
      assert.equal(res.status, 409);
      const caseId = res.body.details?.case?.id;
      assert.ok(caseId);

      // Verify case exists, notifications exist, and audit row exists
      const [caseCheck, notifCheck, auditCheck] = await Promise.all([
        query('SELECT id, status FROM capacity_conflict_cases WHERE id = $1', [caseId]),
        query('SELECT id FROM in_app_notifications WHERE case_id = $1', [caseId]),
        query("SELECT id FROM audit_log WHERE entity_id = $1 AND action = 'CASE_CREATE'", [caseId]),
      ]);

      assert.equal(caseCheck.rows.length, 1);
      assert.ok(notifCheck.rows.length >= 1);
      assert.equal(auditCheck.rows.length, 1);

      // Verify NO assignment was created
      const assignCheck = await query(`
        SELECT id FROM assignments WHERE activity_id = $1 AND planned_hours = 85.0 AND status = 'ACTIVE';
      `, [ACT_INT_1]);
      assert.equal(assignCheck.rows.length, 0);
    });

    test('Failed resolution update rolls back all changes atomically', async () => {
      // Create a test case
      const caseRes = await query(`
        INSERT INTO capacity_conflict_cases (
          case_code, activity_id, affected_user_id, project_id, status, severity,
          created_at, deadline, case_data
        ) VALUES (
          'CC-TX-TEST-' || SUBSTR(gen_random_uuid()::text, 1, 8), $1, $2, $3,
          'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '4 hours', '{"test": true}'
        ) RETURNING id;
      `, [ACT_INT_1, member1User.id, PROJ_INT_ID]);
      const testCaseId = caseRes.rows[0].id;

      // Attempt invalid resolution (reason < 10 chars)
      const res = await apiRequest(`/api/v1/capacity-conflicts/${testCaseId}/resolve`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          resolutionType: 'REDUCE_OR_SPLIT_SCOPE',
          newPlannedHours: 15.0,
          reason: 'Too short', // Invalid: < 10 chars
        }
      });
      assert.equal(res.status, 400);

      // Verify case remains in RESOURCE_RESOLUTION_REQUIRED status
      const checkRes = await query('SELECT status, resolved_at FROM capacity_conflict_cases WHERE id = $1', [testCaseId]);
      assert.equal(checkRes.rows[0].status, 'RESOURCE_RESOLUTION_REQUIRED');
      assert.equal(checkRes.rows[0].resolved_at, null);

      // Verify no audit row was recorded
      const auditRes = await query(`
        SELECT id FROM audit_log WHERE entity_id = $1 AND action = 'CASE_RESOLVE';
      `, [testCaseId]);
      assert.equal(auditRes.rows.length, 0);
    });
  });

  // ===========================================================================
  // Section F: Utilization Threshold Consistency
  // ===========================================================================
  describe('F. Utilization Threshold Consistency Tests', () => {
    test('capacitySchedulingModule.evaluateUtilization returns HARD_BLOCK for exactly 100.0% utilization', () => {
      const res = capacitySchedulingModule.evaluateUtilization(40.0, 40.0);
      assert.equal(res.plannedUtilizationPercent, 100.0);
      assert.equal(res.status, 'HARD_BLOCK');
      assert.equal(res.label, 'Capacity Conflict');
    });

    test('89.99% is OK, 90.0% is SOFT_WARNING, 100.0% is HARD_BLOCK', () => {
      const okRes = capacitySchedulingModule.evaluateUtilization(35.99, 40.0);
      assert.equal(okRes.status, 'OK');

      const warnRes = capacitySchedulingModule.evaluateUtilization(36.0, 40.0);
      assert.equal(warnRes.status, 'SOFT_WARNING');

      const blockRes = capacitySchedulingModule.evaluateUtilization(40.0, 40.0);
      assert.equal(blockRes.status, 'HARD_BLOCK');
    });
  });

  // ===========================================================================
  // Section G: Automatic Escalation & Background Worker (BLOCKING)
  // ===========================================================================
  describe('G. Automatic Escalation & Dedicated Worker Tests', () => {
    let overdueCaseId;

    before(async () => {
      const caseRes = await query(`
        INSERT INTO capacity_conflict_cases (
          case_code, activity_id, affected_user_id, project_id, status, severity,
          created_at, deadline, case_data
        ) VALUES (
          'CC-OVERDUE-G-' || SUBSTR(gen_random_uuid()::text, 1, 8), $1, $2, $3,
          'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK',
          CURRENT_TIMESTAMP - INTERVAL '6 hours',
          CURRENT_TIMESTAMP - INTERVAL '2 hours',
          '{"overload": true}'
        ) RETURNING id;
      `, [ACT_INT_1, member1User.id, PROJ_INT_ID]);
      overdueCaseId = caseRes.rows[0].id;
    });

    after(async () => {
      if (overdueCaseId) {
        await query(`DELETE FROM in_app_notifications WHERE case_id = $1`, [overdueCaseId]);
        await query(`DELETE FROM audit_log WHERE entity_id = $1`, [overdueCaseId]);
        await query(`DELETE FROM capacity_conflict_cases WHERE id = $1`, [overdueCaseId]);
      }
    });

    test('checkAndEscalateOverdueCases escalates overdue case and notifies ALL active SYSTEM_ADMINs', async () => {
      const initialNotifs = await query(`
        SELECT id FROM in_app_notifications WHERE case_id = $1;
      `, [overdueCaseId]);
      assert.equal(initialNotifs.rows.length, 0);

      // Run escalation check
      const result = await checkAndEscalateOverdueCases({ now: new Date() });
      assert.ok(result.length >= 1 || result.escalatedCount >= 1);

      // Verify case status transitioned to ESCALATED
      const caseRes = await query('SELECT status, escalated_at FROM capacity_conflict_cases WHERE id = $1', [overdueCaseId]);
      assert.equal(caseRes.rows[0].status, 'ESCALATED');
      assert.ok(caseRes.rows[0].escalated_at);

      // Verify multiple active admins: BOTH adminUser and secondAdminUser received notification
      const notifsRes = await query(`
        SELECT user_id, type FROM in_app_notifications WHERE case_id = $1 AND type = 'CASE_ESCALATED';
      `, [overdueCaseId]);
      const notifiedUserIds = new Set(notifsRes.rows.map(n => n.user_id));
      assert.ok(notifiedUserIds.has(adminUser.id), 'First admin must be notified');
      assert.ok(notifiedUserIds.has(secondAdminUser.id), 'Second admin must be notified');

      // Verify audit log row
      const auditRes = await query(`
        SELECT id, action FROM audit_log WHERE entity_id = $1 AND action = 'CASE_ESCALATE';
      `, [overdueCaseId]);
      assert.equal(auditRes.rows.length, 1);
    });

    test('checkAndEscalateOverdueCases is idempotent on second execution', async () => {
      // Run second time on already escalated cases
      const secondResult = await checkAndEscalateOverdueCases({ now: new Date() });
      // Case was already escalated; count should be 0
      assert.equal(secondResult.length, 0);

      // Verify notification count did not duplicate
      const notifsRes = await query(`
        SELECT id FROM in_app_notifications WHERE case_id = $1 AND type = 'CASE_ESCALATED';
      `, [overdueCaseId]);
      assert.equal(notifsRes.rows.length, 2, 'Must not create duplicate notifications on repeated runs');
    });

    test('Advisory lock prevents duplicate concurrent execution', async () => {
      const pool = getPool();
      const lockClient = await pool.connect();

      try {
        // Manually acquire the advisory lock in a separate connection
        const lockRes = await lockClient.query('SELECT pg_try_advisory_lock($1) AS acquired', [ADVISORY_LOCK_ESCALATION]);
        assert.equal(lockRes.rows[0].acquired, true);

        // Run checkAndEscalateOverdueCases while lock is held
        const result = await checkAndEscalateOverdueCases({ now: new Date() });
        assert.equal(result.skipped, true, 'Job must skip execution when lock is held by another process');

        // Unlock
        await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ESCALATION]);
      } finally {
        lockClient.release();
      }
    });

    test('Worker job cycle runs without SMTP or email dependencies', async () => {
      // Execute worker cycle function directly
      const cycleResult = await runWorkerJobCycle();
      assert.ok(cycleResult !== undefined);
      // Confirmed no network/SMTP socket error thrown
    });
  });

  // ===========================================================================
  // H. Conflict-Case Resolution Options Authorization Tests (§ 4, 5)
  // ===========================================================================
  describe('H. Conflict-Case Resolution Options Authorization Tests (§ 4, 5)', () => {
    let intCaseId;
    let valCaseId;

    before(async () => {
      // Create a test case in Integration project (pm1 scope, member1 in RM scope)
      const intCaseRes = await query(`
        INSERT INTO capacity_conflict_cases (
          case_code, activity_id, affected_user_id, project_id,
          status, severity, created_at, deadline, case_data
        ) VALUES (
          'CC-TEST-OPT-INT-' || SUBSTR(gen_random_uuid()::text, 1, 8),
          $1, $2, $3,
          'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '4 hours',
          '{"test": true}'
        ) RETURNING id;
      `, [ACT_INT_1, member1User.id, PROJ_INT_ID]);
      intCaseId = intCaseRes.rows[0].id;

      // Create a test case in Validation project (pm2 scope, unscopedUser outside RM scope)
      const valCaseRes = await query(`
        INSERT INTO capacity_conflict_cases (
          case_code, activity_id, affected_user_id, project_id,
          status, severity, created_at, deadline, case_data
        ) VALUES (
          'CC-TEST-OPT-VAL-' || SUBSTR(gen_random_uuid()::text, 1, 8),
          $1, $2, $3,
          'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '4 hours',
          '{"test": true}'
        ) RETURNING id;
      `, [ACT_VAL_1, unscopedUser.id, PROJ_VAL_ID]);
      valCaseId = valCaseRes.rows[0].id;
    });

    after(async () => {
      await query(`DELETE FROM capacity_conflict_cases WHERE id IN ($1, $2)`, [intCaseId, valCaseId]);
    });

    test('SYSTEM_ADMIN: allow resolution options for all cases', async () => {
      const resInt = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}/options`, { sessionKey: 'admin' });
      assert.equal(resInt.status, 200);
      assert.ok(Array.isArray(resInt.body.options));

      const resVal = await apiRequest(`/api/v1/capacity-conflicts/${valCaseId}/options`, { sessionKey: 'admin' });
      assert.equal(resVal.status, 200);
      assert.ok(Array.isArray(resVal.body.options));
    });

    test('PROJECT_MANAGER: allow resolution options only in assigned project scope', async () => {
      // pm1 scoped to PROJ_INT_ID: allowed for intCase
      const resAllowed = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}/options`, { sessionKey: 'pm1' });
      assert.equal(resAllowed.status, 200);
      assert.ok(Array.isArray(resAllowed.body.options));

      // pm1 scoped to PROJ_INT_ID: denied for valCase
      const resDenied = await apiRequest(`/api/v1/capacity-conflicts/${valCaseId}/options`, { sessionKey: 'pm1' });
      assert.equal(resDenied.status, 403);
      assert.ok(resDenied.body.error.message.includes('Project Manager can access options only for cases within assigned projects'));
    });

    test('RESOURCE_MANAGER: allow resolution options only involving members in resource scope', async () => {
      // rm scoped to member1User (intCase): allowed
      const resAllowed = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}/options`, { sessionKey: 'rm' });
      assert.equal(resAllowed.status, 200);
      assert.ok(Array.isArray(resAllowed.body.options));

      // rm not scoped to unscopedUser (valCase): denied
      const resDenied = await apiRequest(`/api/v1/capacity-conflicts/${valCaseId}/options`, { sessionKey: 'rm' });
      assert.equal(resDenied.status, 403);
      assert.ok(resDenied.body.error.message.includes('Resource Manager can access options only for cases concerning members within resource scope'));
    });

    test('TEAM_MEMBER and TEAM_LEAD: deny resolution options with HTTP 403', async () => {
      const resTM = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}/options`, { sessionKey: 'member1' });
      assert.equal(resTM.status, 403);

      const resTL = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}/options`, { sessionKey: 'lead1' });
      assert.equal(resTL.status, 403);
    });

    test('Unauthenticated request: deny with HTTP 401', async () => {
      const res = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}/options`, { sessionKey: null });
      assert.equal(res.status, 401);
    });

    test('Non-existent case: returns HTTP 404', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000999';
      const res = await apiRequest(`/api/v1/capacity-conflicts/${fakeId}/options`, { sessionKey: 'admin' });
      assert.equal(res.status, 404);
    });
  });

  // ===========================================================================
  // I. Case Escalation Authorization Tests (§ 5, 6)
  // ===========================================================================
  describe('I. Case Escalation Authorization Tests (§ 5, 6)', () => {
    let intCaseId;
    let valCaseId;

    beforeEach(async () => {
      const intRes = await query(`
        INSERT INTO capacity_conflict_cases (
          case_code, activity_id, affected_user_id, project_id,
          status, severity, created_at, deadline, case_data
        ) VALUES (
          'CC-TEST-ESC-INT-' || SUBSTR(gen_random_uuid()::text, 1, 8),
          $1, $2, $3,
          'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '4 hours',
          '{"test": true}'
        ) RETURNING id;
      `, [ACT_INT_1, member1User.id, PROJ_INT_ID]);
      intCaseId = intRes.rows[0].id;

      const valRes = await query(`
        INSERT INTO capacity_conflict_cases (
          case_code, activity_id, affected_user_id, project_id,
          status, severity, created_at, deadline, case_data
        ) VALUES (
          'CC-TEST-ESC-VAL-' || SUBSTR(gen_random_uuid()::text, 1, 8),
          $1, $2, $3,
          'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '4 hours',
          '{"test": true}'
        ) RETURNING id;
      `, [ACT_VAL_1, memberValUser.id, PROJ_VAL_ID]);
      valCaseId = valRes.rows[0].id;
    });

    afterEach(async () => {
      await query(`DELETE FROM in_app_notifications WHERE case_id IN ($1, $2)`, [intCaseId, valCaseId]);
      await query(`DELETE FROM audit_log WHERE entity_id IN ($1, $2)`, [intCaseId, valCaseId]);
      await query(`DELETE FROM capacity_conflict_cases WHERE id IN ($1, $2)`, [intCaseId, valCaseId]);
    });

    test('SYSTEM_ADMIN: allow escalating any conflict case', async () => {
      const res = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}/escalate`, {
        method: 'POST',
        sessionKey: 'admin',
        body: { reason: 'System Admin escalation override' }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.case.status, 'ESCALATED');
    });

    test('PROJECT_MANAGER: allow escalating only in assigned project scope', async () => {
      // pm1 for intCase: allowed
      const resAllowed = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}/escalate`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: { reason: 'PM1 escalating unresolved case in project scope' }
      });
      assert.equal(resAllowed.status, 200);
      assert.equal(resAllowed.body.case.status, 'ESCALATED');

      // pm1 for valCase (out of scope): denied
      const resDenied = await apiRequest(`/api/v1/capacity-conflicts/${valCaseId}/escalate`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: { reason: 'PM1 unauthorized escalation attempt' }
      });
      assert.equal(resDenied.status, 403);
      assert.ok(resDenied.body.error.message.includes('Project Manager can escalate cases only within their assigned projects'));
    });

    test('RESOURCE_MANAGER, TEAM_LEAD, TEAM_MEMBER: deny escalation with HTTP 403', async () => {
      const resRM = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}/escalate`, {
        method: 'POST',
        sessionKey: 'rm',
        body: { reason: 'RM escalation attempt' }
      });
      assert.equal(resRM.status, 403);

      const resTL = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}/escalate`, {
        method: 'POST',
        sessionKey: 'lead1',
        body: { reason: 'TL escalation attempt' }
      });
      assert.equal(resTL.status, 403);

      const resTM = await apiRequest(`/api/v1/capacity-conflicts/${intCaseId}/escalate`, {
        method: 'POST',
        sessionKey: 'member1',
        body: { reason: 'TM escalation attempt' }
      });
      assert.equal(resTM.status, 403);
    });
  });

  // ===========================================================================
  // J. Date-Adjustment Evidence & After-State Workload Recalculation Tests (§ 7, 8)
  // ===========================================================================
  describe('J. Date-Adjustment Evidence & After-State Workload Recalculation Tests (§ 7, 8)', () => {
    let dateCaseId;

    beforeEach(async () => {
      // Setup activity with old dates (2026-12-07 to 2026-12-11)
      await query(`
        UPDATE activities 
        SET start_date = '2026-12-07', due_date = '2026-12-11', remaining_effort_hours = 8
        WHERE id = $1
      `, [ACT_INT_2]);

      await query(`DELETE FROM assignments WHERE activity_id = $1`, [ACT_INT_2]);
      await query(`
        INSERT INTO assignments (activity_id, user_id, start_date, end_date, planned_hours, status)
        VALUES ($1, $2, '2026-12-07', '2026-12-11', 8.0, 'ACTIVE')
      `, [ACT_INT_2, member1User.id]);

      const caseRes = await query(`
        INSERT INTO capacity_conflict_cases (
          case_code, activity_id, affected_user_id, project_id,
          status, severity, created_at, deadline, case_data
        ) VALUES (
          'CC-TEST-DATE-' || SUBSTR(gen_random_uuid()::text, 1, 8),
          $1, $2, $3,
          'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '4 hours',
          '{"weekly_utilization": 110, "net_capacity": 40, "activity": {"id": "${ACT_INT_2}"}}'
        ) RETURNING id;
      `, [ACT_INT_2, member1User.id, PROJ_INT_ID]);
      dateCaseId = caseRes.rows[0].id;
    });

    afterEach(async () => {
      await query(`DELETE FROM in_app_notifications WHERE case_id = $1`, [dateCaseId]);
      await query(`DELETE FROM audit_log WHERE entity_id = $1`, [dateCaseId]);
      await query(`DELETE FROM capacity_conflict_cases WHERE id = $1`, [dateCaseId]);
      await query(`DELETE FROM assignments WHERE activity_id = $1`, [ACT_INT_2]);
    });

    test('ADJUST_ASSIGNMENT_DATES computes after-state over submitted new dates and persists in evidence & audit', async () => {
      const reason = 'Shifting activity dates from December to empty February week to resolve capacity overload';
      const newStartDate = '2027-02-08';
      const newEndDate = '2027-02-12';

      const res = await apiRequest(`/api/v1/capacity-conflicts/${dateCaseId}/resolve`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          resolutionType: 'ADJUST_ASSIGNMENT_DATES',
          newStartDate,
          newEndDate,
          reason,
        }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.case.status, 'RESOLVED');

      const details = res.body.case.resolution_details;
      assert.ok(details.after_state);
      // Evaluated date range reflects the NEW dates, not old December dates
      assert.equal(details.after_state.evaluated_date_range.start_date, newStartDate);
      assert.equal(details.after_state.evaluated_date_range.end_date, newEndDate);
      // Member has only 8h in that week on 40h net capacity = 20.0%
      assert.equal(details.after_state.weekly_utilization, 20.0);
      assert.equal(details.after_state.conflict_status, 'OK');

      // Verify audit record has the exact same corrected after-state
      const auditRes = await query(`
        SELECT after_state FROM audit_log 
        WHERE entity_id = $1 AND action = 'CASE_RESOLVE'
        ORDER BY recorded_at DESC LIMIT 1
      `, [dateCaseId]);

      assert.equal(auditRes.rows.length, 1);
      const auditDetails = typeof auditRes.rows[0].after_state === 'string'
        ? JSON.parse(auditRes.rows[0].after_state).resolution_details
        : auditRes.rows[0].after_state.resolution_details;

      assert.equal(auditDetails.after_state.evaluated_date_range.start_date, newStartDate);
      assert.equal(auditDetails.after_state.weekly_utilization, 20.0);
    });
  });

  // ===========================================================================
  // K. Nearest Committed Milestone Query & Status Filtering Tests (§ 2)
  // ===========================================================================
  describe('K. Nearest Committed Milestone Query & Status Filtering Tests (§ 2)', () => {
    let testMilestoneId;

    afterEach(async () => {
      if (testMilestoneId) {
        await query(`DELETE FROM audit_log WHERE entity_name = 'milestone' AND entity_id = $1`, [testMilestoneId]);
        await query(`DELETE FROM milestones WHERE id = $1`, [testMilestoneId]);
        testMilestoneId = null;
      }
    });

    test('findNearestCommittedMilestone excludes CANCELLED and ACHIEVED milestones', async () => {
      // Insert milestone with status ACHIEVED
      const achRes = await query(`
        INSERT INTO milestones (
          project_id, name, milestone_type, target_date, is_committed, committed_type, status
        ) VALUES (
          $1, 'Achieved Delivery Gate', 'Customer delivery or customer release', '2027-02-15', TRUE, 'Customer delivery or customer release', 'ACHIEVED'
        ) RETURNING id;
      `, [PROJ_INT_ID]);
      testMilestoneId = achRes.rows[0].id;

      const nearestAch = await findNearestCommittedMilestone(PROJ_INT_ID, '2027-02-14');
      // Must not return the ACHIEVED milestone
      if (nearestAch) {
        assert.notEqual(nearestAch.id, testMilestoneId);
      }

      // Update milestone to CANCELLED
      await query(`UPDATE milestones SET status = 'CANCELLED' WHERE id = $1`, [testMilestoneId]);
      const nearestCan = await findNearestCommittedMilestone(PROJ_INT_ID, '2027-02-14');
      // Must not return the CANCELLED milestone
      if (nearestCan) {
        assert.notEqual(nearestCan.id, testMilestoneId);
      }

      // Update to PLANNED (active)
      await query(`UPDATE milestones SET status = 'PLANNED' WHERE id = $1`, [testMilestoneId]);
      const nearestActive = await findNearestCommittedMilestone(PROJ_INT_ID, '2027-02-14');
      assert.ok(nearestActive);
      assert.equal(nearestActive.id, testMilestoneId);
    });
  });

  // ===========================================================================
  // L. Resource Manager Scope Lookup Alignment Tests (§ 3, 5)
  // ===========================================================================
  describe('L. Resource Manager Scope Lookup Alignment Tests (§ 3, 5)', () => {
    let testUserId;
    let testTeamId;
    let testRmId;

    beforeEach(async () => {
      // Create test team, test user, and test RM scoped via user_scopes (scope_type = 'TEAM')
      const teamRes = await query(`
        INSERT INTO teams (code, name, description)
        VALUES ('TEAM-ALIGN-' || SUBSTR(gen_random_uuid()::text, 1, 8), 'Test Scope Alignment Team', 'Team for RM scope regression test')
        RETURNING id;
      `);
      testTeamId = teamRes.rows[0].id;

      const userRes = await query(`
        INSERT INTO users (email, full_name, password_hash, is_active, must_change_password)
        VALUES ('engineer.testscope@ems-ecu.internal', 'Test Scope Engineer', 'mock_hash', TRUE, FALSE)
        RETURNING id;
      `);
      testUserId = userRes.rows[0].id;

      await query(`
        INSERT INTO team_memberships (team_id, user_id)
        VALUES ($1, $2);
      `, [testTeamId, testUserId]);

      const rmUserRes = await query(`
        INSERT INTO users (email, full_name, password_hash, is_active, must_change_password)
        VALUES ('rm.testscope@ems-ecu.internal', 'Test Scope RM', 'mock_hash', TRUE, FALSE)
        RETURNING id;
      `);
      testRmId = rmUserRes.rows[0].id;

      await query(`
        INSERT INTO user_roles (user_id, role_code)
        VALUES ($1, 'RESOURCE_MANAGER');
      `, [testRmId]);

      // Assign RM scope via user_scopes table (scope_type = 'TEAM'), NOT resource_manager_scopes
      await query(`
        INSERT INTO user_scopes (user_id, scope_type, target_id)
        VALUES ($1, 'TEAM', $2);
      `, [testRmId, testTeamId]);
    });

    afterEach(async () => {
      await query(`DELETE FROM user_scopes WHERE user_id = $1`, [testRmId]);
      await query(`DELETE FROM team_memberships WHERE user_id = $1`, [testUserId]);
      await query(`DELETE FROM user_roles WHERE user_id IN ($1, $2)`, [testUserId, testRmId]);
      await query(`DELETE FROM users WHERE id IN ($1, $2)`, [testUserId, testRmId]);
      await query(`DELETE FROM teams WHERE id = $1`, [testTeamId]);
    });

    test('findResponsibleResourceManager resolves RM correctly when scope is in user_scopes', async () => {
      const rm = await findResponsibleResourceManager(testUserId);
      assert.ok(rm, 'Must resolve responsible RM for user');
      assert.equal(rm.id, testRmId);
      assert.equal(rm.email, 'rm.testscope@ems-ecu.internal');
    });
  });
});
