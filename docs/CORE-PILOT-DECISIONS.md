# Core Pilot Decisions
## Automotive Multi-Product Project & Resource Management System

**Document type:** Approval register — pre-architecture decisions
**Source documents:** PRD.md v1.0, MVP-SCOPE.md v0.2, OPEN-QUESTIONS.md v0.1, REQUIREMENTS-DECISION-LOG.md v0.1
**Prepared:** 2026-10-10
**Status:** **CORE PILOT BUILD GATE: CLEARED WITH CONDITIONS (2026-10-10)**
**Summary:** Build authorized to proceed against technical design baseline subject to recorded conditions.

> [!NOTE]
> **Build Gate Outcome: CLEARED WITH CONDITIONS (2026-10-10)**
>
> **Required before pilot go-live:**
> 1. One Product Owner approval record covering CPD-001 to CPD-008, excluding CPD-009.
> 2. CPD-003 calendar and holiday list before pilot data is loaded.
> 3. CPD-010 IT confirmation of network access, backup location, and restore-test owner/date before go-live.
>
> **Deferred to Operational Hardening:**
> - CPD-009 detailed material-change thresholds and mandatory-reason policy.
> - Full configurable permissions, corporate SSO, advanced backup/recovery, dependency engine, dashboards, and other listed hardening features.

---

## CPD-001 — Product Hierarchy and Project Work-Area Tags

**Decision status:** **Approved by Product Owner, Vivek (2026-10-10)**

**Confirmed business context and approved model:**
- **Single Product:** **EMS ECU Development** is the single top-level Product for the pilot. It covers the complete development lifecycle for engine management system ECUs.
- **Configurable Work-Area Tags:** The 14 items below are **configurable, multi-select Project Work-Area Tags**, **not Products**. They must **not create separate Product records**.
- **Multi-select tags on Projects:** A Project may have **one or more Work-Area Tags** simultaneously. All projects share the same core entity structure.
- **Portfolio and Sub-products:** Portfolio remains **optional** in the data model. **Sub-products are not supported** in MVP Core Pilot; the hierarchy is flat at the Product level.

**Authoritative hierarchy for MVP Core Pilot:**
```
Portfolio (optional grouping, not required for pilot)
  └── Product (mandatory; single product: EMS ECU Development)
        └── Project (mandatory; unique code, name, owner, priority, status, planned dates, 1+ Work-Area Tags)
              └── Phase / Workstream (optional grouping within a project; name, sequence, planned dates)
                    └── Activity (authoritative unit of work; see CPD-007)
                          └── Sub-activity (one level only; see CPD-007)
                                └── Assignment (links an activity to one team member; see CPD-005)
```

**Approved 14 Project Work-Area Tags:**
1. Customer Vehicle Program
2. New ECU Development
3. Hardware Variant
4. Base Software
5. Application Software
6. Calibration
7. Diagnostics / OBD
8. Feature Change
9. Integration
10. Validation
11. Compliance
12. Quality
13. Production Support
14. Internal Process / Tool Improvement

**PRD / scope reference:** BR-001, BR-002, FR-PP-001, FR-PP-002, PRD § Core Information Model hierarchy, MVP-SCOPE.md §§ 1, 5; OPEN-QUESTIONS.md Q1.1, Q1.2, Q1.3; REQUIREMENTS-DECISION-LOG.md §1.1

**Status:** Approved by Product Owner, Vivek (2026-10-10)

- [x] Approve — EMS ECU Development is the single top-level Product; 14 items are configurable, multi-select Project Work-Area Tags (not Products); projects carry 1+ tags; no separate product records; Portfolio optional; no sub-products.
- [ ] Change — approved alternative:

---

## CPD-002 — Estimate and Capacity Unit

**Decision status:** **Approved by Product Owner, Vivek (2026-10-10)**

**Approved rules:**
- **Hours as mandatory unit:** Hours are the mandatory and exclusive unit for all activity effort estimates, assignments, remaining effort, capacity, and workload calculations in MVP Core Pilot.
- **Activity effort fields:** Original estimate (hours), current estimate (hours), remaining effort (hours), and optionally actual effort (hours).
- **Actual effort optional:** Actual-effort / time tracking is optional per project. Timesheets are not required for Core Pilot.
- **Progress signal:** Remaining effort is the primary progress signal.
- **Story points reference only:** Story points may be stored only as non-calculating reference notes in a secondary field; no automatic conversion to hours is provided.
- **Assignment distribution:** Planned effort on an Assignment is stored in hours and distributed evenly across valid working days.

**PRD / scope reference:** FR-ACT-005, FR-CAP-004, FR-CAP-005, BR-004, PRD § "The distribution rule must be explicit," MVP-SCOPE.md §§ 6, 7; OPEN-QUESTIONS.md Q5.1, Q5.2; REQUIREMENTS-DECISION-LOG.md §1.2, §1.3

