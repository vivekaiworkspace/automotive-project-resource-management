# MVP Scope
## Automotive Multi-Product Project & Resource Management System

**Source document:** PRD.md v1.0
**Scope version:** 0.2 — Revised delivery tiers
**Prepared:** 2026-10-10
**Status:** Proposal awaiting stakeholder approval — no items below are approved decisions

> [!IMPORTANT]
> This document reorganizes the full Release 1 scope from PRD.md into three delivery tiers.
> Nothing here authorises implementation. Resolve open questions in OPEN-QUESTIONS.md and
> ambiguities in REQUIREMENTS-DECISION-LOG.md before committing estimates for any tier.

---

## Delivery Tiers at a Glance

| Tier | Purpose | Exit gate |
|---|---|---|
| **MVP Core Pilot** | Smallest end-to-end vertical slice that proves the central workflow on real data with a small pilot group | Core Pilot Acceptance Gate (§ 12) |
| **MVP Operational Hardening** | Extends Core Pilot to production-quality visibility, safety, import, and governance so the full organization can adopt | Stakeholder sign-off on each hardening item |
| **Post-MVP / Release 1.1+** | Advanced planning features, automotive templates, integrations, and intelligence — deferred until the core workflow is stable | Future release planning |

Every item in this document retains its original PRD requirement ID. Each item is labeled with one of:
`MVP Core Pilot` · `MVP Operational Hardening` · `Post-MVP / Release 1.1+` · `Assumption requiring approval`

---

## 1. The Core Workflow the Pilot Must Prove

MVP Core Pilot succeeds when a small group of real users can demonstrate this end-to-end chain on live data, with no spreadsheets involved:

```
Product → Project → Activity → Assignment → Team Member
  → Approved leave reduces net capacity
  → Overload warning fires
  → Project list and team workload view reflect the change immediately
  → Audit record written
```

### PRD acceptance scenarios mapped to tiers

The PRD defines seven acceptance scenarios. This revision resolves the contradiction in the previous scope draft (Scenario 5 was claimed in-scope but its prerequisites were not fully included).

| Scenario | Title | Tier | Rationale |
|---|---|---|---|
| 1 | Cross-project overload — hard conflict blocks or requires override | **MVP Core Pilot** | Central proof of finite-capacity enforcement. Requires that a member's weekly load already includes assignments from every active pilot project visible to the planning engine, so a new assignment in any pilot project correctly sees the already-committed load from the others. |
| 2 | Leave affects delivery — capacity falls, forecast recalculates, notification sent | **MVP Core Pilot** | Core workflow requires leave → capacity → warning chain |
| 3 | Shared record synchronization — one change reflected in all views, audit written | **MVP Core Pilot** | Fundamental data integrity proof; no Gantt required to pass this |
| 4 | Dependency protection — conflict shown before save; no silent violation | **MVP Operational Hardening** | Finish-to-Start dependency engine is needed, but the critical path is not; defer until Hardening because Core Pilot can prove the workflow with date validation alone |
| **5** | **Skill-aware assignment — eligible members listed with capacity and leave context** | **MVP Operational Hardening** | **Resolution of previous contradiction:** Scenario 5 requires FR-RES-007 (required skills on activity) and FR-RES-008 (candidate suggestions). Both are tagged "Should" in the PRD. Including the full skill-matching engine in Core Pilot adds significant scope to a pilot that must be as small as possible. Skills catalogue and member skill records are built in Core Pilot as a prerequisite; skill-filtered candidate suggestions and required-skill validation fire in Hardening. See note below. |
| 6 | Baseline variance — current vs. baseline shown; baseline unchanged | **MVP Operational Hardening** | Baselines require a stable workflow before they are meaningful; baseline tooling belongs in Hardening |
| 7 | Concurrent editing — second writer receives conflict prompt, not silent overwrite | **MVP Core Pilot** | Optimistic concurrency is a data-integrity prerequisite, not an advanced feature |

> **Scenario 5 note:** Skills catalogue (FR-RES-005) and member skill records (FR-RES-006) are built in Core Pilot because they are referenced by BR-016 and because skill data must be present before Hardening can add required-skill filtering. Scenario 5 itself — the planner sees eligible candidates ranked by skill, capacity, and leave — is the Hardening gate test. This is consistent with the PRD "Should" priority on FR-RES-007 and FR-RES-008. The Scenario 5 deferred-from-Core annotation must be recorded in the Core Pilot Acceptance Gate (§ 12).

