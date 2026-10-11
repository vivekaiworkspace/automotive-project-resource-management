/**
 * Admin Setup & Configurable Records Client
 * Handles authenticated API interactions, optimistic locking, and dynamic configuration views
 */

let currentUser = null;
let currentCsrfToken = null;
let currentSelectedTeamId = null;
let currentSelectedPhaseProjectId = null;
let currentSelectedTagProjectId = null;
let currentCustomFieldDefs = [];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  const ok = await initAuth();
  if (ok) {
    loadProfile();
    loadReferenceDataForSelectedCategory();
    loadAllProjects();
    loadAllProducts();
    loadAllTeams();
    if (currentUser.roles.includes('SYSTEM_ADMIN') || currentUser.roles.includes('RESOURCE_MANAGER')) {
      loadAllUsers();
    }
    if (currentUser.roles.includes('SYSTEM_ADMIN')) {
      loadTags();
      loadPmScopes();
      loadProductTypesForCustomFields();
      loadAuditEvents();
    }
  }
});

// Setup navigation tab switching
function setupTabs() {
  const tabs = document.querySelectorAll('.admin-nav-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      switchTab(targetId);
    });
  });

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

  const activeBtn = document.querySelector(`.admin-nav-btn[data-tab="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const activeContent = document.getElementById(tabId);
  if (activeContent) activeContent.style.display = 'block';
}

// Authentication & Session Bootstrap
async function initAuth() {
  try {
    const res = await fetch('/api/v1/auth/me');
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/login.html?returnUrl=/admin.html';
      return false;
    }
    const data = await res.json();
    currentUser = data.user;
    currentCsrfToken = data.csrf_token;

    // Update UI headers
    document.getElementById('header-user-name').textContent = currentUser.full_name || currentUser.email;
    document.getElementById('header-avatar').textContent = (currentUser.full_name || currentUser.email)[0].toUpperCase();

    // Role-based visibility
    applyRoleVisibility(currentUser.roles || []);
    return true;
  } catch (err) {
    showAlert('Failed to authenticate session: ' + err.message, 'error');
    return false;
  }
}

function applyRoleVisibility(roles) {
  const isAdmin = roles.includes('SYSTEM_ADMIN');
  const isPM = roles.includes('PROJECT_MANAGER');
  const isRM = roles.includes('RESOURCE_MANAGER');
  const isTL = roles.includes('TEAM_LEAD');

  // Nav buttons
  document.querySelectorAll('.admin-nav-btn').forEach(btn => {
    let show = false;
    if (btn.classList.contains('role-admin') && isAdmin) show = true;
    if (btn.classList.contains('role-pm') && (isAdmin || isPM)) show = true;
    if (btn.classList.contains('role-rm') && (isAdmin || isRM)) show = true;
    if (btn.classList.contains('role-tl') && (isAdmin || isTL)) show = true;
    if (btn.getAttribute('data-tab') === 'tab-profile') show = true;

    btn.style.display = show ? 'inline-flex' : 'none';
  });

  // Action buttons
  document.querySelectorAll('.role-admin').forEach(el => {
    if (!isAdmin && el.tagName === 'BUTTON') el.style.display = 'none';
  });
}

// Reusable API Caller with CSRF and Optimistic Concurrency conflict handling
async function apiCall(endpoint, { method = 'GET', body = null } = {}) {
  const headers = {};
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
    headers['Content-Type'] = 'application/json';
    if (currentCsrfToken) {
      headers['X-CSRF-Token'] = currentCsrfToken;
    }
  }

  const options = {
    method,
    headers,
    credentials: 'include',
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(endpoint, options);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (res.status === 409) {
    const msg = json?.error?.message || 'Record modified concurrently by another user.';
    showAlert(`⚠️ Optimistic Concurrency Conflict (HTTP 409): ${msg}. Please refresh the record.`, 'conflict');
    throw new Error('STALE_RECORD_CONFLICT');
  }

  if (!res.ok) {
    const errorMsg = json?.error?.message || json?.message || `Request failed with status ${res.status}`;
    showAlert(`Error (${res.status}): ${errorMsg}`, 'error');
    throw new Error(errorMsg);
  }

  return json;
}

// Alert Notification
function showAlert(message, type = 'success') {
  const banner = document.getElementById('alert-banner');
  const msgEl = document.getElementById('alert-message');
  banner.className = `admin-alert-banner ${type}`;
  msgEl.textContent = message;
  banner.style.display = 'flex';
  if (type === 'success') {
    setTimeout(() => { banner.style.display = 'none'; }, 4000);
  }
}

// Profile Loader
function loadProfile() {
  document.getElementById('prof-name').textContent = currentUser.full_name;
  document.getElementById('prof-email').textContent = currentUser.email;
  document.getElementById('prof-id').textContent = currentUser.id;
  document.getElementById('prof-roles').textContent = (currentUser.roles || []).join(', ');
  document.getElementById('prof-status').textContent = currentUser.is_active ? 'Active' : 'Inactive';
  document.getElementById('prof-pwd-req').textContent = currentUser.must_change_password ? 'Yes (Change Required)' : 'No';

  const scopesContainer = document.getElementById('prof-scopes-container');
  scopesContainer.innerHTML = '';
  const scopes = currentUser.scopes || [];
  if (scopes.length === 0) {
    scopesContainer.innerHTML = '<span style="color: var(--text-dim); font-size: 0.85rem;">No explicit SBAC scopes assigned.</span>';
  } else {
    scopes.forEach(s => {
      const span = document.createElement('span');
      span.className = 'status-badge active';
      span.textContent = `${s.scope_type}: ${s.target_id}`;
      scopesContainer.appendChild(span);
    });
  }
}

// -----------------------------------------------------------------------------
// 1. Users Management
// -----------------------------------------------------------------------------
async function loadAllUsers() {
  try {
    const data = await apiCall('/api/v1/users');
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '';

    const selectMemberUser = document.getElementById('member-user-id');
    const selectPmUser = document.getElementById('pm-user-selector');
    if (selectMemberUser) selectMemberUser.innerHTML = '<option value="">Select a user...</option>';
    if (selectPmUser) selectPmUser.innerHTML = '<option value="">Select PM user...</option>';

    data.users.forEach(u => {
      const tr = document.createElement('tr');
      const rolesBadges = (u.roles || []).map(r => `<span class="role-badge ${r === 'SYSTEM_ADMIN' ? 'admin' : ''}">${r}</span>`).join(' ');
      const statusBadge = u.is_active 
        ? '<span class="status-badge active">Active</span>' 
        : '<span class="status-badge inactive">Inactive</span>';

      tr.innerHTML = `
        <td>
          <div style="font-weight: 600;">${escapeHtml(u.full_name)}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim);" class="mono">${escapeHtml(u.email)}</div>
        </td>
        <td>${rolesBadges}</td>
        <td>${statusBadge}</td>
        <td><span class="mono">v${u.version || 1}</span></td>
        <td style="font-size: 0.78rem; color: var(--text-muted);">${new Date(u.created_at).toLocaleDateString()}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-auth-action" onclick="openEditUserModal('${u.id}', '${escapeHtml(u.full_name)}', ${u.version || 1})">Edit</button>
            <button class="btn-auth-action ${u.is_active ? 'btn-rose' : 'btn-cyan'}" onclick="toggleUserActivation('${u.id}', ${!u.is_active}, ${u.version || 1})">
              ${u.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);

      // Populate select dropdowns
      if (selectMemberUser && u.is_active) {
        selectMemberUser.innerHTML += `<option value="${u.id}">${escapeHtml(u.full_name)} (${escapeHtml(u.email)})</option>`;
      }
      if (selectPmUser && u.is_active && (u.roles || []).includes('PROJECT_MANAGER')) {
        selectPmUser.innerHTML += `<option value="${u.id}">${escapeHtml(u.full_name)}</option>`;
      }
    });
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

