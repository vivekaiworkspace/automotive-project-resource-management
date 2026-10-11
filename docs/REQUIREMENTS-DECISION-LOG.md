# Requirements Decision Log
## Automotive Multi-Product Project & Resource Management System

**Source document:** PRD.md v1.0
**Log version:** 0.1 — Pre-discovery draft
**Prepared:** 2026-10-10
**Status:** Core Pilot decisions approved by Vivek (2026-10-10 / 2026-10-11); operational prerequisites and Post-MVP items tracked

---

## Product Owner Decisions — 2026-10-11 (CPD-007 Approval & CPD-009 Deferral)

**Decision Date:** 2026-10-11
**Approver:** Vivek (Product Owner)
**Approval Evidence:** Product Owner decision recorded in Core Pilot decision register.
**Decisions Recorded:**
1. **CPD-007 Approved:** Product Owner Vivek approved CPD-007 (Activity Structure and Status Workflow) for Core Pilot. Sub-activity depth is limited to 1 level. Only `SYSTEM_ADMIN` may enter `Done` or `Cancelled`, revoke `Done → Cancelled`, or reopen `Done`/`Cancelled` (each requiring trimmed justification ≥ 10 characters and an immutable audit record). Cancellation is an atomic transaction terminating future load and recalculating capacity. Direct children must all be `Done` or `Cancelled` before a parent activity can transition to `Done`.
2. **CPD-009 Deferred:** Product Owner Vivek deferred CPD-009 (Material-Change Rules) to Operational Hardening; it is not Core Pilot implementation scope. Excluded from Core Pilot: date-shift threshold detection (3 working days), estimate-change percentage threshold detection (20%), mandatory reason prompts for ordinary activity edits, configurable material-change thresholds, material-change interceptors, bulk-edit material-change behavior, and Gantt/dependency/export change tracking.
3. **Core Pilot Scope Clarification:** Any prior Core Pilot references to date-shift, estimate-change, ordinary-edit mandatory-reason, or material-change interceptor behavior are superseded for Core Pilot.
4. **Active Audit Requirements Retained:** Existing append-only audit logging and mandatory written justifications for already-approved actions remain active: capacity hard-block overrides (CPD-004), terminal administrative overrides (CPD-007), and leave workflow audit events and privacy controls (CPD-006).

---

## Product Owner Decisions — 2026-10-11 (Policy Clarification: GATE-01 Evidence & Annual Calendars)

Date: 2026-10-11
Decision:
- GATE-01 external approval evidence references are optional; the decision register is sufficient for Core Pilot governance.
- Annual holiday calendars are separate, preserved records.
- Holiday source and approver/reference are optional metadata.
- A validated holiday list remains required before planning or pilot data loading for its applicable year.

---

## Product Owner Decisions — 2026-10-11 (Policy Clarification: Public-Holiday Calendar Deferral from Implementation)

Date: 2026-10-11
Approver: Vivek (Product Owner)
Decision:
- Public holiday dates are deferred for now and are NOT required to continue implementation, automated testing, local development, or non-production validation.
- Do not enter holiday dates now.
- Do not automatically import, web-scrape, infer, or create placeholder holiday dates.
- The base organization calendar remains `Asia/Kolkata`, Monday–Friday, 8 hours/day.
- Individual approved leave and authorized member-specific calendar exceptions remain supported capacity inputs.
- An authorized administrator will manually enter and validate the applicable annual holiday calendar before production use of holiday-sensitive capacity forecasts.
- The holiday calendar must not block the main implementation sequence.
- GATE-02 is reframed as a production-readiness configuration prerequisite, not an implementation blocker.
- GATE-03 and GATE-04 remain production/go-live prerequisites and are unchanged.
- CPD-009 remains deferred to Operational Hardening; CPD-007 approval status is unchanged.

---

## 1. Ambiguous Requirements

### 1.1 "Product" definition — Resolved (CPD-001)
**PRD reference:** FR-PP-001, PRD § Open Decisions, BR-001
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-001):**
- The pilot product is **EMS ECU Development** — one top-level product in the system covering the full EMS ECU development lifecycle.
- The 14 work areas are **configurable, multi-select Project Work-Area Tags**, not products. A project carries one or more tags. Tags do not create separate product records.
- Sub-products are not supported in Core Pilot; hierarchy is flat at the Product level. Portfolio is optional.

