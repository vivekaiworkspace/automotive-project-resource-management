import { test, describe, beforeEach, afterEach } from 'node:test';
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

describe('Leave Management Board UI Tests (Phase 8 Slice 1 Corrections)', () => {

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

    test('leave.html defines loading, empty, and safe error UI states', () => {
      const html = fs.readFileSync(leaveHtmlPath, 'utf8');

      assert.ok(html.includes('id="leave-loading-state"'), 'Must include loading state container');
      assert.ok(html.includes('id="leave-empty-state"'), 'Must include empty state container');
      assert.ok(html.includes('id="leave-error-state"'), 'Must include error state container');
      assert.ok(html.includes('id="alert-banner"'), 'Must include notification banner');
    });

    test('leave.html does not contain obsolete rejection modal markup', () => {
      const html = fs.readFileSync(leaveHtmlPath, 'utf8');
      assert.equal(html.includes('id="modal-rejection-reason"'), false, 'Rejection modal must be removed');
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

  describe('3. F-01: Action Authorization — Absence of Inferred Approve/Reject Controls', () => {
    const pendingRecord = {
      id: 'leave-rec-001',
      user_id: 'member-uuid-101',
      start_date: '2026-11-16',
      end_date: '2026-11-20',
      duration_days: 5,
      duration_hours: 40,
      leave_type: 'ANNUAL',
      leave_reason: 'Vacation',
      status: 'PENDING',
      version: 1,
    };

    const pilotRoles = [
      'SYSTEM_ADMIN',
      'RESOURCE_MANAGER',
      'TEAM_LEAD',
      'PROJECT_MANAGER',
      'TEAM_MEMBER',
    ];

    for (const role of pilotRoles) {
      test(`Approve and reject controls are completely ABSENT for role ${role} when explicit action authorization is absent`, () => {
        const testUser = { id: 'viewer-uuid-999', roles: [role] };

        // Test card rendering
        const cardHtml = LeaveBoard.renderLeaveCardHtml(pendingRecord, testUser);
        assert.equal(cardHtml.includes('btn-action-approve'), false, `Card must not render approve button for ${role}`);
        assert.equal(cardHtml.includes('btn-action-reject'), false, `Card must not render reject button for ${role}`);
        assert.equal(cardHtml.includes('Approve'), false, `Card must not render Approve text for ${role}`);
        assert.equal(cardHtml.includes('Reject'), false, `Card must not render Reject text for ${role}`);

        // Test list rendering DOM insertion
        const mockTableBody = {
          innerHTML: '',
          insertAdjacentHTML: (pos, html) => { mockTableBody.innerHTML += html; }
        };
        const prevGlobalDoc = globalThis.document;
        globalThis.document = {
          getElementById: (id) => id === 'leave-table-body' ? mockTableBody : null,
          querySelectorAll: () => []
        };
        try {
          LeaveBoard.renderListView([pendingRecord], testUser);
          assert.equal(mockTableBody.innerHTML.includes('btn-action-approve'), false, `List must not render approve button for ${role}`);
          assert.equal(mockTableBody.innerHTML.includes('btn-action-reject'), false, `List must not render reject button for ${role}`);
        } finally {
          globalThis.document = prevGlobalDoc;
        }
      });
    }

    test('Non-pending records (APPROVED, REJECTED, CANCELLED) also render NO approve or reject buttons', () => {
      const adminUser = { id: 'admin-uuid-001', roles: ['SYSTEM_ADMIN'] };

      for (const st of ['APPROVED', 'REJECTED', 'CANCELLED']) {
        const record = { ...pendingRecord, id: `leave-${st}`, status: st };
        const cardHtml = LeaveBoard.renderLeaveCardHtml(record, adminUser);
        assert.equal(cardHtml.includes('btn-action-approve'), false, `Must not render approve button on ${st}`);
        assert.equal(cardHtml.includes('btn-action-reject'), false, `Must not render reject button on ${st}`);
      }
    });
  });

  describe('4. F-02: Safe & Neutral Rendering of Missing / Null Details', () => {
    test('Card reason container is completely OMITTED when leave_reason is null or omitted', () => {
      const user = { id: 'user-uuid-100', roles: ['TEAM_MEMBER'] };

      const nullReasonRecord = {
        id: 'leave-null-reason',
        user_id: 'user-uuid-100',
        start_date: '2026-11-16',
        end_date: '2026-11-20',
        leave_type: 'ANNUAL',
        leave_reason: null, // explicit null
        status: 'APPROVED',
      };

      const omittedReasonRecord = {
        id: 'leave-omitted-reason',
        user_id: 'user-uuid-100',
        start_date: '2026-11-16',
        end_date: '2026-11-20',
        leave_type: 'ANNUAL',
        status: 'APPROVED', // leave_reason omitted
      };

      const htmlNull = LeaveBoard.renderLeaveCardHtml(nullReasonRecord, user);
      assert.equal(htmlNull.includes('leave-reason-box'), false, 'leave-reason-box must be omitted when null');
      assert.equal(htmlNull.includes('Reason confidential / masked by policy'), false, 'Must not invent policy explanation');
      assert.equal(htmlNull.includes('Confidential / Masked'), false, 'Must not invent confidential text');

      const htmlOmitted = LeaveBoard.renderLeaveCardHtml(omittedReasonRecord, user);
      assert.equal(htmlOmitted.includes('leave-reason-box'), false, 'leave-reason-box must be omitted when omitted');
      assert.equal(htmlOmitted.includes('Reason confidential / masked by policy'), false, 'Must not invent policy explanation');
    });

    test('Card leave_type renders neutral em dash pill when absent or null, without invented text', () => {
      const user = { id: 'user-uuid-100', roles: ['PROJECT_MANAGER'] };

      const nullTypeRecord = {
        id: 'leave-null-type',
        user_id: 'user-uuid-200',
        start_date: '2026-11-16',
        end_date: '2026-11-20',
        leave_type: null,
        status: 'PENDING',
      };

      const cardHtml = LeaveBoard.renderLeaveCardHtml(nullTypeRecord, user);
      assert.ok(cardHtml.includes('—'), 'Must render neutral em dash for absent leave_type');
      assert.equal(cardHtml.includes('Not Disclosed'), false, 'Must not invent "Not Disclosed" label');
      assert.equal(cardHtml.includes('type-protected'), false, 'Must not invent protected classification');
    });

    test('Table list view renders neutral em dash (—) for null leave_type and null leave_reason', () => {
      const user = { id: 'user-uuid-100', roles: ['TEAM_MEMBER'] };
      const maskedRecord = {
        id: 'leave-tbl-masked',
        user_id: 'user-uuid-200',
        start_date: '2026-11-16',
        end_date: '2026-11-20',
        duration_days: 5,
        duration_hours: 40,
        leave_type: null,
        leave_reason: null,
        approved_by_user_id: null,
        status: 'APPROVED',
      };

      const mockTableBody = {
        innerHTML: '',
        insertAdjacentHTML: (pos, html) => { mockTableBody.innerHTML += html; }
      };
      const prevGlobalDoc = globalThis.document;
      globalThis.document = {
        getElementById: (id) => id === 'leave-table-body' ? mockTableBody : null,
        querySelectorAll: () => []
      };
      try {
        LeaveBoard.renderListView([maskedRecord], user);
        assert.ok(mockTableBody.innerHTML.includes('<td>—</td>'), 'Fixed table cells must display neutral em dash');
        assert.equal(mockTableBody.innerHTML.includes('Not Disclosed'), false, 'Must not contain "Not Disclosed"');
        assert.equal(mockTableBody.innerHTML.includes('Confidential / Masked'), false, 'Must not contain "Confidential / Masked"');
      } finally {
        globalThis.document = prevGlobalDoc;
      }
    });

    test('Actual server-provided text is safely escaped without script injection', () => {
      const maliciousRecord = {
        id: 'leave-malicious',
        user_id: '<script>alert("xss")</script>',
        start_date: '2026-11-16',
        end_date: '2026-11-20',
        duration_days: 5,
        duration_hours: 40,
        leave_type: 'ANNUAL',
        leave_reason: '<img src=x onerror=alert(1)> & "Family Holiday"',
        status: 'APPROVED',
      };

      const user = { id: 'user-uuid-100', roles: ['SYSTEM_ADMIN'] };
      const cardHtml = LeaveBoard.renderLeaveCardHtml(maliciousRecord, user);

      assert.equal(cardHtml.includes('<script>'), false, 'Must not inject unescaped script tag');
      assert.ok(cardHtml.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'), 'Must safely escape user_id');
      assert.equal(cardHtml.includes('<img src=x'), false, 'Must not inject unescaped img tag');
      assert.ok(cardHtml.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Family Holiday&quot;'), 'Must safely escape leave_reason');
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

      const cleanErr = 'Both start date and end date are required.';
      assert.equal(LeaveBoard.formatSafeErrorMessage(cleanErr), cleanErr);
    });
  });

  describe('5. F-03: Cancellation Scope — Strict Ownership Rules', () => {
    const ownPendingRecord = {
      id: 'leave-own-pending',
      user_id: 'current-user-123',
      start_date: '2026-11-16',
      end_date: '2026-11-20',
      status: 'PENDING',
    };

    const ownApprovedRecord = {
      ...ownPendingRecord,
      id: 'leave-own-approved',
      status: 'APPROVED',
    };

    const otherMemberPendingRecord = {
      id: 'leave-other-pending',
      user_id: 'other-user-456',
      start_date: '2026-11-16',
      end_date: '2026-11-20',
      status: 'PENDING',
    };

    test('Own eligible records (PENDING, APPROVED) retain cancellation controls', () => {
      const currentUser = { id: 'current-user-123', roles: ['TEAM_MEMBER'] };

      const pendingHtml = LeaveBoard.renderLeaveCardHtml(ownPendingRecord, currentUser);
      assert.ok(pendingHtml.includes('btn-action-cancel-record'), 'Self-cancellation must be present on own PENDING record');

      const approvedHtml = LeaveBoard.renderLeaveCardHtml(ownApprovedRecord, currentUser);
      assert.ok(approvedHtml.includes('btn-action-cancel-record'), 'Self-cancellation must be present on own APPROVED record');
    });

    test('Ineligible statuses (REJECTED, CANCELLED) do NOT show cancellation controls, even for owner', () => {
      const currentUser = { id: 'current-user-123', roles: ['TEAM_MEMBER'] };

      const rejectedRecord = { ...ownPendingRecord, id: 'leave-own-rejected', status: 'REJECTED' };
      const rejectedHtml = LeaveBoard.renderLeaveCardHtml(rejectedRecord, currentUser);
      assert.equal(rejectedHtml.includes('btn-action-cancel-record'), false, 'Cannot cancel REJECTED leave');

      const cancelledRecord = { ...ownPendingRecord, id: 'leave-own-cancelled', status: 'CANCELLED' };
      const cancelledHtml = LeaveBoard.renderLeaveCardHtml(cancelledRecord, currentUser);
      assert.equal(cancelledHtml.includes('btn-action-cancel-record'), false, 'Cannot cancel already CANCELLED leave');
    });

    test('Other-member records NEVER gain cancellation controls from approver role names', () => {
      const approverRoles = ['SYSTEM_ADMIN', 'RESOURCE_MANAGER', 'TEAM_LEAD', 'PROJECT_MANAGER'];

      for (const role of approverRoles) {
        const viewer = { id: 'current-user-123', roles: [role] };
        const cardHtml = LeaveBoard.renderLeaveCardHtml(otherMemberPendingRecord, viewer);
        assert.equal(
          cardHtml.includes('btn-action-cancel-record'),
          false,
          `Other-member record must NOT display cancel button for ${role}`
        );
      }
    });

    test('Record with missing user_id does not display cancellation controls', () => {
      const currentUser = { id: 'current-user-123', roles: ['TEAM_MEMBER'] };
      const noUserRecord = {
        id: 'leave-no-user',
        user_id: null,
        status: 'PENDING',
      };

      const cardHtml = LeaveBoard.renderLeaveCardHtml(noUserRecord, currentUser);
      assert.equal(cardHtml.includes('btn-action-cancel-record'), false, 'Unidentifiable owner record must omit cancel control');
    });
  });

  describe('6. F-04: Duplicate Request In-Flight Protection', () => {
    let mockElements = {};
    let prevGlobalDoc;

    beforeEach(() => {
      mockElements = {
        'btn-submit-leave': { disabled: false, textContent: 'Submit Request', dataset: {} },
        'leave-form-error': { style: { display: 'none' }, textContent: '' },
        'input-start-date': { value: '2026-11-16' },
        'input-end-date': { value: '2026-11-20' },
        'input-leave-type': { value: 'ANNUAL' },
        'input-leave-reason': { value: 'Vacation' },
        'input-target-user-id': { value: '' },
        'modal-leave-request': { style: { display: 'flex' } },
        'alert-banner': { style: { display: 'none' }, className: '' },
        'alert-message': { textContent: '' },
        'form-leave-request': { reset: () => {} },
      };

      prevGlobalDoc = globalThis.document;
      globalThis.document = {
        getElementById: (id) => mockElements[id] || null,
        querySelectorAll: () => [],
      };
    });

    afterEach(() => {
      globalThis.document = prevGlobalDoc;
      LeaveBoard.resetApiFetch();
    });

    test('Repeated submission while pending produces exactly ONE apiFetch POST, disabling initiating control', async () => {
      let postCallCount = 0;
      let resolvePromise;
      const deferredPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      LeaveBoard.setApiFetch(async (url, options = {}) => {
        if (options && (options.method || 'GET').toUpperCase() === 'POST') {
          postCallCount++;
          await deferredPromise;
          return { data: { id: 'new-leave-id', status: 'PENDING' } };
        }
        return { data: [] }; // GET from loadLeaveRecords()
      });

      // Initiate first submission
      const promise1 = LeaveBoard.handleCreateLeave({ preventDefault: () => {} });

      // In-flight guard should now be active
      assert.equal(LeaveBoard.isSubmitting(), true, 'In-flight guard must be true');
      assert.equal(mockElements['btn-submit-leave'].disabled, true, 'Submit button must be disabled');

      // Attempt repeated submission while first is still pending
      const promise2 = LeaveBoard.handleCreateLeave({ preventDefault: () => {} });

      // Call count must remain 1
      assert.equal(postCallCount, 1, 'Duplicate submission must be ignored while in-flight');

      // Resolve the deferred request
      resolvePromise();
      await Promise.all([promise1, promise2]);

      // Guard cleared and button re-enabled
      assert.equal(LeaveBoard.isSubmitting(), false, 'In-flight guard must be cleared in finally');
      assert.equal(mockElements['btn-submit-leave'].disabled, false, 'Submit button must be restored');
      assert.equal(postCallCount, 1, 'Total POST requests must be exactly 1');
    });

    test('Submission failure clears in-flight guard and restores initiating control to permit retry', async () => {
      let postCallCount = 0;

      // First attempt fails with network error
      LeaveBoard.setApiFetch(async (url, options = {}) => {
        if (options && (options.method || 'GET').toUpperCase() === 'POST') {
          postCallCount++;
          throw new Error('Network error during submission');
        }
        return { data: [] };
      });

      await LeaveBoard.handleCreateLeave({ preventDefault: () => {} });

      assert.equal(postCallCount, 1);
      assert.equal(LeaveBoard.isSubmitting(), false, 'Guard must be cleared even on failure');
      assert.equal(mockElements['btn-submit-leave'].disabled, false, 'Button must be re-enabled after failure');
      assert.equal(mockElements['leave-form-error'].style.display, 'block', 'Error must be displayed');

      // Second attempt succeeds
      LeaveBoard.setApiFetch(async (url, options = {}) => {
        if (options && (options.method || 'GET').toUpperCase() === 'POST') {
          postCallCount++;
          return { data: { id: 'retry-leave-id', status: 'PENDING' } };
        }
        return { data: [] };
      });

      await LeaveBoard.handleCreateLeave({ preventDefault: () => {} });

      assert.equal(postCallCount, 2, 'Retry must be permitted after failure, producing second POST');
      assert.equal(LeaveBoard.isSubmitting(), false, 'Guard must remain cleared');
      assert.equal(mockElements['btn-submit-leave'].disabled, false, 'Button restored');
    });

    test('Cancellation in-flight guard prevents duplicate cancellation requests', async () => {
      let cancelCallCount = 0;
      let resolvePromise;
      const deferredPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      LeaveBoard.setApiFetch(async (url) => {
        if (url.includes('/cancel')) {
          cancelCallCount++;
          await deferredPromise;
          return { data: { id: 'cancel-123', status: 'CANCELLED' } };
        }
        return { data: [] };
      });

      const mockBtn = { disabled: false };

      // Initiate first cancel
      const p1 = LeaveBoard.handleCancelLeave('leave-cancel-999', mockBtn);

      assert.equal(LeaveBoard.isCancelling('leave-cancel-999'), true, 'Cancelling guard must be set');
      assert.equal(mockBtn.disabled, true, 'Trigger button must be disabled');

      // Duplicate cancel invocation for same leave ID
      const p2 = LeaveBoard.handleCancelLeave('leave-cancel-999', mockBtn);

      assert.equal(cancelCallCount, 1, 'Duplicate cancel must not trigger additional POST');

      // Resolve deferred cancel request
      resolvePromise();
      await Promise.all([p1, p2]);

      assert.equal(LeaveBoard.isCancelling('leave-cancel-999'), false, 'Cancelling guard must be cleared');
      assert.equal(mockBtn.disabled, false, 'Trigger button must be re-enabled');
      assert.equal(cancelCallCount, 1);
    });
  });

  describe('7. Navigation Link Integration Across Existing UI Pages', () => {
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

  describe('8. Session Expiry & HTTP 401 / 403 Request Boundary Handling', () => {
    let mockElements = {};
    let prevGlobalDoc;
    let prevGlobalWindow;
    let prevGlobalFetch;

    beforeEach(() => {
      mockElements = {
        'leave-loading-state': { style: { display: 'none' } },
        'leave-empty-state': { style: { display: 'none' } },
        'leave-error-state': { style: { display: 'none' } },
        'leave-error-message': { textContent: '' },
        'leave-tab-content': { style: { display: 'none' } },
        'filter-start-date': { value: '' },
        'filter-end-date': { value: '' },
        'filter-status': { value: '' },
        'btn-submit-leave': { disabled: false, textContent: 'Submit Request', dataset: {} },
        'leave-form-error': { style: { display: 'none' }, textContent: '' },
        'input-start-date': { value: '2026-11-16' },
        'input-end-date': { value: '2026-11-20' },
        'input-leave-type': { value: 'ANNUAL' },
        'input-leave-reason': { value: 'Vacation' },
        'input-target-user-id': { value: '' },
        'modal-leave-request': { style: { display: 'flex' } },
        'alert-banner': { style: { display: 'none' }, className: '' },
        'alert-message': { textContent: '' },
        'form-leave-request': { reset: () => {} },
      };

      prevGlobalDoc = globalThis.document;
      prevGlobalWindow = globalThis.window;
      prevGlobalFetch = globalThis.fetch;

      globalThis.window = {
        location: { href: '' },
        confirm: () => true,
      };

      globalThis.document = {
        getElementById: (id) => mockElements[id] || null,
        querySelectorAll: () => [],
      };
    });

    afterEach(() => {
      globalThis.document = prevGlobalDoc;
      globalThis.window = prevGlobalWindow;
      globalThis.fetch = prevGlobalFetch;
      LeaveBoard.resetApiFetch();
    });

    test('List refresh receiving HTTP 401 initiates login redirection without ordinary inline load-error state', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }),
      });

      await LeaveBoard.loadLeaveRecords();

      assert.equal(globalThis.window.location.href, '/login.html', 'Must redirect to /login.html on 401');
      assert.equal(mockElements['leave-error-state'].style.display, 'none', 'Inline error state must NOT be rendered');
      assert.equal(mockElements['leave-error-message'].textContent, '', 'Error message must NOT be populated');
    });

    test('Submission receiving HTTP 401 initiates login redirection, suppresses form error, and cleans up guard', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }),
      });

      await LeaveBoard.handleCreateLeave({ preventDefault: () => {} });

      assert.equal(globalThis.window.location.href, '/login.html', 'Must redirect to /login.html on 401');
      assert.equal(LeaveBoard.isSubmitting(), false, 'isSubmitting guard must be cleared in finally');
      assert.equal(mockElements['btn-submit-leave'].disabled, false, 'Submit button must be restored');
      assert.equal(mockElements['leave-form-error'].style.display, 'none', 'Form error must NOT be rendered');
    });

    test('Cancellation receiving HTTP 401 initiates login redirection, suppresses alert error, and cleans up guard', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }),
      });

      const mockBtn = { disabled: false };
      await LeaveBoard.handleCancelLeave('leave-rec-401', mockBtn);

      assert.equal(globalThis.window.location.href, '/login.html', 'Must redirect to /login.html on 401');
      assert.equal(LeaveBoard.isCancelling('leave-rec-401'), false, 'Cancelling guard must be cleared in finally');
      assert.equal(mockBtn.disabled, false, 'Trigger button must be re-enabled');
      assert.equal(mockElements['alert-banner'].style.display, 'none', 'Alert banner error must NOT be displayed');
    });

    test('HTTP 403 on list refresh does NOT redirect to login and renders safe authorization error state', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: { code: 'FORBIDDEN', message: 'Access denied: insufficient view scope' } }),
      });

      await LeaveBoard.loadLeaveRecords();

      assert.equal(globalThis.window.location.href, '', 'Must NOT redirect to /login.html on HTTP 403');
      assert.equal(mockElements['leave-error-state'].style.display, 'flex', 'Safe error state must be rendered on 403');
      assert.ok(mockElements['leave-error-message'].textContent.includes('insufficient view scope'), 'Safe error message displayed');
    });

    test('HTTP 403 on submission does NOT redirect, renders safe form error, and preserves guard cleanup', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: { code: 'FORBIDDEN', message: 'Cannot create leave for this user' } }),
      });

      await LeaveBoard.handleCreateLeave({ preventDefault: () => {} });

      assert.equal(globalThis.window.location.href, '', 'Must NOT redirect on HTTP 403');
      assert.equal(LeaveBoard.isSubmitting(), false, 'isSubmitting guard must be cleared in finally');
      assert.equal(mockElements['btn-submit-leave'].disabled, false, 'Submit button must be restored');
      assert.equal(mockElements['leave-form-error'].style.display, 'block', 'Form error must be displayed on 403');
      assert.ok(mockElements['leave-form-error'].textContent.includes('Cannot create leave'), 'Safe error message displayed');
    });

    test('HTTP 403 on cancellation does NOT redirect, renders safe alert error, and preserves guard cleanup', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: { code: 'FORBIDDEN', message: 'You are not authorized to cancel this record' } }),
      });

      const mockBtn = { disabled: false };
      await LeaveBoard.handleCancelLeave('leave-rec-403', mockBtn);

      assert.equal(globalThis.window.location.href, '', 'Must NOT redirect on HTTP 403');
      assert.equal(LeaveBoard.isCancelling('leave-rec-403'), false, 'Cancelling guard must be cleared in finally');
      assert.equal(mockBtn.disabled, false, 'Trigger button must be re-enabled');
      assert.equal(mockElements['alert-banner'].style.display, 'flex', 'Alert banner must be displayed on 403');
      assert.ok(mockElements['alert-message'].textContent.includes('not authorized to cancel'), 'Safe error message displayed');
    });

    test('Session bootstrap initSessionAndProfile redirects on 401 and retains safe error on 403', async () => {
      // 401 on /api/v1/auth/me
      globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Session expired' } }),
      });

      await LeaveBoard.initSessionAndProfile();
      assert.equal(globalThis.window.location.href, '/login.html', 'initSessionAndProfile must redirect on 401');
      assert.equal(mockElements['leave-error-state'].style.display, 'none', 'Error state not shown on 401 redirect');

      // Reset and test 403
      globalThis.window.location.href = '';
      globalThis.fetch = async () => ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: { code: 'FORBIDDEN', message: 'Account suspended' } }),
      });

      await LeaveBoard.initSessionAndProfile();
      assert.equal(globalThis.window.location.href, '', 'Must NOT redirect on 403');
      assert.equal(mockElements['leave-error-state'].style.display, 'flex', 'Error state shown on 403');
    });

    test('customApiFetch throwing 401 error also initiates redirection and halts error rendering', async () => {
      LeaveBoard.setApiFetch(async () => {
        const err = new Error('HTTP 401: Unauthorized');
        err.status = 401;
        throw err;
      });

      await LeaveBoard.loadLeaveRecords();
      assert.equal(globalThis.window.location.href, '/login.html', 'customApiFetch 401 must trigger redirect');
      assert.equal(mockElements['leave-error-state'].style.display, 'none', 'Inline error state suppressed');
    });
  });
});
