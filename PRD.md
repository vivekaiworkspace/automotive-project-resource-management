# Product Requirements Document — Automotive Multi-Product Project & Resource Management System

**Document version:** 1.0  
**Status:** Proposed baseline for discovery, UX design, and implementation  
**Product type:** Self-hosted internal web application with a locally controlled database  
**Primary owner:** Automotive Product/Program Management  
**Intended users:** Product managers, project managers, team leads, team members, resource managers, and system administrators

## Executive Summary

The proposed product is a self-hosted portfolio, project, task, and resource-planning application for an automotive product organization. It will replace fragmented Excel tracking with a single source of truth connecting **Product → Project → Milestone/Phase → Activity → Assignment → Team Member**. The main product decision is that project activities and team assignments must not be maintained as two copied lists: both views must read and update the same activity and assignment records, so a date, effort, status, priority, dependency, leave, or allocation change is immediately reflected everywhere.

The first release should focus on dependable execution rather than attempting to reproduce every function of enterprise project-management or HR software. Its core value is to answer four questions continuously:

1. What work must be delivered, for which product and project, and by when?
2. Which activities are blocked, late, or at risk?
3. Who has the correct skills and available capacity to do the work?
4. What will happen to delivery dates and workloads when priorities, effort, assignments, dependencies, or leave change?

The design is aligned with automotive project-management needs. Automotive SPICE MAN.3 emphasizes defining and monitoring work packages, dependencies, estimates, resources, schedules, skills, and progress, then keeping them consistent as conditions change. APQP provides a gated path from product concept toward launch and emphasizes timing, risk, readiness, metrics, change, and lessons learned. These practices support configurable automotive templates, but the application should remain usable for projects that do not require formal APQP, Automotive SPICE, or ISO 26262 governance.[^1][^2][^3][^4][^5]

A responsive web application backed by **PostgreSQL running on the organization’s local server or private network** is recommended. PostgreSQL supports transactional integrity and row-level access policies, including default-deny behavior when row-level security is enabled without an applicable policy. A Docker-based single-server deployment is appropriate for the initial internal release, with a documented path to separate application and database servers later.[^6][^7]

## Problem Statement

The current Excel-based process has reached a scale where manual coordination is creating operational risk:

- Multiple products contain multiple projects, each with different priorities, delivery dates, phases, and dependencies.
- A fixed set of teams and team members must execute an increasing number of activities.
- Project planning and team workload planning are interdependent but difficult to keep synchronized in spreadsheets.
- Skills, leave, working calendars, and existing allocations affect whether a proposed plan is feasible.
- A project-level change may create resource conflicts in other projects, but these impacts are not immediately visible.
- Progress, overdue work, milestone health, Gantt schedules, and capacity require significant manual consolidation.
- The product manager lacks a safe what-if environment for evaluating priority or assignment changes before committing them.

The product must turn activity entry into a controlled planning workflow: **capture → estimate → prioritize → identify dependencies → find eligible capacity → assign → baseline/commit → execute → monitor → replan → close and learn**.

## Product Vision

Create the organization’s authoritative operational planning system for coordinating automotive development activities across products, projects, teams, and people—simple enough for daily adoption, but rigorous enough to expose delivery, dependency, skill, and capacity risks before they become delays.

### Product principles

- **One record, many views:** Grid, Kanban, Gantt, workload, personal worklist, and dashboards must display the same underlying records.
- **Plan with finite capacity:** No plan is considered feasible merely because dates were entered; member availability, leave, skills, and other assignments must be checked.
- **Human-controlled scheduling:** The system recommends and warns. Authorized users approve changes; the system must not silently reassign people or move committed milestones.
- **Explain every warning:** An overload or schedule-risk warning must identify the cause, affected dates, conflicting assignments, and possible resolution.
- **Progressive complexity:** Basic users see a clear worklist. Managers can open dependencies, capacity, baselines, and scenario planning when needed.
- **Auditability:** Significant changes to dates, effort, assignments, priority, status, and baselines are attributable and recoverable.
- **Automotive-ready, not automotive-locked:** Templates may support APQP gates, Automotive SPICE work packages, and safety-related classifications, while ordinary projects remain lightweight.

## Goals and Success Measures

### Business goals

- Establish a single source of truth for all active products, projects, activities, assignments, milestones, and resource availability.
- Reduce project delivery risk by identifying overload, dependency conflicts, skill gaps, late work, and schedule slippage early.
- Enable portfolio-level prioritization when fixed capacity cannot satisfy all demand.
- Reduce manual effort spent consolidating Excel files and creating recurring project-status reports.
- Improve accountability by giving every activity an owner, status, dates, estimate, priority, and change history.
- Preserve local control of operational and employee-related data.

### Initial success metrics

The product owner should record a baseline before rollout, then measure:

| Outcome | Metric | Initial target after 90 days |
|---|---|---:|
| Adoption | Active projects managed primarily in the application | At least 90% |
| Data quality | Active activities with owner, estimate, priority, start date, due date, and status | At least 95% |
| Planning quality | Assignments made without unresolved hard capacity conflicts | At least 90% |
| Delivery visibility | At-risk milestones identified before their due date | At least 80% |
| Update discipline | Assigned activities updated within the defined reporting cycle | At least 90% |
| Efficiency | Reduction in time spent preparing weekly portfolio reports | At least 50% |
| Reliability | Successful scheduled backups | 100% of scheduled runs |

These are proposed product targets, not externally sourced performance benchmarks. Final targets should be adjusted after the current process is measured.

## Scope and Boundaries

### In scope

- Product and project portfolio hierarchy
- Project setup, lifecycle, phases, milestones, priorities, owners, and delivery dates
- Activity/work-package creation, decomposition, dependencies, estimates, dates, statuses, priorities, risks, comments, and attachments
- Team and team-member directories
- Skills, proficiency, and project-required skills
- Working calendars, public holidays, part-time capacity, and leave
- Individual and team assignment, allocation, and workload planning
- Capacity-aware scheduling warnings and controlled schedule recalculation
- Gantt, list, Kanban, calendar, workload, and dashboard views
- Personal work queues and team-lead execution views
- Baselines, change history, notifications, and audit logs
- Excel/CSV import and export
- Local deployment, backup, restore, access control, and administration
- Configurable automotive project templates and gates