function openCreateUserModal() {
  document.getElementById('modal-user-title').textContent = 'Create User';
  document.getElementById('user-edit-id').value = '';
  document.getElementById('user-edit-version').value = '1';
  document.getElementById('user-full-name').value = '';
  document.getElementById('user-email').value = '';
  document.getElementById('user-password').value = '';
  document.getElementById('user-email-group').style.display = 'block';
  document.getElementById('user-pwd-group').style.display = 'block';
  openModal('modal-user');
}

function openEditUserModal(id, fullName, version) {
  document.getElementById('modal-user-title').textContent = 'Edit User';
  document.getElementById('user-edit-id').value = id;
  document.getElementById('user-edit-version').value = version;
  document.getElementById('user-full-name').value = fullName;
  document.getElementById('user-email-group').style.display = 'none';
  document.getElementById('user-pwd-group').style.display = 'none';
  openModal('modal-user');
}

async function handleUserSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('user-edit-id').value;
  const version = Number(document.getElementById('user-edit-version').value);
  const fullName = document.getElementById('user-full-name').value;

  try {
    if (id) {
      // Update
      await apiCall(`/api/v1/users/${id}`, {
        method: 'PUT',
        body: { full_name: fullName, version }
      });
      showAlert('User updated successfully.');
    } else {
      // Create
      const email = document.getElementById('user-email').value;
      const password = document.getElementById('user-password').value;
      const roleCheckboxes = document.querySelectorAll('input[name="user_role"]:checked');
      const roles = Array.from(roleCheckboxes).map(c => c.value);

      await apiCall('/api/v1/users', {
        method: 'POST',
        body: { email, password, full_name: fullName, roles }
      });
      showAlert('User created successfully.');
    }
    closeModal('modal-user');
    loadAllUsers();
  } catch (err) {
    // Alert already handled
  }
}

async function toggleUserActivation(id, isActive, version) {
  if (!confirm(`Are you sure you want to ${isActive ? 'activate' : 'deactivate'} this user?`)) return;
  try {
    await apiCall(`/api/v1/users/${id}/activation`, {
      method: 'PUT',
      body: { is_active: isActive, version }
    });
    showAlert(`User ${isActive ? 'activated' : 'deactivated'} successfully.`);
    loadAllUsers();
  } catch {}
}

// -----------------------------------------------------------------------------
// 2. Teams & Memberships Management
// -----------------------------------------------------------------------------
async function loadAllTeams() {
  try {
    const data = await apiCall('/api/v1/teams');
    const tbody = document.getElementById('teams-table-body');
    tbody.innerHTML = '';

    data.teams.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono font-bold">${escapeHtml(t.code)}</td>
        <td><strong>${escapeHtml(t.name)}</strong></td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${escapeHtml(t.description || '-')}</td>
        <td><span class="status-badge ${t.status === 'ACTIVE' ? 'active' : 'archived'}">${t.status}</span></td>
        <td><span class="mono">v${t.version}</span></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-auth-action btn-cyan" onclick="inspectTeamMembers('${t.id}', '${escapeHtml(t.name)}')">Members</button>
            <button class="btn-auth-action btn-rose role-admin" onclick="archiveTeam('${t.id}', ${t.version})">Archive</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load teams:', err);
  }
}

