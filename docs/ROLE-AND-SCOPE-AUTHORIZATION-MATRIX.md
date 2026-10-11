# Automotive Project & Resource Management System
## Core Pilot Role-and-Scope Authorization Matrix

**Document Version:** 1.1  
**Status:** Design Proposal — Subject to Formal Product Owner or Delegated Approver Sign-off  
**Authoritative References:** PRD.md v1.0, docs/MVP-SCOPE.md, docs/CORE-PILOT-DECISIONS.md (CPD-006, CPD-007, CPD-008, CPD-009, CPD-010), docs/SECURITY.md, docs/DATA_MODEL.md  

> [!NOTE]
> **Decision-Traceability Note:**  
> Authorization rules are design proposals derived from CPD-007, CPD-008, and CPD-009. They are not approved implementation requirements until the relevant Core Pilot decision records have formal Product Owner or delegated-approver sign-off. Where no decision explicitly grants a permission, the matrix uses deny-by-default.

---

### 1. Mandatory Architectural Authorization Rules

1. **Global Authority:** `SYSTEM_ADMIN` possesses global authority across all entities, organizations, projects, and users.
2. **Product Multiplicity:** Products are a mandatory entity, and the physical schema supports multiple products. "EMS ECU Development" represents initial seed/demonstration data for the pilot, not an authorization or architectural limit.
3. **Project Creation Restriction:** Creating projects is restricted to `SYSTEM_ADMIN` ONLY. Project Managers cannot create projects because PM authority is bounded strictly by assigned projects (`user_scopes.scope_type = 'PROJECT'`). PMs can edit, archive, and manage only projects to which they are already assigned. (If project creation is delegated in the future, a separate approved decision must define the provisioning workflow and initial scope assignment).
4. **Team Scope Isolation:** `TEAM_LEAD` authority is strictly bounded by team scope (`user_scopes.scope_type = 'TEAM'`). A TL can update execution progress and approve leave for their direct team across assigned projects.
5. **Team Member Visibility & Ownership Isolation:** Team Members can **view own assigned activities only** and **view own assignments only**. Permission to view peer assignments, team-wide activities, or general project activity records is denied unless explicitly granted by a separate approved decision. Team Members may update only their own assigned activity status, remaining effort, forecast finish, and blocker description, subject to applicable transition rules.
6. **Resource Management Isolation & Deferred Audit:** `RESOURCE_MANAGER` authority is strictly bounded by resource scope. RMs maintain member calendars, capacity buffer percentages, and skills, and approve leave in scope. RMs **cannot** assign project activities. **Audit log access for Resource Manager is NO (deferred pending a separate decision).**
7. **Compound Evaluation:** Every access request requires both an authorized **Role** and a valid matching **Scope**, with the sole exception of `SYSTEM_ADMIN` global authority.
8. **Absolute Audit Immutability:** **No role** (including System Admin) possesses permission to modify or delete audit log records. Database privileges revoke `UPDATE` and `DELETE` on `audit_log`.
9. **Terminal Status Exclusivity:** Only `SYSTEM_ADMIN` may perform terminal entry (`Done`, `Cancelled`), terminal revocation (`Done → Cancelled`), and terminal reopenings, each requiring an administrative override and a trimmed reason ≥ 10 characters.
10. **Parent-Child Completion Rule:** A parent activity may transition to `Done` only when every direct child sub-activity is either `Done` or `Cancelled`. Any child in `Draft`, `Ready for Planning`, `Planned`, `In Progress`, or `Blocked` prevents the parent from entering `Done`.
11. **Capacity Override Governance:** Only `SYSTEM_ADMIN` and in-scope `PROJECT_MANAGER` may override a hard capacity conflict (> 100%), and both require a mandatory auditable justification (≥ 10 characters).
12. **Material-Change Threshold Governance:** Mandatory written justification (≥ 10 characters) and immutable audit logging are strictly enforced for:
    * Date change: shift of >= 3 working days;
    * Estimate change: change of >= 20 percent;
    * Assignee change: any assignee change on a `Planned` or `In Progress` activity;
    * Priority change: any priority change on a `Planned` or `In Progress` activity;
    * Terminal status changes (`Done`, `Cancelled`) and reopenings;
    * Hard capacity conflict overrides (> 100%).
