/**
 * Calendar Exceptions Capacity Evaluation & Effort Distribution Test Suite
 *
 * Covers required test cases:
 * A. One weekday exception: 40 gross, 8 unavailable, 32 net.
 * B. Approved leave plus exception on the same date: deduct once.
 * C. Overlapping approved leave/duplicate exceptions: deduct once.
 * D. Weekend exceptions: no capacity effect.
 * E. 10% buffer after one exception: 28.8 net.
 * F. Full-week exceptions: zero net capacity.
 * G. Positive load with zero net capacity: existing hard-conflict behavior.
 * H. 36 planned hours against 32 net: blocked through the real assignment validation path.
 * I. Exactly 100% utilization remains blocked under existing policy.
 * J. Exception dates excluded from distribution without losing planned hours.
 * K. No valid assignment days: safe failure/conflict, no division by zero.
 * L. Exceptions outside the interval and another member's exceptions have no effect.
 * M. Pending leave warning preserved without capacity deduction.
 * N. No exception reason/identifier leakage in HTTP responses.
 * O. Existing evaluation/assignment authorization and override behavior retained.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { query, closePool } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { bootstrapSystemAdmin } from '../src/modules/iam/bootstrap.service.js';
import { createSession } from '../src/modules/iam/session.service.js';
import { createApp } from '../src/app.js';
import {
  evaluateUserWorkload,
  saveAssignmentWithCapacityValidation,
} from '../src/modules/capacity_scheduling/capacity.service.js';

describe('Calendar Exceptions in Capacity Evaluation Suite', () => {
  let server;
  let baseUrl;

  let adminUser;
  let pm1User;
  let pm2User;
  let member1User;
  let member2User;
  let memberValUser;
  let rmUser;

  let member1Record;
  let member2Record;

  const sessions = {};

  const PROJ_INT_ID = '60000000-0000-0000-0000-000000000001'; // EMS-G2-INT
  const ACT_INT_1 = '70000000-0000-0000-0000-000000000001';
  const ACT_INT_2 = '70000000-0000-0000-0000-000000000002';
  const TEAM_INT_ID = '50000000-0000-0000-0000-000000000001';

  before(async () => {
    // Safety check: ensure tests run ONLY on test database
    const dbCheck = await query('SELECT current_database()');
    const dbName = dbCheck.rows[0].current_database;
    assert.ok(
      dbName.includes('test'),
      `Safety assertion failed: tests must run against a test database (current: ${dbName})`
    );

    await runMigrations();
    await bootstrapSystemAdmin();

    const usersRes = await query('SELECT id, email, is_active FROM users ORDER BY email ASC');
    const userMap = new Map(usersRes.rows.map(u => [u.email, u]));

    adminUser = userMap.get('admin.pilot@ems-ecu.internal') || usersRes.rows.find(u => u.email.includes('admin'));
    pm1User = userMap.get('pm.integration@example.test');
    pm2User = userMap.get('pm.validation@example.test');
    member1User = userMap.get('engineer.integration1@example.test');
    member2User = userMap.get('engineer.integration2@example.test');
    memberValUser = userMap.get('engineer.validation1@example.test');
    rmUser = userMap.get('resource.manager@example.test');

    // Ensure member records exist in members table
    const m1Res = await query(`
      INSERT INTO members (id, team_id, user_id, employee_id, first_name, last_name, email, non_project_buffer_percent)
      VALUES ('30000000-0000-0000-0000-000000000005', $1, $2, 'EMP-INT-001', 'Integration', 'Engineer 1', $3, 0.00)
      ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id, non_project_buffer_percent = 0.00
      RETURNING *;
    `, [TEAM_INT_ID, member1User.id, member1User.email]);
    member1Record = m1Res.rows[0];

    const m2Res = await query(`
      INSERT INTO members (id, team_id, user_id, employee_id, first_name, last_name, email, non_project_buffer_percent)
      VALUES ('30000000-0000-0000-0000-000000000006', $1, $2, 'EMP-INT-002', 'Integration', 'Engineer 2', $3, 0.00)
      ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id, non_project_buffer_percent = 0.00
      RETURNING *;
    `, [TEAM_INT_ID, member2User.id, member2User.email]);
    member2Record = m2Res.rows[0];

    // Ensure users have must_change_password = FALSE for session auth
    await query("UPDATE users SET must_change_password = FALSE");

    const usersToSession = [
      ['admin', adminUser],
      ['pm1', pm1User],
      ['pm2', pm2User],
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
    await query(`DELETE FROM member_calendar_exceptions;`);
    await query(`DELETE FROM assignments WHERE activity_id IN ('${ACT_INT_1}', '${ACT_INT_2}');`);
    await query(`DELETE FROM leave_records WHERE start_date >= '2026-10-01';`);
    await closePool();
  });

  beforeEach(async () => {
    // Reset test exceptions, leaves, assignments, and buffer
    await query(`DELETE FROM member_calendar_exceptions;`);
    await query(`DELETE FROM leave_records WHERE start_date >= '2026-10-01';`);
    await query(`DELETE FROM assignments WHERE activity_id IN ('${ACT_INT_1}', '${ACT_INT_2}');`);
    await query(`UPDATE members SET non_project_buffer_percent = 0.00 WHERE id = $1`, [member1Record.id]);
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

      const req = http.request(url, {
        method,
        headers: reqHeaders,
      }, (res) => {
        let resBody = '';
        res.on('data', chunk => resBody += chunk);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(resBody); } catch (_) {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: resBody,
            json,
          });
        });
      });

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  // A. One weekday exception: 40 gross, 8 unavailable, 32 net
  test('TC-A: One weekday exception produces 40 gross, 8 unavailable, 32 net capacity', async () => {
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES ($1, '2026-11-11', 'TC-A Plant Maintenance')
    `, [member1Record.id]);

    const res = await evaluateUserWorkload({
      userId: member1User.id,
      startDate: '2026-11-09',
      endDate: '2026-11-13',
      proposedPlannedHours: 0,
    });

    assert.equal(res.weeks.length, 1);
    const week = res.weeks[0];
    assert.equal(week.workingDays, 5);
    assert.equal(week.grossCapacityHours, 40.0);
    assert.equal(week.leaveHours, 0.0, 'leaveHours must strictly report leave, not exception hours');
    assert.equal(week.netCapacityHours, 32.0);
    assert.equal(week.totalPlannedHours, 0.0);
  });

  // B. Approved leave plus exception on the same date: deduct once
  test('TC-B: Approved leave plus exception on same date deducts only once (32 net)', async () => {
    // Approved leave on Wednesday 2026-11-11
    await query(`
      INSERT INTO leave_records (id, member_id, user_id, start_date, end_date, leave_type, leave_reason, status)
      VALUES (gen_random_uuid(), $1, $2, '2026-11-11', '2026-11-11', 'ANNUAL', 'Medical', 'APPROVED')
    `, [member1Record.id, member1User.id]);

    // Calendar exception on same Wednesday 2026-11-11
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES ($1, '2026-11-11', 'TC-B Training')
    `, [member1Record.id]);

    const res = await evaluateUserWorkload({
      userId: member1User.id,
      startDate: '2026-11-09',
      endDate: '2026-11-13',
      proposedPlannedHours: 0,
    });

    const week = res.weeks[0];
    assert.equal(week.grossCapacityHours, 40.0);
    assert.equal(week.leaveHours, 8.0, 'leaveHours reflects approved leave');
    assert.equal(week.netCapacityHours, 32.0, 'Net capacity must deduct 8 hours once, not 16 hours');
  });

  // C. Overlapping approved leave/duplicate exceptions: deduct once
  test('TC-C: Overlapping approved leave and duplicate exceptions deduplicate without double-deduction', async () => {
    // Approved leave spanning Wed 2026-11-11 to Thu 2026-11-12 (2 days = 16h)
    await query(`
      INSERT INTO leave_records (id, member_id, user_id, start_date, end_date, leave_type, leave_reason, status)
      VALUES (gen_random_uuid(), $1, $2, '2026-11-11', '2026-11-12', 'ANNUAL', 'Conference', 'APPROVED')
    `, [member1Record.id, member1User.id]);

    // Duplicate exception on Wed 2026-11-11
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES ($1, '2026-11-11', 'TC-C Duplicate 1')
    `, [member1Record.id]);

    // Another exception on Wed 2026-11-11
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES ($1, '2026-11-11', 'TC-C Duplicate 2')
    `, [member1Record.id]);

    // Exception on Thu 2026-11-12
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES ($1, '2026-11-12', 'TC-C Overlapping Thursday')
    `, [member1Record.id]);

    const res = await evaluateUserWorkload({
      userId: member1User.id,
      startDate: '2026-11-09',
      endDate: '2026-11-13',
      proposedPlannedHours: 0,
    });

    const week = res.weeks[0];
    assert.equal(week.grossCapacityHours, 40.0);
    // 2 distinct unavailable weekdays (Wed, Thu) = 16h unavailable -> 24h net
    assert.equal(week.netCapacityHours, 24.0, 'Must deduct exactly 2 days (16h), yielding 24h net capacity');
  });

  // D. Weekend exceptions: no capacity effect
  test('TC-D: Weekend exceptions have no capacity deduction under Mon-Fri calendar', async () => {
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES 
        ($1, '2026-11-14', 'TC-D Saturday Exception'),
        ($1, '2026-11-15', 'TC-D Sunday Exception')
    `, [member1Record.id]);

    const res = await evaluateUserWorkload({
      userId: member1User.id,
      startDate: '2026-11-09',
      endDate: '2026-11-15',
      proposedPlannedHours: 0,
    });

    const week = res.weeks[0];
    assert.equal(week.grossCapacityHours, 40.0);
    assert.equal(week.netCapacityHours, 40.0, 'Weekend exceptions must not reduce Monday-Friday capacity');
  });

  // E. 10% buffer after one exception: 28.8 net
  test('TC-E: 10% buffer is applied after deducting unavailable hours, producing 28.8 net', async () => {
    await query(`UPDATE members SET non_project_buffer_percent = 10.00 WHERE id = $1`, [member1Record.id]);

    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES ($1, '2026-11-11', 'TC-E Single Exception')
    `, [member1Record.id]);

    const res = await evaluateUserWorkload({
      userId: member1User.id,
      startDate: '2026-11-09',
      endDate: '2026-11-13',
      proposedPlannedHours: 0,
    });

    const week = res.weeks[0];
    assert.equal(week.grossCapacityHours, 40.0);
    // Available = 40 - 8 = 32. Net = round(32 * (1 - 0.10), 2) = 28.8
    assert.equal(week.netCapacityHours, 28.8, 'Buffer ordering must be: (40 - 8) * 0.9 = 28.8');
  });

  // F. Full-week exceptions: zero net capacity
  test('TC-F: Full-week exceptions produce exactly zero net capacity', async () => {
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES 
        ($1, '2026-11-09', 'TC-F Mon'),
        ($1, '2026-11-10', 'TC-F Tue'),
        ($1, '2026-11-11', 'TC-F Wed'),
        ($1, '2026-11-12', 'TC-F Thu'),
        ($1, '2026-11-13', 'TC-F Fri')
    `, [member1Record.id]);

    const res = await evaluateUserWorkload({
      userId: member1User.id,
      startDate: '2026-11-09',
      endDate: '2026-11-13',
      proposedPlannedHours: 0,
    });

    const week = res.weeks[0];
    assert.equal(week.grossCapacityHours, 40.0);
    assert.equal(week.netCapacityHours, 0.0);
  });

  // G. Positive load with zero net capacity: existing hard-conflict behavior
  test('TC-G: Positive load with zero net capacity triggers existing hard-conflict behavior', async () => {
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES 
        ($1, '2026-11-09', 'TC-G Mon'),
        ($1, '2026-11-10', 'TC-G Tue'),
        ($1, '2026-11-11', 'TC-G Wed'),
        ($1, '2026-11-12', 'TC-G Thu'),
        ($1, '2026-11-13', 'TC-G Fri')
    `, [member1Record.id]);

    const res = await evaluateUserWorkload({
      userId: member1User.id,
      startDate: '2026-11-09',
      endDate: '2026-11-13',
      proposedPlannedHours: 10.0,
    });

    assert.equal(res.conflictStatus, 'CAPACITY_CONFLICT');
    assert.equal(res.peakUtilizationPercent, 999.99, 'Zero capacity with load uses 999.99 sentinel');
    assert.equal(res.weeks[0].status, 'CAPACITY_CONFLICT');
  });

  // H. 36 planned hours against 32 net: blocked through real assignment validation path
  test('TC-H: 36 planned hours against 32 net capacity is blocked at service and HTTP levels', async () => {
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES ($1, '2026-11-11', 'TC-H Exception')
    `, [member1Record.id]);

    // 1. Service-level check: domain error thrown
    await assert.rejects(
      async () => {
        await saveAssignmentWithCapacityValidation({
          activityId: ACT_INT_1,
          userId: member1User.id,
          startDate: '2026-11-09',
          endDate: '2026-11-13',
          plannedHours: 36.0,
          currentUser: pm1User,
        });
      },
      (err) => {
        assert.equal(err.code, 'CAPACITY_HARD_CONFLICT');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );

    // 2. HTTP-level check: status 409 returned
    const httpRes = await apiRequest(`/api/v1/activities/${ACT_INT_1}/assignments`, {
      method: 'POST',
      sessionKey: 'pm1',
      body: {
        userId: member1User.id,
        startDate: '2026-11-09',
        endDate: '2026-11-13',
        plannedHours: 36.0,
      },
    });

    assert.equal(httpRes.status, 409);
    assert.equal(httpRes.json.error.code, 'CAPACITY_HARD_CONFLICT');
  });

  // I. Exactly 100% utilization remains blocked under existing policy
  test('TC-I: Exactly 100% utilization (32 planned against 32 net) remains blocked under policy', async () => {
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES ($1, '2026-11-11', 'TC-I Exception')
    `, [member1Record.id]);

    // 32 net capacity, 32 planned hours = 100.0% utilization -> blocked
    await assert.rejects(
      async () => {
        await saveAssignmentWithCapacityValidation({
          activityId: ACT_INT_1,
          userId: member1User.id,
          startDate: '2026-11-09',
          endDate: '2026-11-13',
          plannedHours: 32.0,
          currentUser: pm1User,
        });
      },
      (err) => {
        assert.equal(err.code, 'CAPACITY_HARD_CONFLICT');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
  });

  // J. Exception dates excluded from distribution without losing planned hours
  test('TC-J: Exception dates excluded from assignment distribution without dropping planned hours', async () => {
    // 2 weeks: Mon 2026-11-09 to Fri 2026-11-20 (10 gross weekdays)
    // Week 1 has 1 exception on Wed 2026-11-11 -> Week 1 has 4 valid days
    // Week 2 has 0 exceptions -> Week 2 has 5 valid days
    // Total valid days = 9 days
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES ($1, '2026-11-11', 'TC-J Wednesday Exception')
    `, [member1Record.id]);

    const res = await evaluateUserWorkload({
      userId: member1User.id,
      startDate: '2026-11-09',
      endDate: '2026-11-20',
      proposedPlannedHours: 36.0,
    });

    assert.equal(res.weeks.length, 2);
    const week1 = res.weeks[0];
    const week2 = res.weeks[1];

    // Week 1 allocation: (4 / 9) * 36.0 = 16.0h
    assert.equal(week1.proposedHours, 16.0);
    assert.equal(week1.netCapacityHours, 32.0);
    assert.equal(week1.utilizationPercent, 50.0);

    // Week 2 allocation: (5 / 9) * 36.0 = 20.0h
    assert.equal(week2.proposedHours, 20.0);
    assert.equal(week2.netCapacityHours, 40.0);
    assert.equal(week2.utilizationPercent, 50.0);

    // Total planned hours preserved: 16.0 + 20.0 = 36.0
    const totalAllocated = week1.proposedHours + week2.proposedHours;
    assert.equal(totalAllocated, 36.0, 'No planned hours dropped');
  });

  // K. No valid assignment days: safe failure/conflict, no division by zero
  test('TC-K: Assignment interval with zero valid working days handles conflict safely without NaN', async () => {
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES 
        ($1, '2026-11-09', 'TC-K Mon'),
        ($1, '2026-11-10', 'TC-K Tue'),
        ($1, '2026-11-11', 'TC-K Wed'),
        ($1, '2026-11-12', 'TC-K Thu'),
        ($1, '2026-11-13', 'TC-K Fri')
    `, [member1Record.id]);

    const res = await evaluateUserWorkload({
      userId: member1User.id,
      startDate: '2026-11-09',
      endDate: '2026-11-13',
      proposedPlannedHours: 8.0,
    });

    assert.equal(res.conflictStatus, 'CAPACITY_CONFLICT');
    assert.equal(Number.isNaN(res.peakUtilizationPercent), false, 'Must not be NaN');
    assert.equal(Number.isFinite(res.peakUtilizationPercent), true, 'Must be finite sentinel');
    assert.equal(res.peakUtilizationPercent, 999.99);
    const week = res.weeks[0];
    assert.equal(Number.isNaN(week.utilizationPercent), false, 'Week utilization must not be NaN');
    assert.equal(week.proposedHours, 8.0, 'Load safely retained in evaluated week');
  });

  // L. Exceptions outside interval and another member exceptions have no effect
  test('TC-L: Out-of-interval and other-member exceptions do not alter evaluated member capacity', async () => {
    // Member 1 exception in December (outside evaluated interval)
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES ($1, '2026-12-15', 'TC-L Future Exception')
    `, [member1Record.id]);

    // Member 2 exception on 2026-11-11
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES ($1, '2026-11-11', 'TC-L Member 2 Exception')
    `, [member2Record.id]);

    const res = await evaluateUserWorkload({
      userId: member1User.id,
      startDate: '2026-11-09',
      endDate: '2026-11-13',
      proposedPlannedHours: 0,
    });

    const week = res.weeks[0];
    assert.equal(week.grossCapacityHours, 40.0);
    assert.equal(week.netCapacityHours, 40.0, 'Member 1 capacity unaffected by Member 2 or outside exceptions');
  });

  // M. Pending leave warning preserved without capacity deduction
  test('TC-M: Pending leave warning is preserved without deducting capacity', async () => {
    await query(`
      INSERT INTO leave_records (id, member_id, user_id, start_date, end_date, leave_type, leave_reason, status)
      VALUES (gen_random_uuid(), $1, $2, '2026-11-11', '2026-11-11', 'ANNUAL', 'Pending Doctor', 'PENDING')
    `, [member1Record.id, member1User.id]);

    const res = await evaluateUserWorkload({
      userId: member1User.id,
      startDate: '2026-11-09',
      endDate: '2026-11-13',
      proposedPlannedHours: 10.0,
    });

    const week = res.weeks[0];
    assert.equal(week.netCapacityHours, 40.0, 'Pending leave must not deduct net capacity');
    assert.equal(res.hasPendingLeaveWarning, true, 'Soft warning for pending leave overlap preserved');
  });

  // N. No exception reason/identifier leakage in HTTP responses
  test('TC-N: Capacity evaluation HTTP response does not leak exception reasons, IDs, or raw records', async () => {
    const SECRET_REASON = 'CONFIDENTIAL_MEDICAL_TREATMENT_XYZ_987';
    await query(`
      INSERT INTO member_calendar_exceptions (id, member_id, exception_date, reason)
      VALUES ('77777777-7777-7777-7777-777777777777', $1, '2026-11-11', $2)
    `, [member1Record.id, SECRET_REASON]);

    const res = await apiRequest('/api/v1/capacity/evaluate', {
      method: 'POST',
      sessionKey: 'pm1',
      body: {
        userId: member1User.id,
        startDate: '2026-11-09',
        endDate: '2026-11-13',
        plannedHours: 0,
      },
    });

    assert.equal(res.status, 200);
    const bodyStr = res.body;

    // Strict privacy assertions
    assert.equal(bodyStr.includes(SECRET_REASON), false, 'Exception reason must never leak into response');
    assert.equal(bodyStr.includes('77777777-7777-7777-7777-777777777777'), false, 'Exception ID must not leak');
    assert.equal(bodyStr.includes('member_calendar_exceptions'), false, 'Table name must not leak');
    assert.equal(bodyStr.includes('calendarExceptions'), false, 'Raw exception objects must not leak');

    // Field names preserved
    const week = res.json.workload.weeks[0];
    assert.equal(week.netCapacityHours, 32.0, 'Net capacity correctly reflects exception');
    assert.equal(week.leaveHours, 0.0, 'leaveHours must not be relabeled as combined exception hours');
    assert.equal(week.unavailableHours, undefined, 'unavailableHours should not be introduced without approval');
  });

  // O. Existing evaluation/assignment authorization and override behavior retained
  test('TC-O: Authorization scoping and assignment override behavior remain fully enforced', async () => {
    // 1. Authorization: Team member cannot evaluate another user (HTTP 403)
    const tmDenied = await apiRequest('/api/v1/capacity/evaluate', {
      method: 'POST',
      sessionKey: 'member1',
      body: {
        userId: member2User.id,
        startDate: '2026-11-09',
        endDate: '2026-11-13',
        plannedHours: 0,
      },
    });
    assert.equal(tmDenied.status, 403);

    // 2. Authorization: PM for Validation project cannot evaluate for Integration activity (HTTP 403)
    const pmDenied = await apiRequest('/api/v1/capacity/evaluate', {
      method: 'POST',
      sessionKey: 'pm2',
      body: {
        userId: member1User.id,
        activityId: ACT_INT_1,
        startDate: '2026-11-09',
        endDate: '2026-11-13',
        plannedHours: 0,
      },
    });
    assert.equal(pmDenied.status, 403);

    // 3. Authorization: System Admin can evaluate any member (HTTP 200)
    const adminAllowed = await apiRequest('/api/v1/capacity/evaluate', {
      method: 'POST',
      sessionKey: 'admin',
      body: {
        userId: member1User.id,
        startDate: '2026-11-09',
        endDate: '2026-11-13',
        plannedHours: 0,
      },
    });
    assert.equal(adminAllowed.status, 200);

    // 4. Override behavior: PM can override a hard conflict with valid justification (>= 10 chars)
    await query(`
      INSERT INTO member_calendar_exceptions (member_id, exception_date, reason)
      VALUES ($1, '2026-11-11', 'TC-O Exception')
    `, [member1Record.id]);

    // 36 planned hours exceeds 32 net capacity -> save with override succeeds
    const savedResult = await saveAssignmentWithCapacityValidation({
      activityId: ACT_INT_1,
      userId: member1User.id,
      startDate: '2026-11-09',
      endDate: '2026-11-13',
      plannedHours: 36.0,
      currentUser: pm1User,
      override: {
        justification_reason: 'Emergency production release schedule compression override',
      },
    });

    assert.ok(savedResult.assignment);
    assert.equal(savedResult.assignment.status, 'ACTIVE');
    assert.equal(savedResult.assignment.planned_hours, '36.00');
  });
});
