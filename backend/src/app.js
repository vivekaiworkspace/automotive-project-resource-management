import http from 'node:http';
import { handleLiveness, handleReadiness } from './modules/health/health.controller.js';
import { applySecurityHeaders } from './middleware/securityHeaders.js';
import { logRequest } from './middleware/requestLogger.js';
import { sendError } from './middleware/errorHandler.js';
import { authenticateRequest } from './middleware/auth.js';
import { verifyCsrf } from './middleware/csrf.js';
import { config } from './config/index.js';

import { 
  iamModule,
  handleLogin,
  handleLogout,
  handleChangePassword,
  handleGetMe,
  handleGetCsrfToken,
  handleProtectedTest,
  handleAdminTest,
  handleListRoles,
  handleListUsers,
  handleGetUserById,
  handleCreateUser,
  handleUpdateUser,
  handleUpdateUserRoles,
  handleSetUserActivation,
} from './modules/iam/index.js';

import { 
  organizationModule,
  handleListTeams,
  handleGetTeamById,
  handleCreateTeam,
  handleUpdateTeam,
  handleArchiveTeam,
  handleListMemberships,
  handleCreateMembership,
  handleUpdateMembership,
  handleArchiveMembership,
} from './modules/organization/index.js';

import { 
  projectCatalogModule,
  handleListCategories,
  handleListReferenceData,
  handleGetReferenceDataById,
  handleCreateReferenceData,
  handleUpdateReferenceData,
  handleArchiveReferenceData,
  handleReactivateReferenceData,
  handleListProducts,
  handleGetProductById,
  handleCreateProduct,
  handleUpdateProduct,
  handleArchiveProduct,
  handleListProjects,
  handleGetProjectById,
  handleCreateProject,
  handleUpdateProject,
  handleArchiveProject,
  handleListPhases,
  handleCreatePhase,
  handleUpdatePhase,
  handleArchivePhase,
  handleListTags,
  handleCreateTag,
  handleUpdateTag,
  handleArchiveTag,
  handleGetProjectTags,
  handleAssignProjectTag,
  handleRemoveProjectTag,
  handleListAllProjectScopes,
  handleGetProjectManagers,
  handleAssignProjectManager,
  handleRemoveProjectManager,
  handleListCustomFieldDefinitions,
  handleGetCustomFieldDefinition,
  handleCreateCustomFieldDefinition,
  handleUpdateCustomFieldDefinition,
  handleArchiveCustomFieldDefinition,
  handleAddCustomFieldOption,
  handleUpdateCustomFieldOption,
  handleArchiveCustomFieldOption,
  handleGetProjectCustomFields,
  handleUpdateProjectCustomFields,
} from './modules/project_catalog/index.js';

import { 
  auditModule,
  handleGetAuditEvents,
} from './modules/audit/index.js';

import { 
  activityModule,
  handleListProjectActivities,
  handleCreateActivity,
  handleGetActivityById,
  handleUpdateActivity,
  handleTransitionStatus,
  handleArchiveActivity,
  handleRestoreActivity,
  handleGetActivityChildren,
  handleGetActivityAuditEvents,
  handleListMyActivities,
  handleListTeamActivities,
} from './modules/activity/index.js';
import { 
  capacitySchedulingModule,
  handleEvaluateCapacity,
  handleSaveAssignment,
  handleListConflictCases,
  handleGetConflictCase,
  handleGetCaseResolutionOptions,
  handleResolveCase,
  handleEscalateCase,
  handleCheckEscalations,
  handleListMilestones,
  handleCreateMilestone,
  handleUpdateMilestoneCommitted,
  handleGetMilestone,
  handleListNotifications,
} from './modules/capacity_scheduling/index.js';
import { leaveModule } from './modules/leave/index.js';

