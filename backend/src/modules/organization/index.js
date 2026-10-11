export * from './team.service.js';
export * from './membership.service.js';
export * from './organization.controller.js';

export const organizationModule = {
  name: 'organization',
  version: '0.1.0',
  status: 'IMPLEMENTED_CORE_PILOT',
  calendar: {
    timezone: 'Asia/Kolkata',
    standardHoursPerDay: 8.0,
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  },
};