---

### 1.2 Estimate unit is unresolved — Resolved (CPD-002)
**PRD reference:** FR-ACT-005, FR-CAP-004, FR-CAP-005, BR-004, PRD § Open Decisions
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-002):**
- **Hours** is the mandatory and exclusive unit for activity estimates, assignments, remaining effort, capacity, and workload calculations.
- Story points may be stored only as non-calculating reference notes in a secondary field.

---

### 1.3 Actual effort tracking is optional with no governing rule — Resolved (CPD-002)
**PRD reference:** FR-ACT-005, PRD § Open Decisions
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-002):**
- Actual-effort / time tracking is optional per project.
- Remaining effort is the primary progress signal; timesheets are not required for Core Pilot.

---

### 1.4 Assignment approval workflow is undefined — Resolved (CPD-008)
**PRD reference:** FR-CAP-001, Workflow § "New activity to committed plan" step 8, Permissions Matrix
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-008):**
- Project Manager assigns activities within assigned projects (capacity rules enforced). Team Lead reviews team workload. Dual approval countersignatures are deferred to Release 1.1.

---

### 1.5 Configurable status transitions are unspecified — Resolved (CPD-007)
**PRD reference:** FR-ACT-004
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-11)
**Resolution (CPD-007):**
- Seven statuses in Core Pilot: `Draft → Ready for Planning → Planned → In Progress ⇄ Blocked → Done / Cancelled`.
- Immutable transitions: `Blocked ⇄ In Progress` allowed without admin intervention. `Done` and `Cancelled` are terminal statuses; entering Done/Cancelled, revoking `Done → Cancelled`, and reopening require `SYSTEM_ADMIN` override with a recorded reason (≥ 10 characters). Parent activity requires all direct children to be Done or Cancelled before parent can transition to Done. Ordinary backward replanning does not enforce material-change reason prompts in Core Pilot per CPD-009 deferral.

---

### 1.6 "Material change" threshold is not defined — Deferred (CPD-009)
**PRD reference:** BR-011, FR-ACT-005
**Classification:** Deferred to Operational Hardening (CPD-009) — not Core Pilot implementation scope.
**Resolution (CPD-009):**
- Detailed material-change thresholds (date shift >= 3 working days, estimate change >= 20%), ordinary-edit mandatory reason prompts, and configurable material-change interceptors are deferred to MVP Operational Hardening.
- Core Pilot retains append-only `audit_log` records for all mutations and enforces mandatory justifications (≥ 10 characters) strictly for approved actions: CPD-007 terminal administrative overrides, CPD-004 capacity hard-block overrides, and leave workflow events. Ordinary activity edits save without mandatory reason prompts.

---

### 1.7 Progress calculation weighting method is under-specified
**PRD reference:** BR-015, FR-DAS-003, Reporting Definitions ("Project progress")
**Classification:** Missing business rule
**Finding:** BR-015 says "Project progress is calculated from leaf activities using a configured weighting method." The Reporting Definitions confirm "effort by default" but do not define what happens when leaf activities have no estimates, how sub-activity rollup interacts with the parent, or whether the weighting method can be changed after a project starts.
**Required decision:** Confirm the default method (effort-weighted completion), the rule for zero-estimate activities, and whether the method locks at baseline creation.

---

### 1.8 Even-distribution effort-cap behavior is ambiguous — Resolved (CPD-004)
**PRD reference:** FR-CAP-005, PRD § "The distribution rule must be explicit"
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-004):**
- Planned assignment effort is distributed evenly across valid working days without automatic redistribution. High daily load raises weekly utilization and triggers the 90% soft warning or 100% hard block. Zero net capacity with positive load is treated as a hard conflict.

---

### 1.9 Sub-activity depth limit is not defined — Resolved (CPD-007)
**PRD reference:** FR-ACT-002
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-007):**
- Exactly one level of sub-activities is supported in Core Pilot (Activity → Sub-activity; depth = 2). Configurable depth is deferred to Operational Hardening.

---

