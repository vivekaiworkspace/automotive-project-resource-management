# Automotive Project & Resource Management System
## Final Pilot Decision Approval Form — EMS ECU Development Core Pilot

**Document Type:** Formal Decision Approval & Governance Gate Form
**Target:** MVP Core Pilot
**Date:** 2026-10-11
**Gating Rule:** Implementation architecture and application development cannot begin while any required Core Pilot decision (CPD-001 through CPD-010) remains unresolved or unevidenced. Decisions cannot be marked approved from discussion alone.
**GATE-01 Governance Scope:** Consolidated Product Owner approval covering CPD-001 through CPD-008 (CPD-009 excluded per Operational Hardening deferral).
**GATE-01 Status:** **Recorded in decision register; awaiting formal evidence reference**
**GATE-02 Intake Status:** **PENDING — Awaiting official 2026 public holiday list submission**

---

### Section 1: Decision Approvals (CPD-001 through CPD-010)

#### CPD-001 — Product Hierarchy & Project Work-Area Tags
* **Proposed Decision:** The data model supports multiple products seeded initially with "EMS ECU Development", with 14 configurable multi-select Project Work-Area Tags that do not create separate product records and flat hierarchy without sub-products.
* **Selection:**
  - [x] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: Vivek
  - Approver Role/Title: Product Owner
  - Delegated-Authority Confirmation: Direct Product Owner approval (Vivek)
  - Decision Date: 2026-10-11
  - Evidence/Reference (signed document, email, minutes, or ticket ID): Product Owner decision recorded in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE]
  - Conditions or Exceptions: None

---

#### CPD-002 — Estimate and Capacity Unit
* **Proposed Decision:** Hours is the mandatory and exclusive unit for all activity effort estimates, assignments, remaining effort, and capacity calculations, with actual effort optional per project and story points reference-only.
* **Selection:**
  - [x] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: Vivek
  - Approver Role/Title: Product Owner
  - Delegated-Authority Confirmation: Direct Product Owner approval (Vivek)
  - Decision Date: 2026-10-11
  - Evidence/Reference (signed document, email, minutes, or ticket ID): Product Owner decision recorded in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE]
  - Conditions or Exceptions: None

---

#### CPD-003 — Organization Calendar
* **Proposed Decision:** Standard working capacity is calculated on Monday through Friday, 8 hours per day, Asia/Kolkata timezone, requiring a validated 2026 public holiday calendar before pilot data is loaded.
* **Selection:**
  - [x] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: Vivek
  - Approver Role/Title: Product Owner
  - Delegated-Authority Confirmation: Direct Product Owner approval (Vivek)
  - Decision Date: 2026-10-11
  - Evidence/Reference (signed document, email, minutes, or ticket ID): Product Owner decision recorded in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE]
  - Conditions or Exceptions: 2026 public holiday calendar list pending from Vivek before pilot data load (GATE-02)

---

#### CPD-004 — Capacity Planning & Overload Thresholds
* **Proposed Decision:** Net capacity is derived dynamically from working days minus approved leave, calendar exceptions, and member buffer, enforcing a 90% soft warning and a 100% hard block requiring a written reason (min 10 chars) to override.
* **Selection:**
  - [x] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: Vivek
  - Approver Role/Title: Product Owner
  - Delegated-Authority Confirmation: Direct Product Owner approval (Vivek)
  - Decision Date: 2026-10-11
  - Evidence/Reference (signed document, email, minutes, or ticket ID): Product Owner decision recorded in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE]
  - Conditions or Exceptions: 90% soft warning; 100% hard block; System Admin / PM written reason override

---

#### CPD-005 — Cross-Project Capacity Aggregation
* **Proposed Decision:** Workload is aggregated in real time across all active projects to calculate true engineer utilization and prevent cross-project resource overloading.
* **Selection:**
  - [x] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: Vivek
  - Approver Role/Title: Product Owner
  - Delegated-Authority Confirmation: Direct Product Owner approval (Vivek)
  - Decision Date: 2026-10-11
  - Evidence/Reference (signed document, email, minutes, or ticket ID): Product Owner decision recorded in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE]
  - Conditions or Exceptions: Active projects = not Archived and not Cancelled

---

#### CPD-006 — Leave Integration & Privacy
* **Proposed Decision:** Only approved leave deducts from capacity, and leave reasons are masked server-side to protect privacy, visible only to Resource Managers in scope and System Admin.
* **Selection:**
  - [x] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: Vivek
  - Approver Role/Title: Product Owner
  - Delegated-Authority Confirmation: Direct Product Owner approval (Vivek)
  - Decision Date: 2026-10-11
  - Evidence/Reference (signed document, email, minutes, or ticket ID): Product Owner decision recorded in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE]
  - Conditions or Exceptions: Approved leave reduces capacity; pending leave displays soft warning on assignments; server-side privacy masking