### Out of scope for the first release

- Payroll, attendance, compensation, performance reviews, recruitment, and full HRIS functionality
- Financial accounting, invoicing, procurement, and supplier payment
- Source-code hosting, CI/CD, requirements authoring, test-case execution, PLM, ALM, or document-control replacement
- Real-time chat or video conferencing
- AI-based autonomous planning or automatic reassignment without approval
- Native mobile applications; responsive web support is sufficient initially
- Complex earned-value management, cost accounting, or portfolio financial optimization
- External customer/supplier portal in the first release

### Future integration boundary

The architecture should expose a versioned API and signed webhooks so the system can later integrate with HR, calendar, ALM, PLM, requirements, test, or code platforms. Mature self-hosted project tools expose APIs and project/event-scoped webhooks for this purpose. Integrations are not required to prove the MVP’s core planning value.[^8][^9]

## Users and Roles

| Role | Primary needs | Default authority |
|---|---|---|
| Product/Portfolio Manager | Prioritize products/projects, compare delivery health, resolve cross-project conflicts | Portfolio read/write, priority approval, scenario approval |
| Project Manager | Plan scope, activities, dates, dependencies, milestones, risks, and assignments | Full control within assigned projects |
| Team Lead | Review team demand, allocate members, balance work, validate estimates and progress | Team resource and assignment control; project activity updates where assigned |
| Team Member | See assigned work, update status and remaining effort, add comments/evidence, declare blockers | Update own assignments and allowed activity fields |
| Resource Manager | Maintain team structure, member capacity, skills, and leave; review utilization | Resource data control without general project-scope authority |
| Viewer/Stakeholder | Monitor selected products/projects and dashboards | Read-only scoped access |
| System Administrator | Users, roles, reference data, templates, backup, restore, security, audit | System-wide administration |

A person may hold more than one role. Access must be the intersection of role permissions and scope assignments, such as a project manager seeing only assigned projects while a portfolio manager sees all products in a portfolio.

## Core Information Model

### Hierarchy

The primary hierarchy is:

**Portfolio (optional) → Product → Project → Phase/Workstream → Milestone → Activity/Sub-activity → Assignment**

Teams and people are shared organizational resources linked to assignments rather than copied into projects:

**Division/Department (optional) → Team → Team Member → Skills / Calendar / Leave**

### Key entities

| Entity | Purpose | Critical fields |
|---|---|---|
| Product | Groups related projects around a vehicle, platform, ECU, component, service, or product line | Code, name, owner, status, business priority, target dates |
| Project | Delivery container under a product | Code, name, type, owner, lifecycle template, priority, status, planned dates, committed date, health |
| Phase/Workstream | Organizes activities by lifecycle stage or discipline | Name, sequence, owner, planned dates, gate linkage |
| Milestone/Gate | Zero-duration delivery or approval point | Name, due date, owner, gate criteria, status, evidence, approvers |
| Activity | Authoritative unit of planned and tracked work | ID, title, project, parent, type, owner, status, priority, estimate, remaining effort, dates, constraint type, progress |
| Dependency | Defines scheduling relationship | Predecessor, successor, relation type, lag/lead, hard/soft flag |
| Assignment | Allocates activity effort to a person or team | Activity, assignee, role, planned effort, allocation dates, allocation method |
| Team Member | Represents a resource who can receive work | Name, team, role, employment status, capacity, calendar, active dates |
| Skill | Controlled capability catalogue | Skill family, name, description, proficiency scale |
| Member Skill | Links a member and demonstrated capability | Skill, proficiency, validation status, expiry date, validator |
| Leave | Removes availability from a resource calendar | Type, start/end, hours or full day, status, approver |
| Calendar | Defines working and non-working time | Time zone, weekdays, daily hours, holidays, exceptions |
| Baseline | Immutable approved planning snapshot | Version, timestamp, approver, reason, planned dates/effort |
| Risk/Issue | Tracks uncertainty or current problem | Probability, impact, exposure, owner, mitigation, due date, status |
| Change Log | Records material before/after values | Entity, field, old value, new value, actor, time, reason |

### Single-source synchronization rule

There must be no separate “project task” and “team task” objects. An activity is one object; an assignment links it to one or more team members. Therefore:

- Changing activity dates updates the Gantt, team planner, personal worklist, project dashboard, workload calculation, and alerts.
- Adding or approving leave updates capacity and flags all affected assignments.
- Updating remaining effort changes future workload and forecast completion.
- Reassigning work updates both project ownership and team workload in one transaction.
- Changing project priority recalculates visual conflict ranking but does not automatically overwrite a committed assignment.
- Deleting or archiving a project must not silently erase audit history or reported effort.

## Functional Requirements

### Product and portfolio management

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| FR-PP-001 | Create, edit, archive, and restore products | Must | Authorized user can maintain unique code, owner, status, and priority; archived products are hidden by default but retained |
| FR-PP-002 | Create multiple projects under a product | Must | Each project inherits product context and can have independent owner, template, priority, dates, and status |
| FR-PP-003 | Portfolio overview | Must | User can filter projects by product, manager, team, status, priority, health, and date range |
| FR-PP-004 | Configurable priority model | Must | Admin defines priority labels and ranking; portfolio manager can rank projects with change reason |
| FR-PP-005 | Project lifecycle templates | Should | User can instantiate Lean, APQP, Automotive SPICE, software, hardware, or custom templates |
| FR-PP-006 | Project cloning | Should | Authorized user can clone structure, activities, dependencies, required skills, and relative dates without copying history |
| FR-PP-007 | Project health | Must | System calculates schedule, workload, blocker, and data-quality indicators; manager may add an explained manual override |
| FR-PP-008 | Portfolio roadmap | Should | Display projects and major milestones across products on one timeline |

