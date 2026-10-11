/**
 * Activity Planning & Execution Frontend Controller (Step 4)
 * Handles activity catalog, hierarchy tree, status state machine,
 * optimistic locking, and material-change audits.
 */

let currentUser = null;
let csrfToken = null;
let projectsList = [];
let phasesMap = new Map();
let activityTypesList = [];
let prioritiesList = [];
let usersList = [];
let currentProjectId = null;
let currentActivityDetail = null;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  setupTabNavigation();
  setupEventListeners();
  await initSessionAndProfile();
});

function showAlert(message, type = 'error') {
  const banner = document.getElementById('alert-banner');
  const msgEl = document.getElementById('alert-message');
  if (!banner || !msgEl) return;
  msgEl.textContent = message;
  banner.className = `admin-alert-banner ${type === 'success' ? 'alert-success' : 'alert-error'}`;
  banner.style.display = 'flex';
  setTimeout(() => { banner.style.display = 'none'; }, 8000);
}

async function apiFetch(url, options = {}) {
  const defaultHeaders = {
    'Accept': 'application/json',
  };
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes((options.method || 'GET').toUpperCase())) {
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

  try {
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
  } catch (err) {
    throw err;
  }
}

async function initSessionAndProfile() {
  try {
    // 1. Fetch authenticated user profile
    const meData = await apiFetch('/api/v1/auth/me');
    currentUser = meData.user;

    // 2. Fetch CSRF token for mutations
    const csrfData = await apiFetch('/api/v1/auth/csrf-token');
    csrfToken = csrfData.csrfToken;

    // Render user profile
    renderUserProfile(currentUser);

    // 3. Load reference metadata
    await loadReferenceData();

    // 4. Load projects list
    await loadProjects();

    // 5. Initial views
    await refreshProjectActivities();

    // Configure role-based tab visibility
    const roles = currentUser.roles || [];
    const isTL = roles.includes('TEAM_LEAD') || roles.includes('SYSTEM_ADMIN');
    const isTM = roles.includes('TEAM_MEMBER');
    const isPM = roles.includes('PROJECT_MANAGER') || roles.includes('SYSTEM_ADMIN');

    if (isPM) {
      document.getElementById('btn-open-create-activity').style.display = 'inline-flex';
    }
    if (roles.includes('SYSTEM_ADMIN')) {
      const adminLink = document.getElementById('nav-admin-link');
      if (adminLink) adminLink.style.display = 'inline-flex';
    }
    if (!isTL) {
      const teamTab = document.getElementById('tab-btn-team');
      if (teamTab) teamTab.style.display = 'none';
    }
  } catch (err) {
    if (err.status === 401 || err.code === 'UNAUTHENTICATED') {
      window.location.href = '/login.html';
      return;
    }
    showAlert(`Failed to initialize session: ${err.message}`);
  }
}

function renderUserProfile(user) {
  const avatar = document.getElementById('header-avatar');
  const nameEl = document.getElementById('header-user-name');
  if (avatar && user.fullName) {
    avatar.textContent = user.fullName.charAt(0).toUpperCase();
  }
  if (nameEl) {
    nameEl.textContent = `${user.fullName} (${(user.roles || []).join(', ')})`;
  }
}

function setupTabNavigation() {
  const tabBtns = document.querySelectorAll('#activities-tabs-nav .admin-nav-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetSec = document.getElementById(targetId);
      if (targetSec) targetSec.classList.add('active');

      if (targetId === 'tab-project-activities') {
        await refreshProjectActivities();
      } else if (targetId === 'tab-hierarchy') {
        await renderHierarchyTree();
      } else if (targetId === 'tab-my-activities') {
        await loadMyActivities();
      } else if (targetId === 'tab-team-activities') {
        await loadTeamActivities();
      }
    });
  });
}