**Status:** Approved by Product Owner, Vivek (2026-10-10)

- [x] Approve — Hours as mandatory and exclusive unit for estimates, assignments, remaining effort, capacity, and workload calculations; actual effort optional per project; remaining effort is primary progress signal; story points as non-calculating reference notes only.
- [ ] Change — approved alternative:

---

## CPD-003 — Organization Calendar

**Decision status:** **Approved by Product Owner, Vivek (2026-10-10)**

The following calendar settings are confirmed for MVP Core Pilot and form the basis of the net-capacity formula (see CPD-004):

| Setting | Approved value | Notes |
|---|---|---|
| Standard working days per week | Monday – Friday (5 days) | Confirmed base working pattern |
| Standard working hours per day | 8 hours | 40 hours/week standard full capacity |
| Organization time zone | `Asia/Kolkata` | Canonical organization time zone |
| Public holidays | 2026 holiday calendar pending | **Pending:** Vivek will provide the 2026 holiday list before pilot data is loaded and capacity planning begins |
| Per-member calendar exceptions | Individual non-working days | Entered by Resource Manager or Admin; override the organization calendar for that member on specified dates |

Additional rules:
- All timestamps are stored in UTC and displayed in each user's configured time zone (BR-014).
- Working-day calculations for a member's assignment use the **member's configured time zone** for day-boundary determination. Project-level milestone dates use the **organization's configured time zone** (`Asia/Kolkata`). This rule must be documented explicitly in the scheduling engine (OPEN-QUESTIONS.md Q4.2).
- Per-team calendars (distinct from the organization calendar) are an MVP Operational Hardening item and are not configured during Core Pilot.
- The organization time zone field in Admin is a mandatory field; the system must not allow assignments to be created if this field is empty.

**PRD / scope reference:** FR-RES-002, FR-RES-003, BR-014, FR-SCH-001, MVP-SCOPE.md § 3; OPEN-QUESTIONS.md Q5.7, Q4.2; REQUIREMENTS-DECISION-LOG.md §6.3, §6.5

**Why this is needed before architecture**
Net capacity (CPD-004) is calculated per member per week. The calculation is impossible until working days, daily hours, and the organization time zone are resolved. The time zone also determines how UTC timestamps are translated into "today" for overdue-activity and stale-update calculations. Agreeing on the calendar model before schema design avoids ambiguous nullable columns in the calendar and capacity tables.

**Status:** Approved by Product Owner, Vivek (2026-10-10)

- [x] Approve — Mon–Fri, 8 hours/day, Time zone: `Asia/Kolkata`. Public holiday calendar pending from Vivek before pilot data load.
- [ ] Change — approved alternative:

---

## CPD-004 — Capacity Rules

**Proposed decision**

The following formulas and thresholds govern all capacity and conflict calculations in MVP Core Pilot.

**Net capacity formula (FR-CAP-004)**
```
Net capacity (hours/week) =
    (working days in week × daily hours per calendar)
  − approved leave hours in that week
  − calendar exceptions (non-working days) in that week
  − non-project buffer (hours/week)
```

**Non-project buffer (FR-RES-002)**
- Default: 0% of weekly capacity.
- Configurable per member as a percentage of weekly hours by Resource Manager.
- Must be set before pilot assignments are made if the organization uses any meaningful non-project time reservation.
- No calendar events are required for non-project time in Core Pilot; the percentage is a flat planning reserve.

**Planned utilization formula (FR-CAP-005)**
```
Planned utilization (%) = planned assignment effort (hours in week)
                          ÷ net capacity (hours in week) × 100
```
Where "planned assignment effort in week" is the portion of the evenly distributed assignment load that falls within that working week.

**Effort distribution rule (PRD § "The distribution rule must be explicit")**
- Planned assignment effort is spread evenly across the assignment's valid working days (working days within the assignment's start–end date range, excluding non-working days and approved leave).
- There is no redistribution around daily-capacity caps in Core Pilot: if daily load from all assignments exceeds daily hours, the weekly utilization figure rises accordingly and triggers the conflict rules below.
- Front-loaded, back-loaded, and custom effort profiles are Post-MVP features.

**Zero-capacity rule**
- If net capacity for a week is zero (all capacity consumed by leave or exceptions) and planned load is greater than zero, the system treats this as a **hard conflict**, not as an infinite utilization percentage (PRD § "The base calculations are").

**Conflict thresholds (FR-CAP-006, FR-CAP-007)**

| Threshold | Proposed value | Action |
|---|---|---|
| Soft warning | 90% utilization | Warn the planner; assignment may be saved without override |
| Hard block | 100% utilization | Block the save; requires an authorized override with a recorded reason |