### 1.10 Pending leave visibility rule is ambiguous — Resolved (CPD-006)
**PRD reference:** FR-RES-004, Workflow § "Leave impact" step 2
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-006):**
- Only approved leave reduces net capacity. Pending leave does not reduce capacity but generates a soft warning on overlapping assignments.

---

## 2. Conflicting Requirements

### 2.1 Assignment permission conflicts between permissions matrix and workflow — Resolved (CPD-008)
**PRD reference:** Permissions Matrix "Assign team member," Workflow § "New activity to committed plan" steps 5–8
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-008):**
- Project Manager assigns activities within assigned projects (capacity rules enforced). Team Lead reviews team workload. Dual-approval / Resource Manager countersignature is deferred to Release 1.1.

---

### 2.2 Leave approval authority conflicts between matrix rows — Resolved (CPD-006)
**PRD reference:** Permissions Matrix "Submit leave" and "Approve leave"
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-006):**
- Team Lead is primary approver for own team members. Resource Manager approves within assigned scope. System Admin approves in all cases.

---

### 2.3 Scenario planning scope conflicts with Release 1 MVP plan
**PRD reference:** FR-CAP-010, Workflow § "Priority change," Release Plan § Release 1 vs. 1.1
**Classification:** Conflicting requirement / Risk
**Finding:** The Release 1 (MVP) plan defers scenario planning to Release 1.1. However, the Priority Change workflow in the main PRD body assumes scenarios exist at MVP ("The manager opens a scenario…"). FR-CAP-010 is tagged "Should" priority, which creates ambiguity about whether it is in scope.
**Required decision:** Confirm whether FR-CAP-010 is in MVP scope. If deferred, define an explicit MVP-level priority-change workflow (preview-then-commit without a full scenario object).

---

### 2.4 Deletion policy is inconsistently applied across entities
**PRD reference:** BR-013, FR-PP-001, FR-RES-012
**Classification:** Ambiguous requirement / Conflicting requirement
**Finding:** BR-013 mandates archive/deactivate rather than physical deletion for master data. However, the PRD does not address whether archived products appear in workload totals, whether archived teams appear in historical capacity reports, or whether draft entities with no history may be hard-deleted.
**Required decision:** Define the full lifecycle state machine for each master entity and specify which states are visible in which contexts.

---

## 3. Missing Business Rules

### 3.1 Assignment effort vs. activity effort mismatch handling
**PRD reference:** BR-005, FR-CAP-002
**Classification:** Missing business rule
**Finding:** BR-005 says the mismatch is allowed only when "a warning is acknowledged or policy permits it" but does not define who acknowledges, whether the warning blocks saving, or whether the mismatch appears as a data-quality defect in dashboards.
**Required decision:** Define the acknowledgment workflow and whether the warning is soft (save allowed) or hard (blocked until resolved).

---

### 3.2 Member deactivation mid-assignment is undefined
**PRD reference:** FR-RES-012, BR-017
**Classification:** Missing business rule
**Finding:** BR-017 blocks new assignments outside employment dates. FR-RES-012 warns about unfinished work but does not specify whether existing assignments are auto-flagged as orphaned, blocked from Done, or require a replacement assignment before deactivation is permitted.
**Required decision:** Define the deactivation workflow: warn-and-block, warn-and-allow-with-reason, or auto-reassign-to-team-placeholder.

---

### 3.3 Cascade rules when an activity is Cancelled
**PRD reference:** BR-008, FR-ACT-004
**Classification:** Missing business rule
**Finding:** BR-008 says cancelled activities consume no future capacity after cancellation. The PRD does not define whether assignments are automatically terminated, whether partial actual effort is preserved, or whether dependencies on a cancelled activity become invalid.
**Required decision:** Define the cascade rules (recommended: assignments terminated at cancellation date, actual effort preserved, successor dependencies flagged as unmet predecessor).

---

### 3.4 Milestone approval with incomplete predecessor activities
**PRD reference:** FR-ACT-009, FR-SCH-004
**Classification:** Missing business rule
**Finding:** The PRD does not define whether a milestone can be approved while contributing activities remain In Progress, or whether gate approvers can override an incomplete predecessor list with a recorded exception.
**Required decision:** Define the milestone approval rule (all contributing activities must be Done, or owner can override with recorded exception).