function openCreateTeamModal() {
  document.getElementById('modal-team-title').textContent = 'Create Team';
  document.getElementById('team-edit-id').value = '';
  document.getElementById('team-edit-version').value = '1';
  document.getElementById('team-code').value = '';
  document.getElementById('team-name').value = '';
  document.getElementById('team-description').value = '';
  openModal('modal-team');
}

async function handleTeamSubmit(e) {
  e.preventDefault();
  const code = document.getElementById('team-code').value;
  const name = document.getElementById('team-name').value;
  const description = document.getElementById('team-description').value;

  try {
    await apiCall('/api/v1/teams', {
      method: 'POST',
      body: { code, name, description }
    });
    showAlert('Team created successfully.');
    closeModal('modal-team');
    loadAllTeams();
  } catch {}
}

async function archiveTeam(teamId, version) {
  if (!confirm('Are you sure you want to logically archive this team?')) return;
  try {
    await apiCall(`/api/v1/teams/${teamId}/archive`, {
      method: 'POST',
      body: { version }
    });
    showAlert('Team archived successfully.');
    loadAllTeams();
  } catch {}
}

async function inspectTeamMembers(teamId, teamName) {
  currentSelectedTeamId = teamId;
  document.getElementById('team-members-title').textContent = `Members of ${teamName}`;
  document.getElementById('team-members-section').style.display = 'block';

  try {
    const data = await apiCall(`/api/v1/teams/${teamId}/memberships`);
    const tbody = document.getElementById('members-table-body');
    tbody.innerHTML = '';

    if (data.memberships.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-dim);">No active members in this team.</td></tr>';
      return;
    }

    data.memberships.forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(m.full_name)}</strong></td>
        <td class="mono" style="font-size: 0.8rem;">${escapeHtml(m.email)}</td>
        <td>${m.is_team_lead ? '<span class="status-badge high">Team Lead</span>' : '<span class="status-badge">Member</span>'}</td>
        <td class="mono">${m.active_from}</td>
        <td class="mono">${m.active_to || 'Indefinite'}</td>
        <td class="mono">v${m.version}</td>
        <td>
          <button class="btn-auth-action btn-rose" onclick="archiveMembership('${teamId}', '${m.id}', ${m.version})">Remove</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load team members:', err);
  }
}

function openAddMemberModal() {
  document.getElementById('member-active-from').value = new Date().toISOString().slice(0, 10);
  document.getElementById('member-active-to').value = '';
  document.getElementById('member-is-lead').checked = false;
  openModal('modal-member');
}

async function handleMemberSubmit(e) {
  e.preventDefault();
  const userId = document.getElementById('member-user-id').value;
  const activeFrom = document.getElementById('member-active-from').value;
  const activeTo = document.getElementById('member-active-to').value || null;
  const isTeamLead = document.getElementById('member-is-lead').checked;

  try {
    await apiCall(`/api/v1/teams/${currentSelectedTeamId}/memberships`, {
      method: 'POST',
      body: { user_id: userId, active_from: activeFrom, active_to: activeTo, is_team_lead: isTeamLead }
    });
    showAlert('Team member assigned successfully.');
    closeModal('modal-member');
    inspectTeamMembers(currentSelectedTeamId, '');
  } catch {}
}

async function archiveMembership(teamId, membershipId, version) {
  if (!confirm('Are you sure you want to remove this active membership?')) return;
  try {
    await apiCall(`/api/v1/teams/${teamId}/memberships/${membershipId}/archive`, {
      method: 'POST',
      body: { version }
    });
    showAlert('Membership archived successfully.');
    inspectTeamMembers(teamId, '');
  } catch {}
}