---

## 2. Identity and Access

| Item | PRD reference | Tier |
|---|---|---|
| Local username/password authentication; adaptive hash (Argon2id); unique salts | Security § | MVP Core Pilot |
| Minimal role set for pilot: System Admin, Project Manager, Team Lead, Team Member, Resource Manager | PRD § Users and Roles | MVP Core Pilot |
| A person may hold more than one role | PRD § Users and Roles | MVP Core Pilot |
| Access is the intersection of role and scope; users see only authorized records | BR-018, PRD § Users and Roles | MVP Core Pilot |
| HTTPS for all sessions via reverse proxy; HTTP-only Secure SameSite session cookies | Security § | MVP Core Pilot |
| Session rotation on authentication; idle and absolute expiry enforced | Security § | MVP Core Pilot |
| CSRF protection, input validation, output encoding | Security § | MVP Core Pilot |
| Configurable account lockout and rate limiting | Security § | MVP Core Pilot |
| First-run bootstrap: Admin account seeded via environment variable; forced password change on first login | Architecture § Identity | MVP Core Pilot |
| Audit: login events, authorization failures | Security § | MVP Core Pilot |
| Portfolio Manager and Viewer roles — scoped read-only and portfolio-write access | PRD § Users and Roles | MVP Operational Hardening |
| Full configurable permission matrix with per-role scope grants | Permissions Matrix § | MVP Operational Hardening |
| Audit: permission changes, exports, baseline publication, overrides | Security §, Audit § | MVP Operational Hardening |
| Rate limiting hardening; file-upload controls | Security § | MVP Operational Hardening |
| OIDC / LDAP / Active Directory SSO | Security §, Release 2 | Post-MVP / Release 1.1+ |

**Assumptions requiring approval**
- Local username/password with strong password policy is acceptable for pilot without corporate SSO. If IT policy cannot grant this exception, SSO becomes a Core Pilot blocker. (See REQUIREMENTS-DECISION-LOG.md §7.2)
- Network boundary is LAN + VPN; no public internet exposure for pilot. (See REQUIREMENTS-DECISION-LOG.md §7.1)

---

## 3. Organization and Teams

| Item | PRD reference | Tier |
|---|---|---|
| Create teams; assign team lead; add active members; preserve dated membership history | FR-RES-001 | MVP Core Pilot |
| Member capacity: weekly hours or FTE, effective dates | FR-RES-002 | MVP Core Pilot |
| Organization working calendar: holidays, working days, daily hours, time zone | FR-RES-003 | MVP Core Pilot |
| Per-member calendar exceptions (individual non-working days) | FR-RES-003 | MVP Core Pilot |
| Member deactivation: blocks new assignments, warns of unfinished work | FR-RES-012 | MVP Core Pilot |
| Optional planning buffer (non-project hours reserve) per member | FR-RES-002 | MVP Core Pilot |
| Division/Department grouping above team level | PRD § Core Information Model | MVP Operational Hardening |
| Per-team calendar (distinct from organization calendar) | FR-RES-003 | MVP Operational Hardening |
| Temporary cross-project allocation with effective dates | FR-RES-011 | Post-MVP / Release 1.1+ |
| Delegate nomination for notifications and approvals | FR-RES-013 | Post-MVP / Release 1.1+ |

**Assumptions requiring approval**
- Default working hours: 8 hours/day, Monday–Friday. Organization must confirm before calendar data is seeded. (See REQUIREMENTS-DECISION-LOG.md §6.3)
- Non-project buffer defaults to 0%; configurable per member by Resource Manager. (See REQUIREMENTS-DECISION-LOG.md §6.2 and §3.6)

---

## 4. Skills and Availability

