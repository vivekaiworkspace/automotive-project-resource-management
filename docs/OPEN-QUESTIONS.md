# Open Questions
## Automotive Multi-Product Project & Resource Management System

**Source document:** PRD.md v1.0
**Questions version:** 0.1 — Pre-discovery draft
**Prepared:** 2026-10-10
**Status:** Awaiting answers from product owner and stakeholders

> Each question includes a **Default recommendation** — a suggested answer based on common automotive project-management practice and PRD intent. Default recommendations are **not approved decisions**. They are placeholders to enable design work to proceed provisionally, pending stakeholder confirmation.
>
> Cross-references to the Requirements Decision Log use the format **(RDL §X.Y)**.

---

## Group 1: Product Hierarchy and Terminology

### Q1.1 — What does "Product" mean in this organization? — Resolved (CPD-001)
**PRD reference:** FR-PP-001, PRD § Open Decisions
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- The pilot product is **EMS ECU Development** — the single top-level product in the system covering the complete EMS ECU development lifecycle.
- The 14 work areas are **configurable, multi-select Project Work-Area Tags**, not products. A project may have one or more Work-Area Tags. Tags do not create separate product records.
**(RDL §1.1, CPD-001)**

---

### Q1.2 — Can a Product have sub-products, or is the hierarchy strictly Product → Project? — Resolved (CPD-001)
**PRD reference:** PRD § Core Information Model hierarchy
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- Sub-products are not supported; EMS ECU Development is the single top-level product. The hierarchy is flat at the Product level. Variant relationships are tracked via Work-Area Tags on projects.
**(CPD-001)**

---

### Q1.3 — Is a Portfolio always used, or is it optional? — Resolved (CPD-001)
**PRD reference:** PRD § Core Information Model hierarchy (Portfolio — optional)
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- Portfolio is optional in the data model and can be hidden in the UI. A Product exists without requiring a parent Portfolio.
**(CPD-001)**

---

### Q1.4 — What is the expected active project and activity volume for the initial rollout?
**PRD reference:** PRD § Open Decisions ("What is the expected active project, activity, user, and attachment volume?"), NFR § Performance
**Context:** The PRD sets design targets (100 concurrent users, 100,000 active activities) but notes these must be validated in discovery. Actual organization volumes may be lower or higher.
**Default recommendation:** Collect actual counts from existing Excel workbooks before finalizing performance test scenarios. Use the PRD NFR targets as the ceiling, not the baseline.

---

## Group 2: Roles and Permissions

### Q2.1 — Who is the approver in the assignment workflow: Project Manager, Team Lead, Resource Manager, or a configurable chain? — Resolved (CPD-008)
**PRD reference:** FR-CAP-001, Workflow § "New activity to committed plan," Permissions Matrix, PRD § Open Decisions
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- Project Manager assigns activities within assigned projects (subject to capacity rules). Team Lead reviews team workload. Dual approval is deferred to Release 1.1.
**(RDL §1.4, §2.1, CPD-008)**

---

### Q2.2 — Which roles can override a hard capacity conflict, and does an override require a second approver? — Resolved (CPD-004, CPD-008)
**PRD reference:** FR-CAP-007, Permissions Matrix "Override hard conflict"
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- System Admin and the relevant Project Manager (within assigned projects only) can override a hard conflict. A written justification reason is mandatory and recorded in the audit log. No second approver is required in Core Pilot.
**(RDL §5.3, CPD-004, CPD-008)**

---

### Q2.3 — What leave data may each role see? — Resolved (CPD-006)
**PRD reference:** Security §, PRD § Open Decisions
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- **Project Manager & Team Member:** Unavailable dates and duration only (no type, no reason).
- **Team Lead:** Dates and leave type (e.g., Annual, Sick) for own team members; no reason.
- **Resource Manager:** Full leave record (dates, type, reason, status, approver) within assigned resource scope.
- **System Admin:** Full leave records for all users.
**(RDL §5.4, CPD-006)**

---