### Project and activity management

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| FR-ACT-001 | Create activities quickly | Must | User can add an activity with title and project, then complete required planning fields inline or in a detail drawer |
| FR-ACT-002 | Activity hierarchy | Must | Support parent activity and configurable sub-activity depth; parent progress and dates roll up from children |
| FR-ACT-003 | Required planning fields | Must | Before commitment, an activity requires type, priority, owner, estimate, start/due dates, status, and project |
| FR-ACT-004 | Status workflow | Must | Default: Draft, Ready for Planning, Planned, In Progress, Blocked, In Review, Done, Cancelled; transitions are configurable by role |
| FR-ACT-005 | Estimates | Must | Store original estimate, current estimate, remaining effort, actual effort if enabled, and estimate-change reason |
| FR-ACT-006 | Scheduling constraints | Must | Support As Soon As Possible, Start No Earlier Than, Finish No Later Than, and Fixed Dates |
| FR-ACT-007 | Dependencies | Must | Support Finish-to-Start initially; add Start-to-Start, Finish-to-Finish, and lag/lead in a later release |
| FR-ACT-008 | Dependency validation | Must | Prevent circular dependencies and explain the cycle to the user |
| FR-ACT-009 | Milestones and gates | Must | Milestone has owner, date, readiness criteria, evidence links, approval state, and contributing activities |
| FR-ACT-010 | Bulk edit | Must | Authorized user can update status, priority, owner, dates, labels, or phase for selected activities with preview and audit entry |
| FR-ACT-011 | Comments and attachments | Should | Users can discuss an activity, mention users, and attach evidence subject to file limits |
| FR-ACT-012 | Risks and issues | Should | Link risks/issues to product, project, milestone, or activity and show exposure and mitigation status |
| FR-ACT-013 | Baselines | Must | Authorized user can create named immutable baselines and compare current versus baseline dates, effort, and milestone variance |
| FR-ACT-014 | Recurring activities | Could | Generate future activities from an approved recurrence rule |
| FR-ACT-015 | Saved views | Should | Users save filters, columns, sort, grouping, and date scale as personal or shared views |
| FR-ACT-016 | Unique readable IDs | Must | Every activity receives a stable identifier, such as PRJ-1042, never reused after deletion |

### Team and resource management

A resource’s working calendar is essential to availability. Established project systems distinguish organization/base, project, task, and resource calendars, and schedule work using the applicable working and non-working times. The initial application can simplify this to organization calendars plus per-member exceptions while preserving the same planning principle.[^10][^11]

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| FR-RES-001 | Team structure | Must | Create teams, assign lead, add active members, and preserve dated membership history |
| FR-RES-002 | Member capacity | Must | Define weekly hours or full-time equivalent, effective dates, and optional planning buffer |
| FR-RES-003 | Working calendars | Must | Define organization holidays, team calendar, member work pattern, time zone, and dated exceptions |
| FR-RES-004 | Leave management | Must | Member or authorized manager submits leave; approved leave reduces capacity; rejected/cancelled leave does not |
| FR-RES-005 | Skills catalogue | Must | Admin maintains controlled skill names, categories, and proficiency scale |
| FR-RES-006 | Member skills | Must | Record proficiency, evidence/notes, validator, last reviewed date, and optional expiry |
| FR-RES-007 | Required activity skills | Should | Activity can require one or more skills and minimum proficiency |
| FR-RES-008 | Candidate suggestions | Should | System lists eligible members based on skill, capacity, team, role, and availability, explaining rank factors |
| FR-RES-009 | Workload heatmap | Must | Show planned effort versus net capacity by member/team and day/week/month with underload, healthy load, and overload bands |
| FR-RES-010 | Cross-project demand | Must | A member’s workload includes assignments from every active project visible to the planning engine |
| FR-RES-011 | Temporary allocation | Should | Support temporary team/project allocation with effective dates without changing permanent team membership |
| FR-RES-012 | Inactive members | Must | Deactivation blocks new assignments but retains history and warns about unfinished work |
| FR-RES-013 | Delegate | Could | A member can nominate a temporary delegate for notifications and approvals, without transferring assignments automatically |

### Assignment and capacity planning

Capacity must be visible in the same planning context as scheduled work. Established planning tools combine work from multiple projects, expose dependencies, and show whether teams are under- or over-allocated. Resource workload tools similarly compare assigned work with availability and allow analysis by resource or project.[^12][^13][^14]

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| FR-CAP-001 | Individual assignment | Must | Activity can be assigned to a member with planned effort and assignment dates |
| FR-CAP-002 | Multiple assignees | Must | Activity may be split across members; total assigned planned effort is shown and validated against activity effort |
| FR-CAP-003 | Team placeholder | Should | Activity can be tentatively assigned to a team before a member is selected, clearly marked unstaffed |
| FR-CAP-004 | Net capacity calculation | Must | Net capacity equals working capacity minus approved leave, calendar exceptions, and configured non-project buffer |
| FR-CAP-005 | Allocation calculation | Must | Planned utilization equals total planned assignment effort divided by net capacity for the selected time bucket |
| FR-CAP-006 | Conflict detection | Must | Warn when allocation exceeds threshold, leave overlaps an assignment, required skill is missing, dependency dates conflict, or due date is infeasible |
| FR-CAP-007 | Hard/soft limits | Must | Admin configures warning and blocking thresholds; only authorized roles can override a hard conflict with reason |
| FR-CAP-008 | Allocation editing | Must | Dragging/resizing an assignment previews affected workload and dates before save |
| FR-CAP-009 | Rebalancing suggestions | Should | Suggest available qualified members, activity split, date shift, or priority escalation; no change occurs without confirmation |
| FR-CAP-010 | Scenario planning | Should | Create a private scenario, change dates/priority/assignment, compare effects, then publish approved changes atomically |
| FR-CAP-011 | Unassigned demand | Must | Dashboard lists Ready for Planning activities without a confirmed resource |
| FR-CAP-012 | Remaining-effort forecast | Should | Reforecast future demand from remaining rather than original effort after execution begins |

The base calculations are:

- **Net capacity** = scheduled working hours − approved leave hours − calendar exceptions − reserved non-project hours.
- **Planned load** = sum of assignment effort distributed into the selected time period.
- **Utilization** = planned load / net capacity × 100.
- If net capacity is zero and load is greater than zero, the assignment is a hard conflict rather than an infinite percentage.

The distribution rule must be explicit. MVP should spread planned effort evenly over an assignment’s valid working days, capped only by configurable capacity rules. Later releases may support front-loaded, back-loaded, or manually profiled effort.