export function createApp() {
  const server = http.createServer(async (req, res) => {
    const startTime = Date.now();

    // Security headers & CORS
    applySecurityHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    res.on('finish', () => {
      logRequest(req, res, Date.now() - startTime);
    });

    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;

      // Unauthenticated health probes
      if (req.method === 'GET' && pathname === '/health') {
        return await handleLiveness(req, res);
      }

      if (req.method === 'GET' && (pathname === '/api/v1/health' || pathname === '/api/health')) {
        return await handleReadiness(req, res);
      }

      // Contextual Session Authentication
      await authenticateRequest(req);

      // Enforce anti-CSRF check for all state-changing browser requests (Req 2)
      if (!verifyCsrf(req, res)) {
        return;
      }

      // Public / Diagnostic routes
      if (req.method === 'GET' && pathname === '/api/v1/modules') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          architecture: 'Modular Monolith (In-Process Domain Modularity)',
          status: 'Core Pilot Foundation',
          modules: [
            iamModule,
            organizationModule,
            projectCatalogModule,
            activityModule,
            capacitySchedulingModule,
            leaveModule,
            auditModule,
          ]
        }, null, 2));
      }

      if (req.method === 'GET' && pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          service: config.app.name,
          version: config.app.version,
          status: 'online',
          pilotProduct: 'EMS ECU Development',
          docs: '/docs',
          healthCheck: '/health',
          readinessCheck: '/api/v1/health',
          modules: '/api/v1/modules',
        }, null, 2));
      }

      // =======================================================================
      // Authentication & Session Endpoints (Step 2)
      // =======================================================================
      if (req.method === 'POST' && pathname === '/api/v1/auth/login') {
        return await handleLogin(req, res);
      }

      if (req.method === 'POST' && pathname === '/api/v1/auth/logout') {
        return await handleLogout(req, res);
      }

      if (req.method === 'POST' && pathname === '/api/v1/auth/change-password') {
        return await handleChangePassword(req, res);
      }

      if (req.method === 'GET' && pathname === '/api/v1/auth/me') {
        return await handleGetMe(req, res);
      }

      if (req.method === 'GET' && pathname === '/api/v1/auth/csrf-token') {
        return await handleGetCsrfToken(req, res);
      }

      if (req.method === 'GET' && pathname === '/api/v1/auth/protected-test') {
        return await handleProtectedTest(req, res);
      }

      if (req.method === 'GET' && pathname === '/api/v1/auth/admin-test') {
        return await handleAdminTest(req, res);
      }

      // =======================================================================
      // Step 3: Users & Roles Administration Endpoints
      // =======================================================================
      if (req.method === 'GET' && pathname === '/api/v1/roles') {
        return await handleListRoles(req, res);
      }

      if (req.method === 'GET' && pathname === '/api/v1/users') {
        return await handleListUsers(req, res);
      }

      if (req.method === 'POST' && pathname === '/api/v1/users') {
        return await handleCreateUser(req, res);
      }

      const matchUserRoles = pathname.match(/^\/api\/v1\/users\/([a-zA-Z0-9-]+)\/roles$/);
      if (matchUserRoles) {
        if (req.method === 'PUT') return await handleUpdateUserRoles(req, res, matchUserRoles[1]);
      }

      const matchUserActivation = pathname.match(/^\/api\/v1\/users\/([a-zA-Z0-9-]+)\/activation$/);
      if (matchUserActivation) {
        if (req.method === 'PUT') return await handleSetUserActivation(req, res, matchUserActivation[1]);
      }

      const matchUser = pathname.match(/^\/api\/v1\/users\/([a-zA-Z0-9-]+)$/);
      if (matchUser) {
        const userId = matchUser[1];
        if (req.method === 'GET') return await handleGetUserById(req, res, userId);
        if (req.method === 'PUT') return await handleUpdateUser(req, res, userId);
      }

      // =======================================================================
      // Step 3: Teams & Team Memberships
      // =======================================================================
      if (req.method === 'GET' && pathname === '/api/v1/teams') {
        return await handleListTeams(req, res);
      }

      if (req.method === 'POST' && pathname === '/api/v1/teams') {
        return await handleCreateTeam(req, res);
      }

      const matchTeamArchive = pathname.match(/^\/api\/v1\/teams\/([a-zA-Z0-9-]+)\/archive$/);
      if (matchTeamArchive) {
        if (req.method === 'POST') return await handleArchiveTeam(req, res, matchTeamArchive[1]);
      }

      const matchMembershipArchive = pathname.match(/^\/api\/v1\/teams\/([a-zA-Z0-9-]+)\/memberships\/([a-zA-Z0-9-]+)\/archive$/);
      if (matchMembershipArchive) {
        if (req.method === 'POST') return await handleArchiveMembership(req, res, matchMembershipArchive[1], matchMembershipArchive[2]);
      }

      const matchMembershipItem = pathname.match(/^\/api\/v1\/teams\/([a-zA-Z0-9-]+)\/memberships\/([a-zA-Z0-9-]+)$/);
      if (matchMembershipItem) {
        if (req.method === 'PUT') return await handleUpdateMembership(req, res, matchMembershipItem[1], matchMembershipItem[2]);
      }

      const matchTeamMemberships = pathname.match(/^\/api\/v1\/teams\/([a-zA-Z0-9-]+)\/memberships$/);
      if (matchTeamMemberships) {
        const teamId = matchTeamMemberships[1];
        if (req.method === 'GET') return await handleListMemberships(req, res, teamId);
        if (req.method === 'POST') return await handleCreateMembership(req, res, teamId);
      }

      const matchTeam = pathname.match(/^\/api\/v1\/teams\/([a-zA-Z0-9-]+)$/);
      if (matchTeam) {
        const teamId = matchTeam[1];
        if (req.method === 'GET') return await handleGetTeamById(req, res, teamId);
        if (req.method === 'PUT') return await handleUpdateTeam(req, res, teamId);
      }

      // =======================================================================
      // Step 3: Configurable Reference Data
      // =======================================================================
      if (req.method === 'GET' && pathname === '/api/v1/reference-data/categories') {
        return await handleListCategories(req, res);
      }

      if (req.method === 'GET' && pathname === '/api/v1/reference-data') {
        return await handleListReferenceData(req, res);
      }

      if (req.method === 'POST' && pathname === '/api/v1/reference-data') {
        return await handleCreateReferenceData(req, res);
      }

      const matchRefArchive = pathname.match(/^\/api\/v1\/reference-data\/([a-zA-Z0-9-]+)\/archive$/);
      if (matchRefArchive) {
        if (req.method === 'POST') return await handleArchiveReferenceData(req, res, matchRefArchive[1]);
      }

      const matchRefReactivate = pathname.match(/^\/api\/v1\/reference-data\/([a-zA-Z0-9-]+)\/reactivate$/);
      if (matchRefReactivate) {
        if (req.method === 'POST') return await handleReactivateReferenceData(req, res, matchRefReactivate[1]);
      }

      const matchRefItem = pathname.match(/^\/api\/v1\/reference-data\/([a-zA-Z0-9-]+)$/);
      if (matchRefItem) {
        const refId = matchRefItem[1];
        if (req.method === 'GET') return await handleGetReferenceDataById(req, res, refId);
        if (req.method === 'PUT') return await handleUpdateReferenceData(req, res, refId);
      }

      // =======================================================================
      // Step 3: Products & Archival
      // =======================================================================
      if (req.method === 'GET' && pathname === '/api/v1/products') {
        return await handleListProducts(req, res);
      }

      if (req.method === 'POST' && pathname === '/api/v1/products') {
        return await handleCreateProduct(req, res);
      }

      const matchProdArchive = pathname.match(/^\/api\/v1\/products\/([a-zA-Z0-9-]+)\/archive$/);
      if (matchProdArchive) {
        if (req.method === 'POST') return await handleArchiveProduct(req, res, matchProdArchive[1]);
      }

      const matchProd = pathname.match(/^\/api\/v1\/products\/([a-zA-Z0-9-]+)$/);
      if (matchProd) {
        const prodId = matchProd[1];
        if (req.method === 'GET') return await handleGetProductById(req, res, prodId);
        if (req.method === 'PUT') return await handleUpdateProduct(req, res, prodId);
      }

      // =======================================================================
      // Step 3: Project Phases & Tags
      // =======================================================================
      const matchPhaseArchive = pathname.match(/^\/api\/v1\/projects\/([a-zA-Z0-9-]+)\/phases\/([a-zA-Z0-9-]+)\/archive$/);
      if (matchPhaseArchive) {
        if (req.method === 'POST') return await handleArchivePhase(req, res, matchPhaseArchive[1], matchPhaseArchive[2]);
      }

      const matchPhaseItem = pathname.match(/^\/api\/v1\/projects\/([a-zA-Z0-9-]+)\/phases\/([a-zA-Z0-9-]+)$/);
      if (matchPhaseItem) {
        if (req.method === 'PUT') return await handleUpdatePhase(req, res, matchPhaseItem[1], matchPhaseItem[2]);
      }

      const matchProjectPhases = pathname.match(/^\/api\/v1\/projects\/([a-zA-Z0-9-]+)\/phases$/);
      if (matchProjectPhases) {
        const projId = matchProjectPhases[1];
        if (req.method === 'GET') return await handleListPhases(req, res, projId);
        if (req.method === 'POST') return await handleCreatePhase(req, res, projId);
      }

      const matchProjectTagItem = pathname.match(/^\/api\/v1\/projects\/([a-zA-Z0-9-]+)\/tags\/([a-zA-Z0-9-]+)$/);
      if (matchProjectTagItem) {
        if (req.method === 'DELETE') return await handleRemoveProjectTag(req, res, matchProjectTagItem[1], matchProjectTagItem[2]);
      }

      const matchProjectTags = pathname.match(/^\/api\/v1\/projects\/([a-zA-Z0-9-]+)\/tags$/);
      if (matchProjectTags) {
        const projId = matchProjectTags[1];
        if (req.method === 'GET') return await handleGetProjectTags(req, res, projId);
        if (req.method === 'POST') return await handleAssignProjectTag(req, res, projId);
      }

      // Project Manager Scopes
      if (req.method === 'GET' && pathname === '/api/v1/project-scopes') {
        return await handleListAllProjectScopes(req, res);
      }

      const matchProjManagerItem = pathname.match(/^\/api\/v1\/projects\/([a-zA-Z0-9-]+)\/managers\/([a-zA-Z0-9-]+)$/);
      if (matchProjManagerItem) {
        if (req.method === 'DELETE') return await handleRemoveProjectManager(req, res, matchProjManagerItem[1], matchProjManagerItem[2]);
      }

      const matchProjManagers = pathname.match(/^\/api\/v1\/projects\/([a-zA-Z0-9-]+)\/managers$/);
      if (matchProjManagers) {
        const projId = matchProjManagers[1];
        if (req.method === 'GET') return await handleGetProjectManagers(req, res, projId);
        if (req.method === 'POST') return await handleAssignProjectManager(req, res, projId);
      }

      // Project Custom Fields
      const matchProjectCustomFields = pathname.match(/^\/api\/v1\/projects\/([a-zA-Z0-9-]+)\/custom-fields$/);
      if (matchProjectCustomFields) {
        const projId = matchProjectCustomFields[1];
        if (req.method === 'GET') return await handleGetProjectCustomFields(req, res, projId);
        if (req.method === 'PUT') return await handleUpdateProjectCustomFields(req, res, projId);
      }

      // =======================================================================
      // Step 3: Projects & Archival
      // =======================================================================
      if (req.method === 'GET' && pathname === '/api/v1/projects') {
        return await handleListProjects(req, res);
      }

      if (req.method === 'POST' && pathname === '/api/v1/projects') {
        return await handleCreateProject(req, res);
      }

      const matchProjArchive = pathname.match(/^\/api\/v1\/projects\/([a-zA-Z0-9-]+)\/archive$/);
      if (matchProjArchive) {
        if (req.method === 'POST') return await handleArchiveProject(req, res, matchProjArchive[1]);
      }

      const matchProj = pathname.match(/^\/api\/v1\/projects\/([a-zA-Z0-9-]+)$/);
      if (matchProj) {
        const projId = matchProj[1];
        if (req.method === 'GET') return await handleGetProjectById(req, res, projId);
        if (req.method === 'PUT') return await handleUpdateProject(req, res, projId);
      }

      // =======================================================================
      // Step 3: Work-Area Tags
      // =======================================================================
      if (req.method === 'GET' && pathname === '/api/v1/tags') {
        return await handleListTags(req, res);
      }

      if (req.method === 'POST' && pathname === '/api/v1/tags') {
        return await handleCreateTag(req, res);
      }

      const matchTagArchive = pathname.match(/^\/api\/v1\/tags\/([a-zA-Z0-9-]+)\/archive$/);
      if (matchTagArchive) {
        if (req.method === 'POST') return await handleArchiveTag(req, res, matchTagArchive[1]);
      }

      const matchTagItem = pathname.match(/^\/api\/v1\/tags\/([a-zA-Z0-9-]+)$/);
      if (matchTagItem) {
        const tagId = matchTagItem[1];
        if (req.method === 'PUT') return await handleUpdateTag(req, res, tagId);
      }

      // =======================================================================
      // Step 3: Custom Field Definitions & Options
      // =======================================================================
      if (req.method === 'GET' && pathname === '/api/v1/custom-fields/definitions') {
        return await handleListCustomFieldDefinitions(req, res);
      }

      if (req.method === 'POST' && pathname === '/api/v1/custom-fields/definitions') {
        return await handleCreateCustomFieldDefinition(req, res);
      }

      const matchDefArchive = pathname.match(/^\/api\/v1\/custom-fields\/definitions\/([a-zA-Z0-9-]+)\/archive$/);
      if (matchDefArchive) {
        if (req.method === 'POST') return await handleArchiveCustomFieldDefinition(req, res, matchDefArchive[1]);
      }

      const matchDefOptionAdd = pathname.match(/^\/api\/v1\/custom-fields\/definitions\/([a-zA-Z0-9-]+)\/options$/);
      if (matchDefOptionAdd) {
        if (req.method === 'POST') return await handleAddCustomFieldOption(req, res, matchDefOptionAdd[1]);
      }

      const matchDefItem = pathname.match(/^\/api\/v1\/custom-fields\/definitions\/([a-zA-Z0-9-]+)$/);
      if (matchDefItem) {
        const defId = matchDefItem[1];
        if (req.method === 'GET') return await handleGetCustomFieldDefinition(req, res, defId);
        if (req.method === 'PUT') return await handleUpdateCustomFieldDefinition(req, res, defId);
      }

      const matchOptArchive = pathname.match(/^\/api\/v1\/custom-fields\/options\/([a-zA-Z0-9-]+)\/archive$/);
      if (matchOptArchive) {
        if (req.method === 'POST') return await handleArchiveCustomFieldOption(req, res, matchOptArchive[1]);
      }

      const matchOptItem = pathname.match(/^\/api\/v1\/custom-fields\/options\/([a-zA-Z0-9-]+)$/);
      if (matchOptItem) {
        const optId = matchOptItem[1];
        if (req.method === 'PUT') return await handleUpdateCustomFieldOption(req, res, optId);
      }

      // =======================================================================
      // Step 3: Audit Log (System Admin only)
      // =======================================================================
      if (req.method === 'GET' && pathname === '/api/v1/audit/events') {
        return await handleGetAuditEvents(req, res);
      }

      // =======================================================================
      // Step 4: Activity Planning & Execution Workflow Endpoints
      // =======================================================================

      // Project Activities List & Creation
      const matchProjectActivities = pathname.match(/^\/api\/v1\/projects\/([a-zA-Z0-9-]+)\/activities$/);
      if (matchProjectActivities) {
        const projectId = matchProjectActivities[1];
        if (req.method === 'GET') return await handleListProjectActivities(req, res, projectId);
        if (req.method === 'POST') return await handleCreateActivity(req, res, projectId);
      }

      // "My Activities" for Team Members
      if (req.method === 'GET' && pathname === '/api/v1/activities/my') {
        return await handleListMyActivities(req, res);
      }

      // "Team Activities" for Team Leads
      if (req.method === 'GET' && pathname === '/api/v1/activities/team') {
        return await handleListTeamActivities(req, res);
      }

      // Status Transitions
      const matchActivityStatus = pathname.match(/^\/api\/v1\/activities\/([a-zA-Z0-9-]+)\/status-transitions$/);
      if (matchActivityStatus) {
        const activityId = matchActivityStatus[1];
        if (req.method === 'POST') return await handleTransitionStatus(req, res, activityId);
      }

      // Activity Archival & Restoration
      const matchActivityArchive = pathname.match(/^\/api\/v1\/activities\/([a-zA-Z0-9-]+)\/archive$/);
      if (matchActivityArchive) {
        const activityId = matchActivityArchive[1];
        if (req.method === 'POST') return await handleArchiveActivity(req, res, activityId);
      }

      const matchActivityRestore = pathname.match(/^\/api\/v1\/activities\/([a-zA-Z0-9-]+)\/restore$/);
      if (matchActivityRestore) {
        const activityId = matchActivityRestore[1];
        if (req.method === 'POST') return await handleRestoreActivity(req, res, activityId);
      }

      // Activity Hierarchy: Direct Children
      const matchActivityChildren = pathname.match(/^\/api\/v1\/activities\/([a-zA-Z0-9-]+)\/children$/);
      if (matchActivityChildren) {
        const activityId = matchActivityChildren[1];
        if (req.method === 'GET') return await handleGetActivityChildren(req, res, activityId);
      }

      // Activity Audit History
      const matchActivityAudit = pathname.match(/^\/api\/v1\/activities\/([a-zA-Z0-9-]+)\/audit-events$/);
      if (matchActivityAudit) {
        const activityId = matchActivityAudit[1];
        if (req.method === 'GET') return await handleGetActivityAuditEvents(req, res, activityId);
      }

      // Activity Item: GET & PATCH
      const matchActivity = pathname.match(/^\/api\/v1\/activities\/([a-zA-Z0-9-]+)$/);
      if (matchActivity) {
        const activityId = matchActivity[1];
        if (req.method === 'GET') return await handleGetActivityById(req, res, activityId);
        if (req.method === 'PATCH') return await handleUpdateActivity(req, res, activityId);
      }

      // =======================================================================
      // Step 5: Capacity Conflict Resolution, Assignments & Milestones Workflow
      // =======================================================================

      // Evaluate capacity pre-check
      if (req.method === 'POST' && pathname === '/api/v1/capacity/evaluate') {
        return await handleEvaluateCapacity(req, res);
      }

      // Save assignment with capacity validation
      const matchAssignment = pathname.match(/^\/api\/v1\/activities\/([a-zA-Z0-9-]+)\/assignments$/);
      if (matchAssignment) {
        const activityId = matchAssignment[1];
        if (req.method === 'POST') return await handleSaveAssignment(req, res, activityId);
      }

      // Check / trigger escalation of overdue cases
      if ((req.method === 'POST' || req.method === 'GET') && pathname === '/api/v1/capacity-conflicts/check-escalations') {
        return await handleCheckEscalations(req, res);
      }

      // Capacity Conflict Resolution Options
      const matchCaseOptions = pathname.match(/^\/api\/v1\/capacity-conflicts\/([a-zA-Z0-9-]+)\/options$/);
      if (matchCaseOptions) {
        const caseId = matchCaseOptions[1];
        if (req.method === 'GET') return await handleGetCaseResolutionOptions(req, res, caseId);
      }

      // Resolve Case
      const matchCaseResolve = pathname.match(/^\/api\/v1\/capacity-conflicts\/([a-zA-Z0-9-]+)\/resolve$/);
      if (matchCaseResolve) {
        const caseId = matchCaseResolve[1];
        if (req.method === 'POST') return await handleResolveCase(req, res, caseId);
      }

      // Escalate Case
      const matchCaseEscalate = pathname.match(/^\/api\/v1\/capacity-conflicts\/([a-zA-Z0-9-]+)\/escalate$/);
      if (matchCaseEscalate) {
        const caseId = matchCaseEscalate[1];
        if (req.method === 'POST') return await handleEscalateCase(req, res, caseId);
      }

      // Capacity Conflict Case: GET by ID
      const matchCaseItem = pathname.match(/^\/api\/v1\/capacity-conflicts\/([a-zA-Z0-9-]+)$/);
      if (matchCaseItem) {
        const caseId = matchCaseItem[1];
        if (req.method === 'GET') return await handleGetConflictCase(req, res, caseId);
      }

      // List Capacity Conflict Cases
      if (req.method === 'GET' && pathname === '/api/v1/capacity-conflicts') {
        return await handleListConflictCases(req, res);
      }

      // Project Milestones: List & Create
      const matchProjectMilestones = pathname.match(/^\/api\/v1\/projects\/([a-zA-Z0-9-]+)\/milestones$/);
      if (matchProjectMilestones) {
        const projectId = matchProjectMilestones[1];
        if (req.method === 'GET') return await handleListMilestones(req, res, projectId);
        if (req.method === 'POST') return await handleCreateMilestone(req, res, projectId);
      }

      // Milestone Committed Status: PATCH
      const matchMilestoneCommitted = pathname.match(/^\/api\/v1\/milestones\/([a-zA-Z0-9-]+)\/committed$/);
      if (matchMilestoneCommitted) {
        const milestoneId = matchMilestoneCommitted[1];
        if (req.method === 'PATCH') return await handleUpdateMilestoneCommitted(req, res, milestoneId);
      }

      // Milestone Item: GET
      const matchMilestoneItem = pathname.match(/^\/api\/v1\/milestones\/([a-zA-Z0-9-]+)$/);
      if (matchMilestoneItem) {
        const milestoneId = matchMilestoneItem[1];
        if (req.method === 'GET') return await handleGetMilestone(req, res, milestoneId);
      }

      // In-app Notifications: GET
      if (req.method === 'GET' && pathname === '/api/v1/notifications') {
        return await handleListNotifications(req, res);
      }

      // Not Found
      return sendError(res, 404, 'NOT_FOUND', `Route not found: ${req.method} ${pathname}`);
    } catch (err) {
      console.error('Unhandled request exception:', err);
      return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected internal error occurred.');
    }
  });

  return server;
}
