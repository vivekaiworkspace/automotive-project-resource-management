import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { capacitySchedulingModule } from '../src/modules/capacity_scheduling/index.js';

describe('Deterministic Capacity Mathematics Tests (CPD-002, CPD-004)', () => {
  const { calculateNetCapacityHours, evaluateUtilization } = capacitySchedulingModule;

  test('TC-CAL-001: 5 working days * 8 hours = 40.00h base net capacity', () => {
    const net = calculateNetCapacityHours(5, 8.0, 0, 0);
    assert.equal(net, 40.0);
  });

  test('Approved leave reduces capacity by standard hours (1 day = 8h)', () => {
    const net = calculateNetCapacityHours(5, 8.0, 8.0, 0);
    assert.equal(net, 32.0);
  });

  test('Non-project buffer reduces net capacity proportionally (10% of 40h = 36h)', () => {
    const net = calculateNetCapacityHours(5, 8.0, 0, 10.0);
    assert.equal(net, 36.0);
  });

  test('Combined leave and buffer calculation', () => {
    // 40h gross - 8h leave = 32h available * (1 - 0.20) = 25.6h
    const net = calculateNetCapacityHours(5, 8.0, 8.0, 20.0);
    assert.equal(net, 25.6);
  });

  test('TC-CAP-001: 90% planned utilization triggers SOFT_WARNING', () => {
    // 36.00h assigned against 40.00h net capacity = exactly 90.00%
    const result = evaluateUtilization(36.0, 40.0);
    assert.equal(result.plannedUtilizationPercent, 90.0);
    assert.equal(result.status, 'SOFT_WARNING');
  });

  test('TC-CAP-002: Utilization exceeding 100% triggers HARD_BLOCK', () => {
    // 40.01h assigned against 40.00h net capacity = 100.03%
    const result = evaluateUtilization(40.01, 40.0);
    assert.equal(result.status, 'HARD_BLOCK');
    assert.ok(result.plannedUtilizationPercent > 100.0);
  });

  test('TC-CAP-REG-100: Exactly 100.0% utilization triggers HARD_BLOCK / Capacity Conflict', () => {
    // 40.00h assigned against 40.00h net capacity = exactly 100.00%
    const result = evaluateUtilization(40.0, 40.0);
    assert.equal(result.plannedUtilizationPercent, 100.0);
    assert.equal(result.status, 'HARD_BLOCK');
    assert.equal(result.label, 'Capacity Conflict');
  });

  test('TC-CAP-005: Zero net capacity week with assigned load triggers HARD_BLOCK (999.99%)', () => {
    const result = evaluateUtilization(8.0, 0.0);
    assert.equal(result.status, 'HARD_BLOCK');
    assert.equal(result.plannedUtilizationPercent, 999.99);
  });

  test('Zero load in zero capacity week returns OK', () => {
    const result = evaluateUtilization(0.0, 0.0);
    assert.equal(result.status, 'OK');
    assert.equal(result.plannedUtilizationPercent, 0.0);
  });
});