### Scheduling engine

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| FR-SCH-001 | Working-day scheduling | Must | Start/finish calculations exclude non-working days and approved leave for assigned resources |
| FR-SCH-002 | Dependency propagation | Must | Proposed predecessor date changes show impacted successor dates before commitment |
| FR-SCH-003 | Critical path | Should | Calculate and display zero/lowest-float dependency chain for selected project or scenario |
| FR-SCH-004 | Milestone forecast | Must | Forecast date reflects unresolved predecessors and resource-constrained activity dates |
| FR-SCH-005 | Manual protection | Must | Fixed dates and committed milestones are never moved silently; conflicts are raised for decision |
| FR-SCH-006 | Recalculation trace | Must | Each proposed move explains the triggering change and dependency/capacity chain |
| FR-SCH-007 | Rolling-wave support | Should | Near-term work can be detailed while later phases remain milestone or summary level; this reflects practical Automotive SPICE planning guidance.[^2] |
| FR-SCH-008 | Schedule versioning | Must | Store approved schedule baselines and identify who published subsequent material changes |

### Execution experience

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| FR-EXE-001 | My Work | Must | Member sees current, upcoming, overdue, and blocked assignments across all projects, ordered by actionable priority |
| FR-EXE-002 | Quick progress update | Must | Member can update status, percent complete, remaining effort, forecast finish, comment, and blocker from one panel |
| FR-EXE-003 | Team board | Must | Team lead sees activities grouped by member and status with workload indicators |
| FR-EXE-004 | Blocker escalation | Must | Marking Blocked requires blocker description, owner, and next action; relevant managers are notified |
| FR-EXE-005 | Review/approval | Should | Configurable activity types may require review before Done |
| FR-EXE-006 | Stale-update warning | Must | Highlight in-progress work not updated within the configured reporting period |
| FR-EXE-007 | Completion validation | Must | Activity cannot close if mandatory checklist/evidence fields are incomplete, unless authorized override is recorded |

### Dashboards and reporting

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| FR-DAS-001 | Portfolio dashboard | Must | Show project count by health/status, milestone forecast, overdue work, unstaffed demand, top conflicts, and capacity trend |
| FR-DAS-002 | Product dashboard | Must | Show projects, cross-project milestones, progress, risks, dependencies, and team demand for one product |
| FR-DAS-003 | Project dashboard | Must | Show milestone health, baseline variance, progress, overdue/blocked activities, dependency risks, workload, and recent changes |
| FR-DAS-004 | Resource dashboard | Must | Show member/team capacity, allocation, leave, overload, skill demand, and unassigned work |
| FR-DAS-005 | Gantt chart | Must | Display phases, activities, milestones, dependencies, baseline variance, assignees, progress, and critical/at-risk styling |
| FR-DAS-006 | Workload chart | Must | Show load versus net capacity by person/team and time bucket; drill into contributing assignments |
| FR-DAS-007 | Delivery forecast | Should | Display committed versus forecast milestone dates and primary variance drivers |
| FR-DAS-008 | Configurable filters | Must | Product, project, team, member, manager, status, priority, skill, health, and date filters behave consistently across views |
| FR-DAS-009 | Export | Must | Export current filtered view to XLSX/CSV and key visual reports to PDF/image where technically practical |
| FR-DAS-010 | Scheduled report | Could | Email or generate a periodic portfolio/project status snapshot for selected recipients |

Gantt and team-planner patterns are well established: phases, activities, dependencies, milestones, and team assignments can be maintained on shared timelines, including multi-project plans. The application should use these familiar concepts but optimize the default dashboard around exceptions requiring decisions rather than decorative charts.[^15]

### Notifications

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| FR-NOT-001 | In-app notification center | Must | User can view unread/read notifications and navigate directly to the affected record |
| FR-NOT-002 | Trigger rules | Must | Notify on assignment, mention, approval request, rejected change, blocker, due-date risk, overload, and affected leave |
| FR-NOT-003 | Digest | Should | User can receive daily/weekly digest rather than individual low-severity alerts |
| FR-NOT-004 | Noise controls | Must | Admin sets defaults; users may reduce optional notifications but not critical governance notices |
| FR-NOT-005 | Email | Should | SMTP integration delivers selected notifications; failure is logged and retried |

### Import, export, and migration

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| FR-IMP-001 | Excel/CSV import wizard | Must | Map columns, preview validation errors, detect duplicates, and import only after confirmation |
| FR-IMP-002 | Staged migration | Must | Import products, projects, teams/members, calendars/leave, activities, dependencies, and assignments in a documented order |
| FR-IMP-003 | Error report | Must | Rejected rows include row number, field, reason, and suggested correction |
| FR-IMP-004 | Re-import safety | Must | Import uses stable external IDs or defined matching rules to avoid duplicate records |
| FR-IMP-005 | Export completeness | Must | Authorized users can export operational data and audit-friendly baseline/change information within their scope |
| FR-IMP-006 | Template file | Must | Provide a controlled workbook template with required fields, allowed values, and examples separate from live data |

## Automotive Configuration

### Lifecycle templates

The system should ship with optional templates rather than hard-code one lifecycle:

| Template | Example structure | Intended use |
|---|---|---|
| Lean | Intake, Plan, Execute, Validate, Close | Small internal or exploratory work |
| APQP | Plan/Define, Product Design, Process Design, Product/Process Validation, Feedback/Corrective Action | Product and manufacturing launch coordination |
| Automotive SPICE | Scope, lifecycle/release, work packages, monitoring, reviews, corrective actions | Software/system development governance |
| Functional Safety | Concept, system development, integration/validation, supporting processes | Safety-related E/E development coordination |
| Custom | Administrator-defined phases, gates, fields, and checklists | Organization-specific process |

ISO 26262 describes an automotive safety lifecycle and includes planning, system development, integration/testing, validation, configuration management, change management, verification, and documentation-related activities. The application should track those activities and evidence links when configured, but it must not claim that using the tool itself makes a project compliant.[^16][^17][^18]

### Configurable automotive fields

Optional fields should include:

- Vehicle program, platform, model, variant, ECU/component, domain, and customer
- SOP/start-of-production date, prototype build, design freeze, tooling, validation, PPAP, and release milestones
- APQP phase and gate
- Automotive SPICE process/work-product category
- Safety relevance, ASIL classification reference, cybersecurity relevance, and homologation relevance
- Hardware, software, mechanical, validation, manufacturing, supplier, and quality workstreams
- Supplier/customer responsible party
- Evidence/document link and approval state