---

### 3.5 Zero-estimate activity contribution to progress
**PRD reference:** BR-015, Reporting Definitions
**Classification:** Missing business rule
**Finding:** The Reporting Definitions say activities without estimates are "reported separately" but do not say whether they are excluded from the denominator, counted as 0% complete, or flagged as data-quality issues blocking project reporting.
**Required decision:** Define the exact rule (recommended: excluded from numerator and denominator; reported as a separate count in the data-quality indicator).

---

### 3.6 Non-project buffer model
**PRD reference:** FR-CAP-004, FR-RES-002, Net Capacity formula
**Classification:** Missing business rule / Missing data definition
**Finding:** The net-capacity formula includes "reserved non-project hours" and FR-RES-002 mentions "optional planning buffer," but no rule defines who sets this buffer, whether it is a percentage or fixed hours, or what activities qualify as non-project.
**Required decision:** Define the MVP buffer model (recommended: per-member fixed percentage configurable by Resource Manager, defaulting to 0%).

---

## 4. Missing Data Definitions

### 4.1 Proficiency scale
**PRD reference:** FR-RES-005, FR-RES-006, BR-016, FR-RES-007
**Classification:** Missing data definition
**Finding:** The PRD refers to a "proficiency scale" in three places but never defines the scale values. Without a concrete scale, the eligibility rule in FR-RES-008 and the conflict warning in FR-CAP-006 cannot be implemented consistently.
**Required decision:** Define the proficiency scale (recommended: integer 1–5 with labels: 1 Awareness, 2 Basic, 3 Competent, 4 Advanced, 5 Expert), whether it is system-wide or per skill family, and whether it is configurable.

---

### 4.2 Allocation method values for MVP
**PRD reference:** FR-CAP-005, FR-CAP-008, Entity table "Assignment"
**Classification:** Missing data definition
**Finding:** The entity table lists "allocation method" as an Assignment field but MVP allows only even distribution. Allowed values for MVP are not documented, and it is not stated whether the field appears in the UI.
**Required decision:** Define MVP-allowed values (recommended: "Even distribution" only) and document the extension point for later releases.

---

### 4.3 Scheduling constraint semantics
**PRD reference:** FR-ACT-006
**Classification:** Missing data definition
**Finding:** FR-ACT-006 lists four constraints but does not define the default for new activities, the exact semantics of "Fixed Dates" (start locked, finish locked, or both), or how Fixed Date activities interact with dependency propagation (FR-SCH-005 "never moved silently").
**Required decision:** Define default constraint (recommended: As Soon As Possible), confirm Fixed Dates locks both start and finish, and specify the conflict behavior when a dependency pushes into a fixed constraint.

---

### 4.4 Project health indicator calculation
**PRD reference:** FR-PP-007, FR-DAS-001, FR-DAS-003
**Classification:** Missing data definition
**Finding:** FR-PP-007 says the system calculates "schedule, workload, blocker, and data-quality indicators," but the PRD does not specify thresholds, color codes (Green/Amber/Red), formulas, or how dimensions combine into an overall health status.
**Required decision:** Define health indicator bands and threshold rules for each dimension before dashboard UI design begins.

---

### 4.5 Audit log retention period
**PRD reference:** Audit § "Retention configurable by organization policy"
**Classification:** Missing data definition
**Finding:** The PRD says retention is configurable but provides no default. Automotive organizations may have regulatory retention obligations (PPAP records, functional safety evidence).
**Required decision:** Define the default audit retention period (recommended: 3 years minimum for automotive context) and the process for changing it.

---

### 4.6 File attachment limits
**PRD reference:** FR-ACT-011
**Classification:** Missing data definition
**Finding:** FR-ACT-011 mentions "file limits" without specifying maximum file size per attachment, maximum attachments per activity, or allowed MIME types.
**Required decision:** Define default file size limit (e.g., 25 MB per file), total storage quota, and allowed/blocked file types before file-storage design is finalized.

---

## 5. Missing Permission Decisions