function setupEventListeners() {
  // Logout
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await apiFetch('/api/v1/auth/logout', { method: 'POST' });
        window.location.href = '/login.html';
      } catch {
        window.location.href = '/login.html';
      }
    });
  }

  // Filter changes
  ['filter-project', 'filter-phase', 'filter-status', 'filter-type', 'filter-priority', 'filter-hierarchy', 'filter-archived'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        if (id === 'filter-project') {
          currentProjectId = el.value;
          updatePhaseFilterOptions(currentProjectId);
        }
        refreshProjectActivities();
      });
    }
  });

  // Hierarchy project selector
  const hierProjSelect = document.getElementById('hierarchy-project-select');
  if (hierProjSelect) {
    hierProjSelect.addEventListener('change', () => {
      renderHierarchyTree();
    });
  }

  // Open Create Activity Modal
  const btnOpenCreate = document.getElementById('btn-open-create-activity');
  if (btnOpenCreate) {
    btnOpenCreate.addEventListener('click', () => {
      openCreateActivityModal();
    });
  }

  // Project select change inside modal
  const actFormProj = document.getElementById('act-form-project');
  if (actFormProj) {
    actFormProj.addEventListener('change', () => {
      updateModalPhaseAndParentOptions(actFormProj.value);
    });
  }

  // Activity form save
  const actForm = document.getElementById('form-activity');
  if (actForm) {
    actForm.addEventListener('submit', handleSaveActivity);
  }

  // Status transition form submit
  const statusForm = document.getElementById('form-status-transition');
  if (statusForm) {
    statusForm.addEventListener('submit', handleSubmitStatusTransition);
  }

  // Status transition select change (dynamic blocker & reason boxes)
  const targetStatusSelect = document.getElementById('trans-target-status');
  if (targetStatusSelect) {
    targetStatusSelect.addEventListener('change', updateTransitionFormFields);
  }
}

async function loadReferenceData() {
  try {
    const [typesData, prioritiesData, usersData] = await Promise.all([
      apiFetch('/api/v1/reference-data?category=ACTIVITY_TYPE&active_only=true'),
      apiFetch('/api/v1/reference-data?category=ACTIVITY_PRIORITY&active_only=true'),
      apiFetch('/api/v1/users?limit=200').catch(() => ({ users: [] })),
    ]);

    activityTypesList = typesData.data || [];
    prioritiesList = prioritiesData.data || [];
    usersList = (usersData.users || []).filter(u => u.is_active);

    // Populate filter dropdowns
    populateSelect('filter-type', activityTypesList, 'id', 'name', 'All Types');
    populateSelect('filter-priority', prioritiesList, 'id', 'name', 'All Priorities');

    // Populate modal dropdowns
    populateSelect('act-form-type', activityTypesList, 'id', 'name', null);
    populateSelect('act-form-priority', prioritiesList, 'id', 'name', null);
    populateSelect('act-form-owner', usersList, 'id', 'full_name', 'Unassigned');
  } catch (err) {
    console.error('Failed to load reference data:', err);
  }
}

async function loadProjects() {
  try {
    const data = await apiFetch('/api/v1/projects?limit=50');
    projectsList = data.projects || [];

    const filterProj = document.getElementById('filter-project');
    const hierProj = document.getElementById('hierarchy-project-select');
    const formProj = document.getElementById('act-form-project');

    populateSelect('filter-project', projectsList, 'id', 'name', null);
    populateSelect('hierarchy-project-select', projectsList, 'id', 'name', null);
    populateSelect('act-form-project', projectsList, 'id', 'name', null);

    if (projectsList.length > 0) {
      currentProjectId = projectsList[0].id;
      filterProj.value = currentProjectId;
      hierProj.value = currentProjectId;
      await updatePhaseFilterOptions(currentProjectId);
    }
  } catch (err) {
    showAlert(`Failed to load projects: ${err.message}`);
  }
}

async function updatePhaseFilterOptions(projectId) {
  if (!projectId) return;
  try {
    const data = await apiFetch(`/api/v1/projects/${projectId}/phases`);
    phasesMap.set(projectId, data.phases || []);
    populateSelect('filter-phase', data.phases || [], 'id', 'name', 'All Phases');
  } catch {
    populateSelect('filter-phase', [], 'id', 'name', 'All Phases');
  }
}

async function updateModalPhaseAndParentOptions(projectId, currentActId = null) {
  const phaseSelect = document.getElementById('act-form-phase');
  const parentSelect = document.getElementById('act-form-parent');
  if (!projectId) return;

  try {
    const [phasesData, actData] = await Promise.all([
      apiFetch(`/api/v1/projects/${projectId}/phases`),
      apiFetch(`/api/v1/projects/${projectId}/activities?is_parent=true&limit=100`),
    ]);

    populateSelect('act-form-phase', phasesData.phases || [], 'id', 'name', 'No Phase');

    // Potential parents: must belong to same project, cannot be itself, and cannot have a parent
    const potentialParents = (actData.activities || []).filter(a => !currentActId || a.id !== currentActId);
    populateSelect('act-form-parent', potentialParents, 'id', 'title', 'No Parent (Root Activity)');
  } catch (err) {
    console.error('Failed to update modal options:', err);
  }
}

function populateSelect(selectId, items, valueKey, textKey, defaultText = null) {
  const el = document.getElementById(selectId);
  if (!el) return;
  el.innerHTML = '';
  if (defaultText !== null) {
    const defOpt = document.createElement('option');
    defOpt.value = '';
    defOpt.textContent = defaultText;
    el.appendChild(defOpt);
  }
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = item[textKey] || item.code || item.email;
    el.appendChild(opt);
  });
}