These fields must be tenant/organization configurable and hidden when unused.

## Prioritization Model

A single “High/Medium/Low” field is insufficient for cross-project conflict resolution. The product should store separate drivers and calculate a transparent planning score.

### Proposed inputs

- Business/product priority
- Committed customer or SOP date
- Regulatory, safety, or compliance criticality
- Dependency criticality and milestone impact
- Delay impact
- Current readiness/blocker status
- Effort and resource scarcity
- Manual executive override with reason and expiry date

### Decision rule

The score ranks conflicts; it does not automatically change committed work. When two activities compete for the same member, the conflict panel must show both projects, score components, milestones affected, estimated delay, and available options. An authorized manager then chooses to retain, delay, split, reassign, or escalate.

## Key Workflows

### New activity to committed plan

1. A project manager creates or imports an activity under the correct product/project/phase.
2. The activity remains **Draft** until mandatory fields are complete.
3. The manager adds estimate, required skills, priority, target dates, dependencies, and milestone linkage.
4. The activity moves to **Ready for Planning**.
5. The planner reviews qualified candidates and net capacity across all projects.
6. A member or team placeholder is selected; the system previews overload, leave, dependency, and delivery impact.
7. Hard conflicts require resolution or authorized override with reason.
8. Team lead confirms the assignment if the project governance requires it.
9. The activity becomes **Planned** and appears in project, team, personal, Gantt, workload, and dashboard views.
10. A project baseline may be created or updated through controlled approval.

### Leave impact

1. A member or manager enters leave.
2. Pending leave is visible but does not reduce committed capacity unless configured otherwise.
3. Approval reduces the member’s net capacity for affected dates.
4. The system finds overlapping assignments and recalculates workload and forecast risk.
5. Affected team leads and project managers receive one grouped impact notification.
6. The conflict panel proposes date shift, replacement, split, overtime/override if policy allows, or accepted milestone risk.
7. Approved corrective changes update all views and create audit entries.

### Priority change

1. Portfolio manager changes a project’s priority and enters reason/effective date.
2. The system recalculates conflict ranking and identifies lower-priority work using shared resources.
3. No committed activity is moved automatically.
4. The manager opens a scenario, applies proposed changes, and compares milestone and utilization impact.
5. Publishing the scenario updates affected records in one transaction and sends grouped notifications.

### Progress and reforecast

1. Team member updates status, remaining effort, and forecast finish.
2. If remaining effort or finish date increases, future load is recalculated.
3. Dependency successors and milestone forecasts are evaluated.
4. The project manager receives an alert only when thresholds are crossed or commitments are affected.
5. A corrective action can be assigned and tracked to closure.

## UX and Navigation

### Primary navigation

- Home / My Work
- Portfolio
- Products
- Projects
- Team Planner
- Resources
- Dashboards
- Reports
- Administration

### Project workspace

A project should use one consistent workspace with view switching rather than separate disconnected pages:

- Overview
- Activities: List / Kanban
- Timeline: Gantt
- Team and Workload
- Milestones and Gates
- Risks and Issues
- Documents/Links
- Changes and Baselines
- Settings

### Interaction requirements

- Global search by ID, title, product, project, member, skill, or milestone
- Inline editing for common fields with permissions enforced
- Detail drawer to preserve context while editing an activity
- Keyboard-friendly grid for fast data entry by users moving from Excel
- Persistent filters and column choices
- Clear indicators for unsaved scenario changes versus committed data
- No critical information encoded by color alone
- Responsive support for laptop and tablet; mobile optimized for viewing and quick updates
- Virtualized tables and timelines for large data sets

## Permissions Matrix

| Capability | Portfolio Manager | Project Manager | Team Lead | Team Member | Resource Manager | Viewer | Admin |
|---|---:|---:|---:|---:|---:|---:|---:|
| View authorized portfolio/projects | Yes | Scoped | Scoped | Assigned/scoped | Scoped | Scoped | Yes |
| Create product/project | Yes | Optional | No | No | No | No | Yes |
| Change project priority | Yes | Request/optional | No | No | No | No | Yes |
| Create/edit project activities | Yes | Yes | Scoped | Limited | No | No | Yes |
| Assign team member | Yes | Yes, per policy | Yes | No | Optional | No | Yes |
| Update own work | Yes | Yes | Yes | Yes | No | No | Yes |
| Edit another member’s progress | Yes | Yes | Team only | No | No | No | Yes |
| Maintain teams and capacity | View | View | Team scope | Own view | Yes | No | Yes |
| Maintain skills | View | View | Validate team, optional | Propose own | Yes | No | Yes |
| Submit leave | Yes | Yes | Yes | Own | Yes | No | Yes |
| Approve leave | No | No | Optional policy | No | Yes | No | Yes |
| Create baseline | Yes | Yes | No | No | No | No | Yes |
| Override hard conflict | Yes | Optional | Optional team scope | No | Optional | No | Yes |
| View audit log | Yes | Project scope | Team scope | Own changes | Resource scope | No | Yes |
| Configure system | No | No | No | No | No | No | Yes |

Final permissions must be configurable without exposing unrestricted custom scripting. Sensitive leave details should be limited: most project users need to know that a person is unavailable, not the private reason.

## Business Rules

- BR-001: Every active project belongs to exactly one product; a product may have many projects.
- BR-002: Every activity belongs to exactly one project and may belong to one phase/workstream and one parent activity.
- BR-003: An activity may have zero, one, or multiple assignments; an unassigned planned activity is visible as demand.
- BR-004: Activity effort is stored independently from assignee allocation so reassignment does not destroy the estimate.
- BR-005: Total assignment effort may differ from activity effort only when a warning is acknowledged or policy permits it.
- BR-006: Approved leave and calendar exceptions reduce capacity; leave never changes skill or team membership.
- BR-007: Dependency cycles are prohibited.
- BR-008: Done and Cancelled activities consume no future capacity after their effective completion/cancellation date.
- BR-009: Only authorized users may change a committed milestone or publish a baseline.
- BR-010: Baselines are immutable; correction requires a new baseline version.
- BR-011: Material changes require a reason according to configurable thresholds.
- BR-012: Project priority resolves display and recommendation order but never silently rewrites assignments.
- BR-013: Deleting master data used by historical records is implemented as archive/deactivate, not physical deletion.
- BR-014: All timestamps are stored in UTC and displayed using the user/organization time zone.
- BR-015: Project progress is calculated from leaf activities using a configured weighting method; manual override must be labeled and explained.
- BR-016: Skills used for eligibility must be active, validated if required, and unexpired.
- BR-017: A member cannot receive a new assignment outside active employment or team-allocation dates.
- BR-018: Users see only records authorized by both role and scope.