---

#### CPD-007 — Activity Structure and Status Workflow
* **Proposed Decision:** Activities support one sub-activity level, non-linear status workflow with System Admin-only terminal overrides (Done/Cancelled) and reopenings, single-transaction atomic cancellation, and parent Done blocked until all direct children are Done or Cancelled.
* **Selection:**
  - [x] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: Vivek
  - Approver Role/Title: Product Owner
  - Delegated-Authority Confirmation: Direct Product Owner approval (Vivek)
  - Decision Date: 2026-10-11
  - Evidence/Reference (signed document, email, minutes, or ticket ID): Product Owner decision recorded in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE]
  - Conditions or Exceptions: Approved subject to CPD-009 deferral to Operational Hardening

---

#### CPD-008 — Pilot Roles & Authority Boundaries
* **Proposed Decision:** Access is governed by five roles (System Admin, Project Manager, Team Lead, Team Member, Resource Manager) evaluated as role intersecting with assigned project/team/member scope, with Team Members restricted to viewing own assignments only and Project Managers allowed hard conflict overrides only in assigned projects.
* **Selection:**
  - [x] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: Vivek
  - Approver Role/Title: Product Owner
  - Delegated-Authority Confirmation: Direct Product Owner approval (Vivek)
  - Decision Date: 2026-10-11
  - Evidence/Reference (signed document, email, minutes, or ticket ID): Product Owner decision recorded in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE]
  - Conditions or Exceptions: Scoped PM override authority; Team Member view restricted to own assignments only

---

#### CPD-009 — Material-Change Rules
* **Proposed Decision:** An immutable audit row with a mandatory reason of at least 10 characters was proposed for date shifts of >= 3 working days, estimate changes of >= 20 percent, reassignments or priority changes on active work, cancellations, completions, and capacity overrides.
* **Selection:**
  - [ ] Approve as proposed
  - [x] Deferred to Operational Hardening — not Core Pilot implementation scope
* **Approval Record:**
  - Approver Name: Vivek
  - Approver Role/Title: Product Owner
  - Delegated-Authority Confirmation: Direct Product Owner approval (Vivek)
  - Decision Date: 2026-10-11
  - Evidence/Reference (signed document, email, minutes, or ticket ID): Product Owner decision recorded in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE]
  - Conditions or Exceptions: Deferred to Operational Hardening; excluded from Core Pilot GATE-01 scope; terminal and capacity overrides require reason in Core Pilot

---

#### CPD-010 — Local Pilot Deployment & Backup
* **Proposed Decision:** The system deploys on-premise via Docker Compose on corporate LAN/VPN with local Argon2id authentication, daily off-server pg_dump backups, and a mandatory pre-go-live restore test on a separate host.
* **Selection:**
  - [x] Approve as proposed (with operational prerequisites pending)
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: Vivek
  - Approver Role/Title: Product Owner
  - Delegated-Authority Confirmation: Direct Product Owner approval (Vivek)
  - Decision Date: 2026-10-11
  - Evidence/Reference (signed document, email, minutes, or ticket ID): Product Owner decision recorded in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE]
  - Conditions or Exceptions: Approved with operational prerequisites pending before pilot go-live (GATE-03 IT SSO waiver, GATE-04 designated backup destination & restore drill sign-off)

---

### Section 2: Mandatory Organization-Specific Inputs Confirmation & Holiday Intake (GATE-02)

#### A. Working Calendar Baseline Parameters