// ----------------------------------------------------------------------------
// Activity Catalog Table Render
// ----------------------------------------------------------------------------
async function refreshProjectActivities() {
  const projectId = document.getElementById('filter-project')?.value;
  if (!projectId) return;

  const phaseId = document.getElementById('filter-phase')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';
  const typeId = document.getElementById('filter-type')?.value || '';
  const priorityId = document.getElementById('filter-priority')?.value || '';
  const isParent = document.getElementById('filter-hierarchy')?.value || '';
  const includeArchived = document.getElementById('filter-archived')?.value === 'true';

  let q = `/api/v1/projects/${projectId}/activities?limit=100`;
  if (phaseId) q += `&phase_id=${encodeURIComponent(phaseId)}`;
  if (status) q += `&status=${encodeURIComponent(status)}`;
  if (typeId) q += `&activity_type_id=${encodeURIComponent(typeId)}`;
  if (priorityId) q += `&priority_id=${encodeURIComponent(priorityId)}`;
  if (isParent) q += `&is_parent=${encodeURIComponent(isParent)}`;
  if (includeArchived) q += `&include_archived=true`;

  const tbody = document.getElementById('tbody-project-activities');
  try {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-dim);">Loading activities...</td></tr>';
    const data = await apiFetch(q);
    const activities = data.activities || [];

    if (activities.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 24px;">No activities match current filters.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    activities.forEach(act => {
      const tr = document.createElement('tr');
      const statusClass = `status-${(act.status || '').toLowerCase()}`;
      const prioClass = `priority-${(act.priority_name || 'medium').toLowerCase()}`;

      const datesText = act.start_date && act.due_date ? `${formatDate(act.start_date)} &rarr; ${formatDate(act.due_date)}` : '-';
      const estimatesText = `${act.remaining_effort_hours || '0.00'}h / ${act.original_estimate_hours || '-'}h`;

      tr.innerHTML = `
        <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--accent-cyan);">
          ${act.readable_activity_id}
          ${act.parent_activity_id ? '<span style="font-size: 0.65rem; color: #94a3b8; display: block;">↳ Sub-task</span>' : ''}
        </td>
        <td style="font-weight: 600;">
          ${escapeHtml(act.title)}
          ${act.has_active_children ? '<span class="rollup-tag">Roll-up Parent</span>' : ''}
          ${act.archived_at ? '<span style="color: #ef4444; font-size: 0.7rem; font-weight: bold; margin-left: 6px;">[ARCHIVED]</span>' : ''}
        </td>
        <td>${escapeHtml(act.phase_name || '-')}</td>
        <td><span class="activity-badge ${statusClass}">${act.status}</span></td>
        <td>
          <span style="font-size: 0.8rem; font-weight: 600;">${escapeHtml(act.activity_type_name || '-')}</span>
          <span class="activity-badge ${prioClass}" style="margin-left: 4px;">${escapeHtml(act.priority_name || 'MEDIUM')}</span>
        </td>
        <td>${escapeHtml(act.owner_name || '<Unassigned>')}</td>
        <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;">${estimatesText}</td>
        <td style="font-size: 0.82rem; color: var(--text-muted);">${datesText}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn-auth-action btn-cyan" onclick="openActivityDetailModal('${act.id}')" style="padding: 4px 8px; font-size: 0.75rem;">View</button>
          <button class="btn-auth-action" onclick="openEditActivityModal('${act.id}')" style="padding: 4px 8px; font-size: 0.75rem;">Edit</button>
          <button class="btn-auth-action" onclick="openStatusTransitionModal('${act.id}')" style="padding: 4px 8px; font-size: 0.75rem;">Status</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #f87171;">Failed to load activities: ${err.message}</td></tr>`;
  }
}

