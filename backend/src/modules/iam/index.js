/**
 * Identity & Access Management Module (IAM)
 * Architectural boundary: Manages users, credentials, roles, and scope permissions (CPD-008, CPD-010).
 */
export * from './crypto.service.js';
export * from './session.service.js';
export * from './rateLimiter.service.js';
export * from './bootstrap.service.js';
export * from './role.service.js';
export * from './user.service.js';
export * from './iam.controller.js';

export const iamModule = {
  name: 'iam',
  version: '0.1.0',
  status: 'IMPLEMENTED_CORE_PILOT',
  roles: ['SYSTEM_ADMIN', 'PROJECT_MANAGER', 'TEAM_LEAD', 'TEAM_MEMBER', 'RESOURCE_MANAGER'],
  scopes: ['PROJECT', 'TEAM'],
};