| ID | Parameter | Value / Proposal | Status / Required Input |
|---|---|---|---|
| **CPD-003** | Working days per week | Monday – Friday (5 days) | Confirmed baseline |
| **CPD-003** | Working hours per day | 8 hours/day | Confirmed baseline |
| **CPD-003** | Organization time zone | `Asia/Kolkata` | Confirmed baseline |
| **CPD-003** | Pilot-year public-holiday list | 2026 holiday calendar list | **PENDING (GATE-02)** — Awaiting completed intake table below |
| **CPD-004** | Soft-warning threshold | 90% | Confirmed baseline |
| **CPD-004** | Hard-block threshold | 100% | Confirmed baseline |
| **CPD-004** | Default buffer percentage | 0% / member-specific | Confirmed baseline |
| **CPD-006** | Team Lead view leave type | Permitted for own team | Confirmed baseline |
| **CPD-006** | Leave-approval chain | TL (Team) → RM (Scope) → Admin (Global) | Confirmed baseline |
| **CPD-007** | Sub-activity hierarchy | Exactly 1 level (Activity → Sub-activity) | Confirmed baseline |
| **CPD-007** | Core status list | Draft, Ready for Planning, Planned, In Progress, Blocked, Done, Cancelled | Confirmed baseline |
| **CPD-007** | Status transition matrix | Corrected matrix with System Admin terminal overrides | **Approved (2026-10-11)** |
| **CPD-007** | Parent-completion rule | Parent Done requires all direct children to be Done or Cancelled | **Approved (2026-10-11)** |
| **CPD-007** | Approval evidence | Product Owner decision in Core Pilot decision register | **Approved (2026-10-11)** |
| **CPD-008** | Five-role model | System Admin, Project Manager, Team Lead, Team Member, Resource Manager | Confirmed baseline |
| **CPD-008** | PM conflict override | Permitted only within assigned projects with reason ≥ 10 chars | Confirmed baseline |
| **CPD-008** | Team Member visibility | View own assigned activities and assignments only | Confirmed baseline |
| **CPD-009** | Material-change threshold policy | Detailed thresholds (>= 3 working days, >= 20%) & mandatory reasons | **DEFERRED TO OPERATIONAL HARDENING** |
| **CPD-010** | Access boundary | Corporate LAN / VPN only | Confirmed baseline |
| **CPD-010** | Authentication model | Corporate IT SSO waiver for pilot local login | **PENDING (GATE-03)** — Required before pilot go-live |
| **CPD-010** | Backup storage destination | Off-server network share / NAS path | **PENDING (GATE-04)** — Required before pilot go-live |
| **CPD-010** | Restore test verification | Test drill owner and scheduled date | **PENDING (GATE-04)** — Required before pilot go-live |

---

#### B. 2026 India / Asia-Kolkata Public Holiday Intake Form (GATE-02)

**Intake Status:** **PENDING — Awaiting Product Owner Submission**
**Target Organization Time Zone:** `Asia/Kolkata`
**Standard Work Week:** Monday through Friday (5 days/week)
**Standard Daily Hours:** 8.00 hours/day (40 hours/week)

> [!IMPORTANT]
> **Holiday Calendar Intake & Seeding Policy:**
> - **No Placeholder or Assumed Calendars:** Production capacity planning, net-capacity aggregation, and pilot project data seeding must NOT proceed using an assumed, estimated, or web-scraped holiday schedule.
> - **Authoritative Source Mandatory:** The holiday list must be derived strictly from the official corporate/organization holiday calendar published for the calendar year 2026.
> - **Input Scope:** Future database migrations or seed scripts will consume only the validated rows populated in the intake table below. Web-derived or assumed dates are strictly prohibited.

##### 1. Validation Rules
1. **ISO 8601 Date Format:** All dates must be formatted strictly as `YYYY-MM-DD`.
2. **Uniqueness:** Duplicate dates are prohibited across the calendar year.
3. **Working-Day Rule (Weekend Exclusion):** The holiday list must not contain Saturdays or Sundays unless the organization explicitly treats that specific weekend date as working or needs it recorded for documented operational shift schedules.
4. **Scope Confirmation:** Each entry must declare whether it applies organization-wide (`Yes`) or only to specific regional development sites (`No`, with site specified in Notes).
5. **Authorized Confirmation:** The list must be officially signed off by the Product Owner or authorized organizational representative (`[HOLIDAY_LIST_APPROVER]`).
6. **Pre-Seeding Gate:** GATE-02 remains pending until the completed official list is supplied, validated, and signed off.

##### 2. Holiday Calendar Intake Table

The Product Owner (Vivek) or designated organizational representative must complete the table below:

| Holiday Date (YYYY-MM-DD) | Holiday Name | Applies Organization-Wide? (Yes/No) | Working-Day Treatment (Non-Working / Working) | Source or Approval Reference | Notes |
|---|---|---|---|---|---|
| `[HOLIDAY_LIST]` | | | | `[HOLIDAY_LIST_SOURCE]` | |

##### 3. Intake Sign-Off Record

- **Official List Status:** `[HOLIDAY_LIST]` (Pending official list submission)
- **Source Document / Notice Reference:** `[HOLIDAY_LIST_SOURCE]`
- **Confirmed By (Product Owner / HR / Admin):** `[HOLIDAY_LIST_APPROVER]`
- **Verification Date:** `<YYYY-MM-DD>`
- **Database Seeding Permitted:** **NO** (Blocked until this intake table is fully populated and confirmed)

---

### Section 3: Gate Evaluation & Governance Outcome

#### A. Completed Decision Status Table

