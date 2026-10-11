export * from './reference_data.service.js';
export * from './product.service.js';
export * from './project.service.js';
export * from './phase.service.js';
export * from './tag.service.js';
export * from './scope.service.js';
export * from './custom_field.service.js';
export * from './project_catalog.controller.js';

export const projectCatalogModule = {
  name: 'project_catalog',
  version: '0.1.0',
  status: 'IMPLEMENTED_CORE_PILOT',
  pilotProduct: {
    code: 'PROD-EMS-ECU',
    name: 'EMS ECU Development',
  },
  workAreaTagsCount: 14,
};
