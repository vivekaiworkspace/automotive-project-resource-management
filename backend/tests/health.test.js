import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleLiveness } from '../src/modules/health/health.controller.js';
import { getSystemHealth } from '../src/modules/health/health.service.js';
import { config } from '../src/config/index.js';

describe('Health Module Unit Tests', () => {
  test('handleLiveness returns 200 OK with status "ok" and timestamp', async () => {
    let capturedStatusCode = null;
    let capturedHeaders = null;
    let capturedBody = '';

    const mockRes = {
      writeHead(status, headers) {
        capturedStatusCode = status;
        capturedHeaders = headers;
      },
      end(body) {
        capturedBody = body;
      }
    };

    await handleLiveness({}, mockRes);

    assert.equal(capturedStatusCode, 200);
    assert.equal(capturedHeaders['Content-Type'], 'application/json');
    const parsed = JSON.parse(capturedBody);
    assert.equal(parsed.status, 'ok');
    assert.ok(Date.parse(parsed.timestamp) > 0, 'Timestamp should be valid ISO string');
  });

  test('getSystemHealth produces compliant health report structure', async () => {
    const health = await getSystemHealth();

    assert.ok(['healthy', 'degraded'].includes(health.status));
    assert.ok([200, 503].includes(health.statusCode));
    assert.equal(health.service.timezone, 'Asia/Kolkata');
    assert.equal(health.service.version, config.app.version);
    assert.ok(typeof health.service.uptimeSeconds === 'number');
    assert.ok(health.service.memory.rssMb > 0);

    // Database block
    assert.ok(health.database);
    assert.equal(health.database.database, config.db.database);

    // Pilot baseline block
    assert.equal(health.pilotBaseline.product, 'EMS ECU Development (PROD-EMS-ECU)');
    assert.equal(health.pilotBaseline.rolesConfigured, 5);
    assert.equal(health.pilotBaseline.workAreaTagsCount, 14);
  });
});
