/**
 * Activity & Lifecycle Module
 * Architectural boundary: Manages activities, sub-activities (max depth 2), and non-linear status workflow (CPD-007, BR-002, Step 4).
 */
export const activityModule = {
  name: 'activity',
  version: '0.4.0',
  status: 'ACTIVE',
  maxSubactivityDepth: 1, // Parent -> Child (total depth 2)
  statuses: ['DRAFT', 'READY_FOR_PLANNING', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'],
  terminalStatuses: ['DONE', 'CANCELLED'],
};

export * from './activity.service.js';
export * from './activity.controller.js';