| CPD ID | Decision Title | Status | Approved Alternative | Approver | Date | Evidence Reference |
|---|---|---|---|---|---|---|
| **CPD-001** | Product Hierarchy & Work-Area Tags | **Recorded in decision register; awaiting formal evidence reference** | Multi-product model; "EMS ECU Development" initial seed; 14 multi-select tags; no sub-products | Vivek (PO) | 2026-10-11 | Product Owner decision in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE] |
| **CPD-002** | Estimate & Capacity Unit | **Recorded in decision register; awaiting formal evidence reference** | Hours mandatory and exclusive unit; actual effort optional; story points reference only | Vivek (PO) | 2026-10-11 | Product Owner decision in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE] |
| **CPD-003** | Organization Calendar | **Recorded in decision register; awaiting formal evidence reference** | Mon–Fri, 8h/day, Asia/Kolkata calendar base; 2026 holiday list required before data load | Vivek (PO) | 2026-10-11 | Product Owner decision in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE] |
| **CPD-004** | Capacity & Overload Thresholds | **Recorded in decision register; awaiting formal evidence reference** | Dynamic capacity; 90% soft warning; 100% hard block with override reason ≥ 10 chars | Vivek (PO) | 2026-10-11 | Product Owner decision in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE] |
| **CPD-005** | Cross-Project Aggregation | **Recorded in decision register; awaiting formal evidence reference** | Real-time workload aggregation across all active projects | Vivek (PO) | 2026-10-11 | Product Owner decision in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE] |
| **CPD-006** | Leave Integration & Privacy | **Recorded in decision register; awaiting formal evidence reference** | Approved leave deducts; server-side privacy masking; RM/Admin view reasons | Vivek (PO) | 2026-10-11 | Product Owner decision in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE] |
| **CPD-007** | Activity Workflow & Transitions | **Recorded in decision register; awaiting formal evidence reference** | One sub-activity level; corrected transition matrix; System Admin terminal overrides; parent Done requires all direct children Done/Cancelled | Vivek (PO) | 2026-10-11 | Product Owner decision in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE] |
| **CPD-008** | Pilot Roles & Scope Boundaries | **Recorded in decision register; awaiting formal evidence reference** | Five-role model; compound role+scope checks; TM view own only; PM override in scope only | Vivek (PO) | 2026-10-11 | Product Owner decision in Core Pilot decision register; formal reference: [APPROVAL_EVIDENCE_REFERENCE] |
| **CPD-009** | Material-Change Audit Rules | **Deferred** | Detailed material-change thresholds and mandatory-reason prompt policy deferred to Operational Hardening | Vivek (PO) | 2026-10-11 | Deferred to Operational Hardening (excluded from GATE-01 scope) |
| **CPD-010** | Local Deployment & Backup | **Approved with operational prerequisites pending** | Docker Compose LAN/VPN deployment; local auth; off-host backup; pre-go-live restore drill | Vivek (PO) | 2026-10-11 | Product Owner decision in Core Pilot decision register; IT confirmations pending (GATE-03/GATE-04) |

---

#### B. Open Operational Gates (Required Before Pilot Go-Live / Data Load)

1. **GATE-01 (Consolidated PO Approval Record):** Status: **Recorded in decision register; awaiting formal evidence reference**. Scope: CPD-001 through CPD-008 (CPD-009 excluded per Operational Hardening deferral). Formal evidence placeholder: `[APPROVAL_EVIDENCE_REFERENCE]`.
2. **GATE-02 (2026 Public Holiday List):** Status: **PENDING**. Organization public holiday list for 2026 (`Asia/Kolkata`) must be provided by Product Owner Vivek via the intake table in Section 2.B before pilot data is loaded and capacity planning begins. Placeholders preserved: `[HOLIDAY_LIST]`, `[HOLIDAY_LIST_SOURCE]`, `[HOLIDAY_LIST_APPROVER]`.
3. **GATE-03 & GATE-04 (CPD-010 IT Confirmations):** Status: **PENDING**. Corporate IT confirmation of LAN/VPN network access / SSO waiver (GATE-03), designated off-server backup storage location, and designated restore-test drill owner/scheduled date (GATE-04) before pilot go-live.

---

#### C. Final Architecture-Gate Result

# **CLEARED WITH CONDITIONS**

**Build Gate Status:**
* **Architecture & Technical Design Baseline:** Approved and cleared for Core Pilot build.
* **Build Authorization:** Build authorized to proceed under the Modular Monolith, PostgreSQL 16, and Docker Compose technical design specifications.
* **Go-Live Conditions:** Subject to resolving formal evidence reference for GATE-01 (`[APPROVAL_EVIDENCE_REFERENCE]`), completed holiday list intake for GATE-02 (`[HOLIDAY_LIST]`), and IT deployment confirmations before pilot data load and go-live.
* **Operational Hardening Deferred Items:** CPD-009 detailed material-change thresholds and mandatory-reason policy, full configurable permissions, corporate SSO, advanced backup/recovery, dependency engine, and dashboards are deferred to MVP Operational Hardening.
