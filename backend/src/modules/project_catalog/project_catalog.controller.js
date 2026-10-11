import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { sendError } from '../../middleware/errorHandler.js';
import { StaleVersionError } from '../iam/user.service.js';

import {
  listCategories,
  listReferenceData,
  getReferenceDataById,
  createReferenceData,
  updateReferenceData,
  archiveReferenceData,
  reactivateReferenceData,
} from './reference_data.service.js';

import {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  archiveProduct,
} from './product.service.js';

import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  archiveProject,
} from './project.service.js';

import {
  listPhases,
  getPhaseById,
  createPhase,
  updatePhase,
  archivePhase,
} from './phase.service.js';

import {
  listTags,
  createTag,
  updateTag,
  archiveTag,
  getProjectTags,
  assignProjectTag,
  removeProjectTag,
  checkProjectScope,
} from './tag.service.js';

import {
  listAllProjectScopes,
  getProjectManagers,
  assignProjectManager,
  removeProjectManager,
} from './scope.service.js';

import {
  listCustomFieldDefinitions,
  getCustomFieldDefinitionById,
  createCustomFieldDefinition,
  updateCustomFieldDefinition,
  archiveCustomFieldDefinition,
  addCustomFieldOption,
  updateCustomFieldOption,
  archiveCustomFieldOption,
  getProjectCustomFields,
  saveProjectCustomFields,
} from './custom_field.service.js';

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function handleControllerError(res, err) {
  if (err instanceof StaleVersionError || err.code === 'CONFLICT_STALE_RECORD') {
    return sendError(res, 409, 'CONFLICT_STALE_RECORD', err.message, {
      current_version: err.currentVersion,
      expected_version: err.expectedVersion,
    });
  }

  const msg = err.message || '';
  if (msg.includes('Access denied')) {
    return sendError(res, 403, 'FORBIDDEN', msg);
  }
  if (msg.includes('not found')) {
    return sendError(res, 404, 'NOT_FOUND', msg);
  }
  if (
    msg.includes('already') ||
    msg.includes('mandatory') ||
    msg.includes('require') ||
    msg.includes('invalid') ||
    msg.includes('cannot') ||
    msg.includes('must') ||
    msg.includes('conflict') ||
    msg.includes('Blank') ||
    msg.includes('Unknown') ||
    msg.includes('Inactive') ||
    msg.includes('Archived') ||
    msg.includes('sequence') ||
    msg.includes('valid date') ||
    msg.includes('does not exist')
  ) {
    return sendError(res, 400, 'BAD_REQUEST', msg);
  }

  console.error('Project catalog error:', err);
  return sendError(res, 500, 'INTERNAL_SERVER_ERROR', msg || 'Internal server error');
}

// -----------------------------------------------------------------------------
// Reference Data Handlers
// -----------------------------------------------------------------------------