### Q2.4 — Can a Project Manager create a Product, or does that require Portfolio Manager or Admin? — Resolved (CPD-008)
**PRD reference:** Permissions Matrix "Create product/project"
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- Project Manager cannot create Products. The EMS ECU Development product is seeded / managed by System Admin.
**(RDL §5.1, CPD-008)**

---

### Q2.5 — Who approves leave, and what is the escalation path? — Resolved (CPD-006)
**PRD reference:** Permissions Matrix "Approve leave," FR-RES-004
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- **Team Lead:** Approves leave for own team members.
- **Resource Manager:** Approves leave within assigned resource scope.
- **System Admin:** Approves leave for all users.
**(RDL §2.2, CPD-006)**

---

## Group 3: Activity Workflow

### Q3.1 — Which status transitions are locked and cannot be removed by configuration? — Resolved (CPD-007)
**PRD reference:** FR-ACT-004
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- Immutable rules: `Blocked ⇄ In Progress` allowed without admin intervention. `Done` and `Cancelled` are terminal statuses; reopening requires System Admin override with a recorded reason. `Done → Cancelled` permitted. Core pilot statuses: `Draft → Ready for Planning → Planned → In Progress ⇄ Blocked → Done / Cancelled`.
**(RDL §1.5, CPD-007)**

---

### Q3.2 — What constitutes a "material change" requiring a recorded reason? — Deferred to Operational Hardening (CPD-009)
**PRD reference:** BR-011
**Resolution (Deferred to Operational Hardening, 2026-10-11):**
- Detailed material-change thresholds (due date shift > 3 working days, start date shift > 3 working days, estimate change > 20%, reassignment, priority change) and ordinary-edit reason prompts are deferred to Operational Hardening per Product Owner decision (2026-10-11).
- Core Pilot retains append-only audit logging for all changes, with mandatory written justification (>= 10 chars) required only for CPD-004 capacity hard-block overrides and CPD-007 terminal administrative overrides.
**(RDL §1.6, CPD-009)**

---

### Q3.3 — Can an activity in Done or Cancelled status be reopened, and by whom? — Resolved (CPD-007)
**PRD reference:** FR-ACT-004, BR-013
**Resolution (Approved by Product Owner, Vivek on 2026-10-11):**
- Reopening an activity in Done or Cancelled status requires a **System Admin override** with a recorded reason. Reopening is recorded in the immutable audit log.
**(CPD-007)**

---

### Q3.4 — Which activity types require a review step before Done?
**PRD reference:** FR-EXE-005 ("Configurable activity types may require review before Done")
**Context:** FR-EXE-005 is a "Should" requirement deferred to Release 1.1. However, the list of activity types that would require review needs to be defined before the status workflow is configured.
**Default recommendation:** Defer review-required types to Release 1.1. For MVP, any authorized Project Manager or Team Lead can mark an activity Done. Document the activity types that will need review in the discovery workshop so Release 1.1 configuration is ready.

---

### Q3.5 — What is the default maximum sub-activity depth? — Resolved (CPD-007)
**PRD reference:** FR-ACT-002
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- Exactly **one level of sub-activities** is supported in Core Pilot (Activity → Sub-activity; depth = 2). Configurable depth is deferred to Operational Hardening.
**(RDL §1.9, CPD-007)**

---

## Group 4: Scheduling and Dependencies

### Q4.1 — Which dependency types are supported in MVP?
**PRD reference:** FR-ACT-007, Release Plan
**Context:** FR-ACT-007 explicitly defers SS, FF, and lag/lead to a later release. The scheduling engine and Gantt must be designed with only Finish-to-Start in MVP.
**Default recommendation:** MVP supports Finish-to-Start only. Design the data model with a `dependency_type` field and `lag_days` field so later types can be added without a schema migration.
**(RDL §6.4)**

---

### Q4.2 — Which time zone governs working-day calculations?
**PRD reference:** FR-SCH-001, BR-014, FR-RES-003
**Context:** If assignees and project owners are in different time zones, working-day boundary calculations differ.
**Default recommendation:** Use the assigned member's time zone for working-day calculations on their assignments. Use the organization's configured time zone for project-level milestone dates. Document this rule explicitly in the scheduling engine.
**(RDL §6.5)**

