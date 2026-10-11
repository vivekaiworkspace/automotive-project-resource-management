import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve project paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const frontendPublic = path.join(projectRoot, 'frontend', 'public');

// Import LeaveBoard controller module
import LeaveBoard from '../public/js/leave.js';

describe('Leave Management Board UI Tests (Phase 8 Slice 1)', () => {

  describe('1. Static Markup & Asset Availability', () => {
    const leaveHtmlPath = path.join(frontendPublic, 'leave.html');
    const leaveCssPath = path.join(frontendPublic, 'css', 'leave.css');
    const leaveJsPath = path.join(frontendPublic, 'js', 'leave.js');

    test('leave.html exists and is well-formed HTML5 document', () => {
      assert.ok(fs.existsSync(leaveHtmlPath), 'frontend/public/leave.html must exist');
      const html = fs.readFileSync(leaveHtmlPath, 'utf8');

      assert.ok(html.includes('<!DOCTYPE html>'), 'Must start with HTML5 doctype');
      assert.ok(html.includes('<title>Leave Management Board — Core Pilot</title>'), 'Must have descriptive page title');
      assert.ok(html.includes('<meta name="description"'), 'Must include meta description');
      assert.ok(html.includes('<meta name="viewport"'), 'Must include responsive viewport');
      assert.ok(html.includes('<link rel="stylesheet" href="css/app.css">'), 'Must link app.css');
      assert.ok(html.includes('<link rel="stylesheet" href="css/admin.css">'), 'Must link admin.css');
      assert.ok(html.includes('<link rel="stylesheet" href="css/leave.css">'), 'Must link leave.css');
      assert.ok(html.includes('<script src="js/leave.js"></script>'), 'Must load leave.js');
    });

    test('leave.html includes proper heading hierarchy and semantic containers', () => {
      const html = fs.readFileSync(leaveHtmlPath, 'utf8');

      assert.ok(html.includes('<h1 class="brand-title">Leave Management Board</h1>'), 'Must have single h1 header');
      assert.ok(html.includes('id="leave-tabs-nav"'), 'Must include tab navigation bar');
      assert.ok(html.includes('id="tab-board"'), 'Must include Board tab panel');
      assert.ok(html.includes('id="tab-list"'), 'Must include Records List tab panel');
      assert.ok(html.includes('id="tab-my-leaves"'), 'Must include My Leaves tab panel');
      assert.ok(html.includes('id="btn-open-request-modal"'), 'Must include Leave Request button');
    });

    test('leave.html provides leave request form with exact supported API fields', () => {
      const html = fs.readFileSync(leaveHtmlPath, 'utf8');

      assert.ok(html.includes('id="form-leave-request"'), 'Must include leave request form');
      assert.ok(html.includes('id="input-leave-type"'), 'Must include leave_type input');
      assert.ok(html.includes('id="input-start-date"'), 'Must include start_date input');
      assert.ok(html.includes('id="input-end-date"'), 'Must include end_date input');
      assert.ok(html.includes('id="input-leave-reason"'), 'Must include leave_reason input');
      assert.ok(html.includes('id="input-target-user-id"'), 'Must include optional target user input');

      // Check valid leave types in dropdown
      const validTypes = ['ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'OTHER'];
      for (const t of validTypes) {
        assert.ok(html.includes(`value="${t}"`), `Option value for ${t} must be present`);
      }
    });

    test('leave.html defines loading, empty, success, and safe error UI states', () => {
      const html = fs.readFileSync(leaveHtmlPath, 'utf8');

      assert.ok(html.includes('id="leave-loading-state"'), 'Must include loading state container');
      assert.ok(html.includes('id="leave-empty-state"'), 'Must include empty state container');
      assert.ok(html.includes('id="leave-error-state"'), 'Must include error state container');
      assert.ok(html.includes('id="alert-banner"'), 'Must include notification banner');
    });

    test('leave.css exists and provides responsive board layout and badge styling', () => {
      assert.ok(fs.existsSync(leaveCssPath), 'frontend/public/css/leave.css must exist');
      const css = fs.readFileSync(leaveCssPath, 'utf8');

      assert.ok(css.includes('.leave-board-columns'), 'Must define Kanban columns grid');
      assert.ok(css.includes('.leave-card'), 'Must define leave card layout');
      assert.ok(css.includes('.status-pending'), 'Must define status pending badge');
      assert.ok(css.includes('.status-approved'), 'Must define status approved badge');
      assert.ok(css.includes('.status-rejected'), 'Must define status rejected badge');
      assert.ok(css.includes('.status-cancelled'), 'Must define status cancelled badge');
      assert.ok(css.includes('.leave-modal-overlay'), 'Must define modal overlay');
    });
  });

  describe('2. Non-Negotiable Privacy Rule & Static Markup Audit', () => {
    test('Static markup and assets contain NO hardcoded sensitive leave reasons or fake fixtures', () => {
      const leaveHtml = fs.readFileSync(path.join(frontendPublic, 'leave.html'), 'utf8');
      const leaveJs = fs.readFileSync(path.join(frontendPublic, 'js', 'leave.js'), 'utf8');

      // List of prohibited sensitive terms in static templates or fixtures
      const prohibitedTerms = [
        'chemotherapy',
        'surgery',
        'depression',
        'bipolar',
        'psychiatric',
        'confidential medical appointment',
        'family emergency involving surgery',
        'mock_medical_leave',
        'hardcoded_reason'
      ];

      for (const term of prohibitedTerms) {
        assert.equal(
          leaveHtml.toLowerCase().includes(term),
          false,
          `leave.html must not contain hardcoded private data: ${term}`
        );
        assert.equal(
          leaveJs.toLowerCase().includes(term),
          false,
          `leave.js must not contain hardcoded fallback mock data: ${term}`
        );
      }
    });

    test('leave.html initial Kanban columns start clean and empty for dynamic hydration', () => {
      const leaveHtml = fs.readFileSync(path.join(frontendPublic, 'leave.html'), 'utf8');

      assert.ok(leaveHtml.includes('id="column-cards-pending"></div>'), 'Pending column container starts empty');
      assert.ok(leaveHtml.includes('id="column-cards-approved"></div>'), 'Approved column container starts empty');
      assert.ok(leaveHtml.includes('id="column-cards-rejected"></div>'), 'Rejected column container starts empty');
      assert.ok(leaveHtml.includes('id="column-cards-cancelled"></div>'), 'Cancelled column container starts empty');
      assert.ok(leaveHtml.includes('id="leave-table-body"></tbody>'), 'Table body container starts empty');
    });
  });

  describe('3. Authorization Rule & Action Control Visibility', () => {
    const pendingLeave = {
      id: 'leave-uuid-001',
      user_id: 'user-uuid-100',
      start_date: '2026-11-16',
      end_date: '2026-11-20',
      duration_days: 5,
      duration_hours: 40,
      leave_type: 'ANNUAL',
      leave_reason: 'Annual vacation',
      status: 'PENDING',
      version: 1,
    };

    const approvedLeave = {
      ...pendingLeave,
      id: 'leave-uuid-002',
      status: 'APPROVED',
      approved_by_user_id: 'admin-uuid-001',
    };

    const rejectedLeave = {
      ...pendingLeave,
      id: 'leave-uuid-003',
      status: 'REJECTED',
    };

    test('canUserApprove returns true only for SYSTEM_ADMIN, RESOURCE_MANAGER, and TEAM_LEAD', () => {
      assert.equal(LeaveBoard.canUserApprove({ roles: ['SYSTEM_ADMIN'] }), true);
      assert.equal(LeaveBoard.canUserApprove({ roles: ['RESOURCE_MANAGER'] }), true);
      assert.equal(LeaveBoard.canUserApprove({ roles: ['TEAM_LEAD'] }), true);
      assert.equal(LeaveBoard.canUserApprove({ roles: ['PROJECT_MANAGER', 'TEAM_LEAD'] }), true);

      assert.equal(LeaveBoard.canUserApprove({ roles: ['TEAM_MEMBER'] }), false);
      assert.equal(LeaveBoard.canUserApprove({ roles: ['PROJECT_MANAGER'] }), false);
      assert.equal(LeaveBoard.canUserApprove({ roles: [] }), false);
      assert.equal(LeaveBoard.canUserApprove(null), false);
      assert.equal(LeaveBoard.canUserApprove(undefined), false);
    });

    test('Unauthorized user (TEAM_MEMBER) receives NO approve or reject buttons on pending records', () => {
      const teamMemberUser = { id: 'user-uuid-100', roles: ['TEAM_MEMBER'] };
      const cardHtml = LeaveBoard.renderLeaveCardHtml(pendingLeave, teamMemberUser);

      assert.equal(cardHtml.includes('btn-action-approve'), false, 'Approve button must be absent for Team Member');
      assert.equal(cardHtml.includes('btn-action-reject'), false, 'Reject button must be absent for Team Member');
      // Requester may cancel their own pending leave
      assert.ok(cardHtml.includes('btn-action-cancel-record'), 'Cancel button should be available for own pending record');
    });

    test('Unauthorized user (PROJECT_MANAGER) receives NO approve or reject buttons', () => {
      const pmUser = { id: 'pm-uuid-001', roles: ['PROJECT_MANAGER'] };
      const cardHtml = LeaveBoard.renderLeaveCardHtml(pendingLeave, pmUser);

      assert.equal(cardHtml.includes('btn-action-approve'), false, 'Approve button must be absent for PM');
      assert.equal(cardHtml.includes('btn-action-reject'), false, 'Reject button must be absent for PM');
      assert.equal(cardHtml.includes('btn-action-cancel-record'), false, 'Cancel button absent for non-approver non-owner');
    });

    test('Authorized approver (TEAM_LEAD) receives approve and reject controls on PENDING records', () => {
      const leadUser = { id: 'lead-uuid-001', roles: ['TEAM_LEAD'] };
      const cardHtml = LeaveBoard.renderLeaveCardHtml(pendingLeave, leadUser);

      assert.ok(cardHtml.includes('btn-action-approve'), 'Approve button must be present for Team Lead');
      assert.ok(cardHtml.includes('btn-action-reject'), 'Reject button must be present for Team Lead');
      assert.ok(cardHtml.includes('btn-action-cancel-record'), 'Cancel button must be present for Team Lead');
    });

    test('Authorized approver (SYSTEM_ADMIN) receives approve and reject controls on PENDING records', () => {
      const adminUser = { id: 'admin-uuid-001', roles: ['SYSTEM_ADMIN'] };
      const cardHtml = LeaveBoard.renderLeaveCardHtml(pendingLeave, adminUser);

      assert.ok(cardHtml.includes('btn-action-approve'), 'Approve button must be present for Admin');
      assert.ok(cardHtml.includes('btn-action-reject'), 'Reject button must be present for Admin');
    });

    test('Non-pending records (APPROVED, REJECTED) do NOT display approve/reject controls even for Admins', () => {
      const adminUser = { id: 'admin-uuid-001', roles: ['SYSTEM_ADMIN'] };

      const approvedHtml = LeaveBoard.renderLeaveCardHtml(approvedLeave, adminUser);
      assert.equal(approvedHtml.includes('btn-action-approve'), false, 'Approve button must be absent on APPROVED leave');
      assert.equal(approvedHtml.includes('btn-action-reject'), false, 'Reject button must be absent on APPROVED leave');

      const rejectedHtml = LeaveBoard.renderLeaveCardHtml(rejectedLeave, adminUser);
      assert.equal(rejectedHtml.includes('btn-action-approve'), false, 'Approve button must be absent on REJECTED leave');
      assert.equal(rejectedHtml.includes('btn-action-reject'), false, 'Reject button must be absent on REJECTED leave');
    });
  });

  describe('4. Server-Authoritative Privacy Rendering Behavior', () => {
    test('Server-masked record (PM/peer view: type and reason null) renders clean masked indicators', () => {
      const pmUser = { id: 'pm-uuid-001', roles: ['PROJECT_MANAGER'] };
      const maskedRecord = {
        id: 'leave-uuid-004',
        user_id: 'user-uuid-100',
        start_date: '2026-11-16',
        end_date: '2026-11-20',
        duration_days: 5,
        duration_hours: 40,
        leave_type: null,    // Server serialized as null
        leave_reason: null,  // Server serialized as null
        status: 'APPROVED',
      };

      const cardHtml = LeaveBoard.renderLeaveCardHtml(maskedRecord, pmUser);

      assert.ok(cardHtml.includes('Type: Not Disclosed'), 'Must render neutral not disclosed type badge');
      assert.ok(cardHtml.includes('Reason confidential / masked by policy'), 'Must render neutral masked reason text');
      assert.equal(cardHtml.includes('leave-approver-info'), false, 'Approver info must not be rendered when null');
    });

    test('Server-authorized record (Full: type, reason, approver present) displays server values faithfully', () => {
      const adminUser = { id: 'admin-uuid-001', roles: ['SYSTEM_ADMIN'] };
      const fullRecord = {
        id: 'leave-uuid-005',
        user_id: 'user-uuid-100',
        start_date: '2026-11-16',
        end_date: '2026-11-20',
        duration_days: 5,
        duration_hours: 40,
        leave_type: 'SICK',
        leave_reason: 'Post-op recovery period',
        approved_by_user_id: 'admin-uuid-001',
        status: 'APPROVED',
      };

      const cardHtml = LeaveBoard.renderLeaveCardHtml(fullRecord, adminUser);

      assert.ok(cardHtml.includes('SICK'), 'Must display server-provided leave type');
      assert.ok(cardHtml.includes('Post-op recovery period'), 'Must display server-provided leave reason');
      assert.ok(cardHtml.includes('admin-uuid-001'), 'Must display server-provided approver ID');
    });
  });

  describe('5. Safe User-Facing Error State Formatting', () => {
    test('formatSafeErrorMessage preserves clean business error messages', () => {
      const msg1 = 'Both start date and end date are required.';
      assert.equal(LeaveBoard.formatSafeErrorMessage(msg1), msg1);

      const msg2 = 'End date cannot be earlier than start date.';
      assert.equal(LeaveBoard.formatSafeErrorMessage(msg2), msg2);

      const errObj = new Error('You are not authorized to submit leave requests for other users.');
      assert.equal(LeaveBoard.formatSafeErrorMessage(errObj), errObj.message);
    });

    test('formatSafeErrorMessage redacts internal connection errors and stack traces', () => {
      const dbErr = 'connect ECONNREFUSED 127.0.0.1:5432\n    at TCPConnectWrap.afterConnect';
      const formatted = LeaveBoard.formatSafeErrorMessage(dbErr);
      assert.equal(formatted.includes('ECONNREFUSED'), false);
      assert.equal(formatted.includes('127.0.0.1:5432'), false);
      assert.ok(formatted.includes('temporarily unavailable'));

      const sqlErr = 'error: relation "leave_records" does not exist\n    at Parser.parseErrorMessage';
      const formattedSql = LeaveBoard.formatSafeErrorMessage(sqlErr);
      assert.equal(formattedSql.includes('relation'), false);
      assert.ok(formattedSql.includes('temporarily unavailable'));
    });
  });

  describe('6. Navigation Link Integration Across Existing UI Pages', () => {
    test('index.html contains Leave Board navigation link', () => {
      const html = fs.readFileSync(path.join(frontendPublic, 'index.html'), 'utf8');
      assert.ok(html.includes('href="/leave.html"'), 'index.html must link to /leave.html');
      assert.ok(html.includes('Leave Board'), 'index.html must have Leave Board link text');
    });

    test('activities.html contains Leave Board navigation link', () => {
      const html = fs.readFileSync(path.join(frontendPublic, 'activities.html'), 'utf8');
      assert.ok(html.includes('href="/leave.html"'), 'activities.html must link to /leave.html');
      assert.ok(html.includes('Leave Board'), 'activities.html must have Leave Board link text');
    });

    test('admin.html contains Leave Board navigation link', () => {
      const html = fs.readFileSync(path.join(frontendPublic, 'admin.html'), 'utf8');
      assert.ok(html.includes('href="/leave.html"'), 'admin.html must link to /leave.html');
      assert.ok(html.includes('Leave Board'), 'admin.html must have Leave Board link text');
    });
  });
});