// -----------------------------------------------------------------------------
// 3. Products Management
// -----------------------------------------------------------------------------
async function loadAllProducts() {
  try {
    const data = await apiCall('/api/v1/products');
    const tbody = document.getElementById('products-table-body');
    const projProductSelect = document.getElementById('project-product-id');
    tbody.innerHTML = '';
    if (projProductSelect) projProductSelect.innerHTML = '<option value="">Select active product...</option>';

    data.products.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono font-bold">${escapeHtml(p.code)}</td>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td>${escapeHtml(p.product_type_name || 'EMS ECU')}</td>
        <td><span class="status-badge ${p.status === 'ACTIVE' ? 'active' : 'archived'}">${p.status}</span></td>
        <td><span class="mono">v${p.version}</span></td>
        <td>
          <button class="btn-auth-action btn-rose role-admin" onclick="archiveProduct('${p.id}', ${p.version})">Archive</button>
        </td>
      `;
      tbody.appendChild(tr);

      if (projProductSelect && p.status === 'ACTIVE') {
        projProductSelect.innerHTML += `<option value="${p.id}">${escapeHtml(p.name)} (${p.code})</option>`;
      }
    });
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}

async function archiveProduct(productId, version) {
  if (!confirm('Are you sure you want to logically archive this product? Note: Archived products cannot receive new active projects.')) return;
  try {
    await apiCall(`/api/v1/products/${productId}/archive`, {
      method: 'POST',
      body: { version }
    });
    showAlert('Product archived successfully.');
    loadAllProducts();
  } catch {}
}

// -----------------------------------------------------------------------------
// 4. Projects Management
// -----------------------------------------------------------------------------
async function loadAllProjects() {
  try {
    const data = await apiCall('/api/v1/projects');
    const tbody = document.getElementById('projects-table-body');
    const phaseProjSelect = document.getElementById('phase-project-selector');
    const tagProjSelect = document.getElementById('tag-project-selector');
    const pmProjSelect = document.getElementById('pm-proj-selector');
    const cfProjSelect = document.getElementById('cf-project-selector');

    tbody.innerHTML = '';
    if (phaseProjSelect) phaseProjSelect.innerHTML = '<option value="">Select a Project...</option>';
    if (tagProjSelect) tagProjSelect.innerHTML = '<option value="">Select Project...</option>';
    if (pmProjSelect) pmProjSelect.innerHTML = '<option value="">Select Project...</option>';
    if (cfProjSelect) cfProjSelect.innerHTML = '<option value="">Select Project...</option>';

    data.projects.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono font-bold">${escapeHtml(p.code)}</td>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td>${escapeHtml(p.product_name)}</td>
        <td><span class="status-badge ${p.priority_code === 'HIGH' || p.priority_code === 'CRITICAL' ? 'high' : ''}">${p.priority_name || p.priority_code}</span></td>
        <td><span class="status-badge ${p.status === 'ACTIVE' ? 'active' : 'draft'}">${p.status}</span></td>
        <td class="mono" style="font-size: 0.78rem;">${p.planned_start_date} &rarr; ${p.planned_finish_date}</td>
        <td><span class="mono">v${p.version}</span></td>
        <td>
          <button class="btn-auth-action" onclick="openEditProjectModal('${p.id}', '${escapeHtml(p.name)}', ${p.version})">Edit</button>
        </td>
      `;
      tbody.appendChild(tr);

      const optionHtml = `<option value="${p.id}">${escapeHtml(p.code)} — ${escapeHtml(p.name)}</option>`;
      if (phaseProjSelect) phaseProjSelect.innerHTML += optionHtml;
      if (tagProjSelect) tagProjSelect.innerHTML += optionHtml;
      if (pmProjSelect) pmProjSelect.innerHTML += optionHtml;
      if (cfProjSelect) cfProjSelect.innerHTML += optionHtml;
    });
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

function openCreateProjectModal() {
  document.getElementById('modal-project-title').textContent = 'Create Project';
  document.getElementById('project-edit-id').value = '';
  document.getElementById('project-edit-version').value = '1';
  document.getElementById('project-code').value = '';
  document.getElementById('project-name').value = '';
  document.getElementById('project-start-date').value = '2026-11-01';
  document.getElementById('project-finish-date').value = '2027-04-30';
  document.getElementById('project-description').value = '';

  // Priorities
  loadProjectPriorities();
  openModal('modal-project');
}

async function loadProjectPriorities() {
  const prioSelect = document.getElementById('project-priority-id');
  prioSelect.innerHTML = '';
  try {
    const data = await apiCall('/api/v1/reference-data?category=PROJECT_PRIORITY&activeOnly=true');
    data.items.forEach(i => {
      prioSelect.innerHTML += `<option value="${i.id}">${i.name}</option>`;
    });
  } catch {}
}

async function handleProjectSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('project-edit-id').value;
  const version = Number(document.getElementById('project-edit-version').value);
  const name = document.getElementById('project-name').value;
  const description = document.getElementById('project-description').value;

  try {
    if (id) {
      await apiCall(`/api/v1/projects/${id}`, {
        method: 'PUT',
        body: { name, description, version }
      });
      showAlert('Project updated successfully.');
    } else {
      const code = document.getElementById('project-code').value;
      const productId = document.getElementById('project-product-id').value;
      const priorityId = document.getElementById('project-priority-id').value;
      const startDate = document.getElementById('project-start-date').value;
      const finishDate = document.getElementById('project-finish-date').value;

      await apiCall('/api/v1/projects', {
        method: 'POST',
        body: {
          code,
          name,
          product_id: productId,
          project_priority_id: priorityId,
          planned_start_date: startDate,
          planned_finish_date: finishDate,
          description
        }
      });
      showAlert('Project created successfully.');
    }
    closeModal('modal-project');
    loadAllProjects();
  } catch {}
}

function openEditProjectModal(id, name, version) {
  document.getElementById('modal-project-title').textContent = 'Edit Project';
  document.getElementById('project-edit-id').value = id;
  document.getElementById('project-edit-version').value = version;
  document.getElementById('project-name').value = name;
  openModal('modal-project');
}