## Non-Functional Requirements

### Performance and scale

Initial design targets, to be validated in discovery:

- 100 concurrent users
- 1,000 users/members in directory
- 500 products, 5,000 projects including archived projects
- 500,000 activities, with 100,000 active
- 1,000,000 assignments/change events
- Standard list/filter response under 2 seconds at the 95th percentile on supported internal infrastructure
- Dashboard load under 5 seconds at the 95th percentile, with asynchronous refresh for expensive analytics
- Common save operations under 1 second excluding network latency
- Gantt capable of displaying at least 5,000 filtered rows through virtualization or progressive loading

### Availability and recoverability

- Target service availability: 99.5% during defined business hours for the initial internal release
- Automated daily full backup plus more frequent database transaction/WAL backup if infrastructure supports it
- Recovery point objective: 4 hours initially
- Recovery time objective: 8 hours initially
- Quarterly restore test with recorded evidence
- Exportable configuration, attachments, and database backup
- Graceful maintenance mode and versioned database migrations

### Security

- Server-side authentication and authorization on every protected operation
- Role- and scope-based access control, optionally reinforced with PostgreSQL row-level security for high-risk data boundaries.[^6]
- Passwords never stored in plaintext; use an adaptive password hash such as Argon2id, with unique salts and parameters reviewed against current OWASP guidance.[^19]
- Secure, unpredictable sessions; rotate on authentication, enforce idle and absolute expiry, and use HTTPS for the full session.[^20][^21]
- HTTP-only, Secure, SameSite cookies for browser sessions
- CSRF protection, input validation, output encoding, rate limiting, and file-upload controls
- Audit login, authorization failures, permission changes, exports, baseline publication, overrides, and material data changes; OWASP identifies consistent logging as a key detective and investigation control.[^22]
- Encrypt network traffic even on the corporate LAN; encrypt backups and secrets at rest
- Configurable account lockout/rate limits and optional integration with OIDC/LDAP/Active Directory in a later release
- No sensitive leave reason displayed outside authorized resource roles

### Usability and accessibility

- Consistent terminology across all views
- WCAG 2.1 AA-oriented design target for keyboard access, focus, labels, contrast, and non-color status cues
- Undo for safe client-side edits where feasible; confirmation for destructive or wide-impact actions
- Contextual validation messages that explain how to fix the issue
- Onboarding checklist and embedded field help
- English first; externalized text and locale-aware dates prepare for future localization

### Auditability

- Append-only audit entries for material changes
- Actor, timestamp, source, entity, before/after values, and reason
- Correlation ID for bulk import, scenario publication, or automated recalculation
- Audit entries cannot be edited through the user interface
- Retention configurable by organization policy
- Exportable audit report filtered by entity, user, date, and action

## Architecture Recommendation

### Logical architecture

- **Web client:** Responsive TypeScript application
- **Application/API:** Modular monolith exposing versioned REST endpoints
- **Database:** PostgreSQL on a local/private server
- **Background worker:** Notifications, imports, exports, schedule recalculation, report generation, and backup orchestration
- **File storage:** Local encrypted filesystem or S3-compatible on-premise object storage
- **Cache/queue:** Optional Redis when workload justifies it; avoid adding it to the first prototype unless required
- **Deployment:** Docker Compose for initial single-server installation; reverse proxy terminates TLS
- **Observability:** Structured application logs, health checks, database metrics, job monitoring, and backup alerts

### Why a modular monolith

A modular monolith minimizes deployment and transaction complexity while the domain model is still evolving. Product, project, activity, scheduling, resource, reporting, identity, and notification modules should have clear internal boundaries, but microservices are unnecessary for the initial scale. The architecture can later extract heavy scheduling or reporting workloads if measurement demonstrates a need.

### Database guidance

Use PostgreSQL even though the database is local. SQLite is acceptable only for a single-user proof of concept; it should not be the production choice for a multi-user planning application with concurrent edits, background jobs, reporting, and fine-grained authorization. PostgreSQL also provides row security policies for limiting which rows roles can read or modify.[^7][^6]

### Proposed modules

1. Identity and Access
2. Organization and Teams
3. Skills and Availability
4. Products and Portfolio
5. Projects and Templates
6. Activities and Dependencies
7. Assignments and Capacity
8. Scheduling and Scenarios
9. Execution and Collaboration
10. Dashboards and Reporting
11. Import/Export
12. Notifications
13. Audit and Administration

## API Requirements

- Versioned REST API under `/api/v1`
- OpenAPI specification generated and published with the deployment
- Consistent pagination, filtering, sorting, error envelope, and correlation IDs
- Optimistic concurrency using entity version or `If-Match` to prevent silent overwrite
- Idempotency keys for imports, scenario publication, and other retryable write operations
- Bulk endpoints with per-record validation results
- Webhook events for product, project, activity, assignment, milestone, leave, and baseline changes in a later release
- Signed webhook payloads, retries with backoff, delivery log, and disable-on-repeated-failure policy
- API access tokens scoped by user and purpose; tokens are hashed at rest and revocable

## Reporting Definitions

To prevent conflicting dashboard numbers, each metric needs one governed definition:

| Metric | Definition |
|---|---|
| Project progress | Weighted completion of leaf activities, using effort by default; activities without estimates are reported separately |
| Schedule variance | Current forecast finish minus approved baseline finish in working days |
| Milestone on track | Forecast date is on/before committed date and no unresolved hard blocker exists |
| Overdue activity | Not Done/Cancelled and due date is before current local date |
| Blocked activity | Status is Blocked or an unresolved hard predecessor/issue prevents planned start |
| Unstaffed demand | Ready for Planning or Planned activity with remaining effort and no confirmed member assignment |
| Net capacity | Working capacity less approved absence, calendar exceptions, and reserved non-project time |
| Utilization | Planned load divided by net capacity for the period |
| Skill gap | Required active skill/proficiency has no available eligible resource within the planning window |
| Data quality | Percentage of active activities meeting mandatory-field and freshness rules |