| Item | PRD reference | Tier |
|---|---|---|
| Admin maintains controlled skill catalogue: names, categories, proficiency scale | FR-RES-005 | MVP Core Pilot |
| Record member skill proficiency, validator, last reviewed date, optional expiry | FR-RES-006 | MVP Core Pilot |
| BR-016: skills used for eligibility must be active, validated if required, and unexpired | BR-016 | MVP Core Pilot |
| Leave submission by member or authorized manager | FR-RES-004 | MVP Core Pilot |
| Approved leave reduces member net capacity; pending and rejected leave do not | FR-RES-004 | MVP Core Pilot |
| Leave overlap with existing assignment generates soft warning on assignment | FR-CAP-006 | MVP Core Pilot |
| Activity can declare one or more required skills with minimum proficiency | FR-RES-007 | MVP Operational Hardening |
| Candidate suggestion list: eligible members ranked by skill match, capacity, and availability | FR-RES-008 | MVP Operational Hardening |
| Skill-mismatch hard conflict when assigning a member who lacks a required skill | FR-CAP-006 (skill clause) | MVP Operational Hardening |
| Evidence/notes on member skill records; skill expiry notifications | FR-RES-006 | MVP Operational Hardening |

**Assumptions requiring approval**
- Proficiency scale: integer 1–5 (1 Awareness, 2 Basic, 3 Competent, 4 Advanced, 5 Expert), system-wide. Organization must confirm scale labels before skill data is seeded. (See REQUIREMENTS-DECISION-LOG.md §4.1)
- Pending leave is visible as a soft warning on affected assignments but does not reduce committed capacity in Core Pilot. (See REQUIREMENTS-DECISION-LOG.md §1.10)

---

## 5. Products and Projects

**Confirmed pilot context (2026-10-10):** The pilot product is **EMS ECU Development** — one product in the system. It covers the complete EMS ECU lifecycle. Projects under EMS ECU Development may span multiple work areas simultaneously; classification is by **multi-select work-area tags** (see CPD-001 for the 14-tag list). No sub-products are required.

| Item | PRD reference | Tier |
|---|---|---|
| Create, edit, and archive products: unique code, name, owner, status, priority | FR-PP-001 | MVP Core Pilot |
| Create multiple projects under a product; each project has independent owner, priority, status, planned dates | FR-PP-002 | MVP Core Pilot |
| Every active project belongs to exactly one product | BR-001 | MVP Core Pilot |
| Multi-select work-area tags on projects: one or more tags from the confirmed EMS ECU list; used for filtering and grouping | CPD-001 (EMS ECU scope) | MVP Core Pilot |
| Simple project list: filterable by product, status, owner, and work-area tag | FR-PP-003 (partial) | MVP Core Pilot |
| Simple phases/workstreams: name, sequence, planned dates | PRD § Entity table | MVP Core Pilot |
| Configurable project priority model: admin defines labels; portfolio manager ranks with reason | FR-PP-004 | MVP Operational Hardening |
| Full portfolio overview: filter by team, health, date range, manager | FR-PP-003 (full) | MVP Operational Hardening |
| System-calculated health indicators (schedule, workload, blocker, data quality) | FR-PP-007 | MVP Operational Hardening |
| Restore archived products | FR-PP-001 | MVP Operational Hardening |
| Project lifecycle templates (Lean, APQP, Automotive SPICE, Custom) | FR-PP-005 | Post-MVP / Release 1.1+ |
| Project cloning: structure, activities, dependencies, skills, relative dates | FR-PP-006 | Post-MVP / Release 1.1+ |
| Portfolio roadmap timeline across products | FR-PP-008 | Post-MVP / Release 1.1+ |

**Assumptions requiring approval**
- Tag list: the 14 work-area tags listed in CPD-001 are proposed; the product owner must confirm the list is complete and the names are correct before pilot data is seeded. (See REQUIREMENTS-DECISION-LOG.md §1.1)
- Health indicator color bands (Green/Amber/Red) and per-dimension thresholds must be defined before Operational Hardening dashboard design begins. (See REQUIREMENTS-DECISION-LOG.md §4.4)

---

## 6. Activities and Dependencies