// -----------------------------------------------------------------------------
// 5. Phases Management
// -----------------------------------------------------------------------------
async function loadPhasesForSelectedProject() {
  const projectId = document.getElementById('phase-project-selector').value;
  currentSelectedPhaseProjectId = projectId;
  if (!projectId) return;

  try {
    const data = await apiCall(`/api/v1/projects/${projectId}/phases`);
    const tbody = document.getElementById('phases-table-body');
    tbody.innerHTML = '';

    if (data.phases.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dim);">No phases created for this project.</td></tr>';
      return;
    }

    data.phases.forEach(ph => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono font-bold">#${ph.sequence_number}</td>
        <td><strong>${escapeHtml(ph.name)}</strong></td>
        <td class="mono">${ph.planned_start_date || '-'}</td>
        <td class="mono">${ph.planned_finish_date || '-'}</td>
        <td class="mono">v${ph.version}</td>
        <td>
          <button class="btn-auth-action btn-rose" onclick="archivePhase('${projectId}', '${ph.id}', ${ph.version})">Archive</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load phases:', err);
  }
}

function openCreatePhaseModal() {
  if (!currentSelectedPhaseProjectId) {
    showAlert('Please select a project before adding a phase.', 'error');
    return;
  }
  document.getElementById('phase-sequence').value = 1;
  document.getElementById('phase-name').value = '';
  document.getElementById('phase-start-date').value = '';
  document.getElementById('phase-finish-date').value = '';
  openModal('modal-phase');
}

async function handlePhaseSubmit(e) {
  e.preventDefault();
  const sequenceNumber = Number(document.getElementById('phase-sequence').value);
  const name = document.getElementById('phase-name').value;
  const startDate = document.getElementById('phase-start-date').value || null;
  const finishDate = document.getElementById('phase-finish-date').value || null;

  try {
    await apiCall(`/api/v1/projects/${currentSelectedPhaseProjectId}/phases`, {
      method: 'POST',
      body: {
        sequence_number: sequenceNumber,
        name,
        planned_start_date: startDate,
        planned_finish_date: finishDate
      }
    });
    showAlert('Phase created successfully.');
    closeModal('modal-phase');
    loadPhasesForSelectedProject();
  } catch {}
}

async function archivePhase(projectId, phaseId, version) {
  if (!confirm('Are you sure you want to logically archive this phase?')) return;
  try {
    await apiCall(`/api/v1/projects/${projectId}/phases/${phaseId}/archive`, {
      method: 'POST',
      body: { version }
    });
    showAlert('Phase archived successfully.');
    loadPhasesForSelectedProject();
  } catch {}
}

// -----------------------------------------------------------------------------
// 6. Work-Area Tags Management
// -----------------------------------------------------------------------------
async function loadTags() {
  try {
    const data = await apiCall('/api/v1/tags');
    const tbody = document.getElementById('tags-table-body');
    const selectAssign = document.getElementById('tag-to-assign-selector');
    tbody.innerHTML = '';
    if (selectAssign) selectAssign.innerHTML = '<option value="">Select Tag to Assign...</option>';

    data.tags.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${t.display_order}</td>
        <td class="mono font-bold">${escapeHtml(t.code)}</td>
        <td><strong>${escapeHtml(t.name)}</strong></td>
        <td><span class="status-badge ${t.is_active ? 'active' : 'archived'}">${t.is_active ? 'Active' : 'Archived'}</span></td>
        <td><span class="mono">v${t.version}</span></td>
        <td>
          ${t.is_active ? `<button class="btn-auth-action btn-rose" onclick="archiveTag('${t.id}', ${t.version})">Archive</button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);

      if (selectAssign && t.is_active) {
        selectAssign.innerHTML += `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
      }
    });
  } catch (err) {
    console.error('Failed to load tags:', err);
  }
}

async function archiveTag(tagId, version) {
  if (!confirm('Are you sure you want to logically archive this work-area tag?')) return;
  try {
    await apiCall(`/api/v1/tags/${tagId}/archive`, {
      method: 'POST',
      body: { version }
    });
    showAlert('Tag archived successfully.');
    loadTags();
  } catch {}
}

async function loadProjectTagsForSelected() {
  const projectId = document.getElementById('tag-project-selector').value;
  currentSelectedTagProjectId = projectId;
  const container = document.getElementById('project-tags-badges');
  if (!projectId) {
    container.innerHTML = '<span style="color: var(--text-dim); font-size: 0.85rem;">Select a project above to inspect assigned tags</span>';
    return;
  }

  try {
    const data = await apiCall(`/api/v1/projects/${projectId}/tags`);
    container.innerHTML = '';
    if (data.tags.length === 0) {
      container.innerHTML = '<span style="color: var(--text-dim); font-size: 0.85rem;">No tags assigned to this project yet.</span>';
      return;
    }

    data.tags.forEach(t => {
      const pill = document.createElement('span');
      pill.className = 'status-badge active';
      pill.style.padding = '6px 12px';
      pill.innerHTML = `${escapeHtml(t.name)} <button style="background: none; border: none; color: inherit; margin-left: 6px; cursor: pointer;" onclick="removeTagFromProject('${t.id}')">&times;</button>`;
      container.appendChild(pill);
    });
  } catch (err) {
    console.error('Failed to load project tags:', err);
  }
}

async function assignTagToProject() {
  const tagId = document.getElementById('tag-to-assign-selector').value;
  if (!currentSelectedTagProjectId || !tagId) {
    showAlert('Please select both a project and a tag to assign.', 'error');
    return;
  }
  try {
    await apiCall(`/api/v1/projects/${currentSelectedTagProjectId}/tags`, {
      method: 'POST',
      body: { tagId }
    });
    showAlert('Tag assigned to project successfully.');
    loadProjectTagsForSelected();
  } catch {}
}

