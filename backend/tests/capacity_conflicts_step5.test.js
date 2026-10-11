import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { query, closePool } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { bootstrapSystemAdmin } from '../src/modules/iam/bootstrap.service.js';
import { createSession } from '../src/modules/iam/session.service.js';
import { calculateWorkingHoursDeadline, getWeeklyBreakdown } from '../src/modules/capacity_scheduling/calendar.service.js';

describe('Step 5: Capacity-Conflict Resolution and Escalation Workflow Test Suite', () => {
  let server;
  let baseUrl;
  let adminUser;
  let pm1User;
  let pm2User;
  let lead1User;
  let member1User;
  let member2User;
  let memberValUser;
  let rmUser;

  const sessions = {};

  const PROJ_INT_ID = '60000000-0000-0000-0000-000000000001'; // EMS-G2-INT (PM: pm1User)
  const PROJ_VAL_ID = '60000000-0000-0000-0000-000000000002'; // EMS-G2-VAL (PM: pm2User)

  const ACT_INT_1 = '70000000-0000-0000-0000-000000000001';
  const ACT_INT_2 = '70000000-0000-0000-0000-000000000002';
  const ACT_INT_3 = '70000000-0000-0000-0000-000000000003';

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
      UPDATE activities SET owner_user_id = '40000000-0000-0000-0000-000000000006' WHERE id = '${ACT_INT_3}';
      UPDATE activities SET owner_user_id = '40000000-0000-0000-0000-000000000003' WHERE id = '${ACT_INT_1}';
      DELETE FROM assignments WHERE activity_id IN ('${ACT_INT_1}', '${ACT_INT_2}', '${ACT_INT_3}');
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
  // 1. Committed Milestones Rules & Immutable Audit (§ 2)
  // ===========================================================================
  describe('1. Committed Milestones Rules & Scoping (§ 2)', () => {
    let testMilestoneId;

    test('Project Manager can create and mark a milestone as Committed for approved category', async () => {
      const res = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/milestones`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          name: 'Customer Integration Delivery Gate',
          milestoneType: 'Customer delivery or customer release',
          targetDate: '2027-01-31',
          isCommitted: true,
          committedType: 'Customer delivery or customer release',
          description: 'Committed customer delivery milestone',
        }
      });

      assert.equal(res.status, 201);
      assert.ok(res.body.milestone);
      assert.equal(res.body.milestone.is_committed, true);
      assert.equal(res.body.milestone.committed_type, 'Customer delivery or customer release');
      testMilestoneId = res.body.milestone.id;
    });

    test('Marking a milestone as Committed is rejected for unapproved categories', async () => {
      const res = await apiRequest(`/api/v1/projects/${PROJ_INT_ID}/milestones`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          name: 'Internal Team Sprint Milestone',
          milestoneType: 'Sprint Demo',
          targetDate: '2027-01-15',
          isCommitted: true,
          committedType: 'Sprint Demo', // Unapproved category
        }
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('only for: Customer delivery'));
    });

    test('Changing committed status requires a reason of at least 10 characters', async () => {
      const res = await apiRequest(`/api/v1/milestones/${testMilestoneId}/committed`, {
        method: 'PATCH',
        sessionKey: 'pm1',
        body: {
          isCommitted: false,
          reason: 'Too short', // < 10 chars
        }
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('at least 10 characters'));
    });

    test('Changing committed status with valid reason succeeds and writes immutable audit entry', async () => {
      const changeReason = 'Customer agreed to relax gate commitment for internal staging';
      const res = await apiRequest(`/api/v1/milestones/${testMilestoneId}/committed`, {
        method: 'PATCH',
        sessionKey: 'pm1',
        body: {
          isCommitted: false,
          reason: changeReason,
        }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.milestone.is_committed, false);

      // Verify audit trail entry was written
      const auditRes = await query(`
        SELECT * FROM audit_log 
        WHERE entity_name = 'milestone' AND entity_id = $1 
        ORDER BY recorded_at DESC LIMIT 1;
      `, [testMilestoneId]);

      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].action, 'STATUS_CHANGE');
      assert.equal(auditRes.rows[0].change_reason, changeReason);
      assert.equal(auditRes.rows[0].actor_id, pm1User.id);
    });

    test('Project Manager cannot modify milestones outside assigned project scope', async () => {
      // pm1 (scoped only to PROJ_INT_ID) attempts to change milestone in PROJ_VAL_ID
      const valMilestones = await query(`SELECT id FROM milestones WHERE project_id = $1 LIMIT 1`, [PROJ_VAL_ID]);
      const valMilestoneId = valMilestones.rows[0].id;

      const res = await apiRequest(`/api/v1/milestones/${valMilestoneId}/committed`, {
        method: 'PATCH',
        sessionKey: 'pm1',
        body: {
          isCommitted: false,
          reason: 'Unauthorized attempt to modify validation milestone',
        }
      });

      assert.equal(res.status, 403);
      assert.ok(res.body.error.message.includes('Unauthorized'));
    });
  });

  // ===========================================================================
  // 2. Conflict Levels, Labels & Overrides (§ 1)
  // ===========================================================================
  describe('2. Conflict Levels, Labels & Overrides (§ 1)', () => {
    test('A 90% utilization warning permits saving without override', async () => {
      // Clean up previous assignments for member1 in week 2026-12-07 to 2026-12-11
      await query(`DELETE FROM assignments WHERE user_id = $1`, [member1User.id]);

      // 36.0h in a 40.0h net capacity week = exactly 90.0% utilization -> Capacity Warning
      const res = await apiRequest(`/api/v1/activities/${ACT_INT_2}/assignments`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: member1User.id,
          startDate: '2026-12-07',
          endDate: '2026-12-11',
          plannedHours: 36.0,
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.conflict_level, 'CAPACITY_WARNING');
      assert.equal(res.body.conflict_label, 'Capacity Warning');
      assert.ok(res.body.assignment.id);
    });

    test('A 100% or greater utilization assignment is blocked without an authorized override', async () => {
      // Attempting to assign 40.01h (or existing 36h + 8h = 44h) exceeds 100%
      const res = await apiRequest(`/api/v1/activities/${ACT_INT_3}/assignments`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: member1User.id,
          startDate: '2026-12-07',
          endDate: '2026-12-11',
          plannedHours: 8.0, // 36h + 8h = 44h (110.0%)
        }
      });

      assert.equal(res.status, 409);
      assert.ok(res.body.error.message.includes('Capacity Conflict') || res.body.error.message.includes('Conflict'));
      assert.ok(res.body.details);
      assert.equal(res.body.details.conflict_label, 'Capacity Conflict');
    });

    test('Saving with an authorized override succeeds and records override evidence & audit entry', async () => {
      const justification = 'Critical OEM customer demonstration scheduled; overtime approved by PM';
      const res = await apiRequest(`/api/v1/activities/${ACT_INT_3}/assignments`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: member1User.id,
          startDate: '2026-12-07',
          endDate: '2026-12-11',
          plannedHours: 8.0,
          override: {
            justification_reason: justification,
          }
        }
      });

      assert.equal(res.status, 201);
      assert.ok(res.body.assignment.id);

      // Verify conflict_overrides record
      const overrideRes = await query(`
        SELECT * FROM conflict_overrides WHERE assignment_id = $1
      `, [res.body.assignment.id]);

      assert.equal(overrideRes.rows.length, 1);
      assert.equal(overrideRes.rows[0].overridden_by_user_id, pm1User.id);
      assert.equal(overrideRes.rows[0].justification_reason, justification);

      // Verify audit log
      const auditRes = await query(`
        SELECT * FROM audit_log WHERE entity_name = 'assignment' AND entity_id = $1
      `, [res.body.assignment.id]);
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].action, 'ASSIGNMENT_CREATE');
    });

    test('Zero net capacity with planned work is a hard conflict (999.99%)', async () => {
      // Record 5 days of approved leave for member2User in week 2026-12-14 to 2026-12-18
      await query(`
        INSERT INTO leave_records (user_id, start_date, end_date, leave_type, status)
        VALUES ($1, '2026-12-14', '2026-12-18', 'ANNUAL', 'APPROVED');
      `, [member2User.id]);

      // Assigning any work in that zero-capacity week must be blocked
      const res = await apiRequest(`/api/v1/activities/${ACT_INT_3}/assignments`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: member2User.id,
          startDate: '2026-12-14',
          endDate: '2026-12-18',
          plannedHours: 8.0,
        }
      });

      assert.equal(res.status, 409);
      assert.ok(res.body.details);
      assert.equal(res.body.details.conflict_label, 'Capacity Conflict');
      assert.equal(res.body.details.workload.peakUtilizationPercent, 999.99);
    });

    test('Cross-project assignments are aggregated into utilization', async () => {
      // Clean memberVal assignments
      await query(`DELETE FROM assignments WHERE user_id = $1`, [memberValUser.id]);

      // 1. Assign 24.0h in Project 2 (Validation) for week 2027-01-04 to 2027-01-08
      const valActRes = await query(`SELECT id FROM activities WHERE project_id = $1 LIMIT 1`, [PROJ_VAL_ID]);
      const valActId = valActRes.rows[0].id;

      await apiRequest(`/api/v1/activities/${valActId}/assignments`, {
        method: 'POST',
        sessionKey: 'pm2',
        body: {
          userId: memberValUser.id,
          startDate: '2027-01-04',
          endDate: '2027-01-08',
          plannedHours: 24.0,
        }
      });

      // 2. Pre-evaluate adding 20.0h in Project 1 (Integration) for the same week
      const evalRes = await apiRequest('/api/v1/capacity/evaluate', {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: memberValUser.id,
          startDate: '2027-01-04',
          endDate: '2027-01-08',
          plannedHours: 20.0, // 24h + 20h = 44h (110.0%)
        }
      });

      assert.equal(evalRes.status, 200);
      assert.equal(evalRes.body.conflict_level, 'CAPACITY_CONFLICT');
      assert.equal(evalRes.body.conflict_label, 'Capacity Conflict');
      assert.equal(evalRes.body.workload.peakUtilizationPercent, 110.0);
      assert.ok(evalRes.body.workload.conflictingAssignments.length >= 1);
      assert.equal(evalRes.body.workload.conflictingAssignments[0].project_code, 'EMS-G2-VAL');
    });
  });

  // ===========================================================================
  // 3. Critical Conflict & Resolution Case Creation (§ 1, 3, 6)
  // ===========================================================================
  describe('3. Critical — Delivery-at-Risk Conflict & Resolution Case Creation (§ 1, 3, 6)', () => {
    let criticalCaseId;
    let criticalCaseData;

    test('A critical conflict creates a resolution case immediately with a four-working-hour deadline', async () => {
      // Activity due date 2027-01-31 threatens committed milestone M1 (target 2027-01-31)
      // Assigning 48h (overload) creates Critical — Delivery-at-Risk Conflict
      const res = await apiRequest(`/api/v1/activities/${ACT_INT_1}/assignments`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: member1User.id,
          startDate: '2027-01-25',
          endDate: '2027-01-29',
          plannedHours: 48.0, // 48h in 40h week = 120% overload, threatening milestone due 2027-01-31
        }
      });

      assert.equal(res.status, 409);
      assert.ok(res.body.details);
      assert.equal(res.body.details.conflict_level, 'CRITICAL_DELIVERY_AT_RISK');
      assert.equal(res.body.details.conflict_label, 'Critical — Delivery-at-Risk Conflict');

      const conflictCase = res.body.details.case;
      assert.ok(conflictCase, 'Case must be created immediately');
      assert.equal(conflictCase.status, 'RESOURCE_RESOLUTION_REQUIRED');
      assert.equal(conflictCase.severity, 'CRITICAL_DELIVERY_AT_RISK');

      criticalCaseId = conflictCase.id;
      criticalCaseData = conflictCase.case_data;

      // Verify the 4-working-hour deadline calculation
      const createdAt = new Date(conflictCase.created_at);
      const expectedDeadline = calculateWorkingHoursDeadline(createdAt, 4.0);
      const actualDeadline = new Date(conflictCase.deadline);
      assert.equal(actualDeadline.toISOString(), expectedDeadline.toISOString());

      // Verify notification created for PM and RM
      const notifRes = await query(`
        SELECT * FROM in_app_notifications WHERE case_id = $1
      `, [criticalCaseId]);
      assert.ok(notifRes.rows.length >= 1, 'In-app notifications must be created');
    });

    test('Resolution case contains all Section 3 mandatory snapshot fields', async () => {
      const res = await apiRequest(`/api/v1/capacity-conflicts/${criticalCaseId}`, {
        sessionKey: 'pm1'
      });

      assert.equal(res.status, 200);
      const c = res.body.case;
      const data = c.case_data;

      assert.ok(data.conflict_id);
      assert.ok(data.creation_timestamp);
      assert.equal(data.current_status, 'RESOURCE_RESOLUTION_REQUIRED');
      assert.equal(data.status_label, 'Resource Resolution Required');
      assert.equal(data.severity, 'CRITICAL_DELIVERY_AT_RISK');
      assert.ok(data.deadline);

      // Affected engineer
      assert.ok(data.affected_engineer.id);
      assert.ok(data.affected_engineer.full_name);
      assert.ok(data.weekly_utilization > 100.0);
      assert.ok(data.overload_hours > 0);
      assert.ok(data.affected_dates.week_start);
      assert.ok(data.affected_dates.week_end);

      // Activity details
      assert.ok(data.activity.id);
      assert.ok(data.activity.title);
      assert.ok(data.activity.project_id);
      assert.ok(data.activity.planned_dates.start_date);
      assert.ok(data.activity.due_date);

      // Nearest committed milestone & delivery impact statement
      assert.ok(data.nearest_committed_milestone);
      assert.ok(data.delivery_impact_statement);

      // Responsible PM and RM
      assert.ok(data.project_manager);
    });
  });

  // ===========================================================================
  // 4. Resolution Order & Candidate Filtering (§ 4)
  // ===========================================================================
  describe('4. Resolution Order & Candidate Filtering (§ 4)', () => {
    let caseId;

    before(async () => {
      // Retrieve the created critical case
      const caseRes = await query(`
        SELECT id FROM capacity_conflict_cases 
        WHERE status = 'RESOURCE_RESOLUTION_REQUIRED' 
        ORDER BY created_at DESC LIMIT 1
      `);
      caseId = caseRes.rows[0].id;
    });

    test('Presents options in exact approved order (Reassign, Adjust Dates, Scope, Priority, Override)', async () => {
      const res = await apiRequest(`/api/v1/capacity-conflicts/${caseId}/options`, {
        sessionKey: 'pm1'
      });

      assert.equal(res.status, 200);
      const options = res.body.options;
      assert.equal(options.length, 5);

      assert.equal(options[0].type, 'REASSIGN_WORK');
      assert.equal(options[0].is_preferred, true);

      assert.equal(options[1].type, 'ADJUST_ASSIGNMENT_DATES');
      assert.equal(options[2].type, 'REDUCE_OR_SPLIT_SCOPE');
      assert.equal(options[3].type, 'CHANGE_PRIORITY');
      assert.equal(options[4].type, 'AUTHORIZE_OVERRIDE');
    });

    test('No candidate is shown for reassignment if their resulting utilization would reach or exceed 100%', async () => {
      // Deactivate existing assignment on ACT_INT_3 and assign member2 with 40h in the target week
      await query(`UPDATE assignments SET status = 'CANCELLED' WHERE activity_id = '70000000-0000-0000-0000-000000000003'`);
      await query(`
        INSERT INTO assignments (activity_id, user_id, start_date, end_date, planned_hours, status)
        VALUES ('70000000-0000-0000-0000-000000000003', $1, '2027-01-25', '2027-01-29', 40.0, 'ACTIVE')
      `, [member2User.id]);

      const res = await apiRequest(`/api/v1/capacity-conflicts/${caseId}/options`, {
        sessionKey: 'pm1'
      });

      assert.equal(res.status, 200);
      const reassignOpt = res.body.options.find(o => o.type === 'REASSIGN_WORK');
      assert.ok(reassignOpt);

      // member2 is already at 100% capacity; reassignment would exceed 100% -> must NOT be shown
      const candidateUserIds = reassignOpt.candidates.map(c => c.user_id);
      assert.ok(!candidateUserIds.includes(member2User.id), 'Candidate with >= 100% resulting capacity must be excluded');

      // Clean up test assignment
      await query(`DELETE FROM assignments WHERE user_id = $1 AND start_date = '2027-01-25'`, [member2User.id]);
    });
  });

  // ===========================================================================
  // 5. Responsibilities and Permissions (§ 5)
  // ===========================================================================
  describe('5. Responsibilities and Permissions (§ 5)', () => {
    let caseId;

    before(async () => {
      const caseRes = await query(`
        SELECT id FROM capacity_conflict_cases 
        WHERE status = 'RESOURCE_RESOLUTION_REQUIRED' 
        ORDER BY created_at DESC LIMIT 1
      `);
      caseId = caseRes.rows[0].id;
    });

    test('Resource Manager can view options but cannot assign work or approve an override', async () => {
      // 1. RM can view options
      const optRes = await apiRequest(`/api/v1/capacity-conflicts/${caseId}/options`, {
        sessionKey: 'rm'
      });
      assert.equal(optRes.status, 200);

      // 2. RM cannot assign activities
      const assignRes = await apiRequest(`/api/v1/activities/${ACT_INT_1}/assignments`, {
        method: 'POST',
        sessionKey: 'rm',
        body: {
          userId: member1User.id,
          startDate: '2027-02-01',
          endDate: '2027-02-05',
          plannedHours: 20.0,
        }
      });
      assert.equal(assignRes.status, 403);
      assert.ok(assignRes.body.error.message.includes('Resource Manager cannot directly assign activities'));

      // 3. RM cannot resolve with override
      const resolveRes = await apiRequest(`/api/v1/capacity-conflicts/${caseId}/resolve`, {
        method: 'POST',
        sessionKey: 'rm',
        body: {
          resolutionType: 'AUTHORIZE_OVERRIDE',
          reason: 'RM attempting unauthorized override of critical conflict',
        }
      });
      assert.equal(resolveRes.status, 403);
      assert.ok(resolveRes.body.error.message.includes('Resource Manager cannot directly assign activities or approve an override'));
    });

    test('Project Manager can resolve cases only within assigned projects', async () => {
      // pm2 is scoped to PROJ_VAL_ID, attempting to resolve case in PROJ_INT_ID
      const res = await apiRequest(`/api/v1/capacity-conflicts/${caseId}/resolve`, {
        method: 'POST',
        sessionKey: 'pm2',
        body: {
          resolutionType: 'CHANGE_PRIORITY',
          newPriorityId: '25000000-0000-0000-0000-000000000002',
          reason: 'Attempting to resolve case for a project outside assigned scope',
        }
      });

      assert.equal(res.status, 403);
      assert.ok(res.body.error.message.includes('Project Manager can resolve cases only within their assigned projects'));
    });
  });

  // ===========================================================================
  // 6. Escalation Timing (§ 6)
  // ===========================================================================
  describe('6. Escalation Timing (§ 6)', () => {
    test('An overdue unresolved critical case automatically escalates', async () => {
      // Create a test case and artificially set its deadline to the past
      const actRes = await query(`SELECT id FROM activities WHERE project_id = $1 LIMIT 1`, [PROJ_INT_ID]);
      const actId = actRes.rows[0].id;

      const caseRes = await query(`
        INSERT INTO capacity_conflict_cases (
          case_code, activity_id, affected_user_id, project_id,
          status, severity, created_at, deadline, case_data
        ) VALUES (
          'CC-TEST-OVERDUE-' || SUBSTR(gen_random_uuid()::text, 1, 8), $1, $2, $3,
          'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK',
          CURRENT_TIMESTAMP - INTERVAL '5 hours',
          CURRENT_TIMESTAMP - INTERVAL '1 hour',
          '{"test": true}'
        ) RETURNING id;
      `, [actId, member1User.id, PROJ_INT_ID]);
      const overdueCaseId = caseRes.rows[0].id;

      // Trigger escalation check
      const checkRes = await apiRequest('/api/v1/capacity-conflicts/check-escalations', {
        method: 'POST',
        sessionKey: 'admin',
      });

      assert.equal(checkRes.status, 200);
      assert.ok(checkRes.body.escalated_count >= 1);

      // Verify case status transitioned to ESCALATED
      const updatedRes = await query(`
        SELECT status, escalated_at FROM capacity_conflict_cases WHERE id = $1
      `, [overdueCaseId]);
      assert.equal(updatedRes.rows[0].status, 'ESCALATED');
      assert.ok(updatedRes.rows[0].escalated_at);

      // Verify audit trail entry was recorded
      const auditRes = await query(`
        SELECT * FROM audit_log WHERE entity_id = $1 AND action = 'CASE_ESCALATE'
      `, [overdueCaseId]);
      assert.equal(auditRes.rows.length, 1);
    });
  });

  // ===========================================================================
  // 7. Accepted Resolution Evidence & Atomic Updates (§ 7 & 8)
  // ===========================================================================
  describe('7. Accepted Resolution Evidence & Atomic Updates (§ 7 & 8)', () => {
    let caseToResolveId;

    beforeEach(async () => {
      // Clean up any transient test leaves or assignments for candidate member2
      await query(`DELETE FROM leave_records WHERE user_id = $1`, [member2User.id]);
      await query(`DELETE FROM assignments WHERE user_id = $1`, [member2User.id]);

      const caseRes = await query(`
        INSERT INTO capacity_conflict_cases (
          case_code, activity_id, affected_user_id, project_id,
          status, severity, created_at, deadline, case_data
        ) VALUES (
          'CC-RESOLVE-' || SUBSTR(gen_random_uuid()::text, 1, 8),
          '${ACT_INT_1}', '${member1User.id}', '${PROJ_INT_ID}',
          'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP + INTERVAL '4 hours',
          '{"weekly_utilization": 120, "net_capacity": 40, "overload_hours": 8}'
        ) RETURNING id;
      `);
      caseToResolveId = caseRes.rows[0].id;
    });

    test('Case cannot be closed as Resolved by acknowledgement alone or without >= 10 chars reason', async () => {
      // 1. Without reason
      const resNoReason = await apiRequest(`/api/v1/capacity-conflicts/${caseToResolveId}/resolve`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          resolutionType: 'REDUCE_OR_SPLIT_SCOPE',
          newPlannedHours: 30.0,
          reason: 'Ack', // < 10 chars
        }
      });
      assert.equal(resNoReason.status, 400);
      assert.ok(resNoReason.body.error.message.includes('at least 10 characters'));

      // 2. Unknown resolution type
      const resBadType = await apiRequest(`/api/v1/capacity-conflicts/${caseToResolveId}/resolve`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          resolutionType: 'ACKNOWLEDGE_ONLY',
          reason: 'We acknowledge this conflict and will look into it later',
        }
      });
      assert.equal(resBadType.status, 400);
    });

    test('Resolving via Reassignment records old/new assignee, utilization, reason, and updates activity atomically', async () => {
      const reason = 'Reassigned base software task to integration engineer 2 to relieve engineer 1 overload';
      const res = await apiRequest(`/api/v1/capacity-conflicts/${caseToResolveId}/resolve`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          resolutionType: 'REASSIGN_WORK',
          newAssigneeUserId: member2User.id,
          reason,
        }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.case.status, 'RESOLVED');
      assert.equal(res.body.case.resolution_type, 'REASSIGN_WORK');

      // Verify resolution details stored
      const details = res.body.case.resolution_details;
      assert.equal(details.named_decision_maker.email, pm1User.email);
      assert.equal(details.reason, reason);
      assert.equal(details.resulting_field_changes.new_assignee_id, member2User.id);
      assert.ok(details.after_state);

      // Verify atomic activity owner update
      const actRes = await query(`SELECT owner_user_id FROM activities WHERE id = $1`, [ACT_INT_1]);
      assert.equal(actRes.rows[0].owner_user_id, member2User.id);

      // Verify immutable audit log entry linked to case
      const auditRes = await query(`
        SELECT * FROM audit_log WHERE entity_id = $1 AND action = 'CASE_RESOLVE'
      `, [caseToResolveId]);
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].actor_id, pm1User.id);
      assert.equal(auditRes.rows[0].change_reason, reason);
    });

    test('If no workable resolution exists, case escalates, not resolved', async () => {
      const escalationReason = 'No viable candidate or schedule flexibility available; escalates to Delivery Authority';
      const res = await apiRequest(`/api/v1/capacity-conflicts/${caseToResolveId}/escalate`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          reason: escalationReason,
        }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.case.status, 'ESCALATED');

      const auditRes = await query(`
        SELECT * FROM audit_log WHERE entity_id = $1 AND action = 'CASE_ESCALATE'
      `, [caseToResolveId]);
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].change_reason, escalationReason);
    });
  });

  // ===========================================================================
  // 8. No Automated Date Movement (§ 4, 9)
  // ===========================================================================
  describe('8. No Automated Date Movement (§ 4, 9)', () => {
    test('No automated date movement occurs during conflict creation or escalation', async () => {
      const actBefore = await query(`
        SELECT start_date, due_date FROM activities WHERE id = $1
      `, [ACT_INT_2]);
      const originalStart = actBefore.rows[0].start_date;
      const originalDue = actBefore.rows[0].due_date;

      // Trigger conflict check & evaluate capacity
      await apiRequest('/api/v1/capacity/evaluate', {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: member1User.id,
          activityId: ACT_INT_2,
          startDate: '2026-12-01',
          endDate: '2026-12-15',
          plannedHours: 80.0,
        }
      });

      // Verify activity dates were NEVER moved automatically
      const actAfter = await query(`
        SELECT start_date, due_date FROM activities WHERE id = $1
      `, [ACT_INT_2]);

      assert.equal(actAfter.rows[0].start_date.toISOString(), originalStart.toISOString());
      assert.equal(actAfter.rows[0].due_date.toISOString(), originalDue.toISOString());
    });
  });
});