- Admin must configure these thresholds before any assignments are made. There is no system-wide fallback that bypasses configuration.
- The roles authorized to override a hard conflict in Core Pilot are: System Admin and Project Manager (for activities within their assigned projects). This is a minimum set; the full override permission matrix is an Operational Hardening item.
- Override always requires a reason; the reason is written to the audit log.

**PRD / scope reference:** FR-CAP-004, FR-CAP-005, FR-CAP-006, FR-CAP-007, FR-RES-002, PRD §§ "The base calculations are" and "The distribution rule must be explicit," BR-017; MVP-SCOPE.md § 7; OPEN-QUESTIONS.md Q5.3, Q5.4; REQUIREMENTS-DECISION-LOG.md §6.1, §6.2, §3.6, §1.8

**Why this is needed before architecture**
The net-capacity formula determines the exact columns and calculation logic required in the capacity-aggregation query. The conflict thresholds determine whether the system needs a configurable-threshold table or can use constants; and the override model determines whether the assignment write path needs a second-approver record. These choices propagate into the data model, the API contract, and the test suite before any other assignment logic is written.

**Status:** Approved by Product Owner, Vivek (2026-10-10)

- [x] Approve — 90% planned utilization soft warning; 100% planned utilization hard block; override only for System Admin and relevant Project Manager with mandatory written justification in audit log; 0% default non-project buffer per member (Resource Manager configurable per member).
- [ ] Change — approved alternative:

---

## CPD-005 — Cross-Project Load Aggregation

**Proposed decision**

Two explicit aggregation rules apply to all capacity and demand queries in Core Pilot. In both rules, **active project** means any project whose status is not Archived and not Cancelled.

**Rule (a) — Member utilization**
A member's weekly planned load and utilization calculation must include every active assignment for that member across every active pilot project. There is no filter on the project currently being planned; the query always spans the full set of active projects. This is the mechanism that makes PRD Acceptance Scenario 1 ("cross-project overload") provable in Core Pilot: when a planner opens any active project and attempts to assign an activity, the utilization figure shown — and the overload warning and hard block from CPD-004 — are based on that member's combined load from all active projects, not from the open project alone.

**Rule (b) — Unassigned demand**
The unassigned-demand list (FR-CAP-011) must include every Ready-for-Planning activity that has no confirmed individual assignee, across every active pilot project. Membership of the list depends only on activity status (Ready for Planning) and absence of a confirmed assignee — not on whether the viewing member has any existing assignment in that project.

Additional rules:
- The overload warning and hard block (CPD-004) fire on the aggregate utilization produced by Rule (a).
- Advanced cross-portfolio filtering, cross-product workload analytics, and performance-optimized aggregation across a large enterprise project set are MVP Operational Hardening items (FR-RES-010, full scope).

**PRD / scope reference:** FR-RES-010 (pilot scope), FR-CAP-005, FR-CAP-006, FR-CAP-011, PRD Acceptance Scenario 1, MVP-SCOPE.md §§ 1, 7 (AG-2); REQUIREMENTS-DECISION-LOG.md §6.1

**Why this is needed before architecture**
Rule (a) requires the capacity-aggregation query to JOIN across all active projects for every utilization lookup; a single-project filter at this point would require a full query rewrite later and a potentially breaking API change. Rule (b) requires the unassigned-demand query to span all active projects with no project-membership pre-filter; its WHERE clause and indexes must be designed for this from the start. Both rules must be expressed as explicit test-case preconditions in the unit and integration test suite before any capacity or demand endpoint is written.

**Status:** Approved by Product Owner, Vivek (2026-10-10)

- [x] Approve — Mandatory workload aggregation across all active EMS ECU projects (not Archived, not Cancelled); every assignment checks member's total active commitments; unassigned ready-for-planning demand visible across all active pilot projects.
- [ ] Change — approved alternative:

---

## CPD-006 — Leave Rules and Privacy

**Proposed decision**

**Leave and capacity interaction**

| Leave status | Effect on net capacity | Effect on assignments |
|---|---|---|
| Pending (submitted, not yet approved) | No reduction in committed capacity | Soft warning displayed on any assignment overlapping the leave dates |
| Approved | Reduces net capacity for affected days; triggers utilization recalculation | Hard conflict raised if new load would breach the threshold; existing assignments flagged |
| Rejected or Cancelled | No reduction; soft warning removed | No change to assignments |

- Leave submission is made by the member or an authorized manager (FR-RES-004).
- Leave approval authority in Core Pilot: Team Lead is the primary approver for their own team members; Resource Manager can approve for any member within their resource scope; System Admin can approve in all cases. (OPEN-QUESTIONS.md Q2.5)
- When approved leave is entered, the system finds all overlapping assignments, recalculates utilization, and raises conflicts or warnings immediately.

**Leave visibility by role**

The PRD requires that sensitive leave details are not visible outside authorized resource roles (PRD § Security, OPEN-QUESTIONS.md Q2.3). The proposed field-level visibility rules for Core Pilot are:

