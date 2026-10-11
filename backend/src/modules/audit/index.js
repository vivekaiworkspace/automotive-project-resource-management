/**
 * Audit & Governance Module
 * Architectural boundary: Append-only immutable audit trail and override justifications (CPD-009, CPD-010).
 */
export * from './audit.service.js';
export * from './audit.controller.js';

export const auditModule = {
  name: 'audit',
  version: '0.1.0',
  status: 'FOUNDATION_SCAFFOLDED',
  actions: [
    'INSERT',
    'UPDATE',
    'DELETE',
    'STATUS_CHANGE',
    'OVERRIDE',
    'LOGIN_SUCCESS',
    'LOGIN_FAILURE',
    'LOGOUT',
    'PASSWORD_CHANGE',
    'ACCOUNT_LOCKOUT',
    'ROLE_ASSIGNMENT',
    'ROLE_REMOVAL'
  ],
  minOverrideReasonLength: 10,
};