13. **Leave Privacy Masking:** Sensitive leave reasons are visible **only** to `RESOURCE_MANAGER` within scope and `SYSTEM_ADMIN`. All other roles receive masked availability information (dates and duration only; Team Leads see leave type for own team).

---

### 2. Role-and-Scope Authorization Matrix

| Action | System Admin | Project Manager | Team Lead | Team Member | Resource Manager | Required Scope | Sensitive-Data Restriction | Audit Requirement | Core Pilot Status |
|---|---|---|---|---|---|---|---|---|---|
| **Create products** | **YES** | NO | NO | NO | NO | Global (`SYSTEM_ADMIN` only) | None | `ENTITY_CREATED` logged | Core Pilot (Multiple products supported; seed: `EMS ECU Development`) |
| **Edit, archive products** | **YES** | NO | NO | NO | NO | Global (`SYSTEM_ADMIN` only) | None | `ENTITY_UPDATED` / `ARCHIVED` logged | Core Pilot |
| **View products** | **YES** | **YES** | **YES** | **YES** | **YES** | Authenticated user | None | None (Read query) | Core Pilot |
| **Create projects** | **YES ONLY** | NO | NO | NO | NO | Global (`SYSTEM_ADMIN` only) | None | `PROJECT_CREATED` logged | Core Pilot (Admin-only creation; PM creation deferred) |
| **Edit, archive projects** | **YES** | **YES** (Assigned) | NO | NO | NO | Project scope (`user_scopes.scope_type = 'PROJECT'`) for PM; Global for Admin | None | `PROJECT_UPDATED` / `ARCHIVED` (reason required if archived or date change: shift of >= 3 working days) | Core Pilot |
| **View projects** | **YES** | **YES** (Assigned) | **YES** (Assigned) | **YES** (Assigned) | **YES** (In scope) | Project scope for edit; global metadata read | None | None (Read query) | Core Pilot |
| **Create, edit, archive phases** | **YES** | **YES** | NO | NO | NO | Assigned project scope (`ON DELETE RESTRICT`) | None | `PHASE_CREATED` / `UPDATED` / `ARCHIVED` logged | Core Pilot |
| **View phases** | **YES** | **YES** | **YES** | **YES** | **YES** | Assigned project scope | None | None (Read query) | Core Pilot |
| **Create, edit, archive activities** | **YES** | **YES** | NO | NO | NO | Assigned project scope (`UNIQUE (project_id, code)`) | None | `ACTIVITY_CREATED` / `UPDATED` (reason required if date change: shift of >= 3 working days, or estimate change: change of >= 20 percent) | Core Pilot |
| **View activities** | **YES** | **YES** (Assigned) | **YES** (Team in project) | **YES (Own assigned activities only)** | **YES** (In scope) | Admin: Global; PM: Assigned project; TL: Own team; TM: Own assigned activity; RM: Resource scope | None (TM sees own assigned activities only; peer/project viewing denied) | None (Read query) | Core Pilot |
| **Change non-terminal activity statuses** (`Draft → Ready for Planning`, `Ready for Planning ⇄ Planned`, `Planned → In Progress`, `In Progress → Planned`) | **YES** | **YES** | **YES** (`Planned → In Progress` for team) | **YES** (`Planned → In Progress` for own activity) | NO | PM: Project scope; TL: Team scope; TM: Own assigned activity match | None | `STATUS_CHANGE` logged; reason required if accompanied by date change: shift of >= 3 working days, or estimate change: change of >= 20 percent | Core Pilot |
| **Set Blocked and resolve Blocked ⇄ In Progress** | **YES** | **YES** | **YES** | **YES** | NO | PM: Project scope; TL: Team scope; TM: Own assigned activity match | Blocker description must be operational | `STATUS_CHANGE` logged; blocker description required on entry; optional note on exit | Core Pilot |
| **Enter Done or Cancelled** | **YES ONLY** | NO | NO | NO | NO | Global (`SYSTEM_ADMIN` only) | None | Action `OVERRIDE` logged; metadata `ACTIVITY_COMPLETED` / `ACTIVITY_CANCELLED`; mandatory reason ≥ 10 chars; parent requires all direct children Done/Cancelled | Core Pilot |
| **Revoke Done → Cancelled** | **YES ONLY** | NO | NO | NO | NO | Global (`SYSTEM_ADMIN` only) | None | Action `OVERRIDE` logged; metadata `ACTIVITY_REVOCATION`; mandatory reason ≥ 10 chars | Core Pilot |
| **Reopen Done or Cancelled** | **YES ONLY** | NO | NO | NO | NO | Global (`SYSTEM_ADMIN` only) | None | Action `OVERRIDE` logged; metadata `ACTIVITY_REOPENED`; mandatory reason ≥ 10 chars; atomic capacity check | Core Pilot |
| **Create, change, cancel assignments** | **YES** | **YES** | NO | NO | NO | Assigned project scope; exactly 1 active assignee per activity (`UNIQUE (activity_id) WHERE status = 'ACTIVE'`) | None | `ASSIGNMENT_CREATED` / `UPDATED` / `CANCELLED`; assignee change on Planned/In Progress requires reason ≥ 10 chars | Core Pilot |
| **View assignments** | **YES** | **YES** (Assigned) | **YES** (Team) | **YES (Own assignments only)** | **YES** (In scope) | Admin: Global; PM: Project scope; TL: Team scope; TM: Own assignment only; RM: Resource scope | Peer assignment visibility denied to Team Members | None (Read query) | Core Pilot |
| **View member capacity & cross-project workload** | **YES** (All) | **YES** (Assigned & candidates) | **YES** (Team) | **YES** (Self only) | **YES** (In scope) | Role and scope matched | Masked leave details (availability hours only) | None (Read query) | Core Pilot |
| **Override a hard capacity conflict (> 100%)** | **YES** | **YES** (Assigned projects) | NO | NO | NO | Admin: Global; PM: Assigned project only | None | Action `OVERRIDE` logged with member ID, week start, utilization %, and mandatory reason ≥ 10 chars | Core Pilot |
| **Submit leave** | **YES** (Any) | **YES** (Self) | **YES** (Self & team) | **YES** (Self) | **YES** (Self & scope) | Self, own team (TL), or resource scope (RM) | Self-service input; private reason field | `LEAVE_SUBMITTED` logged | Core Pilot |
| **Approve / Reject leave** | **YES** (Escalation) | NO | **YES** (Primary for team) | NO | **YES** (Secondary for scope) | TL: Own team; RM: Resource scope; Admin: Global | Reason visible to TL: type only, reason masked unless RM/Admin | `LEAVE_APPROVED` / `LEAVE_REJECTED` logged | Core Pilot |
| **View leave** | **YES** | **YES** (Dates/duration) | **YES** (Dates/type) | **YES** (Self full; peers dates) | **YES** (Full in scope) | Role-matched scope | Server-side serialization privacy masking enforced (CPD-006) | None (Read query) | Core Pilot |
| **View leave reasons (sensitive details)** | **YES** | NO | NO | **YES** (Self only) | **YES** (In scope only) | RM: Resource scope; Admin: Global; TM: Self only | **Strict Privacy Barrier:** Server-side masking strips reason for PM, TL, and peers | Access restricted at API serialization layer | Core Pilot |
| **Manage member calendars, capacity, and skills** | **YES** | NO | NO | NO | **YES** | RM: Resource scope; Admin: Global | None | `MEMBER_CAPACITY_UPDATED` / `CALENDAR_EXCEPTION_LOGGED` | Core Pilot |
| **Manage organization calendars and holidays** | **YES** | NO | NO | NO | NO | Global (`SYSTEM_ADMIN` only) | None | `CALENDAR_CONFIG_UPDATED` / `HOLIDAY_ADDED` logged | Core Pilot |
| **Manage users, roles, and scope assignments** | **YES** | NO | NO | NO | NO | Global (`SYSTEM_ADMIN` only) | Passwords hashed via Argon2id; zero plaintext storage | `USER_CREATED` / `ROLE_ASSIGNED` / `SCOPE_BOUND` logged | Core Pilot |
| **View audit logs** | **YES** (Full global) | **YES** (Assigned project scope) | NO | NO | **NO (Deferred)** | Admin: Global; PM: Project scope | Leave reasons sanitized in audit metadata for PM. RM audit access is deferred pending separate decision | Read audit access | Core Pilot |
| **Modify or delete audit records** | **FORBIDDEN** | **FORBIDDEN** | **FORBIDDEN** | **FORBIDDEN** | **FORBIDDEN** | **None (Strictly Prohibited System-Wide)** | Database engine level: `UPDATE` and `DELETE` revoked on `audit_log` table | Engine rejects mutation; attempt generates security alert | Core Pilot (Absolute Immutability Rule) |

---