### 5.1 "Optional" Project Manager product-creation authority — Resolved (CPD-008)
**PRD reference:** Permissions Matrix "Create product/project," FR-PP-001
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-008):**
- Project Managers cannot create Products. The EMS ECU Development product is seeded / managed by System Admin.

---

### 5.2 Baseline creation scope for Project Managers
**PRD reference:** Permissions Matrix "Create baseline," FR-ACT-013, BR-009
**Classification:** Missing permission decision
**Finding:** The matrix shows Project Manager (Yes) for baseline creation. The PRD does not address whether a Project Manager can baseline another PM's project or whether scope restrictions apply (assigned projects only).
**Required decision:** Confirm that baseline creation is scoped to assigned projects for Project Managers and is global for Portfolio Managers.

---

### 5.3 Hard-conflict override authority — Resolved (CPD-004, CPD-008)
**PRD reference:** Permissions Matrix "Override hard conflict," FR-CAP-007
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-004, CPD-008):**
- System Admin and the relevant Project Manager (within assigned projects only) can override a hard conflict. Written justification reason is mandatory.

---

### 5.4 Leave field-level visibility per role — Resolved (CPD-006)
**PRD reference:** Security § privacy note, PRD § Open Decisions
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-006):**
- Project Manager & Team Member: dates and duration only.
- Team Lead: dates and type for own team members; no reason.
- Resource Manager: full leave record within assigned scope.
- System Admin: full leave records for all users.

---

### 5.5 Audit log "Resource scope" for Resource Manager
**PRD reference:** Permissions Matrix "View audit log"
**Classification:** Missing permission decision
**Finding:** "Resource scope" for Resource Manager in the audit log row is not defined — it is unclear whether this includes all leave records they approved, all assignment records for their team members, or the full resource history within their organizational scope.
**Required decision:** Define the exact audit log scope boundaries for each role.

---

## 6. Missing Scheduling and Capacity Assumptions

### 6.1 Warning and hard-block utilization thresholds — Resolved (CPD-004)
**PRD reference:** FR-CAP-007, PRD § Open Decisions
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-004):**
- Soft warning at 90% planned utilization; hard block at 100% planned utilization.

---

### 6.2 Non-project capacity reservation model — Resolved (CPD-004)
**PRD reference:** FR-CAP-004, FR-RES-002, PRD § Open Decisions
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-004):**
- Default non-project buffer is 0% per member; Resource Manager can configure individual member percentages.

---

### 6.3 Organization working hours and time zone baseline — Resolved (CPD-003)
**PRD reference:** FR-RES-002, FR-RES-003
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Finding:** FR-RES-002 says "Define weekly hours or FTE" and FR-RES-003 says "Define organization holidays, team calendar, member work pattern, time zone." No default working hours per day/week or organization time zone was stated in the PRD.
**Resolution (CPD-003):** Approved by Product Owner, Vivek:
- **Working days:** Monday through Friday (5 days/week)
- **Standard working hours:** 8 hours per day (40 hours/week)
- **Organization time zone:** `Asia/Kolkata`
- **Public holiday calendar:** Pending (GATE-02 production-readiness configuration prerequisite); deferred from implementation, local development, and automated testing; annual calendars are maintained separately per calendar year (prior-year records preserved); an authorized administrator will manually enter and validate the applicable annual holiday list before production use of holiday-sensitive capacity forecasts.

---

### 6.4 MVP dependency type scope
**PRD reference:** FR-ACT-007, FR-SCH-002, FR-DAS-005
**Classification:** Ambiguous requirement
**Finding:** FR-ACT-007 defers Start-to-Start, Finish-to-Finish, and lag/lead to a later release. The Gantt (FR-DAS-005) and scheduling engine (FR-SCH-002) requirements reference "dependencies" generically. It must be confirmed these requirements work correctly with only Finish-to-Start in MVP.
**Required decision:** Confirm that the Gantt and scheduling engine MVP covers only Finish-to-Start and document the extension point for later dependency types.

---

### 6.5 Cross-timezone scheduling behavior
**PRD reference:** BR-014, FR-RES-003, FR-SCH-001
**Classification:** Missing scheduling assumption
**Finding:** BR-014 says timestamps are stored in UTC. If an assignment spans a member in one time zone and a milestone date expressed in another, the working-day boundary behavior (midnight-crossing) is undefined.
**Required decision:** Define whether scheduling uses the member's time zone, the project's time zone, or the organization's time zone for working-day calculations.