## Data Migration Strategy

### Preparation

- Inventory current workbooks, sheets, owners, formulas, named ranges, and duplicate records.
- Define a canonical field dictionary and controlled values before importing.
- Assign stable codes to products, projects, teams, people, milestones, and activities.
- Decide which historical data is operationally valuable; avoid importing obsolete spreadsheet noise.

### Migration waves

1. Configure organization, calendars, holidays, users, roles, and reference values.
2. Import teams, members, capacities, skills, and approved future leave.
3. Import products and projects.
4. Import phases, milestones, and activities with stable external IDs.
5. Import dependencies and assignments after both endpoints exist.
6. Validate record counts, dates, ownership, effort, dependencies, and sample workload calculations.
7. Run the spreadsheet and application in parallel for a short controlled pilot.
8. Freeze spreadsheet editing, perform a final delta import, and declare the application authoritative.

## Release Plan

### Release 0 — Discovery and prototype

- Validate terminology, hierarchy, statuses, priority rules, calendars, and current Excel fields
- Build clickable UX prototype for activity intake, project plan, team planner, My Work, and dashboards
- Prove workload calculation on anonymized real data
- Confirm infrastructure, backup, authentication, and deployment constraints

### Release 1 — MVP

- Users, roles, scope permissions
- Products, projects, phases, milestones, and activities
- Activity hierarchy, core statuses, estimates, dates, owners, and Finish-to-Start dependencies
- Teams, members, calendars, capacity, skills, and leave
- Assignments, workload heatmap, hard/soft conflict warnings
- My Work, project list, Gantt, project dashboard, portfolio dashboard, resource dashboard
- Baselines and essential change history
- Excel/CSV import/export
- Notifications, backup, restore, logging, and administration

### Release 1.1 — Planning maturity

- Scenario planning and atomic publish
- Candidate recommendations
- Critical path and richer dependencies
- Risks/issues, gate approvals, evidence checklists
- Recurring reports and email digests
- Improved forecast and variance explanations

### Release 1.2 — Automotive templates

- APQP template and gated readiness
- Automotive SPICE project/work-package mappings
- Functional-safety classification fields and evidence links
- Configurable custom templates and field sets

### Release 2 — Integrations and intelligence

- OIDC/LDAP/Active Directory
- Calendar and HR leave synchronization
- ALM/PLM/requirements/test integrations
- Signed webhooks and broader API access
- Historical throughput-based forecasts
- Explainable planning recommendations and risk trends

## MVP Acceptance Scenarios

### Scenario 1: Cross-project overload

Given one member has assignments in two projects during the same week, when a project manager adds a third assignment that takes planned load above the hard threshold, then the system must block commitment or require an authorized override, show all contributing assignments, and identify affected project priorities and milestones.

### Scenario 2: Leave affects delivery

Given a member has approved work during a future period, when approved leave overlaps that work, then net capacity must fall, affected assignments must be flagged, the project forecast must be recalculated, and the responsible project manager and team lead must receive a grouped notification.

### Scenario 3: Shared record synchronization

Given an activity is visible in Gantt, Team Planner, My Work, and Project List, when its due date is changed by an authorized project manager, then every view must display the new date after refresh without separate synchronization or duplicate records, and the audit log must record the old date, new date, actor, time, and reason when required.

### Scenario 4: Dependency protection

Given activity B depends on activity A, when A is moved beyond B’s planned start, then the system must show the conflict and proposed B/milestone impact before saving; it must never silently violate the dependency or move a fixed committed milestone.

### Scenario 5: Skill-aware assignment

Given an activity requires a skill at proficiency level 3, when the planner requests candidates, then active members meeting the skill rule appear with capacity and leave information; ineligible candidates are either excluded or clearly marked with the reason.

### Scenario 6: Baseline variance

Given a project baseline exists, when current dates or estimates change, then project and milestone dashboards must show current-versus-baseline variance while the original baseline remains unchanged.

### Scenario 7: Concurrent editing

Given two managers open the same activity, when one saves a change and the other later submits an edit based on the old version, then the second user must receive a conflict prompt showing changed fields rather than overwriting the first update silently.

### Scenario 8: Excel migration

Given a workbook contains valid and invalid rows, when it is imported, then the system must preview mappings, import no data before confirmation, identify row-level errors, and support repeat execution without duplicating records.

## Testing Strategy

- **Unit tests:** Capacity, working-day, utilization, dependency, priority, permission, and progress calculations
- **Integration tests:** Database transactions, import, audit, notification, file storage, backup, and restore
- **Contract tests:** API schemas, versioning, and optimistic concurrency
- **End-to-end tests:** Core workflows for every role
- **Permission tests:** Explicit allow/deny coverage for every sensitive capability and scope
- **Performance tests:** Large project Gantt, portfolio filters, workload aggregation, bulk import, and scenario publication
- **Security tests:** Authentication, session handling, broken access control, CSRF, injection, file upload, token exposure, and audit integrity
- **Recovery tests:** Database restore, attachment restore, failed migration rollback, and background-job retry
- **User acceptance tests:** Real project managers, team leads, and members complete representative weekly workflows using migrated sample data

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Rebuilding too much enterprise functionality | Long delivery time and low adoption | Keep MVP centered on activity-resource synchronization, workload, and delivery control |
| Poor input quality | Misleading dashboards and recommendations | Required fields, validation, freshness indicators, ownership, and staged migration |
| Users continue maintaining Excel in parallel | Conflicting sources of truth | Short controlled parallel run, clear cutover date, easy grid editing and export |
| Scheduling engine becomes opaque | Low trust and unsafe changes | Preview, explanation chain, scenarios, manual approval, immutable baselines |
| Over-notification | Users ignore alerts | Severity, grouping, digests, thresholds, and user preferences |
| Capacity appears precise but estimates are weak | False confidence | Show assumptions, data-quality score, estimate age, and ranges in later versions |
| Sensitive leave or personnel data is exposed | Privacy and trust failure | Minimal leave visibility, scoped permissions, audit, encryption, and local policy review |
| Single local server fails | Work interruption or data loss | Automated backups, monitored jobs, restore testing, spare-host runbook |
| Customization creates inconsistent workflows | Reporting fragmentation | Governed templates, controlled fields, limited admin configuration, versioned changes |
| Project priority is used politically | Unstable plans and team churn | Separate score inputs, reason/expiry, approval, and scenario impact before change |