// ----------------------------------------------------------------------------
// Hierarchy View Render
// ----------------------------------------------------------------------------
async function renderHierarchyTree() {
  const projectId = document.getElementById('hierarchy-project-select')?.value;
  const container = document.getElementById('hierarchy-tree-container');
  if (!projectId || !container) return;

  container.innerHTML = '<p style="color: var(--text-dim); text-align: center;">Loading activity hierarchy...</p>';

  try {
    // 1. Fetch parents
    const parentsData = await apiFetch(`/api/v1/projects/${projectId}/activities?is_parent=true&limit=100`);
    const parents = parentsData.activities || [];

    if (parents.length === 0) {
      container.innerHTML = '<p style="color: var(--text-dim); text-align: center;">No parent activities found in this project.</p>';
      return;
    }

    container.innerHTML = '';

    for (const parent of parents) {
      const card = document.createElement('div');
      card.className = 'hierarchy-parent-card';

      // Fetch direct children
      const childrenData = await apiFetch(`/api/v1/activities/${parent.id}/children`).catch(() => ({ children: [] }));
      const children = childrenData.children || [];

      const parentStatusClass = `status-${(parent.status || '').toLowerCase()}`;
      card.innerHTML = `
        <div class="hierarchy-parent-header">
          <div class="hierarchy-parent-title">
            <span style="font-family: 'JetBrains Mono', monospace; color: var(--accent-cyan);">${parent.readable_activity_id}</span>
            <span>${escapeHtml(parent.title)}</span>
            <span class="activity-badge ${parentStatusClass}">${parent.status}</span>
            <span class="rollup-tag">Roll-up Remaining: ${parent.remaining_effort_hours || '0.00'}h</span>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 16px;">
            <span>Dates: <strong>${formatDate(parent.start_date)} &rarr; ${formatDate(parent.due_date)}</strong></span>
            <span>Owner: <strong>${escapeHtml(parent.owner_name || 'Unassigned')}</strong></span>
            <button class="btn-auth-action btn-cyan" onclick="openActivityDetailModal('${parent.id}')" style="padding: 2px 8px; font-size: 0.72rem;">Detail</button>
          </div>
        </div>
      `;

      if (children.length > 0) {
        const childList = document.createElement('div');
        childList.className = 'hierarchy-children-list';

        children.forEach(c => {
          const cStatusClass = `status-${(c.status || '').toLowerCase()}`;
          const cDiv = document.createElement('div');
          cDiv.className = 'hierarchy-child-item';
          cDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: #38bdf8;">${c.readable_activity_id}</span>
              <span style="font-weight: 600;">${escapeHtml(c.title)}</span>
              <span class="activity-badge ${cStatusClass}">${c.status}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 12px;">
              <span>Remaining: <strong>${c.remaining_effort_hours}h</strong></span>
              <span>Dates: <strong>${formatDate(c.start_date)} &rarr; ${formatDate(c.due_date)}</strong></span>
              <span>Owner: <strong>${escapeHtml(c.owner_name || 'Unassigned')}</strong></span>
              <button class="btn-auth-action" onclick="openStatusTransitionModal('${c.id}')" style="padding: 2px 6px; font-size: 0.72rem;">Status</button>
              <button class="btn-auth-action" onclick="openActivityDetailModal('${c.id}')" style="padding: 2px 6px; font-size: 0.72rem;">Detail</button>
            </div>
          `;
          childList.appendChild(cDiv);
        });
        card.appendChild(childList);
      } else {
        const noChildMsg = document.createElement('div');
        noChildMsg.style.cssText = 'margin-top: 10px; font-size: 0.8rem; color: var(--text-dim); font-style: italic;';
        noChildMsg.textContent = 'No child sub-activities configured under this root activity.';
        card.appendChild(noChildMsg);
      }

      container.appendChild(card);
    }
  } catch (err) {
    container.innerHTML = `<p style="color: #f87171; text-align: center;">Failed to load hierarchy: ${err.message}</p>`;
  }
}

// ----------------------------------------------------------------------------
// My Activities View
// ----------------------------------------------------------------------------
async function loadMyActivities() {
  const tbody = document.getElementById('tbody-my-activities');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-dim);">Loading your activities...</td></tr>';

  try {
    const data = await apiFetch('/api/v1/activities/my?limit=100');
    const activities = data.activities || [];

    if (activities.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 24px;">You have no assigned activities.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    activities.forEach(act => {
      const tr = document.createElement('tr');
      const statusClass = `status-${(act.status || '').toLowerCase()}`;
      tr.innerHTML = `
        <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--accent-cyan);">${act.readable_activity_id}</td>
        <td style="font-weight: 600;">${escapeHtml(act.title)}</td>
        <td>${escapeHtml(act.project_name || act.project_code)} ${act.phase_name ? `(${escapeHtml(act.phase_name)})` : ''}</td>
        <td><span class="activity-badge ${statusClass}">${act.status}</span></td>
        <td style="font-family: 'JetBrains Mono', monospace;">${act.remaining_effort_hours || '0.00'}h</td>
        <td style="font-size: 0.82rem;">${formatDate(act.start_date)} &rarr; ${formatDate(act.due_date)}</td>
        <td style="font-size: 0.82rem; color: #f87171;">${escapeHtml(act.blocker_description || '-')}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn-auth-action" onclick="openEditActivityModal('${act.id}')" style="padding: 4px 8px; font-size: 0.75rem;">Update Effort</button>
          <button class="btn-auth-action" onclick="openStatusTransitionModal('${act.id}')" style="padding: 4px 8px; font-size: 0.75rem;">Status</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #f87171;">Error loading activities: ${err.message}</td></tr>`;
  }
}

// ----------------------------------------------------------------------------
// Team Activities View
// ----------------------------------------------------------------------------
async function loadTeamActivities() {
  const tbody = document.getElementById('tbody-team-activities');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-dim);">Loading team activities...</td></tr>';

  try {
    const data = await apiFetch('/api/v1/activities/team?limit=100');
    const activities = data.activities || [];

    if (activities.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 24px;">No activities found for active members of your team.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    activities.forEach(act => {
      const tr = document.createElement('tr');
      const statusClass = `status-${(act.status || '').toLowerCase()}`;
      tr.innerHTML = `
        <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--accent-cyan);">${act.readable_activity_id}</td>
        <td style="font-weight: 600;">${escapeHtml(act.title)}</td>
        <td>${escapeHtml(act.project_name || act.project_code)}</td>
        <td><span class="activity-badge ${statusClass}">${act.status}</span></td>
        <td style="font-weight: 600; color: var(--text-main);">${escapeHtml(act.owner_name || 'Unassigned')}</td>
        <td style="font-family: 'JetBrains Mono', monospace;">${act.remaining_effort_hours || '0.00'}h</td>
        <td style="font-size: 0.82rem;">${formatDate(act.start_date)} &rarr; ${formatDate(act.due_date)}</td>
        <td style="font-size: 0.82rem; color: #f87171;">${escapeHtml(act.blocker_description || '-')}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn-auth-action" onclick="openEditActivityModal('${act.id}')" style="padding: 4px 8px; font-size: 0.75rem;">Manage</button>
          <button class="btn-auth-action" onclick="openStatusTransitionModal('${act.id}')" style="padding: 4px 8px; font-size: 0.75rem;">Status</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #f87171;">Error loading team activities: ${err.message}</td></tr>`;
  }
}

// ----------------------------------------------------------------------------
// Create & Edit Activity Modal
// ----------------------------------------------------------------------------
async function openCreateActivityModal() {
  document.getElementById('modal-activity-title').textContent = 'Create New Activity';
  document.getElementById('act-form-id').value = '';
  document.getElementById('act-form-version').value = '1';
  document.getElementById('act-form-readable-id').value = '';
  document.getElementById('act-form-title').value = '';
  document.getElementById('act-form-orig-est').value = '';
  document.getElementById('act-form-curr-est').value = '';
  document.getElementById('act-form-rem-eff').value = '';
  document.getElementById('act-form-start').value = '';
  document.getElementById('act-form-due').value = '';
  document.getElementById('act-form-forecast').value = '';
  document.getElementById('act-form-blocker').value = '';
  document.getElementById('act-form-reason').value = '';
  document.getElementById('act-form-material-reason-box').style.display = 'none';

  const projSelect = document.getElementById('act-form-project');
  projSelect.disabled = false;
  const currentProjId = document.getElementById('filter-project')?.value || (projectsList[0]?.id);
  projSelect.value = currentProjId;

  await updateModalPhaseAndParentOptions(currentProjId);

  document.getElementById('modal-activity-form').style.display = 'flex';
}

async function openEditActivityModal(activityId) {
  try {
    const data = await apiFetch(`/api/v1/activities/${activityId}`);
    const act = data.activity;
    currentActivityDetail = act;

    document.getElementById('modal-activity-title').textContent = `Edit Activity (${act.readable_activity_id})`;
    document.getElementById('act-form-id').value = act.id;
    document.getElementById('act-form-version').value = act.version;
    document.getElementById('act-form-readable-id').value = act.readable_activity_id;
    document.getElementById('act-form-title').value = act.title;

    const projSelect = document.getElementById('act-form-project');
    projSelect.value = act.project_id;
    projSelect.disabled = true; // project is immutable once created

    await updateModalPhaseAndParentOptions(act.project_id, act.id);

    document.getElementById('act-form-phase').value = act.phase_id || '';
    document.getElementById('act-form-parent').value = act.parent_activity_id || '';
    document.getElementById('act-form-type').value = act.activity_type_id;
    document.getElementById('act-form-priority').value = act.priority_id;
    document.getElementById('act-form-owner').value = act.owner_user_id || '';

    const origInput = document.getElementById('act-form-orig-est');
    origInput.value = act.original_estimate_hours !== null ? act.original_estimate_hours : '';
    // Original estimate is immutable once planning begins (non-Draft)
    origInput.disabled = (act.status !== 'DRAFT');

    document.getElementById('act-form-curr-est').value = act.current_estimate_hours !== null ? act.current_estimate_hours : '';
    
    const remInput = document.getElementById('act-form-rem-eff');
    remInput.value = act.remaining_effort_hours !== null ? act.remaining_effort_hours : '';
    remInput.disabled = Boolean(act.has_active_children);
    document.getElementById('rem-eff-rollup-tag').textContent = act.has_active_children ? '(Auto-rolled up from children)' : '';

    const startInput = document.getElementById('act-form-start');
    startInput.value = act.start_date || '';
    startInput.disabled = Boolean(act.has_active_children);
    document.getElementById('start-rollup-tag').textContent = act.has_active_children ? '(Auto-rolled up)' : '';

    const dueInput = document.getElementById('act-form-due');
    dueInput.value = act.due_date || '';
    dueInput.disabled = Boolean(act.has_active_children);
    document.getElementById('due-rollup-tag').textContent = act.has_active_children ? '(Auto-rolled up)' : '';

    document.getElementById('act-form-forecast').value = act.forecast_finish_date || '';
    document.getElementById('act-form-blocker').value = act.blocker_description || '';
    document.getElementById('act-form-reason').value = '';

    // Always show reason box for editing to prompt if material change happens
    document.getElementById('act-form-material-reason-box').style.display = 'block';

    document.getElementById('modal-activity-form').style.display = 'flex';
  } catch (err) {
    showAlert(`Failed to open activity for editing: ${err.message}`);
  }
}

function closeActivityFormModal() {
  document.getElementById('modal-activity-form').style.display = 'none';
}

async function handleSaveActivity(e) {
  e.preventDefault();
  const actId = document.getElementById('act-form-id').value;
  const isEdit = Boolean(actId);
  const version = parseInt(document.getElementById('act-form-version').value, 10);

  const payload = {
    title: document.getElementById('act-form-title').value.trim(),
    phase_id: document.getElementById('act-form-phase').value || null,
    parent_activity_id: document.getElementById('act-form-parent').value || null,
    activity_type_id: document.getElementById('act-form-type').value,
    priority_id: document.getElementById('act-form-priority').value,
    owner_user_id: document.getElementById('act-form-owner').value || null,
    original_estimate_hours: parseNullableNumber(document.getElementById('act-form-orig-est').value),
    current_estimate_hours: parseNullableNumber(document.getElementById('act-form-curr-est').value),
    remaining_effort_hours: parseNullableNumber(document.getElementById('act-form-rem-eff').value),
    start_date: document.getElementById('act-form-start').value || null,
    due_date: document.getElementById('act-form-due').value || null,
    forecast_finish_date: document.getElementById('act-form-forecast').value || null,
    blocker_description: document.getElementById('act-form-blocker').value || null,
  };

  const reason = document.getElementById('act-form-reason').value.trim();
  if (reason) payload.reason = reason;

  try {
    if (isEdit) {
      payload.version = version;
      await apiFetch(`/api/v1/activities/${actId}`, {
        method: 'PATCH',
        body: payload,
      });
      showAlert('Activity updated successfully!', 'success');
    } else {
      const projectId = document.getElementById('act-form-project').value;
      await apiFetch(`/api/v1/projects/${projectId}/activities`, {
        method: 'POST',
        body: payload,
      });
      showAlert('Activity created successfully!', 'success');
    }

    closeActivityFormModal();
    await refreshProjectActivities();
  } catch (err) {
    showAlert(`Save error: ${err.message}`);
  }
}

// ----------------------------------------------------------------------------
// Status Transition Modal
// ----------------------------------------------------------------------------
async function openStatusTransitionModal(activityId) {
  try {
    const data = await apiFetch(`/api/v1/activities/${activityId}`);
    const act = data.activity;
    currentActivityDetail = act;

    document.getElementById('trans-act-id').value = act.id;
    document.getElementById('trans-act-version').value = act.version;
    document.getElementById('trans-act-label').textContent = `${act.readable_activity_id}: ${act.title}`;

    const fromBadge = document.getElementById('trans-from-status');
    fromBadge.textContent = act.status;
    fromBadge.className = `activity-badge status-${(act.status || '').toLowerCase()}`;

    // Compute allowed target statuses
    const targetSelect = document.getElementById('trans-target-status');
    targetSelect.innerHTML = '<option value="">Select target status...</option>';

    const allowedMap = {
      DRAFT: ['READY_FOR_PLANNING', 'DONE', 'CANCELLED'],
      READY_FOR_PLANNING: ['PLANNED', 'DRAFT', 'DONE', 'CANCELLED'],
      PLANNED: ['IN_PROGRESS', 'BLOCKED', 'READY_FOR_PLANNING', 'DONE', 'CANCELLED'],
      IN_PROGRESS: ['BLOCKED', 'PLANNED', 'DONE', 'CANCELLED'],
      BLOCKED: ['IN_PROGRESS', 'PLANNED', 'DONE', 'CANCELLED'],
      DONE: ['CANCELLED', 'PLANNED', 'READY_FOR_PLANNING', 'IN_PROGRESS'],
      CANCELLED: ['PLANNED', 'READY_FOR_PLANNING', 'IN_PROGRESS'],
    };

    const targets = allowedMap[act.status] || [];
    targets.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      targetSelect.appendChild(opt);
    });

    document.getElementById('trans-blocker-box').style.display = 'none';
    document.getElementById('trans-reason-box').style.display = 'none';
    document.getElementById('trans-blocker-text').value = '';
    document.getElementById('trans-reason-text').value = '';

    document.getElementById('modal-status-transition').style.display = 'flex';
  } catch (err) {
    showAlert(`Failed to initiate status transition: ${err.message}`);
  }
}

function updateTransitionFormFields() {
  const target = document.getElementById('trans-target-status').value;
  const blockerBox = document.getElementById('trans-blocker-box');
  const reasonBox = document.getElementById('trans-reason-box');

  const act = currentActivityDetail;
  const fromStatus = act?.status;

  blockerBox.style.display = (target === 'BLOCKED') ? 'block' : 'none';

  const requiresReason = (
    target === 'DONE' ||
    target === 'CANCELLED' ||
    fromStatus === 'DONE' ||
    fromStatus === 'CANCELLED' ||
    (fromStatus === 'IN_PROGRESS' && target === 'PLANNED')
  );

  reasonBox.style.display = requiresReason ? 'block' : 'none';
}

function closeStatusModal() {
  document.getElementById('modal-status-transition').style.display = 'none';
}

async function handleSubmitStatusTransition(e) {
  e.preventDefault();
  const actId = document.getElementById('trans-act-id').value;
  const version = parseInt(document.getElementById('trans-act-version').value, 10);
  const targetStatus = document.getElementById('trans-target-status').value;
  const blockerDescription = document.getElementById('trans-blocker-text').value.trim();
  const reason = document.getElementById('trans-reason-text').value.trim();

  if (!targetStatus) {
    showAlert('Please select a target status');
    return;
  }

  const payload = {
    target_status: targetStatus,
    version,
  };
  if (blockerDescription) payload.blocker_description = blockerDescription;
  if (reason) payload.reason = reason;

  try {
    await apiFetch(`/api/v1/activities/${actId}/status-transitions`, {
      method: 'POST',
      body: payload,
    });

    showAlert(`Activity successfully transitioned to ${targetStatus}!`, 'success');
    closeStatusModal();
    await refreshProjectActivities();
  } catch (err) {
    showAlert(`Transition error: ${err.message}`);
  }
}

// ----------------------------------------------------------------------------
// Activity Detail & Audit History Modal
// ----------------------------------------------------------------------------
async function openActivityDetailModal(activityId) {
  try {
    const [actData, childrenData, auditData] = await Promise.all([
      apiFetch(`/api/v1/activities/${activityId}`),
      apiFetch(`/api/v1/activities/${activityId}/children`).catch(() => ({ children: [] })),
      apiFetch(`/api/v1/activities/${activityId}/audit-events`).catch(() => ({ events: [] })),
    ]);

    const act = actData.activity;
    currentActivityDetail = act;

    document.getElementById('detail-modal-title').textContent = `${act.readable_activity_id}: ${act.title}`;
    const statusBadge = document.getElementById('detail-modal-status');
    statusBadge.textContent = act.status;
    statusBadge.className = `activity-badge status-${(act.status || '').toLowerCase()}`;

    document.getElementById('detail-readable-id').textContent = act.readable_activity_id;
    document.getElementById('detail-project').textContent = `${act.project_name} (${act.project_code})`;
    document.getElementById('detail-phase').textContent = act.phase_name || 'None';
    document.getElementById('detail-owner').textContent = act.owner_name ? `${act.owner_name} (${act.owner_email || ''})` : 'Unassigned';
    document.getElementById('detail-type-priority').textContent = `${act.activity_type_name || '-'} / ${act.priority_name || 'MEDIUM'}`;
    document.getElementById('detail-estimates').textContent = `${act.remaining_effort_hours || '0.00'}h / ${act.original_estimate_hours || '-'}h / ${act.current_estimate_hours || '-'}h`;
    document.getElementById('detail-dates').textContent = `${formatDate(act.start_date)} to ${formatDate(act.due_date)}`;
    document.getElementById('detail-forecast').textContent = formatDate(act.forecast_finish_date);

    // Blocker callout
    const blockerCallout = document.getElementById('detail-blocker-callout');
    if (act.status === 'BLOCKED' && act.blocker_description) {
      document.getElementById('detail-blocker-desc').textContent = act.blocker_description;
      blockerCallout.style.display = 'block';
    } else {
      blockerCallout.style.display = 'none';
    }

    // Children table
    const children = childrenData.children || [];
    const childrenSec = document.getElementById('detail-children-section');
    const childrenTbody = document.getElementById('detail-children-tbody');
    if (children.length > 0) {
      childrenSec.style.display = 'block';
      childrenTbody.innerHTML = '';
      children.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: #38bdf8;">${c.readable_activity_id}</td>
          <td>${escapeHtml(c.title)}</td>
          <td><span class="activity-badge status-${(c.status || '').toLowerCase()}">${c.status}</span></td>
          <td>${escapeHtml(c.owner_name || 'Unassigned')}</td>
          <td style="font-family: 'JetBrains Mono', monospace;">${c.remaining_effort_hours}h</td>
          <td>${formatDate(c.start_date)} &rarr; ${formatDate(c.due_date)}</td>
        `;
        childrenTbody.appendChild(tr);
      });
    } else {
      childrenSec.style.display = 'none';
    }

    // Audit events table
    const events = auditData.events || [];
    const auditTbody = document.getElementById('detail-audit-tbody');
    if (events.length === 0) {
      auditTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-dim);">No audit events recorded for this activity.</td></tr>';
    } else {
      auditTbody.innerHTML = '';
      events.forEach(ev => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-size: 0.8rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">${new Date(ev.recorded_at).toLocaleString()}</td>
          <td style="font-weight: 700; color: var(--accent-cyan);">${ev.action}</td>
          <td style="font-size: 0.82rem;">${escapeHtml(ev.actor_name || ev.actor_email || 'System')}</td>
          <td style="font-size: 0.82rem; color: var(--text-main);">${escapeHtml(ev.change_reason || '-')}</td>
        `;
        auditTbody.appendChild(tr);
      });
    }

    // Archive / restore buttons
    const btnArchive = document.getElementById('detail-btn-archive');
    const btnRestore = document.getElementById('detail-btn-restore');
    const roles = currentUser.roles || [];
    const canArchive = roles.includes('SYSTEM_ADMIN') || roles.includes('PROJECT_MANAGER');

    if (canArchive) {
      if (act.archived_at) {
        btnArchive.style.display = 'none';
        btnRestore.style.display = 'inline-block';
        btnRestore.onclick = () => handleRestoreActivityAction(act.id, act.version);
      } else {
        btnArchive.style.display = 'inline-block';
        btnRestore.style.display = 'none';
        btnArchive.onclick = () => handleArchiveActivityAction(act.id, act.version);
      }
    } else {
      btnArchive.style.display = 'none';
      btnRestore.style.display = 'none';
    }

    document.getElementById('modal-activity-detail').style.display = 'flex';
  } catch (err) {
    showAlert(`Failed to load activity details: ${err.message}`);
  }
}