| Item | PRD reference | Tier |
|---|---|---|
| Create activity with title and project; complete required fields inline or in detail drawer | FR-ACT-001 | MVP Core Pilot |
| Parent activity and one level of sub-activity; parent progress and dates roll up from children | FR-ACT-002 | MVP Core Pilot |
| Required planning fields before commitment: type, priority, owner, estimate (hours), start/due dates, status, project | FR-ACT-003 | MVP Core Pilot |
| Status workflow: Draft, Ready for Planning, Planned, In Progress, Blocked, Done, Cancelled | FR-ACT-004 (core states) | MVP Core Pilot |
| Estimates: original, current, remaining effort, change reason; actual effort optional | FR-ACT-005 | MVP Core Pilot |
| Default scheduling constraint: As Soon As Possible; SNET and FNLT constraints available | FR-ACT-006 (partial) | MVP Core Pilot |
| Unique stable activity IDs (e.g., PRJ-1042), never reused after deletion | FR-ACT-016 | MVP Core Pilot |
| Every activity belongs to exactly one project; optionally one phase and one parent activity | BR-002 | MVP Core Pilot |
| Done/Cancelled activities consume no future capacity after effective date | BR-008 | MVP Core Pilot |
| Material changes to dates, effort, and assignment require a recorded reason | BR-011 | MVP Operational Hardening (CPD-009) |
| Project priority never silently rewrites assignments | BR-012 | MVP Core Pilot |
| Archive/deactivate rather than physical deletion for master data with history | BR-013 | MVP Core Pilot |
| All timestamps stored in UTC; displayed in user/organization time zone | BR-014 | MVP Core Pilot |
| Project progress calculated from leaf activities, effort-weighted by default | BR-015 | MVP Core Pilot |
| Activity effort stored independently from assignee allocation | BR-004 | MVP Core Pilot |
| Finish-to-Start dependencies with circular dependency prevention and user explanation | FR-ACT-007, FR-ACT-008 | MVP Operational Hardening |
| Dependency propagation preview: proposed predecessor change shows impacted successor dates | FR-SCH-002 | MVP Operational Hardening |
| Fixed Dates scheduling constraint; fixed dates never moved silently | FR-ACT-006 (Fixed Dates), FR-SCH-005 | MVP Operational Hardening |
| Milestones: owner, date, readiness criteria, evidence links, approval state, contributing activities | FR-ACT-009 | MVP Operational Hardening |
| Named immutable baselines; compare current vs. baseline dates, effort, milestone variance | FR-ACT-013, BR-009, BR-010 | MVP Operational Hardening |
| Only authorized users may change a committed milestone or publish a baseline | BR-009 | MVP Operational Hardening |
| Bulk edit: status, priority, owner, dates, labels, phase — with preview and audit entry | FR-ACT-010 | MVP Operational Hardening |
| "In Review" status state and configurable review-before-Done workflow | FR-ACT-004, FR-EXE-005 | Post-MVP / Release 1.1+ |
| Start-to-Start, Finish-to-Finish, lag/lead dependencies | FR-ACT-007 | Post-MVP / Release 1.1+ |
| Comments, @mentions, and file attachments on activities | FR-ACT-011 | Post-MVP / Release 1.1+ |
| Risks and issues linked to activities | FR-ACT-012 | Post-MVP / Release 1.1+ |
| Recurring activity generation | FR-ACT-014 | Post-MVP / Release 1.1+ |
| Saved personal and shared views | FR-ACT-015 | Post-MVP / Release 1.1+ |

**Assumptions requiring approval**
- Estimate unit is hours for all capacity planning; story points may be stored as a secondary reference field but are not used in scheduling or workload calculations. (See REQUIREMENTS-DECISION-LOG.md §1.2)
- Default sub-activity depth is one level (Activity → Sub-activity) for Core Pilot; Admin-configurable up to a system maximum in Hardening. (See REQUIREMENTS-DECISION-LOG.md §1.9)
- Material-change thresholds (e.g., date shift > 3 working days, effort change > 20%) are deferred to MVP Operational Hardening (CPD-009); Core Pilot does not enforce ordinary-edit material-change reason prompts. (See REQUIREMENTS-DECISION-LOG.md §1.6)
- Actual effort tracking is optional per project in Core Pilot; remaining effort is sufficient as the primary progress signal. (See REQUIREMENTS-DECISION-LOG.md §1.3)

---

## 7. Assignments and Capacity