## Open Decisions for Discovery

The following decisions should be resolved with stakeholders before development estimates are committed:

- What does “product” mean internally: vehicle, platform, ECU, component, service, or configurable category?
- Are activities estimated in hours, person-days, story points, or a mix? Capacity planning should use one time-based unit even if teams also use story points.
- Is actual time entry required, or are status, remaining effort, and forecast sufficient?
- Who approves assignment: project manager, team lead, resource manager, or a configurable workflow?
- What are the warning and hard-block utilization thresholds?
- How should non-project work, meetings, support, and management overhead reserve capacity?
- What leave data may each role see?
- Which current Excel columns and reports are mandatory for migration?
- Which automotive lifecycle templates are genuinely used by the organization?
- What is the expected active project, activity, user, and attachment volume?
- Must the app operate only on a LAN, through VPN, or also from the public internet?
- Is corporate SSO required for the MVP?
- What backup destination and disaster-recovery host are available?
- Which project changes require formal approval or baseline creation?

## Recommended Product Decision

Proceed with a focused self-hosted application, but define the MVP as a **capacity-aware work planning system**, not a generic project tracker. Its differentiator is the trustworthy connection among project commitments, activities, dependencies, people, skills, leave, and finite capacity. The first implementation should prove that one activity change propagates safely through project, team, workload, Gantt, forecast, and dashboard views; everything else should be prioritized around that capability.

This direction also remains consistent with the broader self-hosted work-management platform previously considered, including product/delivery/engineering and resource-management concerns. The present PRD narrows that wider vision into an implementable automotive planning core and deliberately postpones full HR, ALM, and enterprise portfolio complexity.

---

## References

1. [APQP, Control Plan and PPAP - Understanding and Implementing](https://www.aiag.org/training-and-resources/training-catalog/details/ACPU) - Item code: ACPU | This course is designed not just to understand, but to effectively implement APQP....

2. [www.ul.com · project-management-man3-automotive-spiceAutomotive SPICE® MAN.3: Project Management Process | SIS](https://www.ul.com/sis/insights/project-management-man3-automotive-spice) - The Project Management process in Automotive SPICE® (also known as MAN.3) helps your organization to...

3. [1](https://www.aiag.org/docs/default-source/quality-/aiag-plexus-apqp-white-paper-2023.pdf)

4. [[PDF] Automotive SPICE® Pocket Guide - UL Solutions](https://www.ul.com/sites/default/files/2024-10/Automotive_Spice_Pocket_Guide.pdf)

5. [Automotive Quality Tools & Standards - AIAG](https://www.aiag.org/expertise-areas/quality) - AIAG Quality initiatives advance product development, manufacturing, service, and customer experienc...

6. [www.postgresql.org · docs · 17PostgreSQL: Documentation: 17: 5.9. Row Security Policies](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) - 5.9. Row Security Policies # In addition to the SQL-standard privilege system available through GRAN...

7. [CREATE POLICY](https://www.postgresql.org/docs/18/sql-createpolicy.html) - CREATE POLICY CREATE POLICY — define a new row-level security policy for a table Synopsis CREATE POL...

8. [API and webhooks](https://www.openproject.org/docs/system-admin-guide/api-and-webhooks/) - Configure APIs and webhooks in OpenProject.

9. [OpenProject API Introduction](https://www.openproject.org/docs/api/introduction/) - Open source project management software for classic, agile or hybrid project management: task manage...

10. [Define resource calendars | Microsoft Learn](https://learn.microsoft.com/en-us/dynamics365/project-operations/resource-management/define-resource-calendars) - This article provides information about how to define the working hour calendars for resources in Pr...

11. [support.microsoft.com › en-us › projectWork with calendars in Project | Microsoft Support](https://support.microsoft.com/en-us/project/work-with-calendars-in-project) - If Project's default calendar settings don't work for you, this article gives you a starting point f...

12. [View resource workloads and availability in Project desktop](https://support.microsoft.com/en-us/office/view-resource-workloads-and-availability-in-project-desktop-3ee16869-68ad-4e63-bcb3-278ae34f7459) - View resource workloads and availability in Project desktop

13. [What Is Jira Plans?](https://www.atlassian.com/software/jira/guides/advanced-roadmaps/overview%23:~:text=What%2520is%2520Jira%2520Plans%253F) - Jira Advanced Planning let you tackle complex projects effortlessly, improve planning accuracy, and ...

14. [What are plans in Jira Premium? | Jira Cloud - Atlassian Support](https://support.atlassian.com/jira-software-cloud/docs/what-is-advanced-roadmaps/) - Plans in Jira Premium help you balance work across your teams, schedule work items, and share your v...

15. [Project planning and scheduling software](https://www.openproject.org/collaboration-software-features/project-planning-scheduling/) - Open source project management software for classic, agile or hybrid project management: task manage...

16. [ISO/WD 26262-4](https://www.iso.org/standard/90023.html) - Road vehicles — Functional safety — Part 4: Product development at the system level

17. [© ISO 2018](https://webstore.ansi.org/preview-pages/ISO/preview_ISO+26262-2-2018.pdf)

18. [ISO 26262-8:2018](https://www.iso.org/standard/68390.html) - Road vehicles — Functional safety — Part 8: Supporting processes

19. [Password Storage - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) - Website with the collection of all the cheat sheets of the project.

20. [cheatsheetseries.owasp.org › cheatsheetsAuthentication - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) - Website with the collection of all the cheat sheets of the project.

21. [Session Management - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) - Website with the collection of all the cheat sheets of the project.

22. [cheatsheetseries.owasp.org › cheatsheetsAuthorization - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) - Website with the collection of all the cheat sheets of the project.

