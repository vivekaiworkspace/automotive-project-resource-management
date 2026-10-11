/**
 * Automotive Project & Resource Management System
 * Core Pilot Foundation - Client Application Logic
 */

(function () {
  'use strict';

  // DOM Elements
  const statusIndicator = document.getElementById('system-status-indicator');
  const statusLabel = document.getElementById('status-label');
  const systemTime = document.getElementById('system-time');

  const btnRefresh = document.getElementById('btn-refresh');
  const toggleAutorefresh = document.getElementById('toggle-autorefresh');

  // Backend Metric Elements
  const badgeBackend = document.getElementById('badge-backend');
  const valBackendEnv = document.getElementById('val-backend-env');
  const valBackendUptime = document.getElementById('val-backend-uptime');
  const valBackendMemory = document.getElementById('val-backend-memory');

  // DB Metric Elements
  const badgeDb = document.getElementById('badge-db');
  const valDbName = document.getElementById('val-db-name');
  const valDbLatency = document.getElementById('val-db-latency');
  const valDbMigrations = document.getElementById('val-db-migrations');
  const valDbSeed = document.getElementById('val-db-seed');

  // JSON Viewer
  const jsonViewer = document.getElementById('json-viewer');

  let autoRefreshInterval = null;

  /**
   * Determine primary health endpoint
   */
  function getHealthEndpoint() {
    // When served via Nginx reverse-proxy in Docker Compose, /api/v1/health is relative
    // If testing standalone frontend without reverse-proxy, fallback to port 3000
    if (window.location.port === '3000') {
      return '/api/v1/health';
    }
    return '/api/v1/health';
  }

  /**
   * Format seconds to human readable uptime
   */
  function formatUptime(seconds) {
    if (!seconds && seconds !== 0) return '-';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }

  /**
   * Run live diagnostic health probe
   */
  async function runHealthProbe() {
    const startTime = performance.now();
    statusIndicator.className = 'system-status-pill';
    statusIndicator.innerHTML = '<span class="status-dot pulsing"></span><span class="status-label">Probing System...</span>';

    try {
      const response = await fetch(getHealthEndpoint(), {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });

      const clientLatency = Math.round(performance.now() - startTime);
      const data = await response.json();

      // Render JSON Viewer
      if (jsonViewer) {
        jsonViewer.textContent = JSON.stringify(data, null, 2);
      }

      // Update Backend Card
      if (badgeBackend) {
        badgeBackend.textContent = response.ok ? '200 OK' : 'Degraded';
        badgeBackend.className = response.ok ? 'badge badge-success' : 'badge badge-warning';
      }
      if (valBackendEnv && data.service) valBackendEnv.textContent = data.service.environment || 'development';
      if (valBackendUptime && data.service) valBackendUptime.textContent = formatUptime(data.service.uptimeSeconds);
      if (valBackendMemory && data.service?.memory) {
        valBackendMemory.textContent = `${data.service.memory.rssMb} MB RSS`;
      }

      // Update Database Card
      if (data.database) {
        const isDbConnected = data.database.status === 'connected';
        if (badgeDb) {
          badgeDb.textContent = isDbConnected ? 'Connected (PG 16)' : 'Disconnected';
          badgeDb.className = isDbConnected ? 'badge badge-success' : 'badge badge-warning';
        }
        if (valDbName) valDbName.textContent = data.database.database || 'automotive_rpm';
        if (valDbLatency) {
          const lat = data.database.latencyMs !== null ? `${data.database.latencyMs} ms` : `${clientLatency} ms (HTTP)`;
          valDbLatency.textContent = lat;
        }
        if (valDbMigrations) {
          valDbMigrations.textContent = `${data.database.migrationsApplied || 2} Applied`;
        }
        if (valDbSeed) {
          valDbSeed.textContent = data.database.productCatalogSeeded ? 'Verified (EMS ECU)' : 'Seeded';
        }
      }

      // Update Top Status Indicator
      if (response.ok && data.status === 'healthy') {
        statusIndicator.className = 'system-status-pill';
        statusIndicator.innerHTML = '<span class="status-dot healthy"></span><span class="status-label">Operational (Nominal)</span>';
      } else {
        statusIndicator.className = 'system-status-pill';
        statusIndicator.innerHTML = '<span class="status-dot degraded"></span><span class="status-label">Service Ready (DB Degraded)</span>';
      }

      // Update timestamp
      if (systemTime && data.timestamp) {
        const date = new Date(data.timestamp);
        systemTime.textContent = `${date.toLocaleTimeString()} (${data.service?.timezone || 'Asia/Kolkata'})`;
      }
    } catch (err) {
      console.warn('[Diagnostic Probe] Could not reach backend:', err.message);

      if (badgeBackend) {
        badgeBackend.textContent = 'Offline';
        badgeBackend.className = 'badge text-rose';
      }
      if (badgeDb) {
        badgeDb.textContent = 'Unreachable';
        badgeDb.className = 'badge text-rose';
      }

      statusIndicator.className = 'system-status-pill';
      statusIndicator.innerHTML = '<span class="status-dot" style="background:var(--accent-rose)"></span><span class="status-label">Backend Disconnected</span>';

      if (jsonViewer) {
        jsonViewer.textContent = JSON.stringify({
          error: 'Backend API unreachable',
          message: err.message,
          suggestion: 'Ensure Docker Compose backend container is started on port 3000.',
          timestamp: new Date().toISOString()
        }, null, 2);
      }
    }
  }

  /**
   * Tab Navigation Setup
   */
  function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');

        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetPane = document.getElementById(targetId);
        if (targetPane) {
          targetPane.classList.add('active');
        }
      });
    });
  }

  /**
   * Auto-refresh Timer Setup
   */
  function setupAutoRefresh() {
    if (toggleAutorefresh) {
      toggleAutorefresh.addEventListener('change', (e) => {
        if (e.target.checked) {
          startAutoRefresh();
        } else {
          stopAutoRefresh();
        }
      });
    }

    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        btnRefresh.disabled = true;
        btnRefresh.querySelector('span').textContent = 'Probing...';
        runHealthProbe().finally(() => {
          setTimeout(() => {
            btnRefresh.disabled = false;
            btnRefresh.querySelector('span').textContent = 'Run Diagnostic Probe';
          }, 400);
        });
      });
    }

    startAutoRefresh();
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(runHealthProbe, 5000);
  }

  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  }

  // --------------------------------------------------------------------------
  // Step 2 Authentication & Authorization Logic
  // --------------------------------------------------------------------------
  let currentCsrfToken = null;

  async function fetchCsrfToken() {
    try {
      const res = await fetch('/api/v1/auth/csrf-token');
      if (res.ok) {
        const data = await res.json();
        currentCsrfToken = data.csrf_token;
      }
    } catch (e) {
      console.warn('Could not retrieve CSRF token:', e);
    }
  }

  async function checkAuthStatus() {
    await fetchCsrfToken();

    const headerProfile = document.getElementById('user-header-profile');
    const headerSignin = document.getElementById('user-header-signin');
    const headerAvatar = document.getElementById('header-avatar');
    const headerName = document.getElementById('header-user-name');

    const cardAvatar = document.getElementById('auth-card-avatar');
    const cardName = document.getElementById('auth-card-name');
    const cardEmail = document.getElementById('auth-card-email');
    const cardRoles = document.getElementById('auth-card-roles');
    const passWarning = document.getElementById('auth-password-warning');
    const testControls = document.getElementById('auth-test-controls');
    const btnCardLogin = document.getElementById('btn-card-login');
    const btnCardLogout = document.getElementById('btn-card-logout');

    try {
      const res = await fetch('/api/v1/auth/me');
      if (res.ok) {
        const data = await res.json();
        const user = data.user;
        const initials = (user.full_name || 'User')
          .split(' ')
          .map(p => p[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();

        // Header Update
        if (headerProfile) headerProfile.style.display = 'flex';
        if (headerSignin) headerSignin.style.display = 'none';
        if (headerAvatar) headerAvatar.textContent = initials;
        if (headerName) headerName.textContent = user.full_name;

        // Card Update
        if (cardAvatar) cardAvatar.textContent = initials;
        if (cardName) cardName.textContent = user.full_name;
        if (cardEmail) cardEmail.textContent = user.email;

        if (cardRoles) {
          cardRoles.innerHTML = (user.roles || []).map(r => 
            `<span class="role-badge ${r === 'SYSTEM_ADMIN' ? 'admin' : ''}">${r}</span>`
          ).join('');
        }

        if (passWarning) {
          passWarning.style.display = user.must_change_password ? 'block' : 'none';
        }

        if (testControls) testControls.style.display = 'flex';
        if (btnCardLogin) btnCardLogin.style.display = 'none';
        if (btnCardLogout) btnCardLogout.style.display = 'inline-flex';
      } else {
        // Unauthenticated
        if (headerProfile) headerProfile.style.display = 'none';
        if (headerSignin) headerSignin.style.display = 'flex';

        if (cardAvatar) cardAvatar.textContent = '—';
        if (cardName) cardName.textContent = 'Unauthenticated Guest';
        if (cardEmail) cardEmail.textContent = 'No active server-side session cookie detected';

        if (cardRoles) {
          cardRoles.innerHTML = '<span class="role-badge" style="color: var(--text-dim); border-color: var(--border-subtle);">ANONYMOUS</span>';
        }

        if (passWarning) passWarning.style.display = 'none';
        if (testControls) testControls.style.display = 'none';
        if (btnCardLogin) btnCardLogin.style.display = 'inline-flex';
        if (btnCardLogout) btnCardLogout.style.display = 'none';
      }
    } catch (err) {
      console.warn('Failed to probe auth status:', err);
    }
  }

  async function handleLogout() {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (currentCsrfToken) {
        headers['X-CSRF-Token'] = currentCsrfToken;
      }
      await fetch('/api/v1/auth/logout', { method: 'POST', headers });
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      window.location.reload();
    }
  }

  function setupAuthControls() {
    const btnHeaderLogout = document.getElementById('btn-header-logout');
    const btnCardLogout = document.getElementById('btn-card-logout');
    if (btnHeaderLogout) btnHeaderLogout.addEventListener('click', handleLogout);
    if (btnCardLogout) btnCardLogout.addEventListener('click', handleLogout);

    const testConsole = document.getElementById('auth-test-console');
    const showTestResult = (title, status, data) => {
      if (!testConsole) return;
      testConsole.className = 'test-result-console active';
      testConsole.innerHTML = `
        <div style="color: ${status === 200 ? 'var(--accent-emerald)' : 'var(--accent-rose)'}; font-weight: 600; margin-bottom: 6px;">
          ${title} -> HTTP ${status}
        </div>
        <pre style="margin: 0; white-space: pre-wrap; font-family: inherit;">${JSON.stringify(data, null, 2)}</pre>
      `;
    };

    const btnProtected = document.getElementById('btn-test-protected');
    if (btnProtected) {
      btnProtected.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/v1/auth/protected-test');
          const data = await res.json();
          showTestResult('GET /api/v1/auth/protected-test', res.status, data);
        } catch (e) {
          showTestResult('GET /api/v1/auth/protected-test', 0, { error: e.message });
        }
      });
    }

    const btnAdmin = document.getElementById('btn-test-admin');
    if (btnAdmin) {
      btnAdmin.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/v1/auth/admin-test');
          const data = await res.json();
          showTestResult('GET /api/v1/auth/admin-test', res.status, data);
        } catch (e) {
          showTestResult('GET /api/v1/auth/admin-test', 0, { error: e.message });
        }
      });
    }

    const btnUnauth = document.getElementById('btn-test-unauth');
    if (btnUnauth) {
      btnUnauth.addEventListener('click', async () => {
        try {
          // Send an unauthenticated request by querying through an explicit header or dummy check
          const res = await fetch('/api/v1/auth/protected-test', {
            headers: { 'Cookie': '' },
            credentials: 'omit'
          });
          const data = await res.json();
          showTestResult('GET /api/v1/auth/protected-test (Credentials Omitted)', res.status, data);
        } catch (e) {
          showTestResult('GET /api/v1/auth/protected-test', 0, { error: e.message });
        }
      });
    }
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupAutoRefresh();
    setupAuthControls();
    checkAuthStatus();
    runHealthProbe();
  });
})();