| Item | PRD reference | Tier |
|---|---|---|
| Assign activity to one member with planned effort and assignment dates | FR-CAP-001 | MVP Core Pilot |
| Net capacity = working hours − approved leave − calendar exceptions − non-project buffer | FR-CAP-004 | MVP Core Pilot |
| Planned utilization = planned assignment effort / net capacity × 100 per week | FR-CAP-005 | MVP Core Pilot |
| Soft warning when utilization exceeds warning threshold (default 90%) | FR-CAP-006, FR-CAP-007 | MVP Core Pilot |
| Hard block when utilization exceeds hard threshold (default 100%); authorized override with recorded reason | FR-CAP-006, FR-CAP-007 | MVP Core Pilot |
| Leave-overlap warning when approved leave covers an active assignment | FR-CAP-006 | MVP Core Pilot |
| Effort distributed evenly across assignment's valid working days | PRD § "The distribution rule must be explicit" | MVP Core Pilot |
| Zero net capacity with load > 0 treated as hard conflict, not infinite percentage | PRD § "The base calculations are" | MVP Core Pilot |
| Member cannot receive new assignment outside active employment dates | BR-017 | MVP Core Pilot |
| Unassigned demand: list of Ready-for-Planning activities with no confirmed assignee | FR-CAP-011 | MVP Core Pilot |
| Cross-project load aggregation: a member's weekly load and utilization calculation includes assignments from every active pilot project visible to the planning engine — overload detection in Scenario 1 depends on this | FR-RES-010 (pilot scope) | MVP Core Pilot |
| Multiple assignees per activity; total effort shown and validated against activity effort | FR-CAP-002 | MVP Operational Hardening |
| Assignment-effort mismatch generates acknowledged soft warning | BR-005 | MVP Operational Hardening |
| Drag/resize assignment in workload view previews workload and dates before save | FR-CAP-008 | MVP Operational Hardening |
| Cross-project demand at enterprise scale: advanced cross-portfolio filtering, cross-product workload analytics, and performance-optimized aggregation across the full active project set | FR-RES-010 (full scope) | MVP Operational Hardening |
| Infeasible-due-date conflict detection | FR-CAP-006 (date clause) | MVP Operational Hardening |
| Team placeholder: tentative assignment to team before member is selected | FR-CAP-003 | Post-MVP / Release 1.1+ |
| Rebalancing suggestions (date shift, split, alternate member) | FR-CAP-009 | Post-MVP / Release 1.1+ |
| Scenario planning and atomic publish | FR-CAP-010 | Post-MVP / Release 1.1+ |
| Remaining-effort reforecast of future demand | FR-CAP-012 | Post-MVP / Release 1.1+ |

**Assumptions requiring approval**
- Default hard-block threshold: 100% utilization. Default soft-warning threshold: 90%. Admin must set these before any assignments are made; there is no system-wide default that bypasses the configuration step. (See REQUIREMENTS-DECISION-LOG.md §6.1)
- Non-project buffer defaults to 0% in Core Pilot. (See REQUIREMENTS-DECISION-LOG.md §6.2)

---

## 8. Views and Navigation (Core Pilot)

The Core Pilot requires the minimum views to prove the workflow. Sophisticated dashboards and the full Gantt are Operational Hardening items.

