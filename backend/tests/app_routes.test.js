import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';

describe('HTTP Application Route Integration Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createApp();
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  function makeRequest(path) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const body = data ? JSON.parse(data) : null;
            resolve({ statusCode: res.statusCode, headers: res.headers, body });
          } catch (e) {
            resolve({ statusCode: res.statusCode, headers: res.headers, raw: data });
          }
        });
      }).on('error', reject);
    });
  }

  test('GET /health returns 200 OK and status ok', async () => {
    const res = await makeRequest('/health');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(res.body.timestamp);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  test('GET /api/v1/modules returns modular monolith modules inventory', async () => {
    const res = await makeRequest('/api/v1/modules');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.architecture, 'Modular Monolith (In-Process Domain Modularity)');
    assert.equal(res.body.modules.length, 7);
    const moduleNames = res.body.modules.map(m => m.name);
    assert.deepEqual(moduleNames, [
      'iam',
      'organization',
      'project_catalog',
      'activity',
      'capacity_scheduling',
      'leave',
      'audit'
    ]);
  });

  test('GET / returns root API summary with EMS ECU metadata', async () => {
    const res = await makeRequest('/');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'online');
    assert.equal(res.body.pilotProduct, 'EMS ECU Development');
  });

  test('GET /unknown-route returns 404 NOT_FOUND with error envelope', async () => {
    const res = await makeRequest('/unknown-route');
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.ok(res.body.error.message.includes('/unknown-route'));
  });
});