async function removeTagFromProject(tagId) {
  if (!confirm('Remove this tag from the project?')) return;
  try {
    await apiCall(`/api/v1/projects/${currentSelectedTagProjectId}/tags/${tagId}`, {
      method: 'DELETE'
    });
    showAlert('Tag removed from project.');
    loadProjectTagsForSelected();
  } catch {}
}

// -----------------------------------------------------------------------------
// 7. PM Scope Mappings Management
// -----------------------------------------------------------------------------
async function loadPmScopes() {
  try {
    const data = await apiCall('/api/v1/project-scopes');
    const tbody = document.getElementById('pm-scopes-table-body');
    tbody.innerHTML = '';

    if (data.scopes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dim);">No PM scope assignments active.</td></tr>';
      return;
    }

    data.scopes.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono font-bold">${escapeHtml(s.project_code)}</td>
        <td><strong>${escapeHtml(s.project_name)}</strong></td>
        <td>${escapeHtml(s.manager_name)}</td>
        <td class="mono" style="font-size: 0.8rem;">${escapeHtml(s.manager_email)}</td>
        <td style="font-size: 0.78rem; color: var(--text-muted);">${new Date(s.created_at).toLocaleDateString()}</td>
        <td>
          <button class="btn-auth-action btn-rose" onclick="revokePmScope('${s.user_id}', '${s.project_id}')">Revoke</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load PM scopes:', err);
  }
}

async function assignPmScope() {
  const userId = document.getElementById('pm-user-selector').value;
  const projectId = document.getElementById('pm-proj-selector').value;
  if (!userId || !projectId) {
    showAlert('Please select both a Project Manager and a project.', 'error');
    return;
  }
  try {
    await apiCall('/api/v1/project-scopes', {
      method: 'POST',
      body: { user_id: userId, project_id: projectId }
    });
    showAlert('Project scope granted to Project Manager.');
    loadPmScopes();
  } catch {}
}

async function revokePmScope(userId, projectId) {
  if (!confirm('Are you sure you want to revoke this Project Manager scope?')) return;
  try {
    await apiCall(`/api/v1/project-scopes?user_id=${userId}&project_id=${projectId}`, {
      method: 'DELETE'
    });
    showAlert('Project Manager scope revoked.');
    loadPmScopes();
  } catch {}
}

// -----------------------------------------------------------------------------
// 8. Configurable Reference Data
// -----------------------------------------------------------------------------
async function loadReferenceDataForSelectedCategory() {
  const category = document.getElementById('ref-category-selector').value;
  try {
    const data = await apiCall(`/api/v1/reference-data?category=${category}`);
    const tbody = document.getElementById('ref-data-table-body');
    tbody.innerHTML = '';

    data.items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${item.display_order}</td>
        <td class="mono font-bold">${escapeHtml(item.code)}</td>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td><span class="status-badge ${item.is_active ? 'active' : 'archived'}">${item.is_active ? 'Active' : 'Archived'}</span></td>
        <td><span class="mono">v${item.version}</span></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-auth-action" onclick="openEditReferenceDataModal('${item.id}', '${escapeHtml(item.name)}', ${item.display_order}, ${item.version})">Edit</button>
            ${item.is_active 
              ? `<button class="btn-auth-action btn-rose" onclick="archiveReferenceData('${item.id}', ${item.version})">Archive</button>`
              : `<button class="btn-auth-action btn-cyan" onclick="reactivateReferenceData('${item.id}', ${item.version})">Reactivate</button>`}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load reference data:', err);
  }
}

function openCreateReferenceDataModal() {
  document.getElementById('modal-ref-data-title').textContent = 'Create Reference Item';
  document.getElementById('ref-edit-id').value = '';
  document.getElementById('ref-edit-version').value = '1';
  document.getElementById('ref-code').value = '';
  document.getElementById('ref-name').value = '';
  document.getElementById('ref-order').value = 1;
  openModal('modal-ref-data');
}

function openEditReferenceDataModal(id, name, order, version) {
  document.getElementById('modal-ref-data-title').textContent = 'Edit Reference Item';
  document.getElementById('ref-edit-id').value = id;
  document.getElementById('ref-edit-version').value = version;
  document.getElementById('ref-name').value = name;
  document.getElementById('ref-order').value = order;
  openModal('modal-ref-data');
}

async function handleRefDataSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('ref-edit-id').value;
  const version = Number(document.getElementById('ref-edit-version').value);
  const name = document.getElementById('ref-name').value;
  const displayOrder = Number(document.getElementById('ref-order').value);
  const category = document.getElementById('ref-category-selector').value;

  try {
    if (id) {
      await apiCall(`/api/v1/reference-data/${id}`, {
        method: 'PUT',
        body: { name, display_order: displayOrder, version }
      });
      showAlert('Reference item updated successfully.');
    } else {
      const code = document.getElementById('ref-code').value;
      await apiCall('/api/v1/reference-data', {
        method: 'POST',
        body: { category, code, name, display_order: displayOrder }
      });
      showAlert('Reference item created successfully.');
    }
    closeModal('modal-ref-data');
    loadReferenceDataForSelectedCategory();
  } catch {}
}

async function archiveReferenceData(id, version) {
  if (!confirm('Logically archive this reference item? Historical records will retain references, but it will be prevented from new selections.')) return;
  try {
    await apiCall(`/api/v1/reference-data/${id}/archive`, {
      method: 'POST',
      body: { version }
    });
    showAlert('Reference item archived successfully.');
    loadReferenceDataForSelectedCategory();
  } catch {}
}