| Item | PRD reference | Tier |
|---|---|---|
| My Work: current, upcoming, overdue, and blocked assignments across all projects, ordered by priority | FR-EXE-001 | MVP Core Pilot |
| Quick progress update panel: status, remaining effort, forecast finish, comment, blocker — one panel | FR-EXE-002 | MVP Core Pilot |
| Simple project activity list: filterable by status and owner; inline status and remaining-effort edit | FR-ACT-001, FR-PP-003 | MVP Core Pilot |
| Team workload view: weekly capacity vs. load per member; overload highlighted; drill into assignments | FR-RES-009, FR-DAS-006 | MVP Core Pilot |
| Stale-update warning: highlight in-progress work not updated within the reporting period | FR-EXE-006 | MVP Core Pilot |
| Blocker escalation: description, owner, next action required; in-app notification to responsible manager | FR-EXE-004, FR-NOT-002 | MVP Core Pilot |
| Completion validation: activity cannot reach Done if mandatory fields are incomplete without authorized override | FR-EXE-007 | MVP Core Pilot |
| Inline editing for common fields; permissions enforced | PRD § Interaction requirements | MVP Core Pilot |
| Detail drawer to edit an activity without losing list context | PRD § Interaction requirements | MVP Core Pilot |
| Consistent terminology across all views | NFR § Usability | MVP Core Pilot |
| English language; locale-aware date display | NFR § Usability | MVP Core Pilot |
| No critical information encoded by color alone | PRD § Interaction requirements, NFR § | MVP Core Pilot |
| Team board: activities grouped by member and status with workload indicators | FR-EXE-003 | MVP Operational Hardening |
| Portfolio dashboard: project count by health, milestone forecast, unstaffed demand, top conflicts | FR-DAS-001 | MVP Operational Hardening |
| Product dashboard: cross-project milestones, progress, team demand | FR-DAS-002 | MVP Operational Hardening |
| Project dashboard: milestone health, baseline variance, overdue/blocked, dependency risks, recent changes | FR-DAS-003 | MVP Operational Hardening |
| Resource dashboard: member/team capacity, allocation, leave, overload, skill demand, unassigned work | FR-DAS-004 | MVP Operational Hardening |
| Gantt chart: phases, activities, milestones, dependencies, baseline variance, assignees, at-risk styling | FR-DAS-005 | MVP Operational Hardening |
| Configurable filters: product, project, team, member, manager, status, priority, skill, health, date | FR-DAS-008 | MVP Operational Hardening |
| Global search: ID, title, product, project, member, skill, milestone | PRD § Interaction requirements | MVP Operational Hardening |
| Delivery forecast: committed vs. forecast milestone dates and variance drivers | FR-DAS-007 | Post-MVP / Release 1.1+ |
| Keyboard-friendly grid for fast Excel-like data entry | PRD § Interaction requirements | Post-MVP / Release 1.1+ |
| Virtualized tables and Gantt for large data sets (≥ 5,000 rows) | PRD § Interaction requirements, NFR § | Post-MVP / Release 1.1+ |
| Responsive tablet support; mobile-optimized quick-update view | PRD § Interaction requirements | Post-MVP / Release 1.1+ |
| WCAG 2.1 AA accessibility target | NFR § Usability | Post-MVP / Release 1.1+ |
| Scheduled and emailed portfolio status reports | FR-DAS-010 | Post-MVP / Release 1.1+ |
| Saved personal and shared views | FR-ACT-015 | Post-MVP / Release 1.1+ |

**Assumptions requiring approval**
- Default stale-update reporting period: 7 calendar days, configurable per project. (See REQUIREMENTS-DECISION-LOG.md §6.6)

---

## 9. Notifications

| Item | PRD reference | Tier |
|---|---|---|
| In-app notification center: unread/read list, navigate directly to affected record | FR-NOT-001 | MVP Core Pilot |
| Critical triggers only for Core Pilot: new assignment, blocker raised, overload hard conflict, approved leave overlapping assignment | FR-NOT-002 (partial) | MVP Core Pilot |
| Admin sets notification defaults | FR-NOT-004 | MVP Core Pilot |
| Full trigger set: mention, approval request, rejected change, due-date risk, and all leave events | FR-NOT-002 (full) | MVP Operational Hardening |
| Users may reduce optional notifications but not critical governance notices | FR-NOT-004 | MVP Operational Hardening |
| SMTP email delivery with retry and failure logging | FR-NOT-005 | MVP Operational Hardening |
| Daily/weekly digest option | FR-NOT-003 | Post-MVP / Release 1.1+ |

---

## 10. Import, Export, and Audit

| Item | PRD reference | Tier |
|---|---|---|
| Append-only audit entries: actor, timestamp, entity, before/after values (mandatory reason for capacity hard-block & terminal overrides; general material-change reasons deferred to Operational Hardening per CPD-009) | Audit § | MVP Core Pilot |
| Audit entries cannot be edited through the UI | Audit § | MVP Core Pilot |
| Optimistic concurrency: entity version or If-Match header prevents silent overwrite (supports Scenario 7) | API Requirements § | MVP Core Pilot |
| Correlation ID for bulk operations and automated recalculations | Audit § | MVP Core Pilot |
| Basic CSV export of current activity list and assignment list within user scope | FR-IMP-005 (partial) | MVP Core Pilot |
| Exportable audit report filtered by entity, user, date, and action | Audit § | MVP Operational Hardening |
| Full XLSX/CSV export of filtered operational data and baseline/change information | FR-IMP-005 | MVP Operational Hardening |
| Excel/CSV import wizard: column mapping, preview, validation errors, duplicate detection, import after confirmation | FR-IMP-001 | MVP Operational Hardening |
| Staged migration import order documented and enforced | FR-IMP-002 | MVP Operational Hardening |
| Per-row error report: row number, field, reason, suggested correction | FR-IMP-003 | MVP Operational Hardening |
| Re-import safety via stable external IDs or matching rules | FR-IMP-004 | MVP Operational Hardening |
| Controlled import workbook template with required fields, allowed values, and examples | FR-IMP-006 | MVP Operational Hardening |
| Export key visual reports to PDF/image | FR-DAS-009 | Post-MVP / Release 1.1+ |