export async function handleListCategories(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const categories = await listCategories();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ categories }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleListReferenceData(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const category = url.searchParams.get('category') || null;
    const activeOnly = url.searchParams.get('active_only') === 'true';

    const items = await listReferenceData({ category, activeOnly });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ items }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleGetReferenceDataById(req, res, id) {
  if (!requireAuth(req, res)) return;
  try {
    const item = await getReferenceDataById(id);
    if (!item) return sendError(res, 404, 'NOT_FOUND', `Reference item with ID ${id} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ item }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleCreateReferenceData(req, res) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const item = await createReferenceData({
      category: body.category,
      code: body.code,
      name: body.name,
      displayOrder: body.display_order,
      actorId: req.user.id,
    });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ item, message: 'Reference item created successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleUpdateReferenceData(req, res, id) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const updated = await updateReferenceData(id, {
      name: body.name,
      displayOrder: body.display_order,
      expectedVersion: body.version,
      actorId: req.user.id,
    });
    if (!updated) return sendError(res, 404, 'NOT_FOUND', `Reference item with ID ${id} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ item: updated, message: 'Reference item updated successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleArchiveReferenceData(req, res, id) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const archived = await archiveReferenceData(id, {
      expectedVersion: body.version,
      actorId: req.user.id,
    });
    if (!archived) return sendError(res, 404, 'NOT_FOUND', `Reference item with ID ${id} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ item: archived, message: 'Reference item archived successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleReactivateReferenceData(req, res, id) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const reactivated = await reactivateReferenceData(id, {
      expectedVersion: body.version,
      actorId: req.user.id,
    });
    if (!reactivated) return sendError(res, 404, 'NOT_FOUND', `Reference item with ID ${id} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ item: reactivated, message: 'Reference item reactivated successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

// -----------------------------------------------------------------------------
// Product Handlers
// -----------------------------------------------------------------------------

export async function handleListProducts(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const activeOnly = url.searchParams.get('active_only') === 'true';
    const products = await listProducts({ activeOnly });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ products }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleGetProductById(req, res, productId) {
  if (!requireAuth(req, res)) return;
  try {
    const product = await getProductById(productId);
    if (!product) return sendError(res, 404, 'NOT_FOUND', `Product with ID ${productId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ product }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleCreateProduct(req, res) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const product = await createProduct({
      code: body.code,
      name: body.name,
      productTypeId: body.product_type_id || body.productTypeId,
      businessPriorityId: body.business_priority_id || body.businessPriorityId,
      ownerUserId: body.owner_user_id || body.ownerUserId,
      actorId: req.user.id,
    });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ product, message: 'Product created successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleUpdateProduct(req, res, productId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const updated = await updateProduct(productId, {
      name: body.name,
      productTypeId: body.product_type_id || body.productTypeId,
      businessPriorityId: body.business_priority_id || body.businessPriorityId,
      ownerUserId: body.owner_user_id || body.ownerUserId,
      expectedVersion: body.version,
      actorId: req.user.id,
    });
    if (!updated) return sendError(res, 404, 'NOT_FOUND', `Product with ID ${productId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ product: updated, message: 'Product updated successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleArchiveProduct(req, res, productId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const archived = await archiveProduct(productId, {
      expectedVersion: body.version,
      actorId: req.user.id,
    });
    if (!archived) return sendError(res, 404, 'NOT_FOUND', `Product with ID ${productId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ product: archived, message: 'Product archived successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

// -----------------------------------------------------------------------------
// Project Handlers
// -----------------------------------------------------------------------------

export async function handleListProjects(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const projects = await listProjects(req.user);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ projects }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleGetProjectById(req, res, projectId) {
  if (!requireAuth(req, res)) return;
  try {
    const project = await getProjectById(projectId, req.user);
    if (!project) return sendError(res, 404, 'NOT_FOUND', `Project with ID ${projectId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ project }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleCreateProject(req, res) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const project = await createProject({
      code: body.code,
      name: body.name,
      description: body.description,
      productId: body.product_id || body.productId,
      ownerUserId: body.owner_user_id || body.ownerUserId,
      projectPriorityId: body.project_priority_id || body.projectPriorityId,
      projectStatusId: body.project_status_id || body.projectStatusId,
      plannedStartDate: body.planned_start_date || body.plannedStartDate,
      plannedFinishDate: body.planned_finish_date || body.plannedFinishDate,
      tagIds: body.tag_ids || body.tagIds || [],
      customFieldValues: body.custom_field_values || body.customFieldValues || {},
      actorId: req.user.id,
    });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ project, message: 'Project created successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleUpdateProject(req, res, projectId) {
  const checkPerm = requireRoles(['SYSTEM_ADMIN', 'PROJECT_MANAGER']);
  if (!checkPerm(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const updated = await updateProject(projectId, {
      name: body.name,
      description: body.description,
      ownerUserId: body.owner_user_id || body.ownerUserId,
      projectPriorityId: body.project_priority_id || body.projectPriorityId,
      projectStatusId: body.project_status_id || body.projectStatusId,
      plannedStartDate: body.planned_start_date || body.plannedStartDate,
      plannedFinishDate: body.planned_finish_date || body.plannedFinishDate,
      expectedVersion: body.version,
      actorId: req.user.id,
      requestingUser: req.user,
    });
    if (!updated) return sendError(res, 404, 'NOT_FOUND', `Project with ID ${projectId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ project: updated, message: 'Project updated successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleArchiveProject(req, res, projectId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const archived = await archiveProject(projectId, {
      expectedVersion: body.version,
      actorId: req.user.id,
    });
    if (!archived) return sendError(res, 404, 'NOT_FOUND', `Project with ID ${projectId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ project: archived, message: 'Project archived successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

// -----------------------------------------------------------------------------
// Phase Handlers
// -----------------------------------------------------------------------------

export async function handleListPhases(req, res, projectId) {
  if (!requireAuth(req, res)) return;
  try {
    const phases = await listPhases(projectId, req.user);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ phases }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleCreatePhase(req, res, projectId) {
  const checkPerm = requireRoles(['SYSTEM_ADMIN', 'PROJECT_MANAGER']);
  if (!checkPerm(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const phase = await createPhase(projectId, {
      name: body.name,
      sequenceNumber: body.sequence_number !== undefined ? body.sequence_number : body.sequenceNumber,
      plannedStartDate: body.planned_start_date || body.plannedStartDate,
      plannedFinishDate: body.planned_finish_date || body.plannedFinishDate,
      actorId: req.user.id,
      requestingUser: req.user,
    });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ phase, message: 'Phase created successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleUpdatePhase(req, res, projectId, phaseId) {
  const checkPerm = requireRoles(['SYSTEM_ADMIN', 'PROJECT_MANAGER']);
  if (!checkPerm(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const updated = await updatePhase(phaseId, {
      name: body.name,
      sequenceNumber: body.sequence_number !== undefined ? body.sequence_number : body.sequenceNumber,
      plannedStartDate: body.planned_start_date || body.plannedStartDate,
      plannedFinishDate: body.planned_finish_date || body.plannedFinishDate,
      expectedVersion: body.version,
      actorId: req.user.id,
      requestingUser: req.user,
    });
    if (!updated) return sendError(res, 404, 'NOT_FOUND', `Phase with ID ${phaseId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ phase: updated, message: 'Phase updated successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleArchivePhase(req, res, projectId, phaseId) {
  const checkPerm = requireRoles(['SYSTEM_ADMIN', 'PROJECT_MANAGER']);
  if (!checkPerm(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const archived = await archivePhase(phaseId, {
      expectedVersion: body.version,
      actorId: req.user.id,
      requestingUser: req.user,
    });
    if (!archived) return sendError(res, 404, 'NOT_FOUND', `Phase with ID ${phaseId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ phase: archived, message: 'Phase archived successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

// -----------------------------------------------------------------------------
// Tag Handlers
// -----------------------------------------------------------------------------

export async function handleListTags(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const activeOnly = url.searchParams.get('active_only') === 'true';
    const tags = await listTags({ activeOnly });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tags }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleCreateTag(req, res) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const tag = await createTag({
      code: body.code,
      name: body.name,
      displayOrder: body.display_order,
      actorId: req.user.id,
    });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tag, message: 'Tag created successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleUpdateTag(req, res, tagId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const updated = await updateTag(tagId, {
      name: body.name,
      displayOrder: body.display_order,
      expectedVersion: body.version,
      actorId: req.user.id,
    });
    if (!updated) return sendError(res, 404, 'NOT_FOUND', `Tag with ID ${tagId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tag: updated, message: 'Tag updated successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleArchiveTag(req, res, tagId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const archived = await archiveTag(tagId, {
      expectedVersion: body.version,
      actorId: req.user.id,
    });
    if (!archived) return sendError(res, 404, 'NOT_FOUND', `Tag with ID ${tagId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tag: archived, message: 'Tag archived successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleGetProjectTags(req, res, projectId) {
  if (!requireAuth(req, res)) return;
  try {
    const tags = await getProjectTags(projectId, req.user);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tags }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleAssignProjectTag(req, res, projectId) {
  const checkPerm = requireRoles(['SYSTEM_ADMIN', 'PROJECT_MANAGER']);
  if (!checkPerm(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const tagId = body.tag_id || body.tagId;
    if (!tagId) return sendError(res, 400, 'BAD_REQUEST', 'Tag ID is required.');

    const result = await assignProjectTag(projectId, tagId, { actorId: req.user.id, requestingUser: req.user });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result, message: 'Tag assigned to project successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleRemoveProjectTag(req, res, projectId, tagId) {
  const checkPerm = requireRoles(['SYSTEM_ADMIN', 'PROJECT_MANAGER']);
  if (!checkPerm(req, res)) return;

  try {
    const result = await removeProjectTag(projectId, tagId, { actorId: req.user.id, requestingUser: req.user });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result, message: 'Tag removed from project successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

// -----------------------------------------------------------------------------
// Project Scope Handlers
// -----------------------------------------------------------------------------

export async function handleListAllProjectScopes(req, res) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const scopes = await listAllProjectScopes();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ scopes }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleGetProjectManagers(req, res, projectId) {
  if (!requireAuth(req, res)) return;
  try {
    const managers = await getProjectManagers(projectId, req.user);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ managers }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleAssignProjectManager(req, res, projectId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const userId = body.user_id || body.userId;
    if (!userId) return sendError(res, 400, 'BAD_REQUEST', 'User ID is required.');

    const result = await assignProjectManager(projectId, userId, req.user.id);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result, message: 'Project Manager assigned successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleRemoveProjectManager(req, res, projectId, userId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const result = await removeProjectManager(projectId, userId, req.user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result, message: 'Project Manager removed from project.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

// -----------------------------------------------------------------------------
// Custom Field Handlers
// -----------------------------------------------------------------------------

export async function handleListCustomFieldDefinitions(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const productTypeId = url.searchParams.get('product_type_id') || null;
    const activeOnly = url.searchParams.get('active_only') === 'true';

    const definitions = await listCustomFieldDefinitions({ productTypeId, activeOnly });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ definitions }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleGetCustomFieldDefinition(req, res, id) {
  if (!requireAuth(req, res)) return;
  try {
    const definition = await getCustomFieldDefinitionById(id);
    if (!definition) return sendError(res, 404, 'NOT_FOUND', `Custom field definition with ID ${id} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ definition }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleCreateCustomFieldDefinition(req, res) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const def = await createCustomFieldDefinition({
      productTypeId: body.product_type_id || body.productTypeId,
      code: body.code,
      label: body.label,
      helpText: body.help_text || body.helpText,
      fieldType: body.field_type || body.fieldType,
      isRequired: body.is_required !== undefined ? body.is_required : body.isRequired,
      displayOrder: body.display_order || body.displayOrder,
      options: body.options || [],
      actorId: req.user.id,
    });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ definition: def, message: 'Custom field definition created successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleUpdateCustomFieldDefinition(req, res, id) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const updated = await updateCustomFieldDefinition(id, {
      label: body.label,
      helpText: body.help_text || body.helpText,
      isRequired: body.is_required !== undefined ? body.is_required : body.isRequired,
      displayOrder: body.display_order || body.displayOrder,
      expectedVersion: body.version,
      actorId: req.user.id,
    });
    if (!updated) return sendError(res, 404, 'NOT_FOUND', `Custom field definition with ID ${id} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ definition: updated, message: 'Custom field definition updated successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleArchiveCustomFieldDefinition(req, res, id) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const archived = await archiveCustomFieldDefinition(id, {
      expectedVersion: body.version,
      actorId: req.user.id,
    });
    if (!archived) return sendError(res, 404, 'NOT_FOUND', `Custom field definition with ID ${id} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ definition: archived, message: 'Custom field definition archived successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleAddCustomFieldOption(req, res, definitionId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const option = await addCustomFieldOption(definitionId, {
      code: body.code,
      label: body.label,
      displayOrder: body.display_order || body.displayOrder,
      actorId: req.user.id,
    });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ option, message: 'Option added successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleUpdateCustomFieldOption(req, res, optionId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const updated = await updateCustomFieldOption(optionId, {
      label: body.label,
      displayOrder: body.display_order || body.displayOrder,
      expectedVersion: body.version,
      actorId: req.user.id,
    });
    if (!updated) return sendError(res, 404, 'NOT_FOUND', `Option with ID ${optionId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ option: updated, message: 'Option updated successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleArchiveCustomFieldOption(req, res, optionId) {
  const checkAdmin = requireRoles(['SYSTEM_ADMIN']);
  if (!checkAdmin(req, res)) return;

  try {
    const body = await parseJsonBody(req);
    const archived = await archiveCustomFieldOption(optionId, {
      expectedVersion: body.version,
      actorId: req.user.id,
    });
    if (!archived) return sendError(res, 404, 'NOT_FOUND', `Option with ID ${optionId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ option: archived, message: 'Option archived successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleGetProjectCustomFields(req, res, projectId) {
  if (!requireAuth(req, res)) return;
  if (!checkProjectScope(projectId, req.user)) {
    return sendError(res, 403, 'FORBIDDEN', 'Access denied: project is outside assigned scope.');
  }
  try {
    const fields = await getProjectCustomFields(projectId);
    if (!fields) return sendError(res, 404, 'NOT_FOUND', `Project with ID ${projectId} not found.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ custom_fields: fields }));
  } catch (err) {
    handleControllerError(res, err);
  }
}

export async function handleUpdateProjectCustomFields(req, res, projectId) {
  const checkPerm = requireRoles(['SYSTEM_ADMIN', 'PROJECT_MANAGER']);
  if (!checkPerm(req, res)) return;

  if (!checkProjectScope(projectId, req.user)) {
    return sendError(res, 403, 'FORBIDDEN', 'Access denied: project is outside assigned scope.');
  }

  try {
    const body = await parseJsonBody(req);
    const values = body.values || body.custom_field_values || body;
    const fields = await saveProjectCustomFields(projectId, values, { actorId: req.user.id });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ custom_fields: fields, message: 'Custom fields saved successfully.' }));
  } catch (err) {
    handleControllerError(res, err);
  }
}