| Role | Leave dates and duration | Leave type (e.g., Annual, Sick) | Leave reason | Approver |
|---|---|---|---|---|
| Project Manager, Team Member (own assignments only) | Unavailable from [date] to [date] — duration only | Not visible | Not visible | Not visible |
| Team Lead | Visible for own team members | Visible for own team members | Not visible | Not visible |
| Resource Manager | Visible for all members in scope | Visible | Visible | Visible |
| System Admin | Visible | Visible | Visible | Visible |

- "Unavailable from [date] to [date]" is the minimum information any project-visible user sees for a member on leave; this is sufficient for capacity planning without exposing personal details.
- These rules must be enforced server-side on the leave API response; the UI field visibility alone is not sufficient.

**PRD / scope reference:** FR-RES-004, FR-CAP-006, Security § "No sensitive leave reason displayed outside authorized resource roles," PRD Acceptance Scenario 2, MVP-SCOPE.md § 4; OPEN-QUESTIONS.md Q2.3, Q2.5, Q5.6; REQUIREMENTS-DECISION-LOG.md §1.10, §2.2, §5.4

**Why this is needed before architecture**
Leave interacts with the capacity formula (CPD-004) at the API layer: the leave table, the capacity-query join condition, and the assignment-conflict check all reference leave status. The visibility rules determine which fields are returned per role in the leave API response, which means they must be decided before the API contract is designed — not added as a filter later. Adding server-side field suppression retroactively requires changes to every leave endpoint.

**Status:** Approved by Product Owner, Vivek (2026-10-10)

- [x] Approve — Only approved leave reduces capacity (pending leave creates soft warning for overlapping assignments); leave visibility tiers as proposed (PM/Member: dates/duration only; TL: dates/type for own team; RM: full details in scope; Admin: full details); leave approval authority (TL for own team, RM in scope, Admin for all).
- [ ] Change — approved alternative:

---

## CPD-007 — Activity Structure and Status Workflow

**Decision ID:** CPD-007
**Decision Title:** Activity Structure and Status Workflow
**Decision Status:** **Approved by Product Owner, Vivek (2026-10-11)**
**Decision Outcome:**
- [x] Approve proposed decision as stated
- [ ] Change proposed decision

**Approved Alternative:**
*"Approve CPD-007 with the corrected Activity Status Transition Matrix as the authoritative Core Pilot transition specification, subject to the CPD-009 deferral."*

**Approval Control:**
- **Approver Full Name:** Vivek
- **Approver Role/Title:** Product Owner
- **Delegated Authority Confirmation:** Direct Product Owner approval (Vivek)
- **Decision Date:** 2026-10-11
- **Approval Evidence / Reference:** Product Owner decision recorded in Core Pilot decision register
- **Approval Scope Confirmed:** Corrected activity status transition matrix and CPD-007 clarifications (Sections A–G below), subject to the CPD-009 deferral stated below
- **Approved Document / Revision:** Core Pilot Decisions v0.1 / CPD-007 Specification
- **Conditions / Exceptions / Follow-up Actions:** Approved subject to CPD-009 deferral to Operational Hardening (detailed date/effort material-change thresholds and ordinary-edit reason prompts excluded from Core Pilot).
- **Record Owner:** Vivek (Product Owner)

