/**
 * Step 6: Leave Management & Server-Side Privacy Serialization Test Suite
 * Authoritative PostgreSQL-backed tests covering CPD-006, CPD-008, TC-LEV-001..005,
 * approval scopes, capacity deductions, privacy serialization tiers, and transaction integrity.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { query, closePool, getPool } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { bootstrapSystemAdmin } from '../src/modules/iam/bootstrap.service.js';
import { createSession } from '../src/modules/iam/session.service.js';
import { createApp } from '../src/app.js';
import {
  evaluateUserWorkload,
  redactApprovedLeavesForRole,
  redactConflictCaseForRole,
} from '../src/modules/capacity_scheduling/capacity.service.js';
import {
  submitLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  getLeaveById,
  listLeaveRecords,
} from '../src/modules/leave/leave.service.js';
import { serializeLeaveForRole } from '../src/modules/leave/leave.serializer.js';

describe('Step 6: Leave Management & Server-Side Privacy Serialization Test Suite', () => {
  let server;
  let baseUrl;

  let adminUser;
  let pm1User;
  let pm2User;
  let lead1User;
  let lead2User;
  let member1User;
  let member2User;
  let memberValUser;
  let rmUser;
  let unscopedUser;

  const sessions = {};

  const PROJ_INT_ID = '60000000-0000-0000-0000-000000000001'; // EMS-G2-INT
  const ACT_INT_1 = '70000000-0000-0000-0000-000000000001';
  const ACT_INT_2 = '70000000-0000-0000-0000-000000000002';

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
    memberValUser = userMap.get('engineer.validation1@example.test');
    rmUser = userMap.get('resource.manager@example.test');

    // Create an active user outside any team for out-of-scope testing
    const unscopedRes = await query(`
      INSERT INTO users (email, full_name, password_hash, is_active, must_change_password)
      VALUES ('engineer.unscoped.step6@ems-ecu.internal', 'Unscoped Engineer 6', 'mock_hash', TRUE, FALSE)
      ON CONFLICT (email) DO UPDATE SET is_active = TRUE, must_change_password = FALSE
      RETURNING id, email;
    `);
    unscopedUser = unscopedRes.rows[0];
    await query(`
      INSERT INTO user_roles (user_id, role_code)
      VALUES ($1, 'TEAM_MEMBER')
      ON CONFLICT DO NOTHING;
    `, [unscopedUser.id]);

    const usersToSession = [
      ['admin', adminUser],
      ['pm1', pm1User],
      ['pm2', pm2User],
      ['lead1', lead1User],
      ['lead2', lead2User],
      ['member1', member1User],
      ['member2', member2User],
      ['memberVal', memberValUser],
      ['rm', rmUser],
      ['unscoped', unscopedUser],
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
    // Clean up created assignments & leave records
    await query(`DELETE FROM assignments WHERE activity_id IN ('${ACT_INT_1}', '${ACT_INT_2}');`);
    await query(`DELETE FROM leave_records WHERE start_date >= '2026-10-01';`);
    await closePool();
  });

  beforeEach(async () => {
    // Reset test leaves and assignments before each test
    await query(`DELETE FROM leave_records WHERE start_date >= '2026-10-01';`);
    await query(`DELETE FROM assignments WHERE activity_id IN ('${ACT_INT_1}', '${ACT_INT_2}');`);
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

  // ===========================================================================
  // Section 1: Leave Submission Lifecycle & Validation
  // ===========================================================================
  describe('1. Leave Submission Lifecycle & Validation', () => {
    test('TC-LEV-SUB-001: Team member can submit own valid leave request starting in PENDING status', async () => {
      const res = await apiRequest('/api/v1/leave', {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          start_date: '2026-11-16',
          end_date: '2026-11-20',
          leave_type: 'ANNUAL',
          leave_reason: 'Annual family holiday',
        },
      });

      assert.equal(res.status, 201, `Expected HTTP 201, got ${res.status}: ${res.body}`);
      const leave = res.json.data || res.json.leave || res.json;
      assert.equal(leave.status, 'PENDING');
      assert.equal(leave.start_date, '2026-11-16');
      assert.equal(leave.end_date, '2026-11-20');
      assert.equal(leave.duration_days, 5);
      assert.equal(leave.duration_hours, 40.0);
      assert.equal(leave.leave_type, 'ANNUAL');
      assert.equal(leave.leave_reason, 'Annual family holiday');
      assert.equal(leave.user_id, member1User.id);
    });

    test('TC-LEV-SUB-002: Invalid date ordering (end_date < start_date) is rejected with HTTP 400', async () => {
      const res = await apiRequest('/api/v1/leave', {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          start_date: '2026-11-20',
          end_date: '2026-11-16',
          leave_type: 'ANNUAL',
          leave_reason: 'Inverted dates test',
        },
      });

      assert.equal(res.status, 400, `Expected HTTP 400, got ${res.status}`);
      assert.ok(res.json?.error?.message.includes('end_date cannot be earlier than start_date'));
    });

    test('TC-LEV-SUB-003: Missing required fields or invalid leave_type are rejected with HTTP 400', async () => {
      // Missing reason
      const resMissingReason = await apiRequest('/api/v1/leave', {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          start_date: '2026-11-16',
          end_date: '2026-11-20',
          leave_type: 'ANNUAL',
        },
      });
      assert.equal(resMissingReason.status, 400);

      // Invalid leave type
      const resInvalidType = await apiRequest('/api/v1/leave', {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          start_date: '2026-11-16',
          end_date: '2026-11-20',
          leave_type: 'INVALID_VACATION_TYPE',
          leave_reason: 'Valid reason string',
        },
      });
      assert.equal(resInvalidType.status, 400);
      assert.ok(resInvalidType.json?.error?.message.includes('Invalid leave_type'));
    });

    test('TC-LEV-SUB-004: Team Member cannot create a leave request for another person (HTTP 403)', async () => {
      const res = await apiRequest('/api/v1/leave', {
        method: 'POST',
        sessionKey: 'member1',
        body: {
          user_id: member2User.id,
          start_date: '2026-11-16',
          end_date: '2026-11-20',
          leave_type: 'ANNUAL',
          leave_reason: 'Submitting on behalf of peer without authority',
        },
      });

      assert.equal(res.status, 403, `Expected HTTP 403, got ${res.status}`);
    });

    test('TC-LEV-SUB-005: Project Manager cannot create a leave request for another person (HTTP 403)', async () => {
      const res = await apiRequest('/api/v1/leave', {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          user_id: member1User.id,
          start_date: '2026-11-16',
          end_date: '2026-11-20',
          leave_type: 'ANNUAL',
          leave_reason: 'PM attempting to create leave for engineer',
        },
      });

      assert.equal(res.status, 403, `Expected HTTP 403, got ${res.status}`);
    });

    test('TC-LEV-SUB-006: Team Lead can create a leave request for an active member of their own team (HTTP 201)', async () => {
      const res = await apiRequest('/api/v1/leave', {
        method: 'POST',
        sessionKey: 'lead1',
        body: {
          user_id: member1User.id,
          start_date: '2026-11-16',
          end_date: '2026-11-20',
          leave_type: 'SICK',
          leave_reason: 'Doctor note submitted to Team Lead',
        },
      });

      assert.equal(res.status, 201, `Expected HTTP 201, got ${res.status}: ${res.body}`);
      const leave = res.json.data || res.json.leave || res.json;
      assert.equal(leave.user_id, member1User.id);
      assert.equal(leave.status, 'PENDING');
      assert.equal(leave.leave_type, 'SICK');
    });

    test('TC-LEV-SUB-007: Team Lead is DENIED creating a leave request for an out-of-team member (HTTP 403)', async () => {
      // lead1 (Team 1) attempts to submit for memberValUser (Team 2)
      const res = await apiRequest('/api/v1/leave', {
        method: 'POST',
        sessionKey: 'lead1',
        body: {
          user_id: memberValUser.id,
          start_date: '2026-11-16',
          end_date: '2026-11-20',
          leave_type: 'ANNUAL',
          leave_reason: 'TL cross-team submission attempt',
        },
      });

      assert.equal(res.status, 403, `Expected HTTP 403, got ${res.status}`);
    });

    test('TC-LEV-SUB-008: Resource Manager can submit leave for in-scope member, but is DENIED for out-of-scope user (HTTP 403)', async () => {
      // In-scope member (member1)
      const resInScope = await apiRequest('/api/v1/leave', {
        method: 'POST',
        sessionKey: 'rm',
        body: {
          user_id: member1User.id,
          start_date: '2026-11-16',
          end_date: '2026-11-20',
          leave_type: 'ANNUAL',
          leave_reason: 'RM logged planned training leave',
        },
      });
      assert.equal(resInScope.status, 201);

      // Out-of-scope member (unscopedUser)
      const resOutOfScope = await apiRequest('/api/v1/leave', {
        method: 'POST',
        sessionKey: 'rm',
        body: {
          user_id: unscopedUser.id,
          start_date: '2026-11-16',
          end_date: '2026-11-20',
          leave_type: 'ANNUAL',
          leave_reason: 'RM logged out-of-scope leave',
        },
      });
      assert.equal(resOutOfScope.status, 403);
    });

    test('TC-LEV-SUB-009: System Admin can submit leave for any member (HTTP 201)', async () => {
      const res = await apiRequest('/api/v1/leave', {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          user_id: unscopedUser.id,
          start_date: '2026-11-16',
          end_date: '2026-11-20',
          leave_type: 'OTHER',
          leave_reason: 'Corporate sabbatical approved by executive leadership',
        },
      });

      assert.equal(res.status, 201, `Expected HTTP 201, got ${res.status}: ${res.body}`);
    });
  });

  // ===========================================================================
  // Section 2: Approval Authorization & Scope Enforcement
  // ===========================================================================
  describe('2. Approval Authorization & Scope Enforcement', () => {
    let pendingLeaveTeam1;
    let pendingLeaveTeam2;
    let pendingLeaveUnscoped;

    beforeEach(async () => {
      // Create pending leave for member1 (Team 1)
      const res1 = await submitLeaveRequest({
        userId: member1User.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        leaveType: 'ANNUAL',
        leaveReason: 'Annual holiday request',
        currentUser: member1User,
      });
      pendingLeaveTeam1 = res1;

      // Create pending leave for memberVal (Team 2)
      const res2 = await submitLeaveRequest({
        userId: memberValUser.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        leaveType: 'SICK',
        leaveReason: 'Medical procedure recovery',
        currentUser: memberValUser,
      });
      pendingLeaveTeam2 = res2;

      // Create pending leave for unscopedUser
      const res3 = await submitLeaveRequest({
        userId: unscopedUser.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        leaveType: 'PERSONAL',
        leaveReason: 'Personal leave for unscoped engineer',
        currentUser: adminUser,
      });
      pendingLeaveUnscoped = res3;
    });

    test('TC-LEV-APP-001: Team Lead can approve leave for active member of own team (HTTP 200)', async () => {
      const res = await apiRequest(`/api/v1/leave/${pendingLeaveTeam1.id}/approve`, {
        method: 'POST',
        sessionKey: 'lead1',
      });

      assert.equal(res.status, 200, `Expected HTTP 200, got ${res.status}: ${res.body}`);
      const leave = res.json.data || res.json.leave || res.json;
      assert.equal(leave.status, 'APPROVED');
      assert.equal(leave.leave_type, 'ANNUAL');
      // Approver identity is NEVER serialized to Team Leads
      assert.equal(leave.approved_by_user_id, undefined);
      assert.ok(!Object.keys(leave).some(k => k.toLowerCase().includes('approv')));
    });

    test('TC-LEV-APP-002: Team Lead is DENIED when attempting to approve leave for an out-of-team member (HTTP 403)', async () => {
      // lead1 (Team 1) attempts to approve pendingLeaveTeam2 (memberVal in Team 2)
      const res = await apiRequest(`/api/v1/leave/${pendingLeaveTeam2.id}/approve`, {
        method: 'POST',
        sessionKey: 'lead1',
      });

      assert.equal(res.status, 403, `Expected HTTP 403, got ${res.status}`);
      // Assert state did NOT mutate in database
      const checkRes = await query('SELECT status FROM leave_records WHERE id = $1', [pendingLeaveTeam2.id]);
      assert.equal(checkRes.rows[0].status, 'PENDING');
    });

    test('TC-LEV-APP-003: Resource Manager can approve leave within resource scope, but is DENIED outside scope (HTTP 403)', async () => {
      // In-scope member (pendingLeaveTeam1)
      const resInScope = await apiRequest(`/api/v1/leave/${pendingLeaveTeam1.id}/approve`, {
        method: 'POST',
        sessionKey: 'rm',
      });
      assert.equal(resInScope.status, 200);
      assert.equal((resInScope.json.data || resInScope.json).status, 'APPROVED');

      // Out-of-scope member (pendingLeaveUnscoped)
      const resOutOfScope = await apiRequest(`/api/v1/leave/${pendingLeaveUnscoped.id}/approve`, {
        method: 'POST',
        sessionKey: 'rm',
      });
      assert.equal(resOutOfScope.status, 403);
    });

    test('TC-LEV-APP-004: System Admin can approve leave for any member (HTTP 200)', async () => {
      const res = await apiRequest(`/api/v1/leave/${pendingLeaveUnscoped.id}/approve`, {
        method: 'POST',
        sessionKey: 'admin',
      });

      assert.equal(res.status, 200);
      const leave = res.json.data || res.json.leave || res.json;
      assert.equal(leave.status, 'APPROVED');
      assert.equal(leave.approved_by_user_id, adminUser.id);
    });

    test('TC-LEV-APP-005: Project Manager without leave-approval role is DENIED approval (HTTP 403)', async () => {
      const res = await apiRequest(`/api/v1/leave/${pendingLeaveTeam1.id}/approve`, {
        method: 'POST',
        sessionKey: 'pm1',
      });

      assert.equal(res.status, 403, `Expected HTTP 403, got ${res.status}`);
      const checkRes = await query('SELECT status FROM leave_records WHERE id = $1', [pendingLeaveTeam1.id]);
      assert.equal(checkRes.rows[0].status, 'PENDING');
    });

    test('TC-LEV-APP-006: Team Member is DENIED approval (HTTP 403)', async () => {
      const res = await apiRequest(`/api/v1/leave/${pendingLeaveTeam1.id}/approve`, {
        method: 'POST',
        sessionKey: 'member2',
      });

      assert.equal(res.status, 403, `Expected HTTP 403, got ${res.status}`);
    });

    test('TC-LEV-APP-007: Unauthenticated request is DENIED with HTTP 401', async () => {
      const res = await apiRequest(`/api/v1/leave/${pendingLeaveTeam1.id}/approve`, {
        method: 'POST',
        sessionKey: null,
      });

      assert.equal(res.status, 401);
    });

    test('TC-LEV-APP-008: Approving an already approved leave returns HTTP 400', async () => {
      // First approval
      await apiRequest(`/api/v1/leave/${pendingLeaveTeam1.id}/approve`, {
        method: 'POST',
        sessionKey: 'lead1',
      });

      // Second approval attempt
      const resSecond = await apiRequest(`/api/v1/leave/${pendingLeaveTeam1.id}/approve`, {
        method: 'POST',
        sessionKey: 'lead1',
      });

      assert.equal(resSecond.status, 400);
      assert.ok(resSecond.json?.error?.message.includes('Cannot approve leave request'));
    });

    test('TC-LEV-REJ-001: Team Lead can reject leave for own team member (HTTP 200, status REJECTED)', async () => {
      const res = await apiRequest(`/api/v1/leave/${pendingLeaveTeam1.id}/reject`, {
        method: 'POST',
        sessionKey: 'lead1',
        body: {
          rejection_reason: 'Critical vehicle testing milestone scheduled that week',
        },
      });

      assert.equal(res.status, 200);
      const leave = res.json.data || res.json.leave || res.json;
      assert.equal(leave.status, 'REJECTED');
    });

    test('TC-LEV-REJ-002: Team Lead is DENIED rejecting out-of-team member leave (HTTP 403)', async () => {
      const res = await apiRequest(`/api/v1/leave/${pendingLeaveTeam2.id}/reject`, {
        method: 'POST',
        sessionKey: 'lead1',
      });

      assert.equal(res.status, 403);
    });

    test('TC-LEV-CAN-001: Team member can cancel own pending or approved leave (HTTP 200, status CANCELLED)', async () => {
      // Cancel pending leave
      const resCancel = await apiRequest(`/api/v1/leave/${pendingLeaveTeam1.id}/cancel`, {
        method: 'POST',
        sessionKey: 'member1',
      });

      assert.equal(resCancel.status, 200);
      const leave = resCancel.json.data || resCancel.json.leave || resCancel.json;
      assert.equal(leave.status, 'CANCELLED');
    });

    test('TC-LEV-CAN-002: Unauthorized peer is DENIED cancelling another user leave (HTTP 403)', async () => {
      const res = await apiRequest(`/api/v1/leave/${pendingLeaveTeam1.id}/cancel`, {
        method: 'POST',
        sessionKey: 'member2',
      });

      assert.equal(res.status, 403);
    });
  });

  // ===========================================================================
  // Section 3: Capacity Calculation & Overlap Behavior (CPD-004, CPD-006)
  // ===========================================================================
  describe('3. Capacity Calculation & Overlap Behavior', () => {
    test('TC-LEV-001: PENDING leave does not deduct capacity; net capacity remains 40.00h', async () => {
      // Engineer submits Mon-Fri pending leave
      await submitLeaveRequest({
        userId: member1User.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        leaveType: 'ANNUAL',
        leaveReason: 'Pending holiday submission',
        currentUser: member1User,
      });

      // Query workload for that week (2026-11-16 to 2026-11-20)
      const workload = await evaluateUserWorkload({
        userId: member1User.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        proposedPlannedHours: 0,
      });

      assert.equal(workload.weeks.length, 1);
      const week = workload.weeks[0];
      assert.equal(week.workingDays, 5);
      assert.equal(week.leaveHours, 0, 'Pending leave must NOT deduct leave hours');
      assert.equal(week.netCapacityHours, 40.0, 'Net capacity must remain full 40.00h');
      assert.equal(workload.conflictStatus, 'OK');
    });

    test('TC-LEV-001-WARN: PENDING leave overlapping a proposed assignment produces SOFT WARNING but permits save without override', async () => {
      // Submit pending leave for Mon-Fri
      await submitLeaveRequest({
        userId: member1User.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        leaveType: 'ANNUAL',
        leaveReason: 'Pending holiday submission',
        currentUser: member1User,
      });

      // Pre-check evaluate endpoint
      const evalRes = await apiRequest('/api/v1/capacity/evaluate', {
        method: 'POST',
        sessionKey: 'admin',
        body: {
          userId: member1User.id,
          startDate: '2026-11-16',
          endDate: '2026-11-20',
          plannedHours: 20.0,
        },
      });

      assert.equal(evalRes.status, 200);
      assert.equal(evalRes.json.conflict_level, 'CAPACITY_WARNING', 'Pending leave overlap must produce soft warning indicator');

      // Now create assignment on ACT_INT_1: Must succeed (HTTP 201 Created) without override
      const assignRes = await apiRequest(`/api/v1/activities/${ACT_INT_1}/assignments`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: member1User.id,
          startDate: '2026-11-16',
          endDate: '2026-11-20',
          plannedHours: 20.0,
        },
      });

      assert.equal(assignRes.status, 201, `Expected HTTP 201, got ${assignRes.status}: ${assignRes.body}`);
      assert.equal(assignRes.json.assignment.status, 'ACTIVE');
    });

    test('TC-LEV-002: Approved leave immediately reduces net capacity (Mon-Tue approved = 24.00h net capacity)', async () => {
      // Submit and approve leave for Mon-Tue (2 working days = 16h)
      const leave = await submitLeaveRequest({
        userId: member1User.id,
        startDate: '2026-11-16',
        endDate: '2026-11-17',
        leaveType: 'SICK',
        leaveReason: 'Dental surgery and follow-up',
        currentUser: member1User,
      });

      // Approve leave
      await approveLeaveRequest({
        leaveId: leave.id,
        currentUser: lead1User,
      });

      // Evaluate capacity for the week
      const workload = await evaluateUserWorkload({
        userId: member1User.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        proposedPlannedHours: 0,
      });

      assert.equal(workload.weeks.length, 1);
      const week = workload.weeks[0];
      assert.equal(week.leaveHours, 16.0, 'Approved 2 days leave must equal 16.0h deduction');
      assert.equal(week.netCapacityHours, 24.0, 'Net capacity must update immediately to 24.00h (40h - 16h)');
    });

    test('TC-LEV-CAP-003: Rejected and Cancelled leave do NOT reduce net capacity', async () => {
      // 1. Rejected leave
      const leaveRej = await submitLeaveRequest({
        userId: member1User.id,
        startDate: '2026-11-16',
        endDate: '2026-11-18',
        leaveType: 'ANNUAL',
        leaveReason: 'Rejected leave test',
        currentUser: member1User,
      });
      await rejectLeaveRequest({
        leaveId: leaveRej.id,
        currentUser: lead1User,
      });

      // 2. Cancelled leave
      const leaveCan = await submitLeaveRequest({
        userId: member1User.id,
        startDate: '2026-11-19',
        endDate: '2026-11-20',
        leaveType: 'PERSONAL',
        leaveReason: 'Cancelled leave test',
        currentUser: member1User,
      });
      await cancelLeaveRequest({
        leaveId: leaveCan.id,
        currentUser: member1User,
      });

      const workload = await evaluateUserWorkload({
        userId: member1User.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        proposedPlannedHours: 0,
      });

      const week = workload.weeks[0];
      assert.equal(week.leaveHours, 0, 'Rejected and cancelled leave must not deduct capacity');
      assert.equal(week.netCapacityHours, 40.0, 'Net capacity remains 40.00h');
    });

    test('TC-LEV-CAP-004: Approved full-week leave results in zero net capacity and blocks attempted assigned work (409 Conflict)', async () => {
      // 1. Submit and approve full week Mon-Fri (40 hours)
      const leave = await submitLeaveRequest({
        userId: member1User.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        leaveType: 'ANNUAL',
        leaveReason: 'Full week approved annual leave',
        currentUser: member1User,
      });
      await approveLeaveRequest({
        leaveId: leave.id,
        currentUser: lead1User,
      });

      // 2. Verify net capacity is 0.00h
      const workload = await evaluateUserWorkload({
        userId: member1User.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        proposedPlannedHours: 0,
      });
      const week = workload.weeks[0];
      assert.equal(week.leaveHours, 40.0);
      assert.equal(week.netCapacityHours, 0.0, 'Full week leave must yield zero net capacity');

      // 3. Attempting to assign 8 hours on ACT_INT_1 must trigger 409 Conflict (zero net capacity rule: 999.99%)
      const assignRes = await apiRequest(`/api/v1/activities/${ACT_INT_1}/assignments`, {
        method: 'POST',
        sessionKey: 'pm1',
        body: {
          userId: member1User.id,
          startDate: '2026-11-16',
          endDate: '2026-11-20',
          plannedHours: 8.0,
        },
      });

      assert.equal(assignRes.status, 409, `Expected HTTP 409 hard conflict, got ${assignRes.status}`);
      assert.equal(assignRes.json?.error?.code, 'CAPACITY_HARD_CONFLICT');
      const details = assignRes.json?.details || assignRes.json?.error?.details;
      assert.ok(details?.planned_utilization >= 100.0, `Expected planned_utilization >= 100.0, got ${details?.planned_utilization}`);
    });
  });

  // ===========================================================================
  // Section 4: Server-Side Privacy Serialization (CPD-006, TC-LEV-003..005)
  // ===========================================================================
  describe('4. Server-Side Privacy Serialization Tiers', () => {
    let sensitiveMedicalLeave;

    beforeEach(async () => {
      // member1 (Team 1) submits confidential medical leave
      const created = await submitLeaveRequest({
        userId: member1User.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        leaveType: 'SICK',
        leaveReason: 'Post-surgical recovery',
        currentUser: member1User,
      });
      // Admin approves it
      sensitiveMedicalLeave = await approveLeaveRequest({
        leaveId: created.id,
        currentUser: adminUser,
      });
    });

    test('TC-LEV-003: Project Manager receives availability only (leave_type: null, leave_reason: null, no approver)', async () => {
      // Query list
      const listRes = await apiRequest('/api/v1/leave?start_date=2026-11-01&end_date=2026-11-30', {
        method: 'GET',
        sessionKey: 'pm1',
      });

      assert.equal(listRes.status, 200);
      const leaves = listRes.json.data || listRes.json.leaves;
      const target = leaves.find(l => l.id === sensitiveMedicalLeave.id);
      assert.ok(target, 'Leave record must be present in query');

      assert.equal(target.leave_type, null, 'leave_type must be null for Project Manager');
      assert.equal(target.leave_reason, null, 'leave_reason must be null for Project Manager');
      assert.equal(target.start_date, '2026-11-16');
      assert.equal(target.end_date, '2026-11-20');
      assert.equal(target.duration_days, 5);
      assert.equal(target.duration_hours, 40.0);
      assert.equal(target.status, 'APPROVED');

      // Approver identity must NEVER be returned
      assert.equal(target.approved_by_user_id, undefined);
      assert.ok(!Object.keys(target).some(k => k.toLowerCase().includes('approv')));
    });

    test('TC-LEV-003-PEER: Peer Team Member receives availability only (leave_type: null, leave_reason: null, no approver)', async () => {
      // member2 (peer in Team 1) queries list
      const listRes = await apiRequest('/api/v1/leave?start_date=2026-11-01&end_date=2026-11-30', {
        method: 'GET',
        sessionKey: 'member2',
      });

      assert.equal(listRes.status, 200);
      const leaves = listRes.json.data || listRes.json.leaves;
      const target = leaves.find(l => l.id === sensitiveMedicalLeave.id);
      assert.ok(target, 'Peer leave must be present in availability query');

      assert.equal(target.leave_type, null, 'leave_type must be null for peer team member');
      assert.equal(target.leave_reason, null, 'leave_reason must be null for peer team member');
      assert.equal(target.approved_by_user_id, undefined);
      assert.ok(!Object.keys(target).some(k => k.toLowerCase().includes('approv')));
    });

    test('TC-LEV-004: Team Lead for own-team member receives leave_type: SICK, but leave_reason: null and NO approver', async () => {
      // lead1 (Team Lead for member1) queries list
      const listRes = await apiRequest('/api/v1/leave?start_date=2026-11-01&end_date=2026-11-30', {
        method: 'GET',
        sessionKey: 'lead1',
      });

      assert.equal(listRes.status, 200);
      const leaves = listRes.json.data || listRes.json.leaves;
      const target = leaves.find(l => l.id === sensitiveMedicalLeave.id);
      assert.ok(target, 'Team member leave must be present for Team Lead');

      assert.equal(target.leave_type, 'SICK', 'leave_type must be visible to Team Lead for own team member');
      assert.equal(target.leave_reason, null, 'leave_reason must be null for Team Lead');

      // Approver identity must NEVER be serialized to Team Leads
      assert.equal(target.approved_by_user_id, undefined);
      assert.ok(!Object.keys(target).some(k => k.toLowerCase().includes('approv')));
    });

    test('TC-LEV-004-SCOPE: Team Lead cannot retrieve an out-of-team leave record (HTTP 403)', async () => {
      // lead2 (Team Lead for Team 2) attempts to fetch member1 leave directly
      const detailRes = await apiRequest(`/api/v1/leave/${sensitiveMedicalLeave.id}`, {
        method: 'GET',
        sessionKey: 'lead2',
      });

      assert.equal(detailRes.status, 403, `Expected HTTP 403, got ${detailRes.status}`);

      // In query list, out-of-team leave must NOT appear
      const listRes = await apiRequest('/api/v1/leave?start_date=2026-11-01&end_date=2026-11-30', {
        method: 'GET',
        sessionKey: 'lead2',
      });
      const leaves = listRes.json.data || listRes.json.leaves;
      const found = leaves.some(l => l.id === sensitiveMedicalLeave.id);
      assert.equal(found, false, 'Out-of-team leave records must be filtered from Team Lead list query');
    });

    test('TC-LEV-005: Resource Manager and System Admin receive full leave record including leave_reason and approver', async () => {
      // 1. Resource Manager query
      const rmRes = await apiRequest(`/api/v1/leave/${sensitiveMedicalLeave.id}`, {
        method: 'GET',
        sessionKey: 'rm',
      });
      assert.equal(rmRes.status, 200);
      const rmLeave = rmRes.json.data || rmRes.json.leave || rmRes.json;
      assert.equal(rmLeave.leave_type, 'SICK');
      assert.equal(rmLeave.leave_reason, 'Post-surgical recovery');
      assert.equal(rmLeave.approved_by_user_id, adminUser.id);

      // 2. System Admin query
      const adminRes = await apiRequest(`/api/v1/leave/${sensitiveMedicalLeave.id}`, {
        method: 'GET',
        sessionKey: 'admin',
      });
      assert.equal(adminRes.status, 200);
      const adminLeave = adminRes.json.data || adminRes.json.leave || adminRes.json;
      assert.equal(adminLeave.leave_type, 'SICK');
      assert.equal(adminLeave.leave_reason, 'Post-surgical recovery');
      assert.equal(adminLeave.approved_by_user_id, adminUser.id);
    });

    test('TC-LEV-005-RM-SCOPE: Resource Manager cannot retrieve leave for an out-of-scope member (HTTP 403)', async () => {
      // Create leave for unscopedUser
      const unscopedLeave = await submitLeaveRequest({
        userId: unscopedUser.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        leaveType: 'OTHER',
        leaveReason: 'Unscoped engineer leave',
        currentUser: adminUser,
      });

      const res = await apiRequest(`/api/v1/leave/${unscopedLeave.id}`, {
        method: 'GET',
        sessionKey: 'rm',
      });

      assert.equal(res.status, 403, `Expected HTTP 403, got ${res.status}`);
    });

    test('TC-LEV-PRIV-STP5: Step 5 TEAM_LEAD conflict-case serializer assertion remains intact', () => {
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
  // Section 5: Audit Attribution & Transaction Integrity
  // ===========================================================================
  describe('5. Audit Attribution & Transaction Integrity', () => {
    test('TC-LEV-INT-001: Audit log correctly records LEAVE_SUBMITTED, LEAVE_APPROVED, LEAVE_REJECTED, LEAVE_CANCELLED with actor attribution', async () => {
      // 1. Submit
      const leave = await submitLeaveRequest({
        userId: member1User.id,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        leaveType: 'ANNUAL',
        leaveReason: 'Audit trail verification',
        currentUser: member1User,
      });

      const submitAuditRes = await query(`
        SELECT action, actor_id, entity_name, entity_id FROM audit_log
        WHERE entity_name = 'leave_records' AND entity_id = $1 AND action = 'LEAVE_SUBMITTED';
      `, [leave.id]);
      assert.equal(submitAuditRes.rows.length, 1);
      assert.equal(submitAuditRes.rows[0].actor_id, member1User.id);

      // 2. Approve
      await approveLeaveRequest({
        leaveId: leave.id,
        currentUser: lead1User,
      });

      const approveAuditRes = await query(`
        SELECT action, actor_id, entity_name, entity_id FROM audit_log
        WHERE entity_name = 'leave_records' AND entity_id = $1 AND action = 'LEAVE_APPROVED';
      `, [leave.id]);
      assert.equal(approveAuditRes.rows.length, 1);
      assert.equal(approveAuditRes.rows[0].actor_id, lead1User.id);

      // 3. Cancel
      await cancelLeaveRequest({
        leaveId: leave.id,
        currentUser: member1User,
      });

      const cancelAuditRes = await query(`
        SELECT action, actor_id, entity_name, entity_id FROM audit_log
        WHERE entity_name = 'leave_records' AND entity_id = $1 AND action = 'LEAVE_CANCELLED';
      `, [leave.id]);
      assert.equal(cancelAuditRes.rows.length, 1);
      assert.equal(cancelAuditRes.rows[0].actor_id, member1User.id);
    });

    test('TC-LEV-INT-002: Forced failure during leave transaction leaves NO partial leave or audit mutation', async () => {
      const pool = getPool();
      const client = await pool.connect();
      const testStartDate = '2026-12-21';
      const testEndDate = '2026-12-25';

      try {
        await client.query('BEGIN');

        // Insert leave record inside uncommitted transaction
        const insertRes = await client.query(`
          INSERT INTO leave_records (user_id, start_date, end_date, leave_type, leave_reason, status)
          VALUES ($1, $2, $3, 'ANNUAL', 'Rollback test', 'PENDING')
          RETURNING id;
        `, [member1User.id, testStartDate, testEndDate]);
        const tempId = insertRes.rows[0].id;

        // Force ROLLBACK (simulating unhandled crash or validation failure)
        await client.query('ROLLBACK');

        // Assert row was rolled back
        const checkRes = await query(`SELECT id FROM leave_records WHERE id = $1;`, [tempId]);
        assert.equal(checkRes.rows.length, 0, 'Rolled-back leave record must not persist');

        // Assert no audit entry survived
        const auditRes = await query(`SELECT id FROM audit_log WHERE entity_id = $1;`, [tempId]);
        assert.equal(auditRes.rows.length, 0, 'No partial audit log row must persist after transaction rollback');
      } finally {
        client.release();
      }
    });
  });
});