---

### Q4.3 — What is the default scheduling constraint for new activities?
**PRD reference:** FR-ACT-006
**Context:** The PRD lists four constraints but does not specify the default.
**Default recommendation:** Default to "As Soon As Possible" for new activities. Users can override to SNET, FNLT, or Fixed Dates explicitly. Fixed Dates requires an explicit user selection and audit entry.
**(RDL §4.3)**

---

### Q4.4 — What happens to the scheduled date when a Fixed Date activity is pushed by a dependency?
**PRD reference:** FR-ACT-006, FR-SCH-005
**Context:** FR-SCH-005 says fixed milestones are never moved silently. The conflict behavior when a dependency forces a push into a fixed constraint is undefined.
**Default recommendation:** When a dependency would push a Fixed Date activity beyond its fixed finish, raise a hard conflict immediately. The user must choose: extend the predecessor, accept a milestone risk, or request an authorized override. The Fixed Date activity is never moved automatically.
**(RDL §4.3)**

---

### Q4.5 — Which project changes require a new baseline to be created?
**PRD reference:** BR-009, FR-ACT-013, PRD § Open Decisions
**Context:** The PRD lists baseline triggers as an open decision.
**Default recommendation:** Require a new baseline when: (a) a project reaches Planned status for the first time, (b) any committed milestone date changes, (c) project scope increases by more than 10 net new activities, or (d) a portfolio-level priority change affects this project's committed work. Admin can configure additional triggers.
**(RDL §7.7)**

---

## Group 5: Capacity, Skills, and Leave

### Q5.1 — What is the estimate unit for activities? — Resolved (CPD-002)
**PRD reference:** FR-ACT-005, FR-CAP-004, PRD § Open Decisions
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- **Hours** is the mandatory and exclusive unit for activity estimates, assignments, remaining effort, capacity, and workload calculations. Story points may be stored only as non-calculating reference notes.
**(RDL §1.2, CPD-002)**

---

### Q5.2 — Is actual effort (time tracking) required, or is remaining effort sufficient? — Resolved (CPD-002)
**PRD reference:** FR-ACT-005, PRD § Open Decisions
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- Actual effort tracking is optional per project. Remaining effort is the primary progress signal; timesheets are not required for Core Pilot.
**(RDL §1.3, CPD-002)**

---

### Q5.3 — What are the default warning and hard-block utilization thresholds? — Resolved (CPD-004)
**PRD reference:** FR-CAP-007, PRD § Open Decisions
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- **90% planned utilization:** Soft warning (assignment can still be saved).
- **100% planned utilization:** Hard block. Overrides restricted to System Admin and assigned Project Manager with mandatory written justification.
**(RDL §6.1, CPD-004)**

---

### Q5.4 — How is non-project capacity reserved (meetings, support, management overhead)? — Resolved (CPD-004)
**PRD reference:** FR-CAP-004, FR-RES-002, PRD § Open Decisions
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- Default non-project buffer is **0%** per member. Resource Manager can configure a custom buffer percentage per individual member as needed.
**(RDL §6.2, CPD-004)**

---

### Q5.5 — What proficiency scale should be used for skills?
**PRD reference:** FR-RES-005, FR-RES-006, FR-RES-007, BR-016
**Context:** The PRD references a proficiency scale in three places but never defines it.
**Default recommendation:** Integer scale 1–5:
- 1 — Awareness
- 2 — Basic (can perform with guidance)
- 3 — Competent (can perform independently)
- 4 — Advanced (can lead and train)
- 5 — Expert (recognized authority)
System-wide. Admin can relabel levels but cannot change the integer range without a schema migration.
**(RDL §4.1)**

---