---

## 11. Infrastructure, Security, and Administration

| Item | PRD reference | Tier |
|---|---|---|
| PostgreSQL database on local/private server; SQLite not acceptable for multi-user production | Architecture § | MVP Core Pilot |
| Docker Compose single-server deployment | Architecture § | MVP Core Pilot |
| Reverse proxy terminating TLS (self-signed acceptable for pilot; replace before Hardening) | Architecture §, Security § | MVP Core Pilot |
| Versioned database migrations; graceful maintenance mode | NFR § Availability | MVP Core Pilot |
| Structured application logs sufficient to trace errors and audit events | Architecture § Observability | MVP Core Pilot |
| Manual documented backup and restore procedure: pg_dump daily, tested restore before pilot go-live | NFR § Availability | MVP Core Pilot |
| Passwords never stored in plaintext; Argon2id with unique salts | Security § | MVP Core Pilot |
| Secrets stored outside version control (environment file with restricted permissions) | Security § | MVP Core Pilot |
| Automated unit tests: capacity calculation, working-day calculation, utilization, permission checks | PRD § Testing Strategy | MVP Core Pilot |
| Automated integration tests: database transactions, audit writes, notification triggers | PRD § Testing Strategy | MVP Core Pilot |
| End-to-end tests for Core Pilot role workflows (Project Manager, Team Lead, Team Member, Resource Manager) | PRD § Testing Strategy | MVP Core Pilot |
| Versioned REST API under /api/v1; OpenAPI spec published with deployment | API Requirements § | MVP Core Pilot |
| Background worker: notification delivery and scheduled backup orchestration | Architecture § | MVP Core Pilot |
| Automated daily backup with WAL archiving if infrastructure supports it | NFR § Availability | MVP Operational Hardening |
| RPO 4 hours; RTO 8 hours — requires WAL archiving and documented spare-host runbook | NFR § Availability | MVP Operational Hardening |
| Quarterly restore test with recorded evidence | NFR § Availability | MVP Operational Hardening |
| Backup files encrypted at rest; encryption key stored separately from backup destination | Security § | MVP Operational Hardening |
| Health checks, database metrics, job monitoring, and backup-failure alerts | Architecture § Observability | MVP Operational Hardening |
| TLS certificate from corporate CA or ACME (replace pilot self-signed) | Security § | MVP Operational Hardening |
| Idempotency keys for import and scenario-publish operations | API Requirements § | MVP Operational Hardening |
| Bulk API endpoints with per-record validation results | API Requirements § | MVP Operational Hardening |
| File storage: local encrypted filesystem or on-premise S3-compatible object storage for attachments | Architecture § | Post-MVP / Release 1.1+ |
| Performance targets from PRD NFR § (100 concurrent users, p95 < 2 s list, < 5 s dashboard) | NFR § Performance | Post-MVP / Release 1.1+ |
| Service availability target 99.5% during business hours | NFR § Availability | Post-MVP / Release 1.1+ |
| Redis cache/queue layer | Architecture § | Post-MVP / Release 1.1+ |
| OIDC / LDAP / Active Directory integration | Security §, Release 2 | Post-MVP / Release 1.1+ |
| Signed webhooks, retries, delivery log | API Requirements § | Post-MVP / Release 1.1+ |
| API access tokens scoped by user and purpose | API Requirements § | Post-MVP / Release 1.1+ |
| Audit log retention configurability; exportable by entity/date | Audit § | Post-MVP / Release 1.1+ |

**Assumptions requiring approval**
- A self-signed TLS certificate is acceptable during the Core Pilot provided all pilot clients trust it explicitly. It must be replaced with a corporate-CA or ACME certificate before Operational Hardening rollout. (See REQUIREMENTS-DECISION-LOG.md §7.6)
- IT must confirm available backup destination (NAS, S3-compatible on-premise, or equivalent) before Operational Hardening begins. (See REQUIREMENTS-DECISION-LOG.md §7.3)
- WAL archiving tooling (pgBackRest, Barman, or pg_basebackup + WAL) to be confirmed with IT before Hardening backup design is finalized. (See REQUIREMENTS-DECISION-LOG.md §7.5)
- Backup encryption key stored on a separate server or key management service from the backup files. (See REQUIREMENTS-DECISION-LOG.md §7.4)
- Redis is not added unless load testing during Hardening shows a measurable need. (Architecture § Cache/queue)