async function reactivateReferenceData(id, version) {
  try {
    await apiCall(`/api/v1/reference-data/${id}/reactivate`, {
      method: 'POST',
      body: { version }
    });
    showAlert('Reference item reactivated successfully.');
    loadReferenceDataForSelectedCategory();
  } catch {}
}

// -----------------------------------------------------------------------------
// 9. Product-Type Custom Fields & Project Values
// -----------------------------------------------------------------------------
async function loadProductTypesForCustomFields() {
  try {
    const data = await apiCall('/api/v1/reference-data?category=PRODUCT_TYPE');
    const select = document.getElementById('cf-product-type-selector');
    select.innerHTML = '<option value="">Select Product Type...</option>';
    data.items.forEach(pt => {
      select.innerHTML += `<option value="${pt.id}">${pt.name} (${pt.code})</option>`;
    });
    // Default select EMS ECU if present
    const ems = data.items.find(i => i.code === 'EMS_ECU');
    if (ems) {
      select.value = ems.id;
      loadCustomFieldDefs();
    }
  } catch {}
}

async function loadCustomFieldDefs() {
  const ptId = document.getElementById('cf-product-type-selector').value;
  if (!ptId) return;

  try {
    const data = await apiCall(`/api/v1/custom-fields/definitions?productTypeId=${ptId}`);
    const tbody = document.getElementById('custom-fields-table-body');
    tbody.innerHTML = '';
    currentCustomFieldDefs = data.definitions || [];

    currentCustomFieldDefs.forEach(def => {
      const tr = document.createElement('tr');
      const optionsStr = (def.options || []).map(o => o.label).join(', ') || '-';
      tr.innerHTML = `
        <td class="mono">${def.display_order}</td>
        <td class="mono font-bold">${escapeHtml(def.code)}</td>
        <td><strong>${escapeHtml(def.label)}</strong></td>
        <td><span class="status-badge">${def.field_type}</span></td>
        <td>${def.is_required ? '<span class="status-badge high">Yes</span>' : '<span class="status-badge">No</span>'}</td>
        <td><span class="status-badge ${def.is_active ? 'active' : 'archived'}">${def.is_active ? 'Active' : 'Archived'}</span></td>
        <td style="font-size: 0.78rem; color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(optionsStr)}</td>
        <td><span class="mono">v${def.version}</span></td>
        <td>
          ${def.is_active ? `<button class="btn-auth-action btn-rose" onclick="archiveCustomFieldDef('${def.id}', ${def.version})">Archive</button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load custom field definitions:', err);
  }
}

function openCreateCustomFieldModal() {
  document.getElementById('cf-code').value = '';
  document.getElementById('cf-label').value = '';
  document.getElementById('cf-help-text').value = '';
  document.getElementById('cf-type').value = 'text';
  document.getElementById('cf-options').value = '';
  document.getElementById('cf-order').value = 1;
  document.getElementById('cf-required').checked = false;
  toggleOptionInputs();
  openModal('modal-custom-field');
}

function toggleOptionInputs() {
  const type = document.getElementById('cf-type').value;
  const group = document.getElementById('cf-options-group');
  group.style.display = (type === 'single_select' || type === 'multi_select') ? 'block' : 'none';
}

async function handleCustomFieldSubmit(e) {
  e.preventDefault();
  const ptId = document.getElementById('cf-product-type-selector').value;
  if (!ptId) {
    showAlert('Please select a product type first.', 'error');
    return;
  }

  const code = document.getElementById('cf-code').value;
  const label = document.getElementById('cf-label').value;
  const helpText = document.getElementById('cf-help-text').value;
  const fieldType = document.getElementById('cf-type').value;
  const displayOrder = Number(document.getElementById('cf-order').value);
  const isRequired = document.getElementById('cf-required').checked;

  let options = [];
  if (fieldType === 'single_select' || fieldType === 'multi_select') {
    const rawOptions = document.getElementById('cf-options').value.split(',');
    options = rawOptions.map(o => o.trim()).filter(Boolean).map(o => ({ code: o.toUpperCase().replace(/\s+/g, '_'), label: o }));
  }

  try {
    await apiCall('/api/v1/custom-fields/definitions', {
      method: 'POST',
      body: {
        productTypeId: ptId,
        code,
        label,
        helpText,
        fieldType,
        displayOrder,
        isRequired,
        options
      }
    });
    showAlert('Custom field definition created successfully.');
    closeModal('modal-custom-field');
    loadCustomFieldDefs();
  } catch {}
}

async function archiveCustomFieldDef(id, version) {
  if (!confirm('Logically archive this custom field definition? Historical project values will remain accessible.')) return;
  try {
    await apiCall(`/api/v1/custom-fields/definitions/${id}/archive`, {
      method: 'POST',
      body: { version }
    });
    showAlert('Custom field definition archived successfully.');
    loadCustomFieldDefs();
  } catch {}
}

async function loadProjectCustomFieldValues() {
  const projectId = document.getElementById('cf-project-selector').value;
  const form = document.getElementById('project-custom-fields-form');
  if (!projectId) {
    form.innerHTML = '<span style="color: var(--text-dim); font-size: 0.85rem;">Select a project above to enter/edit custom fields</span>';
    return;
  }

  try {
    const data = await apiCall(`/api/v1/projects/${projectId}/custom-fields`);
    form.innerHTML = '';

    (data.custom_fields || []).forEach(f => {
      const group = document.createElement('div');
      group.className = 'admin-form-group';
      const requiredMark = f.is_required ? '<span style="color: var(--accent-rose);">*</span>' : '';
      group.innerHTML = `<label class="admin-form-label">${escapeHtml(f.label)} ${requiredMark} <span class="mono" style="font-size: 0.65rem; color: var(--text-dim); text-transform: none;">(${f.code})</span></label>`;

      let inputHtml = '';
      const val = f.value !== null && f.value !== undefined ? f.value : '';

      switch (f.field_type) {
        case 'text':
          inputHtml = `<input type="text" class="admin-form-input cf-input" data-code="${f.code}" value="${escapeHtml(String(val))}">`;
          break;
        case 'number':
          inputHtml = `<input type="number" step="any" class="admin-form-input cf-input" data-code="${f.code}" value="${val}">`;
          break;
        case 'date':
          inputHtml = `<input type="date" class="admin-form-input cf-input" data-code="${f.code}" value="${val}">`;
          break;
        case 'yes_no':
          inputHtml = `
            <select class="admin-form-select cf-input" data-code="${f.code}">
              <option value="">Unset</option>
              <option value="true" ${val === true ? 'selected' : ''}>Yes</option>
              <option value="false" ${val === false ? 'selected' : ''}>No</option>
            </select>
          `;
          break;
        case 'single_select': {
          let opts = '<option value="">Select option...</option>';
          (f.options || []).forEach(o => {
            const isSel = o.id === val || o.code === val || o.label === val;
            opts += `<option value="${o.id}" ${isSel ? 'selected' : ''}>${escapeHtml(o.label)}</option>`;
          });
          inputHtml = `<select class="admin-form-select cf-input" data-code="${f.code}">${opts}</select>`;
          break;
        }
        case 'multi_select': {
          const selectedSet = new Set(Array.isArray(val) ? val : []);
          let boxes = '<div style="display: flex; gap: 8px; flex-wrap: wrap;">';
          (f.options || []).forEach(o => {
            const isChecked = selectedSet.has(o.id) || selectedSet.has(o.code) || selectedSet.has(o.label);
            boxes += `<label style="font-size: 0.8rem;"><input type="checkbox" class="cf-multi-box" data-code="${f.code}" value="${o.id}" ${isChecked ? 'checked' : ''}> ${escapeHtml(o.label)}</label>`;
          });
          boxes += '</div>';
          inputHtml = boxes;
          break;
        }
      }

      group.innerHTML += inputHtml;
      form.appendChild(group);
    });
  } catch (err) {
    console.error('Failed to load project custom fields:', err);
  }
}

async function saveProjectCustomFields() {
  const projectId = document.getElementById('cf-project-selector').value;
  if (!projectId) {
    showAlert('Please select a project first.', 'error');
    return;
  }

  const valuesObject = {};
  document.querySelectorAll('.cf-input').forEach(input => {
    const code = input.getAttribute('data-code');
    const val = input.value;
    valuesObject[code] = val;
  });

  // Handle multi-select checkboxes
  const multiMap = {};
  document.querySelectorAll('.cf-multi-box').forEach(box => {
    const code = box.getAttribute('data-code');
    if (!multiMap[code]) multiMap[code] = [];
    if (box.checked) multiMap[code].push(box.value);
  });
  Object.assign(valuesObject, multiMap);

  try {
    await apiCall(`/api/v1/projects/${projectId}/custom-fields`, {
      method: 'PUT',
      body: { values: valuesObject }
    });
    showAlert('Project custom fields saved successfully.');
    loadProjectCustomFieldValues();
  } catch {}
}

// -----------------------------------------------------------------------------
// 10. Audit Events Explorer
// -----------------------------------------------------------------------------
async function loadAuditEvents() {
  try {
    const data = await apiCall('/api/v1/audit/events?limit=30');
    const tbody = document.getElementById('audit-table-body');
    tbody.innerHTML = '';

    if (data.events.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dim);">No audit events recorded yet.</td></tr>';
      return;
    }

    data.events.forEach(e => {
      const tr = document.createElement('tr');
      const diffStr = JSON.stringify({ before: e.before_state, after: e.after_state }, null, 2);
      tr.innerHTML = `
        <td class="mono" style="font-size: 0.75rem;">${new Date(e.created_at).toLocaleString()}</td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(e.actor_name || 'System')}</div>
          <div class="mono" style="font-size: 0.72rem; color: var(--text-dim);">${escapeHtml(e.actor_email || '-')}</div>
        </td>
        <td><span class="status-badge high">${e.action}</span></td>
        <td><strong>${escapeHtml(e.entity_name)}</strong> <span class="mono" style="font-size: 0.7rem; color: var(--text-dim);">${e.entity_id ? e.entity_id.slice(0, 8) + '...' : ''}</span></td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(e.change_reason || '-')}</td>
        <td><div class="diff-box">${escapeHtml(diffStr)}</div></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load audit events:', err);
  }
}

// Logout
async function handleLogout() {
  try {
    await apiCall('/api/v1/auth/logout', { method: 'POST' });
  } catch {}
  window.location.href = '/login.html';
}

// Modal Helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
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
