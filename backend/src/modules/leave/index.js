/**
 * Leave Management Module
 * Architectural boundary: Manages approved leave deductions and role-based privacy field masking (CPD-006).
 */
export const leaveModule = {
  name: 'leave',
  version: '0.1.0',
  status: 'FOUNDATION_SCAFFOLDED',
  leaveTypes: ['ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'OTHER'],
  privacyRule: 'Medical and personal reasons masked for general project members',
};