function closeDetailModal() {
  document.getElementById('modal-activity-detail').style.display = 'none';
}

async function handleArchiveActivityAction(activityId, version) {
  const reason = prompt('Please enter reason for archiving this activity:');
  if (reason === null) return;

  try {
    await apiFetch(`/api/v1/activities/${activityId}/archive`, {
      method: 'POST',
      body: { version, reason: reason.trim() },
    });
    showAlert('Activity archived successfully', 'success');
    closeDetailModal();
    await refreshProjectActivities();
  } catch (err) {
    showAlert(`Archive failed: ${err.message}`);
  }
}

async function handleRestoreActivityAction(activityId, version) {
  const reason = prompt('Please enter reason for restoring this activity:');
  if (reason === null) return;

  try {
    await apiFetch(`/api/v1/activities/${activityId}/restore`, {
      method: 'POST',
      body: { version, reason: reason.trim() },
    });
    showAlert('Activity restored successfully', 'success');
    closeDetailModal();
    await refreshProjectActivities();
  } catch (err) {
    showAlert(`Restore failed: ${err.message}`);
  }
}

// ----------------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------------
function formatDate(d) {
  if (!d) return '-';
  try {
    const str = String(d).split('T')[0];
    return str;
  } catch {
    return d;
  }
}

function parseNullableNumber(val) {
  if (val === '' || val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
