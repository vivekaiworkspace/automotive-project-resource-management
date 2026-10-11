# Next Decisions for Vivek
## EMS ECU Development — Pilot Approval Register & Status

**Status:** **CORE PILOT BUILD GATE: CLEARED WITH CONDITIONS (2026-10-10)**
**Summary:** Build authorized to proceed against technical design baseline. CPD-001 through CPD-008 are approved by Product Owner Vivek (GATE-01 Complete; external approval evidence reference `[APPROVAL_EVIDENCE_REFERENCE]` is optional and does not block go-live). CPD-009 is deferred to Operational Hardening (not awaiting a Core Pilot decision or blocking implementation). Required before go-live / production forecasting: (1) GATE-02 CPD-003 manual annual holiday calendar entry and validation for applicable planning year (2026) before production use of holiday-sensitive capacity forecasts (`[HOLIDAY_LIST]`; deferred during implementation), (2) GATE-03 & GATE-04 CPD-010 IT network access, backup location, and restore drill confirmation.

---

## Confirmed Baseline (No Decisions Needed)

- The single top-level product is **EMS ECU Development** — one product in the system.
- Projects represent specific programs, development streams, or improvements under EMS ECU Development.
- Engineers and teams work across multiple projects simultaneously.
- Planning engine considers capacity, working hours, and approved leave, detecting cross-project overloads in real time.
- The system is self-hosted on the organization's private network (LAN + VPN).

---

## Status of the 10 Core Decisions

---

### CPD-001 — Product Hierarchy & Project Work-Area Tags — APPROVED
**Approved by Vivek on 2026-10-10**

- **Single Product:** **EMS ECU Development** is the single top-level Product for the pilot.
- **Configurable Work-Area Tags:** The 14 items below are configurable, multi-select Project Work-Area Tags, **not Products**. They must **not create separate Product records**.
- **Multi-select tags on Projects:** A project may carry one or more Work-Area Tags simultaneously.
- **Portfolio & Sub-products:** Portfolio remains optional. Sub-products are not supported in Core Pilot; hierarchy is flat at the Product level.

**Approved 14 Work-Area Tags:**
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

---

### CPD-002 — Estimate and Capacity Unit — APPROVED
**Approved by Vivek on 2026-10-10**

- **Hours as mandatory unit:** Hours are the mandatory and exclusive unit for all activity estimates, assignments, remaining effort, capacity, and workload calculations.
- **Progress tracking:** Remaining effort is the primary progress signal; timesheets are not required for Core Pilot.
- **Actual effort:** Actual-effort / time tracking is optional per project.
- **Story points:** Story points may be stored only as non-calculating reference notes in a secondary field; no automatic conversion to hours is provided.

---

### CPD-003 — Organization Calendar — APPROVED
**Approved by Vivek on 2026-10-10**

- **Working days:** Monday through Friday (5 days per week).
- **Working hours:** 8 hours per day (40 hours per week base capacity).
- **Organization time zone:** `Asia/Kolkata`.
- **Public holiday calendar:** **Production-readiness configuration prerequisite (GATE-02);** Public holiday dates are deferred for now and do not block implementation, automated testing, local development, or non-production validation. Holiday calendars are maintained separately per calendar year (prior-year records preserved). An authorized administrator will manually enter and validate the applicable annual holiday list before production use of holiday-sensitive capacity forecasts. Holiday source (`[HOLIDAY_LIST_SOURCE]`) and approver/reference (`[HOLIDAY_LIST_APPROVER]`) are optional metadata; their absence does not invalidate an otherwise authorized holiday calendar.

---

### CPD-004 — Capacity Warning & Hard Block Thresholds — APPROVED
**Approved by Vivek on 2026-10-10**

- **Soft warning:** 90% planned weekly utilization triggers a visible warning; assignment can still be saved.
- **Hard block:** 100% planned weekly utilization blocks the save.
- **Override authority:** Hard block override restricted to **System Admin** and the relevant **Project Manager** (for activities within assigned projects), with mandatory written justification in the audit log.
- **Non-project buffer:** 0% default buffer per member. Resource Manager may configure a custom percentage for individual members with significant meeting/admin load.

---

### CPD-005 — Cross-Project Load Aggregation — APPROVED
**Approved by Vivek on 2026-10-10**

- **Mandatory cross-project aggregation:** Every assignment must check the member's total commitments across all active pilot projects (not only the project currently open).
- **Active project definition:** Any project that is not Archived and not Cancelled.
- **Unassigned demand:** The unassigned Ready-for-Planning list must display all unassigned work across all active pilot projects.

---

### CPD-006 — Leave Rules & Privacy Tiers — APPROVED
**Approved by Vivek on 2026-10-10**

- **Leave effect:** Only approved leave reduces net capacity. Pending leave does not reduce capacity but displays a soft warning on overlapping assignments.
- **Leave visibility:**
  - *Project Manager & Team Member:* Unavailable dates and duration only (no leave type, no reason).
  - *Team Lead:* Dates and leave type (e.g., Annual, Sick) for own team members; no reason.
  - *Resource Manager:* Full record including leave reason for members within assigned resource scope.
  - *System Admin:* Full record for all members.
- **Leave approval authority:**
  - Team Lead approves for own team members.
  - Resource Manager approves for members within assigned scope.
  - System Admin approves for any user.

---

### CPD-007 — Activity Structure & Lifecycle Statuses — APPROVED
**Approved by Vivek on 2026-10-11**

