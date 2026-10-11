/**
 * Leave Management Board UI Controller (Phase 8 Slice 1)
 * Enforces server-authoritative privacy serialization (CPD-006)
 * and strict role-based approval action visibility.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LeaveBoard = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Allowed leave types matching backend specification
  const VALID_LEAVE_TYPES = ['ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'OTHER'];
  const APPROVER_ROLES = ['SYSTEM_ADMIN', 'RESOURCE_MANAGER', 'TEAM_LEAD'];

  let currentUser = null;
  let csrfToken = null;
  let cachedLeaveRecords = [];
  let currentActiveTab = 'tab-board';

  /**
   * Escape HTML entities to prevent XSS
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Safe user-facing error message extractor (prevents stack traces & internal leaking)
   */
  function formatSafeErrorMessage(err, fallback = 'An unexpected error occurred while processing the leave request.') {
    if (!err) return fallback;
    const raw = typeof err === 'string' ? err : (err.message || fallback);
    const firstLine = raw.split('\n')[0].trim();

    // Redact internal error signatures
    if (
      firstLine.includes('ECONNREFUSED') ||
      firstLine.includes('ENOTFOUND') ||
      firstLine.includes('database') ||
      firstLine.includes('relation') ||
      firstLine.includes('syntax error') ||
      firstLine.includes('pg_') ||
      firstLine.includes('SQL') ||
      firstLine.includes('node:') ||
      firstLine.includes('at ')
    ) {
      return 'The leave service is temporarily unavailable. Please verify connectivity and try again.';
    }
    return firstLine || fallback;
  }

  /**
   * Check if current user is authorized to perform approve/reject actions
   */
  function canUserApprove(user) {
    if (!user || !Array.isArray(user.roles)) return false;
    return user.roles.some(r => APPROVER_ROLES.includes(r));
  }

  /**
   * Display global alert notification banner
   */
  function showAlert(message, type = 'error') {
    const banner = document.getElementById('alert-banner');
    const msgEl = document.getElementById('alert-message');
    if (!banner || !msgEl) return;

    msgEl.textContent = formatSafeErrorMessage(message);
    banner.className = `admin-alert-banner ${type === 'success' ? 'alert-success' : 'alert-error'}`;
    banner.style.display = 'flex';

    if (type === 'success') {
      setTimeout(() => {
        if (banner.style.display === 'flex') banner.style.display = 'none';
      }, 6000);
    }
  }

  /**
   * Standardized authenticated API fetch wrapper
   */
  async function apiFetch(url, options = {}) {
    const defaultHeaders = {
      'Accept': 'application/json',
    };

    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      if (csrfToken) {
        defaultHeaders['X-CSRF-Token'] = csrfToken;
      }
      if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }
    }

    options.headers = { ...defaultHeaders, ...(options.headers || {}) };
    options.credentials = 'same-origin';

    const res = await fetch(url, options);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const err = new Error(data?.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      err.status = res.status;
      err.code = data?.error?.code;
      err.details = data?.error?.details;
      throw err;
    }
    return data;
  }

  /**
   * Initialize Session & Authenticated Profile
   */
  async function initSessionAndProfile() {
    try {
      const meData = await apiFetch('/api/v1/auth/me');
      currentUser = meData.user;

      try {
        const csrfData = await apiFetch('/api/v1/auth/csrf-token');
        csrfToken = csrfData.csrf_token || csrfData.csrfToken;
      } catch (e) {
        console.warn('CSRF token fetch warning:', e);
      }

      renderUserProfile(currentUser);
      await loadLeaveRecords();
    } catch (err) {
      if (err.status === 401 || err.code === 'UNAUTHENTICATED' || err.code === 'UNAUTHORIZED') {
        window.location.href = '/login.html';
        return;
      }
      showErrorState(formatSafeErrorMessage(err));
    }
  }

  /**
   * Render User Details in Header
   */
  function renderUserProfile(user) {
    if (!user) return;
    const avatar = document.getElementById('header-avatar');
    const nameEl = document.getElementById('header-user-name');
    const adminLink = document.getElementById('nav-admin-link');

    const fullName = user.full_name || user.fullName || 'User';
    if (avatar) {
      const initials = fullName
        .split(' ')
        .map(p => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      avatar.textContent = initials || 'U';
    }

    if (nameEl) {
      const rolesList = (user.roles || []).join(', ');
      nameEl.textContent = `${fullName} (${rolesList || 'Member'})`;
    }

    if (adminLink && Array.isArray(user.roles) && user.roles.includes('SYSTEM_ADMIN')) {
      adminLink.style.display = 'inline-flex';
    }
  }

  /**
   * Load Leave Records with Active Filters
   */
  async function loadLeaveRecords() {
    showLoadingState();

    const startDate = document.getElementById('filter-start-date')?.value?.trim();
    const endDate = document.getElementById('filter-end-date')?.value?.trim();
    const status = document.getElementById('filter-status')?.value?.trim();

    const queryParams = new URLSearchParams();
    if (startDate) queryParams.set('start_date', startDate);
    if (endDate) queryParams.set('end_date', endDate);
    if (status) queryParams.set('status', status);

    const queryString = queryParams.toString();
    const url = `/api/v1/leave${queryString ? `?${queryString}` : ''}`;

    try {
      const resp = await apiFetch(url);
      const records = resp.data || resp.leaves || [];
      cachedLeaveRecords = Array.isArray(records) ? records : [];

      updateStatsSummary(cachedLeaveRecords);

      if (cachedLeaveRecords.length === 0) {
        showEmptyState();
      } else {
        hideStates();
        renderBoardView(cachedLeaveRecords);
        renderListView(cachedLeaveRecords);
        renderMyLeavesView(cachedLeaveRecords);
      }
    } catch (err) {
      showErrorState(formatSafeErrorMessage(err));
    }
  }

  /**
   * Update Summary Metric Counters
   */
  function updateStatsSummary(records) {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let cancelled = 0;

    for (const r of records) {
      if (r.status === 'PENDING') pending++;
      else if (r.status === 'APPROVED') approved++;
      else if (r.status === 'REJECTED') rejected++;
      else if (r.status === 'CANCELLED') cancelled++;
    }

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('stat-total', records.length);
    setVal('stat-pending', pending);
    setVal('stat-approved', approved);
    setVal('stat-rejected', rejected);
    setVal('stat-cancelled', cancelled);

    setVal('badge-col-pending', pending);
    setVal('badge-col-approved', approved);
    setVal('badge-col-rejected', rejected);
    setVal('badge-col-cancelled', cancelled);
  }

  /**
   * Render Kanban Board View (Grouped by Status)
   */
  function renderBoardView(records) {
    const listPending = document.getElementById('column-cards-pending');
    const listApproved = document.getElementById('column-cards-approved');
    const listRejected = document.getElementById('column-cards-rejected');
    const listCancelled = document.getElementById('column-cards-cancelled');

    if (!listPending || !listApproved || !listRejected || !listCancelled) return;

    listPending.innerHTML = '';
    listApproved.innerHTML = '';
    listRejected.innerHTML = '';
    listCancelled.innerHTML = '';

    for (const record of records) {
      const cardHtml = renderLeaveCardHtml(record, currentUser);
      switch (record.status) {
        case 'PENDING':
          listPending.insertAdjacentHTML('beforeend', cardHtml);
          break;
        case 'APPROVED':
          listApproved.insertAdjacentHTML('beforeend', cardHtml);
          break;
        case 'REJECTED':
          listRejected.insertAdjacentHTML('beforeend', cardHtml);
          break;
        case 'CANCELLED':
          listCancelled.insertAdjacentHTML('beforeend', cardHtml);
          break;
      }
    }

    attachCardActionHandlers();
  }

  /**
   * Render HTML for an Individual Leave Card
   * PRIVACY RULE: Displays only fields present in server record.
   * APPROVAL RULE: Approve/Reject controls only rendered if authorized.
   */
  function renderLeaveCardHtml(record, user) {
    const isApprover = canUserApprove(user);
    const isOwnRecord = user && record.user_id && user.id === record.user_id;

    // Dates and Duration
    const startDate = record.start_date || record.unavailable_from || '—';
    const endDate = record.end_date || record.unavailable_to || '—';
    const days = record.duration_days !== undefined && record.duration_days !== null ? `${record.duration_days}d` : '';
    const hours = record.duration_hours !== undefined && record.duration_hours !== null ? `${record.duration_hours}h` : '';
    const durationLabel = [days, hours].filter(Boolean).join(' / ') || '—';

    // Leave Type (Server Privacy Serialization: null when masked for PM/peer)
    let typeBadgeHtml = '';
    if (record.leave_type) {
      const typeLower = String(record.leave_type).toLowerCase();
      typeBadgeHtml = `<span class="leave-type-pill type-${escapeHtml(typeLower)}">${escapeHtml(record.leave_type)}</span>`;
    } else {
      typeBadgeHtml = `<span class="leave-type-pill type-protected">Type: Not Disclosed</span>`;
    }

    // Leave Reason (Server Privacy Serialization: null when masked for TL/PM/peer)
    let reasonHtml = '';
    if (record.leave_reason) {
      reasonHtml = `<div class="leave-reason-box">${escapeHtml(record.leave_reason)}</div>`;
    } else {
      reasonHtml = `<div class="leave-reason-box reason-masked">Reason confidential / masked by policy</div>`;
    }

    // Approver Info (Server Privacy Serialization: only present for Admin and in-scope RM)
    let approverHtml = '';
    if (record.approved_by_user_id) {
      approverHtml = `<div class="leave-approver-info"><span>Approver ID:</span> <span>${escapeHtml(record.approved_by_user_id)}</span></div>`;
    }

    // Actions
    let actionsHtml = '';
    const isPending = record.status === 'PENDING';
    const isApproved = record.status === 'APPROVED';

    // Show approve/reject ONLY when server profile indicates authorization
    if (isApprover && isPending) {
      actionsHtml += `
        <button class="btn-action-approve" data-id="${escapeHtml(record.id)}" title="Approve leave request">
          &#10003; Approve
        </button>
        <button class="btn-action-reject" data-id="${escapeHtml(record.id)}" title="Reject leave request">
          &#10005; Reject
        </button>
      `;
    }

    // Cancellation: Requester (self) or Approver, if not already cancelled/rejected
    if ((isOwnRecord || isApprover) && (isPending || isApproved)) {
      actionsHtml += `
        <button class="btn-action-cancel-record" data-id="${escapeHtml(record.id)}" title="Cancel leave request">
          Cancel
        </button>
      `;
    }

    return `
      <div class="leave-card" id="leave-card-${escapeHtml(record.id)}">
        <div class="leave-card-top">
          ${typeBadgeHtml}
          <span class="leave-duration-badge">${escapeHtml(durationLabel)}</span>
        </div>

        <div class="leave-dates-row">
          <span>${escapeHtml(startDate)}</span>
          <span class="leave-dates-arrow">&rarr;</span>
          <span>${escapeHtml(endDate)}</span>
        </div>

        <div class="leave-meta-row">
          <div class="leave-user-ref">
            <span>User:</span>
            <span>${escapeHtml(record.user_id || record.member_id || '—')}</span>
          </div>
          ${approverHtml}
        </div>

        ${reasonHtml}

        ${actionsHtml ? `<div class="leave-card-actions">${actionsHtml}</div>` : ''}
      </div>
    `;
  }

  /**
   * Render Tabular Records List View
   */
  function renderListView(records) {
    const tableBody = document.getElementById('leave-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    const isApprover = canUserApprove(currentUser);

    for (const record of records) {
      const isOwnRecord = currentUser && record.user_id && currentUser.id === record.user_id;
      const startDate = record.start_date || record.unavailable_from || '—';
      const endDate = record.end_date || record.unavailable_to || '—';
      const days = record.duration_days !== undefined && record.duration_days !== null ? `${record.duration_days}d` : '—';
      const hours = record.duration_hours !== undefined && record.duration_hours !== null ? `${record.duration_hours}h` : '—';

      const typeDisplay = record.leave_type ? escapeHtml(record.leave_type) : '<span style="color:var(--text-dim);font-style:italic;">Not Disclosed</span>';
      const reasonDisplay = record.leave_reason ? escapeHtml(record.leave_reason) : '<span style="color:var(--text-dim);font-style:italic;">Confidential / Masked</span>';
      const approverDisplay = record.approved_by_user_id ? escapeHtml(record.approved_by_user_id) : '—';

      const statusClass = `status-${String(record.status).toLowerCase()}`;

      // Actions
      let actionsHtml = '';
      if (isApprover && record.status === 'PENDING') {
        actionsHtml += `
          <button class="btn-action-approve" data-id="${escapeHtml(record.id)}" style="padding:2px 8px;font-size:0.7rem;">Approve</button>
          <button class="btn-action-reject" data-id="${escapeHtml(record.id)}" style="padding:2px 8px;font-size:0.7rem;">Reject</button>
        `;
      }
      if ((isOwnRecord || isApprover) && (record.status === 'PENDING' || record.status === 'APPROVED')) {
        actionsHtml += `
          <button class="btn-action-cancel-record" data-id="${escapeHtml(record.id)}" style="padding:2px 6px;font-size:0.7rem;">Cancel</button>
        `;
      }

      const rowHtml = `
        <tr id="leave-row-${escapeHtml(record.id)}">
          <td><span class="status-pill ${statusClass}">${escapeHtml(record.status)}</span></td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;">${escapeHtml(startDate)} &rarr; ${escapeHtml(endDate)}</td>
          <td>${days} (${hours})</td>
          <td>${typeDisplay}</td>
          <td>${reasonDisplay}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:0.72rem;">${escapeHtml(record.user_id || record.member_id || '—')}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:0.72rem;">${approverDisplay}</td>
          <td><div style="display:flex;gap:4px;">${actionsHtml || '—'}</div></td>
        </tr>
      `;
      tableBody.insertAdjacentHTML('beforeend', rowHtml);
    }
  }

  /**
   * Render "My Leaves" Filtered View
   */
  function renderMyLeavesView(records) {
    const container = document.getElementById('my-leaves-container');
    if (!container) return;

    container.innerHTML = '';
    if (!currentUser) return;

    const myRecords = records.filter(r => r.user_id === currentUser.id);

    if (myRecords.length === 0) {
      container.innerHTML = `
        <div class="state-container">
          <div class="state-title">No Personal Leave Records</div>
          <p class="state-description">You have not submitted any leave requests within the current filter range.</p>
        </div>
      `;
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'leave-board-columns';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';

    for (const record of myRecords) {
      const cardHtml = renderLeaveCardHtml(record, currentUser);
      grid.insertAdjacentHTML('beforeend', cardHtml);
    }

    container.appendChild(grid);
  }

  /**
   * Attach Action Handlers (Approve, Reject, Cancel)
   */
  function attachCardActionHandlers() {
    document.querySelectorAll('.btn-action-approve').forEach(btn => {
      btn.onclick = async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (id) await handleApproveLeave(id);
      };
    });

    document.querySelectorAll('.btn-action-reject').forEach(btn => {
      btn.onclick = (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (id) openRejectionModal(id);
      };
    });

    document.querySelectorAll('.btn-action-cancel-record').forEach(btn => {
      btn.onclick = async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (id) await handleCancelLeave(id);
      };
    });
  }

  /**
   * Approve Leave Request Action
   */
  async function handleApproveLeave(leaveId) {
    if (!leaveId) return;
    try {
      await apiFetch(`/api/v1/leave/${leaveId}/approve`, {
        method: 'POST',
      });
      showAlert('Leave request approved successfully. Capacity updated.', 'success');
      await loadLeaveRecords();
    } catch (err) {
      showAlert(`Approval failed: ${formatSafeErrorMessage(err)}`, 'error');
    }
  }

  /**
   * Reject Leave Request Action
   */
  async function handleRejectLeave(leaveId, rejectionReason) {
    if (!leaveId) return;
    try {
      await apiFetch(`/api/v1/leave/${leaveId}/reject`, {
        method: 'POST',
        body: {
          rejection_reason: rejectionReason || undefined,
        },
      });
      showAlert('Leave request rejected successfully.', 'success');
      closeRejectionModal();
      await loadLeaveRecords();
    } catch (err) {
      showAlert(`Rejection failed: ${formatSafeErrorMessage(err)}`, 'error');
    }
  }

  /**
   * Cancel Leave Request Action
   */
  async function handleCancelLeave(leaveId) {
    if (!leaveId) return;
    const confirmed = window.confirm('Are you sure you want to cancel this leave request?');
    if (!confirmed) return;

    try {
      await apiFetch(`/api/v1/leave/${leaveId}/cancel`, {
        method: 'POST',
      });
      showAlert('Leave request cancelled successfully.', 'success');
      await loadLeaveRecords();
    } catch (err) {
      showAlert(`Cancellation failed: ${formatSafeErrorMessage(err)}`, 'error');
    }
  }

  /**
   * Submit New Leave Request Form Handler
   */
  async function handleCreateLeave(event) {
    event.preventDefault();

    const formErrorEl = document.getElementById('leave-form-error');
    if (formErrorEl) formErrorEl.style.display = 'none';

    const startDate = document.getElementById('input-start-date')?.value?.trim();
    const endDate = document.getElementById('input-end-date')?.value?.trim();
    const leaveType = document.getElementById('input-leave-type')?.value?.trim();
    const leaveReason = document.getElementById('input-leave-reason')?.value?.trim();
    const targetUserId = document.getElementById('input-target-user-id')?.value?.trim();

    // Client-side format & consistency validation
    if (!startDate || !endDate) {
      showFormError('Both start date and end date are required.');
      return;
    }

    if (endDate < startDate) {
      showFormError('End date cannot be earlier than start date.');
      return;
    }

    if (!leaveType || !VALID_LEAVE_TYPES.includes(leaveType.toUpperCase())) {
      showFormError(`Invalid leave type. Must be one of: ${VALID_LEAVE_TYPES.join(', ')}.`);
      return;
    }

    if (!leaveReason) {
      showFormError('Leave reason is required.');
      return;
    }

    const payload = {
      start_date: startDate,
      end_date: endDate,
      leave_type: leaveType.toUpperCase(),
      leave_reason: leaveReason,
    };

    if (targetUserId) {
      payload.user_id = targetUserId;
    }

    try {
      await apiFetch('/api/v1/leave', {
        method: 'POST',
        body: payload,
      });

      showAlert('Leave request submitted successfully (Status: PENDING).', 'success');
      closeRequestModal();
      document.getElementById('form-leave-request')?.reset();
      await loadLeaveRecords();
    } catch (err) {
      showFormError(formatSafeErrorMessage(err));
    }
  }

  function showFormError(msg) {
    const formErrorEl = document.getElementById('leave-form-error');
    if (formErrorEl) {
      formErrorEl.textContent = msg;
      formErrorEl.style.display = 'block';
    } else {
      showAlert(msg, 'error');
    }
  }

  /**
   * UI State Helper Functions
   */
  function showLoadingState() {
    const loading = document.getElementById('leave-loading-state');
    const empty = document.getElementById('leave-empty-state');
    const error = document.getElementById('leave-error-state');
    const content = document.getElementById('leave-tab-content');

    if (loading) loading.style.display = 'flex';
    if (empty) empty.style.display = 'none';
    if (error) error.style.display = 'none';
    if (content) content.style.display = 'none';
  }

  function showEmptyState() {
    const loading = document.getElementById('leave-loading-state');
    const empty = document.getElementById('leave-empty-state');
    const error = document.getElementById('leave-error-state');
    const content = document.getElementById('leave-tab-content');

    if (loading) loading.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    if (error) error.style.display = 'none';
    if (content) content.style.display = 'none';
  }

  function showErrorState(message) {
    const loading = document.getElementById('leave-loading-state');
    const empty = document.getElementById('leave-empty-state');
    const error = document.getElementById('leave-error-state');
    const content = document.getElementById('leave-tab-content');
    const errorMsg = document.getElementById('leave-error-message');

    if (loading) loading.style.display = 'none';
    if (empty) empty.style.display = 'none';
    if (error) error.style.display = 'flex';
    if (errorMsg) errorMsg.textContent = message;
    if (content) content.style.display = 'none';
  }

  function hideStates() {
    const loading = document.getElementById('leave-loading-state');
    const empty = document.getElementById('leave-empty-state');
    const error = document.getElementById('leave-error-state');
    const content = document.getElementById('leave-tab-content');

    if (loading) loading.style.display = 'none';
    if (empty) empty.style.display = 'none';
    if (error) error.style.display = 'none';
    if (content) content.style.display = 'block';
  }

  /**
   * Modal Management
   */
  let pendingRejectionId = null;

  function openRequestModal() {
    const modal = document.getElementById('modal-leave-request');
    if (modal) modal.style.display = 'flex';
  }

  function closeRequestModal() {
    const modal = document.getElementById('modal-leave-request');
    if (modal) modal.style.display = 'none';
  }

  function openRejectionModal(leaveId) {
    pendingRejectionId = leaveId;
    const modal = document.getElementById('modal-rejection-reason');
    const input = document.getElementById('input-rejection-reason');
    if (input) input.value = '';
    if (modal) modal.style.display = 'flex';
  }

  function closeRejectionModal() {
    pendingRejectionId = null;
    const modal = document.getElementById('modal-rejection-reason');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Tab Navigation Setup
   */
  function setupTabNavigation() {
    const tabBtns = document.querySelectorAll('#leave-tabs-nav .admin-nav-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.leave-tab-panel').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        currentActiveTab = targetId;

        const targetPanel = document.getElementById(targetId);
        if (targetPanel) targetPanel.classList.add('active');
      });
    });
  }

  /**
   * Global Event Listeners Setup
   */
  function setupEventListeners() {
    // Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
          await fetch('/api/v1/auth/logout', { method: 'POST', headers });
        } catch (_) {}
        window.location.href = '/login.html';
      });
    }

    // Modal Triggers
    const btnOpenModal = document.getElementById('btn-open-request-modal');
    if (btnOpenModal) btnOpenModal.addEventListener('click', openRequestModal);

    const btnCloseModal = document.getElementById('btn-close-request-modal');
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeRequestModal);

    const btnCancelModal = document.getElementById('btn-cancel-request-modal');
    if (btnCancelModal) btnCancelModal.addEventListener('click', closeRequestModal);

    // Rejection Modal Triggers
    const btnCloseRejection = document.getElementById('btn-close-rejection-modal');
    if (btnCloseRejection) btnCloseRejection.addEventListener('click', closeRejectionModal);

    const btnCancelRejection = document.getElementById('btn-cancel-rejection-modal');
    if (btnCancelRejection) btnCancelRejection.addEventListener('click', closeRejectionModal);

    const btnConfirmRejection = document.getElementById('btn-confirm-rejection');
    if (btnConfirmRejection) {
      btnConfirmRejection.addEventListener('click', async () => {
        if (!pendingRejectionId) return;
        const reason = document.getElementById('input-rejection-reason')?.value?.trim();
        await handleRejectLeave(pendingRejectionId, reason);
      });
    }

    // Form Submit
    const formRequest = document.getElementById('form-leave-request');
    if (formRequest) formRequest.addEventListener('submit', handleCreateLeave);

    // Filters
    const btnApplyFilters = document.getElementById('btn-apply-filters');
    if (btnApplyFilters) btnApplyFilters.addEventListener('click', loadLeaveRecords);

    const btnResetFilters = document.getElementById('btn-reset-filters');
    if (btnResetFilters) {
      btnResetFilters.addEventListener('click', () => {
        const fStart = document.getElementById('filter-start-date');
        const fEnd = document.getElementById('filter-end-date');
        const fStatus = document.getElementById('filter-status');
        if (fStart) fStart.value = '';
        if (fEnd) fEnd.value = '';
        if (fStatus) fStatus.value = '';
        loadLeaveRecords();
      });
    }
  }

  // Auto-run on DOM ready in browser environment
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', async () => {
      setupTabNavigation();
      setupEventListeners();
      await initSessionAndProfile();
    });
  }

  // Return API object for programmatic testing
  return {
    VALID_LEAVE_TYPES,
    APPROVER_ROLES,
    canUserApprove,
    formatSafeErrorMessage,
    escapeHtml,
    renderLeaveCardHtml,
  };
});