### Q5.6 — Does pending leave reduce committed capacity, and what is the default? — Resolved (CPD-006)
**PRD reference:** FR-RES-004, Workflow § "Leave impact"
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- Only approved leave reduces net capacity. Pending leave creates a soft warning on overlapping assignments without reducing capacity.
**(RDL §1.10, CPD-006)**

---

### Q5.7 — What are the organization's standard working hours and time zone? — Resolved (CPD-003)
**PRD reference:** FR-RES-002, FR-RES-003
**Context:** No default working hours or organization time zone was stated in the PRD.
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- **Working days:** Monday through Friday (5 days/week)
- **Standard working hours:** 8 hours per day (40 hours/week)
- **Organization time zone:** `Asia/Kolkata`
- **Public holiday calendar:** Pending; Vivek will provide the 2026 holiday list before pilot data is loaded and capacity planning begins.
**(RDL §6.3, CPD-003)**

---

## Group 6: Dashboards and Reporting

### Q6.1 — What are the health indicator thresholds for Green / Amber / Red?
**PRD reference:** FR-PP-007, FR-DAS-001, FR-DAS-003
**Context:** The PRD says the system calculates schedule, workload, blocker, and data-quality health indicators but does not define bands or thresholds.
**Default recommendation:**
| Dimension | Green | Amber | Red |
|---|---|---|---|
| Schedule | All milestones on track | ≥1 milestone within 5 days of risk | ≥1 milestone overdue or hard blocker |
| Workload | No member > 90% utilization | Any member 90–100% utilization | Any member > 100% utilization |
| Blockers | No Blocked activities | ≥1 Blocked activity < 3 days old | ≥1 Blocked activity ≥ 3 days unresolved |
| Data quality | ≥95% activities meet mandatory fields | 85–95% compliance | < 85% compliance |
Stakeholders must confirm these thresholds before dashboard design begins.
**(RDL §4.4)**

---

### Q6.2 — What is the stale-update warning period?
**PRD reference:** FR-EXE-006
**Context:** FR-EXE-006 says the period is configurable but provides no default.
**Default recommendation:** 7 calendar days. Configurable per project in project settings. Portfolio-level Admin can set a system-wide default.
**(RDL §6.6)**

---

### Q6.3 — Which reporting definitions need organization-specific confirmation?
**PRD reference:** PRD § Reporting Definitions table
**Context:** The PRD provides governed metric definitions (schedule variance, overdue activity, etc.) but notes that final targets should be adjusted after the current process is measured.
**Default recommendation:** Accept all PRD metric definitions as-written for MVP. Review after 90-day adoption period and adjust as needed. Document any organization-specific deviations in an addendum to this document before they are implemented.

---

## Group 7: Import and Migration

### Q7.1 — Which current Excel columns and reports are mandatory for migration?
**PRD reference:** PRD § Open Decisions, FR-IMP-001, FR-IMP-006, Data Migration Strategy §
**Context:** The migration strategy requires inventorying current workbooks before building the import template.
**Default recommendation:** Conduct a data inventory workshop with the key product managers and project managers before the import template is designed. Identify: active products, projects, team members, activities in flight, dependencies in use, and leave approvals already granted for the next 90 days.

---

### Q7.2 — Which historical data should be migrated and what can be discarded?
**PRD reference:** Data Migration Strategy § Preparation
**Context:** The PRD advises avoiding "obsolete spreadsheet noise" but does not define what qualifies.
**Default recommendation:** Migrate only: active projects and their open activities, team structure as of cutover date, approved future leave within 12 months, historical baselines for projects with a committed SOP date. Archive completed projects as read-only without migrating sub-activities unless evidence is required for a regulatory record.

---

### Q7.3 — How are stable external IDs assigned to existing Excel records?
**PRD reference:** FR-IMP-004, Data Migration Strategy § Assign stable codes
**Context:** FR-IMP-004 requires stable external IDs to prevent duplicate imports. Existing Excel data may not have consistent codes.
**Default recommendation:** Define a coding convention (e.g., PROD-001, PROJ-001, MBR-001) before migration Wave 1. Assign codes in the canonical field dictionary. The import template must include an `external_id` column for every entity type.