> [!NOTE]
> CPD-007 is approved by Product Owner Vivek on 2026-10-11. Terminal administrative overrides, atomic cancellation, child-completion constraints, and immutable audit tracking are approved for Core Pilot. Material-change threshold prompts for ordinary edits are deferred per CPD-009. For the approval record, see [docs/CPD-007-APPROVAL-REQUEST.md](file:///c:/DATA/Antigravity/Projects/automotive-project-resource-management/docs/CPD-007-APPROVAL-REQUEST.md).

---

### Confirmed Business Rules and Clarifications

#### A. Hierarchy and Depth
- Activities support exactly one level of sub-activities in Core Pilot (Activity → Sub-activity; maximum depth = 2 levels). Admin cannot increase this limit during Core Pilot; configurable depth is an MVP Operational Hardening item (FR-ACT-002, REQUIREMENTS-DECISION-LOG.md §1.9).
- A parent activity's progress and dates roll up from its children (FR-ACT-002).
- Activity effort is stored independently from assignee allocation so reassignment does not destroy the estimate (BR-004).

#### B. Terminal Transitions, Revocations, and Reopenings
- **Strict Role Restriction:** Only `SYSTEM_ADMIN` may move an activity into `Done` or `Cancelled`.
- **Terminal Revocation:** Only `SYSTEM_ADMIN` may perform `Done → Cancelled`.
- **Terminal Reopening:** Only `SYSTEM_ADMIN` may reopen `Done` or `Cancelled` activities (to `Draft`, `Ready for Planning`, `Planned`, or `In Progress`).
- **Administrative Override Justification:** Every terminal entry, terminal revocation, or terminal reopening is classified as an administrative override requiring a trimmed written justification of at least 10 characters.
- Project Manager, Team Lead, and Team Member cannot directly set `Done` or `Cancelled` in Core Pilot.

#### C. Audit Behavior
- Write one immutable audit record for every terminal override.
- **Required Audit Log Fields:** Entity name and ID, action, event type, actor ID, effective role, UTC timestamp, correlation ID, complete before state, complete after state, justification (min 10 chars), authorization basis, capacity-check outcome, and any related hard-conflict override.
- **Core Action Enum:** Use audit action `STATUS_CHANGE` for ordinary transitions. Use audit action `OVERRIDE` for terminal entry, terminal revocation, and terminal reopening. Do not create a separate audit mechanism or silently expand the core audit action enum.
- **Metadata Event Types:** Store human-readable event types in metadata: `ACTIVITY_COMPLETED`, `ACTIVITY_CANCELLED`, `ACTIVITY_REOPENED`, or `ACTIVITY_REVOCATION`.

#### D. Cancellation Atomicity
- Cancellation must occur in **one atomic database transaction**:
  1. Atomically update activity status to `Cancelled`.
  2. Cancel/terminate active assignment load effective from the cancellation date forward.
  3. Recalculate affected member capacity.
  4. Write the immutable audit record.
- Historical assignments, actual effort, and previous audit history are fully preserved.
- Cancelled assignments must not consume future capacity.
- **Independent Sub-activity Status:** Sub-activities retain their independent statuses (no automatic recursive child cancellation). Sub-activities keep their own status unless a separately authorized user action changes them.

#### E. Parent and Child Completion Rule
- A parent activity may transition to `Done` only when every direct child sub-activity is either `Done` or `Cancelled`. Any child in `Draft`, `Ready for Planning`, `Planned`, `In Progress`, or `Blocked` prevents the parent from entering `Done`.

#### F. Deferred and Conditional Behavior
- **Actual-Start-Date Capture:** Automatic actual-start-date capture is **not** implemented in Core Pilot.
- **Replanning Justification:** Ordinary backward replanning (`Planned → Ready for Planning` or `In Progress → Planned`) does not enforce material-change reason prompts in Core Pilot; material-change threshold enforcement is deferred to Operational Hardening (CPD-009).
- **Blocker Description vs. Material Change:** Entering `Blocked` requires a blocker description. Returning `Blocked → In Progress` may optionally record a resolution note. Neither transition requires a material-change reason prompt.

#### G. Default Scheduling Constraint and Identifiers
- Default for all new activities: **As Soon As Possible (ASAP)**. Available in Core Pilot: ASAP, Start No Earlier Than (SNET), Finish No Later Than (FNLT).
- Stable readable IDs: Every activity receives a stable, project-scoped readable ID (`UNIQUE (project_id, code)`). IDs are never reused after deletion or archival.

---

## CPD-008 — Pilot Roles and Minimum Authority

**Proposed decision**

The five roles active in Core Pilot are listed below with their minimum authority. The full configurable permission matrix is an MVP Operational Hardening item; these minimums are the floor that architecture must enforce from day one.

| Role | Core Pilot minimum authority |
|---|---|
| **System Admin** | Full system access: create/edit/archive any entity, configure all settings, approve leave for any member, override any hard conflict with reason, view full audit log, create the first user accounts, manage roles and scope |
| **Project Manager** | Full control within assigned projects: create/edit/archive activities and phases, assign team members (subject to capacity rules), update any activity field in assigned projects, create a basic project list view, view audit log for assigned projects; cannot create products (product creation requires Admin or Portfolio Manager) |
| **Team Lead** | Review and update activities for their team across assigned projects: update activity status, progress, and remaining effort; submit and approve leave for own team members; receive blocker and overload notifications; view team workload; cannot create products or projects |
| **Team Member** | View and update own assigned activities only: update status, remaining effort, forecast finish, and add a blocker description; submit own leave; receive assignment and blocker notifications; cannot view other members' leave reasons |
| **Resource Manager** | Maintain team structure, member capacity, and skills catalogue; submit and approve leave for members within resource scope; view full leave record including reason for members in scope; view cross-project workload for members in scope; cannot create products or projects; cannot assign activities |

Additional rules:
- A person may hold more than one role simultaneously (PRD § Users and Roles).
- Access is the intersection of role permissions and scope assignments: a Project Manager sees only their assigned projects; a Team Lead sees only their team's members (BR-018).
- Portfolio Manager and Viewer roles exist in the PRD but are not active in Core Pilot. They are MVP Operational Hardening items.
- Leave approval: Team Lead is primary for own team; Resource Manager is secondary for all members in scope; System Admin approves in all cases. Escalation path is configured in Admin settings.
- Hard-conflict override authority in Core Pilot: System Admin (always) and Project Manager (within their assigned projects only). This minimum set is expanded in Operational Hardening's full permission matrix.

**PRD / scope reference:** PRD § Users and Roles, Permissions Matrix §, FR-RES-004, FR-CAP-007, BR-018; MVP-SCOPE.md § 2; OPEN-QUESTIONS.md Q2.1, Q2.2, Q2.4, Q2.5; REQUIREMENTS-DECISION-LOG.md §1.4, §2.1, §2.2, §5.1, §5.3

**Why this is needed before architecture**
Row-level access control and API authorization checks are implemented against specific role codes. Changing the role list or redefining a role's authority boundary after the authorization layer is built requires updating every permission check in the codebase. The minimum authority table above is the contract that the permission-check unit tests are written against; those tests must be written before the first API endpoint is implemented (PRD § Testing Strategy).

**Status:** Approved by Product Owner, Vivek (2026-10-10)

- [x] Approve — Five pilot roles (System Admin, Project Manager, Team Lead, Team Member, Resource Manager) with authority as proposed; Project Manager can override capacity hard block only in assigned projects with written justification; multiple roles per person permitted.
- [ ] Change — approved alternative:

---

## CPD-009 — Material-Change Rules

**Decision Status:** **Deferred to Operational Hardening — not Core Pilot implementation scope.**

A "material change" (BR-011) was proposed as an edit to a field that requires the system to prompt the user for a reason and write an audit entry recording the before value, after value, actor, timestamp, and reason.

**Operational Hardening Proposed Thresholds (Deferred from Core Pilot):**

The following events were proposed as material changes and are deferred to Operational Hardening:

| Event | Proposed Threshold / Condition (Operational Hardening) | Reason required? | Audit entry? |
|---|---|---|---|
| Activity due-date change | Date change: shift of >= 3 working days from current due date | Yes (min 10 chars) | Yes |
| Activity start-date change | Date change: shift of >= 3 working days from current start date | Yes (min 10 chars) | Yes |
| Activity current-estimate change | Estimate change: change of >= 20 percent of current estimate (in hours) | Yes (min 10 chars) | Yes |
| Assignee change | Any assignee change on a Planned or In Progress activity | Yes (min 10 chars) | Yes |
| Activity priority change | Any priority change on a Planned or In Progress activity | Yes (min 10 chars) | Yes |
| Activity status change to Cancelled | Always (Terminal administrative override) | Yes (min 10 chars) | Yes |
| Activity status change to Done | Always (Terminal administrative override) | Yes (min 10 chars) | Yes |
| Hard-conflict override | Always (see CPD-004) | Yes (min 10 chars) | Yes |
| Leave approval or rejection by an authorized manager | Always | No — reason optional | Yes |

Changes below the date/effort thresholds are saved silently with a standard audit row (actor and timestamp) but without prompting for a reason. In Core Pilot, ordinary activity field edits do not trigger reason prompts; reason prompts are enforced only for approved capacity hard-block overrides (CPD-004) and terminal administrative overrides (CPD-007).

Additional rules:
- Admin can adjust date-shift and effort-percentage thresholds in system settings. The proposed defaults above are the initial values entered at deployment.
- Reason text is a free-text field with a minimum length of 10 characters to prevent placeholder entries.
- The material-change audit entry is appended to the immutable audit log (see CPD-010); it cannot be edited through the UI (Audit §).
- Bulk edits (FR-ACT-010) generate a single correlation ID and one audit entry per modified record, each referencing the same bulk-operation ID. Bulk edit is an MVP Operational Hardening feature; this rule defines its audit behavior so the audit schema supports it from day one.

**PRD / scope reference:** BR-011, Audit §, FR-ACT-005, FR-ACP-006, FR-CAP-007; MVP-SCOPE.md §§ 6, 10; OPEN-QUESTIONS.md Q3.2; REQUIREMENTS-DECISION-LOG.md §1.6

**Why this is needed before architecture**
The audit table schema must include columns for `reason`, `before_value`, `after_value`, `correlation_id`, and `actor_id` from the first migration. The API write paths for activity and assignment endpoints must know which field-change combinations trigger the reason prompt before those endpoints are coded. The threshold values must also be stored in a configuration table (not hardcoded) to satisfy the PRD requirement that they are admin-configurable; that configuration table must exist in the initial schema.

**Status:** **Deferred to Operational Hardening — not Core Pilot implementation scope.**
Detailed material-change thresholds and mandatory-reason prompt policy are deferred to MVP Operational Hardening. The underlying append-only `audit_log` schema remains active in Core Pilot for status transitions and administrative overrides, but field-level threshold prompt logic is excluded from the Core Pilot build gate.

- [ ] Approve — Mandatory written reason (min 10 characters) for: date change (shift of >= 3 working days), estimate change (change of >= 20 percent), any assignee change on a Planned or In Progress activity, any priority change on a Planned or In Progress activity, cancellation, completion, and capacity hard-block override; immutable audit entries for all changes.
- [x] Deferred to Operational Hardening — not Core Pilot implementation scope. Detailed material-change thresholds and mandatory-reason prompt policy deferred.

---

## CPD-010 — Local Pilot Deployment

**Proposed decision**

The Core Pilot runs on a single local server under the following configuration. All items below are mandatory before the pilot goes live.

**Network and access**
- Access is restricted to the corporate LAN and VPN. No public internet exposure is permitted during Core Pilot (OPEN-QUESTIONS.md Q8.1).
- All traffic is served over HTTPS. A self-signed TLS certificate is acceptable during Core Pilot provided every pilot client machine explicitly trusts it. The certificate must be replaced with a corporate-CA or ACME certificate before MVP Operational Hardening rollout.

**Database**
- PostgreSQL running on the local/private server (Architecture § Database guidance). SQLite is not acceptable for a multi-user planning application with concurrent edits, background jobs, and fine-grained authorization.
- Versioned database migrations via a migration tool (e.g., Flyway or Liquibase). Schema changes must never be applied manually to a live database.

**Deployment**
- Docker Compose for single-server deployment. The application, reverse proxy, database, and background worker run as separate containers defined in the Compose file.
- A graceful maintenance mode is required: the application must be able to signal "under maintenance" and reject new write requests without terminating active sessions abruptly.

**Authentication**
- Local username/password authentication using Argon2id adaptive hashing with unique salts. No corporate SSO (OIDC/LDAP/AD) is used during Core Pilot.
- This is acceptable only if IT policy permits an exception for pilot internal tools. If SSO cannot be waived, escalate to the technology steering group — SSO becomes a Core Pilot blocker (OPEN-QUESTIONS.md Q8.2).
- First Admin account is seeded via an `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` environment variable in a `.env` file that is excluded from version control and protected by filesystem permissions. Admin is forced to change the password on first login.
- Session cookies are HTTP-only, Secure, SameSite=Strict. Sessions rotate on authentication. Idle and absolute expiry are enforced. Account lockout and rate limiting are active from day one.

**Backup — Core Pilot minimum requirement**
- A manual, documented pg_dump backup procedure runs at least once per day. The backup file is stored on a location separate from the pilot server (e.g., a network share or NAS on the corporate network — never on the same physical machine as the database).
- A successful restore of a complete database backup **into a separate test environment or designated recovery host** (not the same server as the pilot) must be demonstrated and documented **before the pilot goes live**. Written evidence must include: test date, operator name, row counts verified for key tables, and sign-off by IT or the product owner. An untested backup is not a backup.
- WAL archiving, the formal RPO 4-hour / RTO 8-hour commitment, the spare-host runbook, and quarterly restore tests with recorded evidence are MVP Operational Hardening requirements; they are not required for Core Pilot go-live but must be planned before Hardening begins.

**Secrets and security**
- All secrets (database credentials, session keys, API secrets) are stored in environment variables outside version control.
- Passwords are never stored in plaintext; Argon2id with unique salts is the mandated algorithm (Security §, OWASP guidance).
- CSRF protection, input validation, and output encoding are active from day one.
- Application logs are structured and sufficient to trace audit events and errors; backup-job success or failure is logged and observable.

**PRD / scope reference:** Architecture §§ Logical architecture, Database guidance, Deployment; Security §; NFR § Availability; MVP-SCOPE.md § 11, AG-6; OPEN-QUESTIONS.md Q8.1, Q8.2, Q8.3, Q8.4, Q8.5, Q8.6, Q8.7; REQUIREMENTS-DECISION-LOG.md §7.1, §7.2, §7.3, §7.4, §7.5, §7.6, §7.8

**Why this is needed before architecture**
The deployment model determines the container topology, the database connection pool configuration, the session-store location, the environment-variable naming conventions, and the secret-injection mechanism — all of which must be consistent across every environment (local dev, pilot, test, and future Hardening). Changing from Docker Compose to a different deployment model mid-pilot is disruptive. The backup procedure must be decided before go-live because an unverified backup is a data-loss risk, not a mitigation. The authentication mechanism determines whether an IdP integration is a blocker or a deferred item.

**Status:** Approved by Product Owner, Vivek (2026-10-10) — with operational prerequisites pending

- [x] Approve — Corporate LAN and VPN access only; local username/password login for pilot subject to IT SSO waiver; PostgreSQL + Docker Compose single-server deployment; daily backup (automated where IT infrastructure supports it, stored separately from app server); successful documented restore test on separate machine required before pilot go-live.
- [ ] Change — approved alternative:

**Operational Prerequisites Pending (before pilot data load and go-live):**
- 2026 company/public holiday list (to be provided by Vivek).
- IT confirmation of local-login / SSO exception.
- Backup destination or network share.
- Restore-test owner and scheduled date.

---

## Decisions Not Needed Yet

The following decisions are real open questions recorded in OPEN-QUESTIONS.md and REQUIREMENTS-DECISION-LOG.md but are **not required before Core Pilot architecture begins**. They are listed here so stakeholders know they are tracked and will be needed before the relevant tier begins.

| Decision topic | Needed before | Relevant reference |
|---|---|---|
| Corporate SSO / OIDC / LDAP / Active Directory integration | MVP Operational Hardening or Release 2 (if IT requires SSO waiver for pilot, it becomes a Core Pilot blocker — see CPD-010) | OPEN-QUESTIONS.md Q8.2, RDL §7.2 |
| WAL archiving method (pgBackRest, Barman, pg_basebackup) and formal RPO 4-hour commitment | MVP Operational Hardening | OPEN-QUESTIONS.md Q8.5, RDL §7.5 |
| Formal spare-host runbook and RTO 8-hour commitment | MVP Operational Hardening | OPEN-QUESTIONS.md Q8.8, RDL §7.3 |
| Backup encryption key management (separate key store, HSM, or corporate PKI) | MVP Operational Hardening | OPEN-QUESTIONS.md Q8.4, RDL §7.4 |
| TLS certificate from corporate CA or ACME (replacing pilot self-signed) | MVP Operational Hardening | OPEN-QUESTIONS.md Q8.6, RDL §7.6 |
| Full configurable permission matrix (Portfolio Manager, Viewer, granular scope grants) | MVP Operational Hardening | RDL §§ 5.1–5.5, MVP-SCOPE.md § 2 |
| Named immutable baselines and baseline creation triggers | MVP Operational Hardening | OPEN-QUESTIONS.md Q4.5, RDL §7.7 |
| Finish-to-Start dependency engine and Fixed Dates constraint | MVP Operational Hardening | OPEN-QUESTIONS.md Q4.1, Q4.4, RDL §6.4 |
| Critical path display (FR-SCH-003) | Post-MVP / Release 1.1+ | MVP-SCOPE.md § 9 |
| Start-to-Start, Finish-to-Finish, and lag/lead dependency types | Post-MVP / Release 1.1+ | FR-ACT-007, MVP-SCOPE.md § 6 |
| Gantt chart (FR-DAS-005) with baseline variance, dependency rendering, at-risk styling | MVP Operational Hardening | MVP-SCOPE.md § 8 |
| Full portfolio and product dashboards (FR-DAS-001, FR-DAS-002) | MVP Operational Hardening | MVP-SCOPE.md § 8 |
| Skill-based candidate matching and required-skill validation on activities (FR-RES-007, FR-RES-008) | MVP Operational Hardening (Scenario 5) | MVP-SCOPE.md § 4, AG-7 |
| Proficiency scale labels (confirm 1–5 with organization) | Before Operational Hardening skill matching is activated | OPEN-QUESTIONS.md Q5.5, RDL §4.1 |
| Excel/CSV import wizard (FR-IMP-001 through FR-IMP-006) | MVP Operational Hardening | MVP-SCOPE.md § 10 |
| SMTP email notification delivery (FR-NOT-005) | MVP Operational Hardening | MVP-SCOPE.md § 9 |
| Health indicator thresholds (Green/Amber/Red bands) | Before Operational Hardening dashboards are designed | OPEN-QUESTIONS.md Q6.1, RDL §4.4 |
| Project lifecycle templates: Lean, APQP, Automotive SPICE, Functional Safety, Custom | Post-MVP / Release 1.2 | MVP-SCOPE.md § 5 |
| Scenario planning and atomic publish (FR-CAP-010) | Post-MVP / Release 1.1+ | MVP-SCOPE.md § 7 |
| Bulk edit with preview and audit correlation (FR-ACT-010) | MVP Operational Hardening | MVP-SCOPE.md § 6 |
| Multiple assignees per activity and effort-mismatch acknowledgment (FR-CAP-002, BR-005) | MVP Operational Hardening | MVP-SCOPE.md § 7, RDL §3.1 |
| Configurable audit log retention period | Post-MVP / Release 1.1+ | RDL §4.5 |
| File attachment storage, size limits, and MIME type controls | Post-MVP / Release 1.1+ | RDL §4.6 |
| Performance targets (100 concurrent users, p95 thresholds) | Post-MVP — validate in load testing | MVP-SCOPE.md § 11, NFR § Performance |
| WCAG 2.1 AA accessibility audit and remediation | Post-MVP / Release 1.1+ | MVP-SCOPE.md § 8 |

---

*End of Core Pilot Decisions — v0.1*
