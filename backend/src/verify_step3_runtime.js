import http from 'node:http';
import { query } from './db/index.js';
import { createSession } from './modules/iam/session.service.js';

async function main() {
  console.log('=== Step 3 Runtime Verification ===\n');

  // 1. Check unauthenticated rejection
  const unauthRes = await makeRequest('http://localhost:3000/api/v1/projects');
  console.log('Check 6 (Protected API rejects unauth):', unauthRes.status === 401 && unauthRes.body.error.code === 'UNAUTHENTICATED' ? 'PASS (HTTP 401 UNAUTHENTICATED)' : 'FAIL');

  // Setup Admin and PM sessions
  const users = await query('SELECT id, email FROM users WHERE email IN ($1, $2, $3)', [
    'admin.pilot@ems-ecu.internal',
    'pm.integration@example.test',
    'pm.validation@example.test',
  ]);
  const userMap = new Map(users.rows.map(u => [u.email, u]));

  const adminSession = await createSession(userMap.get('admin.pilot@ems-ecu.internal').id);
  const pm1Session = await createSession(userMap.get('pm.integration@example.test').id);

  // 2. System Admin creates configurable project field safely
  const createFieldRes = await makeRequest('http://localhost:3000/api/v1/custom-fields/definitions', {
    method: 'POST',
    session: adminSession,
    body: {
      productTypeId: '20000000-0000-0000-0000-000000000001', // EMS_ECU
      code: 'VERIFY_TEST_FIELD',
      label: 'Runtime Verify Field',
      fieldType: 'text',
      isRequired: false,
      displayOrder: 99
    }
  });
  console.log('Check 7 (Admin creates custom field safely):', createFieldRes.status === 201 ? `PASS (Created ${createFieldRes.body.definition.code})` : `FAIL (${createFieldRes.status})`);

  // Clean up verification field
  if (createFieldRes.body?.definition?.id) {
    await query('DELETE FROM custom_field_definitions WHERE id = $1', [createFieldRes.body.definition.id]);
  }

  // 3. Project Manager 1 denied access to other seeded project (EMS-G2-VAL)
  const pmDeniedRes = await makeRequest('http://localhost:3000/api/v1/projects/60000000-0000-0000-0000-000000000002', {
    session: pm1Session,
  });
  console.log('Check 8 (PM denied access to out-of-scope project):', pmDeniedRes.status === 403 ? 'PASS (HTTP 403 FORBIDDEN)' : `FAIL (${pmDeniedRes.status})`);

  // 4. Invalid custom-field value is rejected
  const invalidFieldRes = await makeRequest('http://localhost:3000/api/v1/projects/60000000-0000-0000-0000-000000000001/custom-fields', {
    method: 'PUT',
    session: pm1Session,
    body: {
      values: {
        TARGET_SOP_DATE: 'invalid-date-string'
      }
    }
  });
  console.log('Check 9 (Invalid custom-field value rejected):', invalidFieldRes.status === 400 && invalidFieldRes.body.error.message.includes('valid date') ? 'PASS (HTTP 400 BAD_REQUEST)' : `FAIL (${invalidFieldRes.status})`);

  // 5. Stale-update conflict returns HTTP 409
  const projRes = await makeRequest('http://localhost:3000/api/v1/projects/60000000-0000-0000-0000-000000000001', { session: adminSession });
  const curVer = projRes.body.project.version;

  const staleRes = await makeRequest('http://localhost:3000/api/v1/projects/60000000-0000-0000-0000-000000000001', {
    method: 'PUT',
    session: adminSession,
    body: {
      name: 'Concurrent Update Attempt',
      version: curVer - 1, // Stale version
    }
  });
  console.log('Check 10 (Stale-update returns HTTP 409):', staleRes.status === 409 && staleRes.body.error.code === 'CONFLICT_STALE_RECORD' ? 'PASS (HTTP 409 CONFLICT_STALE_RECORD)' : `FAIL (${staleRes.status})`);

  // 6. Audit events are written
  const auditRes = await makeRequest('http://localhost:3000/api/v1/audit/events?limit=5', { session: adminSession });
  console.log('Check 11 (Audit events written and readable):', auditRes.status === 200 && auditRes.body.events.length > 0 ? `PASS (${auditRes.body.events.length} events found, latest: ${auditRes.body.events[0].action})` : `FAIL (${auditRes.status})`);

  process.exit(0);
}

function makeRequest(urlStr, { method = 'GET', session = null, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const headers = {};
    if (session) {
      headers['Cookie'] = `session_id=${session.rawToken}`;
      if (['POST', 'PUT', 'DELETE'].includes(method.toUpperCase())) {
        headers['X-CSRF-Token'] = session.csrfToken;
      }
    }
    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

main().catch(err => {
  console.error('Runtime verification failed:', err);
  process.exit(1);
});