---

## 12. Core Pilot Acceptance Gate

The Core Pilot may not advance to MVP Operational Hardening until **all** of the following outcomes pass on the live pilot environment with real project data. Results must be witnessed and signed off by the product owner.

| # | Measurable outcome | Pass condition |
|---|---|---|
| AG-1 | **End-to-end data integrity** — an activity due-date change is reflected immediately in the project activity list, the team workload view, and the My Work panel for the assigned member, with no manual sync step | Zero discrepancies observed across all three views in 10 consecutive test edits by two different pilot users |
| AG-2 | **Cross-project capacity enforcement** — a member already at 100% utilization in a given week (from assignments spread across two or more active pilot projects) cannot receive a further assignment in any pilot project without triggering a hard block or an authorized override with a recorded reason; the utilization figure shown to the planner must reflect the combined load from all active pilot projects, not just the current one | Hard-block fires correctly in 100% of test cases across at least two different source projects; override path records reason in audit log; utilization figure verified to include all pilot-project assignments |
| AG-3 | **Leave → capacity chain** — approving a member's leave request reduces their net capacity for the affected days, flags all overlapping assignments with a warning, and generates an in-app notification to the relevant project manager and team lead | Verified for at least 3 distinct leave + assignment overlap scenarios using pilot data |
| AG-4 | **Concurrent edit protection** — when two pilot users open and edit the same activity simultaneously, the second save receives a conflict prompt showing the changed field rather than silently overwriting the first edit | Reproducible in all test attempts; no silent overwrite observed |
| AG-5 | **Audit trail** — every approved audit action (CPD-007 terminal status overrides, CPD-004 capacity hard-block overrides, leave workflow actions) generates an append-only audit entry recording actor, timestamp, entity, before value, after value, and justification where required; entries cannot be deleted or edited through the UI (ordinary-edit material-change threshold prompts deferred to Operational Hardening per CPD-009) | Spot-check of 20 audit entries across approved entity types shows no gaps or editable entries |
| AG-6 | **Backup and restore** — a complete database backup is taken from the pilot server and successfully restored into a **separate test environment or designated recovery host** (not the same server); the application starts, all pilot data is accessible, and no data created before the backup point is missing | Restore test executed on a separate host or isolated test environment before pilot go-live; written record of test date, operator, row counts verified, and sign-off by IT or product owner; formal spare-host runbook, RTO 8-hour commitment, WAL archiving, and quarterly restore evidence with recorded results are required at MVP Operational Hardening |
| AG-7 | **Scenario 5 prerequisite verified** — skill catalogue and member skill records are populated for all pilot members, confirming the data foundation for skill-aware assignment in Operational Hardening; Scenario 5 full test (eligible-member candidate list) is explicitly recorded as pending | Skills catalogue and member records present for ≥ 90% of pilot team members; Scenario 5 deferred status formally noted in the handoff document |

> [!NOTE]
> Scenario 5 (skill-aware assignment) is intentionally absent from the Core Pilot gate tests. Its skill data prerequisites (AG-7) must be met so Operational Hardening can activate skill-filtered candidate suggestions without a data migration sprint.

---

## 13. Explicitly Out of Scope Across All Tiers

The following items are confirmed out of scope for all three tiers (PRD § Out of scope for the first release and Release 2):

- Payroll, attendance, compensation, performance reviews, recruitment, and full HRIS
- Financial accounting, invoicing, procurement, and supplier payment
- Source-code hosting, CI/CD, requirements authoring, test-case management, PLM, ALM, and document-control replacement
- Real-time chat or video conferencing
- AI-based autonomous planning or automatic reassignment without approval
- Native mobile applications
- Complex earned-value management, cost accounting, and portfolio financial optimization
- External customer/supplier portal
- APQP, Automotive SPICE, and Functional Safety lifecycle templates (Release 1.2)
- Scenario planning and atomic publish (Post-MVP / Release 1.1+)
- Recurring activities (Could — Post-MVP)
- Delegate nomination (Could — Post-MVP)
- Localization beyond English (Post-MVP)

---

*End of MVP Scope — v0.2*