---

### 6.6 Stale-update reporting period default
**PRD reference:** FR-EXE-006
**Classification:** Missing scheduling assumption
**Finding:** FR-EXE-006 says "Highlight in-progress work not updated within the configured reporting period" but provides no default value.
**Required decision:** Define the default stale-update threshold (recommended: 7 calendar days) and whether it is configurable per project.

---

## 7. Missing Local Deployment, Backup, and Access Decisions

### 7.1 Network access boundary — Resolved (CPD-010)
**PRD reference:** PRD § Open Decisions
**Classification:** Resolved (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-010):**
- Corporate LAN and VPN access only. No public internet exposure during the pilot.

---

### 7.2 Corporate SSO requirement for MVP — Approved for Pilot; IT Waiver Pending (CPD-010)
**PRD reference:** PRD § Open Decisions, Security § OIDC/LDAP deferred to Release 2
**Classification:** Approved for Pilot; Exception Pending (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-010):**
- Local username/password login approved for Core Pilot, subject to IT granting the SSO waiver.

---

### 7.3 Backup destination and disaster-recovery host — Approved for Pilot; Destination Pending (CPD-010)
**PRD reference:** PRD § Open Decisions, NFR § Availability
**Classification:** Approved for Pilot; Operational Items Pending (Approved by Product Owner, Vivek on 2026-10-10)
**Resolution (CPD-010):**
- Daily backup required, automated where supported, stored separately from application server. Restore test into separate environment required before pilot go-live. Target backup destination, restore drill owner, and scheduled date remain pending from IT.

---

### 7.4 Backup encryption key management
**PRD reference:** Security § "Encrypt backups and secrets at rest"
**Classification:** Missing local deployment decision
**Finding:** The PRD requires backups to be encrypted at rest but does not specify key management (local keyfile, organization key server, HSM). If backup and key reside on the same failed server, recovery is impossible.
**Required decision:** Define backup encryption key storage location and key rotation process before the backup implementation is designed.

---

### 7.5 PostgreSQL backup method (logical dump vs. WAL archiving)
**PRD reference:** NFR § Availability, Architecture § Database guidance
**Classification:** Missing local deployment decision
**Finding:** The PRD says WAL backup is supported "if infrastructure supports it" without specifying the tool (pg_basebackup, pgBackRest, pg_dump, Barman) or whether a streaming replica is expected.
**Required decision:** Confirm with IT the available PostgreSQL backup tooling and decide the backup method before the recovery plan can be validated against the RPO.

---

### 7.6 TLS certificate lifecycle
**PRD reference:** Security § "HTTPS for the full session," Architecture § "reverse proxy terminates TLS"
**Classification:** Missing local deployment decision
**Finding:** The PRD requires HTTPS via a reverse proxy but does not specify whether the certificate is self-signed, issued by an internal corporate CA, or obtained via ACME. Self-signed certificates without proper trust distribution cause browser warnings and break integrations.
**Required decision:** Confirm certificate issuer and distribution process before deployment design is finalized.

---

### 7.7 Formal-approval trigger for baseline creation
**PRD reference:** PRD § Open Decisions ("Which project changes require formal approval or baseline creation?"), BR-009
**Classification:** Open decision
**Finding:** BR-009 says only authorized users may publish a baseline, but does not define what triggers the obligation to create one (first commitment, any committed milestone date change, scope additions over a threshold).
**Required decision:** Define the events that require a new baseline and who must approve each event.

---

### 7.8 First-run administration bootstrap
**PRD reference:** Architecture § Identity and Access module
**Classification:** Missing local deployment decision
**Finding:** The PRD specifies a System Administrator role but does not describe how the first admin account is created (environment variable seed, installer script, first-run wizard), how default credentials are secured, or whether a setup step is part of Docker Compose startup.
**Required decision:** Define the first-run bootstrap procedure and credential security requirements before the deployment runbook can be written.

---

*End of Requirements Decision Log — v0.1*