- **Sub-activity depth:** Exactly one level of sub-activities supported (Activity → Sub-activity).
- **Statuses:** `Draft → Ready for Planning → Planned → In Progress ⇄ Blocked → Done` or `Cancelled`.
- **Terminal authority:** Only `SYSTEM_ADMIN` can move an activity into Done, Cancelled, perform Done → Cancelled, or reopen Done/Cancelled (all require administrative override and trimmed justification ≥ 10 chars).
- **Audit:** Action `OVERRIDE` for terminal transitions/reopenings, `STATUS_CHANGE` for normal transitions; metadata events `ACTIVITY_COMPLETED`, `ACTIVITY_CANCELLED`, `ACTIVITY_REOPENED`, `ACTIVITY_REVOCATION`.
- **Cancellation rule:** Single-transaction atomic cancellation; ends future planned load from cancellation date forward; preserves history/audit; no future capacity consumed; sub-activities keep independent status.
- **Parent/child completion:** A parent activity may transition to Done only when every direct child sub-activity is either Done or Cancelled. Any child in Draft, Ready for Planning, Planned, In Progress, or Blocked prevents the parent from entering Done.
- **Deferred/conditional:** No automatic actual-start-date capture in Core Pilot; material-change threshold enforcement for ordinary edits deferred per CPD-009.

---

### CPD-008 — Pilot Roles and Authority — APPROVED
**Approved by Vivek on 2026-10-10**

- **Five pilot roles:** System Admin, Project Manager, Team Lead, Team Member, Resource Manager.
- **Role authority:** Authority boundaries enforced as proposed in the decision register.
- **Conflict override:** Project Manager can override a capacity hard block only in their assigned projects, with recorded reason.
- **Multiple roles:** A person may hold more than one role simultaneously.

---

### CPD-009 — Material-Change Audit Rules — DEFERRED TO OPERATIONAL HARDENING
**Status:** Deferred to Operational Hardening — not Core Pilot implementation scope.

- Detailed material-change thresholds (shift of >= 3 working days, estimate change of >= 20 percent), ordinary-edit mandatory-reason prompts, and configurable material-change thresholds are deferred to MVP Operational Hardening.
- CPD-009 is not awaiting a Core Pilot decision and is not a Core Pilot implementation blocker.
- Core Pilot maintains underlying append-only `audit_log` schema for state changes and administrative overrides (terminal status overrides, capacity hard-block overrides, leave events), but field-level prompt/validation logic is excluded from Core Pilot build gate.

---

### CPD-010 — Pilot Deployment & Backup — APPROVED (Prerequisites Pending)
**Approved by Vivek on 2026-10-10**

- **Network boundary:** Corporate LAN and VPN only; no public internet exposure during pilot.
- **Authentication:** Local username/password login for pilot, subject to IT granting an SSO waiver.
- **Stack:** PostgreSQL database and Docker Compose single-server deployment.
- **Backup:** Daily backup, automated where IT infrastructure supports it, stored separately from the application server.
- **Pre-pilot restore drill:** Successful documented restore test on a separate machine required before pilot go-live.

---

## Approved Checklist & Pending Operational Items

```
PILOT DECISION APPROVAL REGISTER
Approver: Vivek (Product Owner)

[x] CPD-001 — Product hierarchy & 14 Work-Area Tags (Approved 2026-10-10)
[x] CPD-002 — Mandatory hours unit & remaining effort progress signal (Approved 2026-10-10)
[x] CPD-003 — Working calendar: Mon–Fri, 8h/day, Asia/Kolkata (Approved 2026-10-10)
[x] CPD-004 — Capacity thresholds: 90% warning, 100% block, 0% default buffer (Approved 2026-10-10)
[x] CPD-005 — Mandatory cross-project load aggregation (Active = not Archived/Cancelled) (Approved 2026-10-10)
[x] CPD-006 — Leave rules: approved leave reduces capacity, role-based visibility tiers (Approved 2026-10-10)
[x] CPD-007 — Activity structure: 1 sub-task level, 7 statuses, terminal reopening rule (Approved 2026-10-11)
[x] CPD-008 — Five pilot roles & scoped PM override authority (Approved 2026-10-10)
[-] CPD-009 — Material change audit thresholds (Deferred to Operational Hardening; not Core Pilot scope)
[x] CPD-010 — Local deployment: LAN+VPN, PostgreSQL, Docker Compose, separate backup (Approved 2026-10-10)

GATE STATUS & OPERATIONAL PREREQUISITES:
[x] GATE-01 — Consolidated PO approval record covering CPD-001 through CPD-008 (Complete — Product Owner decisions CPD-001 through CPD-008 are recorded in the Core Pilot decision register. External approval evidence reference [APPROVAL_EVIDENCE_REFERENCE] is optional and may be added when available; CPD-009 excluded per deferral)
[ ] GATE-02 — Annual holiday calendar configuration (Production-readiness prerequisite; deferred from implementation; manual entry and validation required before production use of holiday-sensitive capacity forecasts for applicable planning year 2026; [HOLIDAY_LIST]; source [HOLIDAY_LIST_SOURCE] and approver [HOLIDAY_LIST_APPROVER] optional metadata; prior-year records preserved)
[ ] GATE-03 — IT confirmation of local-login / SSO exception
[ ] GATE-04 — Designated backup storage location / network share & restore drill sign-off
```

---

*End of Next Decisions for Vivek — Approval Register v1.0*
