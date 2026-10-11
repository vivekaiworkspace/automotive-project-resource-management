import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config/index.js';

describe('Configuration & Calendar Invariants Tests', () => {
  test('Standard working calendar aligns with CPD-003 and BR-014', () => {
    assert.equal(config.calendar.defaultTimezone, 'Asia/Kolkata');
    assert.equal(config.calendar.standardHoursPerDay, 8.0);
    assert.equal(config.calendar.workingDaysPerWeek, 5);
    assert.equal(config.calendar.standardWeeklyHours, 40.0);
  });

  test('Capacity thresholds align with CPD-004 rules', () => {
    assert.equal(config.calendar.softWarningUtilizationPercent, 90.0);
    assert.equal(config.calendar.hardBlockUtilizationPercent, 100.0);
  });

  test('Database parameters have valid defaults', () => {
    assert.ok(typeof config.db.port === 'number');
    assert.ok(config.db.database.length > 0);
    assert.ok(config.db.user.length > 0);
  });
});
