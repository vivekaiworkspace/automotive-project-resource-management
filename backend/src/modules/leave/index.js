/**
 * Leave Management Module (Step 6)
 * Architectural boundary: Manages approved leave deductions and role-based privacy field masking (CPD-006).
 */

export const leaveModule = {
  name: 'leave',
  version: '1.0.0',
  status: 'ACTIVE_CORE_PILOT',
  leaveTypes: ['ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'OTHER'],
  privacyRule: 'Medical and personal reasons masked server-side for general project members and team leads',
};

export * from './leave.service.js';
export * from './leave.serializer.js';
export * from './leave.controller.js';