---

### Q7.4 — What is the expected parallel-run duration before Excel is frozen?
**PRD reference:** Data Migration Strategy § step 7
**Context:** The migration strategy recommends a "short controlled pilot" but does not specify its length.
**Default recommendation:** 2-week parallel run (application and Excel both updated). After 2 weeks, freeze Excel editing and run a final delta import. Declare the application authoritative. Extend to 4 weeks only if blocking issues are found during the pilot.

---

## Group 8: Local Deployment, Security, Backup, and Access

### Q8.1 — Is the application LAN-only, VPN-accessible, or internet-facing? — Resolved (CPD-010)
**PRD reference:** PRD § Open Decisions
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- Corporate LAN and VPN access only. No public internet exposure during the pilot.
**(RDL §7.1, CPD-010)**

---

### Q8.2 — Is corporate SSO required at MVP go-live? — Approved for Pilot; IT Waiver Pending (CPD-010)
**PRD reference:** PRD § Open Decisions
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- Local username/password authentication approved for pilot, subject to IT granting the SSO exception. Corporate SSO integration deferred to later release.
**(RDL §7.2, CPD-010)**

---

### Q8.3 — What is the available backup destination? — Approved for Pilot; Location Pending (CPD-010)
**PRD reference:** PRD § Open Decisions
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- Daily backup required, automated where IT infrastructure supports it, stored separately from the application server. Specific network share / NAS destination pending confirmation by IT.
**(RDL §7.3, CPD-010)**

---

### Q8.4 — Where is the backup encryption key stored?
**PRD reference:** Security § "Encrypt backups and secrets at rest"
**Context:** The PRD requires backup encryption but does not address key management.
**Default recommendation:** Store the backup encryption key on a separate server from the backup files, managed by the IT team. Document the key retrieval procedure in the disaster-recovery runbook. Consider an IT-managed key management service (e.g., HashiCorp Vault or a corporate PKI) if available. Do not store the key and the backup on the same device.
**(RDL §7.4)**

---

### Q8.5 — Which PostgreSQL backup method should be used (logical dump vs. WAL archiving)?
**PRD reference:** NFR § Availability, Architecture § Database guidance
**Context:** The RPO of 4 hours requires more frequent backups than a daily pg_dump alone provides.
**Default recommendation:** Primary method: pg_basebackup (physical base backup) plus continuous WAL archiving to the backup destination. Daily pg_dump (logical) as a secondary for selective recovery. Use pgBackRest or Barman if the IT team has existing expertise. Confirm with IT before development begins.
**(RDL §7.5)**

---

### Q8.6 — What TLS certificate approach is available?
**PRD reference:** Security § HTTPS, Architecture § reverse proxy
**Context:** A self-signed certificate on a corporate LAN without CA trust distribution causes browser warnings and may break integrations.
**Default recommendation:** Use a certificate issued by the organization's internal Corporate CA if one exists. If no internal CA exists, use Let's Encrypt via ACME if the server has internet access for certificate renewal; otherwise use a manually renewed certificate from an internal CA. Distribute the CA root certificate to all client machines via Group Policy or MDM. Document the renewal schedule.
**(RDL §7.6)**

---

### Q8.7 — How is the first System Admin account created? — Resolved (CPD-010)
**PRD reference:** Architecture § Identity and Access module
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- First Admin account seeded via `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` environment variables in a protected `.env` file excluded from version control. Forced password change on first login.
**(RDL §7.8, CPD-010)**

---

### Q8.8 — What is the disaster-recovery host and the spare-server runbook? — Approved for Pilot; Drill Pending (CPD-010)
**PRD reference:** PRD § Risks ("Single local server fails"), NFR § RTO 8 hours
**Resolution (Approved by Product Owner, Vivek on 2026-10-10):**
- A successful restore test into a separate machine/test environment must be completed and documented before pilot go-live. Drill owner and scheduled date remain pending.
**(RDL §7.3, CPD-010)**

---

*End of Open Questions — v0.1*
