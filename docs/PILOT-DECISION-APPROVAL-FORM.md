# Automotive Project & Resource Management System
## Final Pilot Decision Approval Form — EMS ECU Development Core Pilot

**Document Type:** Formal Decision Approval & Governance Gate Form  
**Target:** MVP Core Pilot  
**Date:** 2026-10-10  
**Gating Rule:** Implementation architecture and application development cannot begin while any required Core Pilot decision (CPD-001 through CPD-010) remains unresolved or unevidenced. Decisions cannot be marked approved from discussion alone.  

---

### Section 1: Decision Approvals (CPD-001 through CPD-010)

#### CPD-001 — Product Hierarchy & Project Work-Area Tags
* **Proposed Decision:** The data model supports multiple products seeded initially with "EMS ECU Development", with 14 configurable multi-select Project Work-Area Tags that do not create separate product records and flat hierarchy without sub-products.
* **Selection:**
  - [ ] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: `<To be supplied>`
  - Approver Role/Title: `<To be supplied>`
  - Delegated-Authority Confirmation: `<Confirmed / N/A>`
  - Decision Date: `<Date>`
  - Evidence/Reference (signed document, email, minutes, or ticket ID): `<To be supplied>`
  - Conditions or Exceptions: `<None or details>`

---

#### CPD-002 — Estimate and Capacity Unit
* **Proposed Decision:** Hours is the mandatory and exclusive unit for all activity effort estimates, assignments, remaining effort, and capacity calculations, with actual effort optional per project and story points reference-only.
* **Selection:**
  - [ ] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: `<To be supplied>`
  - Approver Role/Title: `<To be supplied>`
  - Delegated-Authority Confirmation: `<Confirmed / N/A>`
  - Decision Date: `<Date>`
  - Evidence/Reference (signed document, email, minutes, or ticket ID): `<To be supplied>`
  - Conditions or Exceptions: `<None or details>`

---

#### CPD-003 — Organization Calendar
* **Proposed Decision:** Standard working capacity is calculated on Monday through Friday, 8 hours per day, Asia/Kolkata timezone, requiring a validated 2026 public holiday calendar before pilot data is loaded.
* **Selection:**
  - [ ] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: `<To be supplied>`
  - Approver Role/Title: `<To be supplied>`
  - Delegated-Authority Confirmation: `<Confirmed / N/A>`
  - Decision Date: `<Date>`
  - Evidence/Reference (signed document, email, minutes, or ticket ID): `<To be supplied>`
  - Conditions or Exceptions: `<None or details>`

---

#### CPD-004 — Capacity Planning & Overload Thresholds
* **Proposed Decision:** Net capacity is derived dynamically from working days minus approved leave, calendar exceptions, and member buffer, enforcing a 90% soft warning and a 100% hard block requiring a written reason (min 10 chars) to override.
* **Selection:**
  - [ ] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: `<To be supplied>`
  - Approver Role/Title: `<To be supplied>`
  - Delegated-Authority Confirmation: `<Confirmed / N/A>`
  - Decision Date: `<Date>`
  - Evidence/Reference (signed document, email, minutes, or ticket ID): `<To be supplied>`
  - Conditions or Exceptions: `<None or details>`

---

#### CPD-005 — Cross-Project Capacity Aggregation
* **Proposed Decision:** Workload is aggregated in real time across all active projects to calculate true engineer utilization and prevent cross-project resource overloading.
* **Selection:**
  - [ ] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: `<To be supplied>`
  - Approver Role/Title: `<To be supplied>`
  - Delegated-Authority Confirmation: `<Confirmed / N/A>`
  - Decision Date: `<Date>`
  - Evidence/Reference (signed document, email, minutes, or ticket ID): `<To be supplied>`
  - Conditions or Exceptions: `<None or details>`

---

#### CPD-006 — Leave Integration & Privacy
* **Proposed Decision:** Only approved leave deducts from capacity, and leave reasons are masked server-side to protect privacy, visible only to Resource Managers in scope and System Admin.
* **Selection:**
  - [ ] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: `<To be supplied>`
  - Approver Role/Title: `<To be supplied>`
  - Delegated-Authority Confirmation: `<Confirmed / N/A>`
  - Decision Date: `<Date>`
  - Evidence/Reference (signed document, email, minutes, or ticket ID): `<To be supplied>`
  - Conditions or Exceptions: `<None or details>`

---

#### CPD-007 — Activity Structure and Status Workflow
* **Proposed Decision:** Activities support one sub-activity level, non-linear status workflow with System Admin-only terminal overrides (Done/Cancelled) and reopenings, single-transaction atomic cancellation, and parent Done blocked until all direct children are Done or Cancelled.
* **Selection:**
  - [ ] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: `<To be supplied>`
  - Approver Role/Title: `<To be supplied>`
  - Delegated-Authority Confirmation: `<Confirmed / N/A>`
  - Decision Date: `<Date>`
  - Evidence/Reference (signed document, email, minutes, or ticket ID): `<To be supplied>`
  - Conditions or Exceptions: `<None or details>`

---

#### CPD-008 — Pilot Roles & Authority Boundaries
* **Proposed Decision:** Access is governed by five roles (System Admin, Project Manager, Team Lead, Team Member, Resource Manager) evaluated as role intersecting with assigned project/team/member scope, with Team Members restricted to viewing own assignments only and Project Managers allowed hard conflict overrides only in assigned projects.
* **Selection:**
  - [ ] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: `<To be supplied>`
  - Approver Role/Title: `<To be supplied>`
  - Delegated-Authority Confirmation: `<Confirmed / N/A>`
  - Decision Date: `<Date>`
  - Evidence/Reference (signed document, email, minutes, or ticket ID): `<To be supplied>`
  - Conditions or Exceptions: `<None or details>`

---

#### CPD-009 — Material-Change Rules
* **Proposed Decision:** An immutable audit row with a mandatory reason of at least 10 characters is required for date shifts of >= 3 working days, estimate changes of >= 20 percent, reassignments or priority changes on active work, cancellations, completions, and capacity overrides.
* **Selection:**
  - [ ] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: `<To be supplied>`
  - Approver Role/Title: `<To be supplied>`
  - Delegated-Authority Confirmation: `<Confirmed / N/A>`
  - Decision Date: `<Date>`
  - Evidence/Reference (signed document, email, minutes, or ticket ID): `<To be supplied>`
  - Conditions or Exceptions: `<None or details>`

---

#### CPD-010 — Local Pilot Deployment & Backup
* **Proposed Decision:** The system deploys on-premise via Docker Compose on corporate LAN/VPN with local Argon2id authentication, daily off-server pg_dump backups, and a mandatory pre-go-live restore test on a separate host.
* **Selection:**
  - [ ] Approve as proposed
  - [ ] Change — provide complete replacement decision:
* **Approval Record:**
  - Approver Name: `<To be supplied>`
  - Approver Role/Title: `<To be supplied>`
  - Delegated-Authority Confirmation: `<Confirmed / N/A>`
  - Decision Date: `<Date>`
  - Evidence/Reference (signed document, email, minutes, or ticket ID): `<To be supplied>`
  - Conditions or Exceptions: `<None or details>`

---

### Section 2: Mandatory Organization-Specific Inputs Confirmation

| ID | Parameter | Value / Proposal | Status / Required Input |
|---|---|---|---|
| **CPD-003** | Working days per week | Monday – Friday (5 days) | Confirmed proposal |
| **CPD-003** | Working hours per day | 8 hours/day | Confirmed proposal |
| **CPD-003** | Organization time zone | `Asia/Kolkata` | Confirmed proposal |
| **CPD-003** | Pilot-year public-holiday list | 2026 holiday calendar list | **MISSING / BLOCKED** (Vivek to provide) |
| **CPD-004** | Soft-warning threshold | 90% | Confirmed proposal |
| **CPD-004** | Hard-block threshold | 100% | Confirmed proposal |
| **CPD-004** | Default buffer percentage | 0% / member-specific | Confirmed proposal |
| **CPD-006** | Team Lead view leave type | Permitted for own team | Confirmed proposal |
| **CPD-006** | Leave-approval chain | TL (Team) → RM (Scope) → Admin (Global) | Confirmed proposal |
| **CPD-007** | Sub-activity hierarchy | Exactly 1 level (Activity → Sub-activity) | Confirmed proposal |
| **CPD-007** | Core status list | Draft, Ready for Planning, Planned, In Progress, Blocked, Done, Cancelled | Confirmed proposal |
| **CPD-007** | Status transition matrix | Corrected matrix with System Admin terminal overrides | **PENDING FORMAL SIGN-OFF** |
| **CPD-007** | Parent-completion rule | Parent Done requires all direct children to be Done or Cancelled | **PENDING FORMAL SIGN-OFF** |
| **CPD-007** | Approval evidence | Reference ID | **Required before pilot go-live** (PO approval covering CPD-001–CPD-008) |
| **CPD-008** | Five-role model | System Admin, Project Manager, Team Lead, Team Member, Resource Manager | Confirmed proposal |
| **CPD-008** | PM conflict override | Permitted only within assigned projects with reason ≥ 10 chars | Confirmed proposal |
| **CPD-008** | Team Member visibility | View own assigned activities and assignments only | Confirmed proposal |
| **CPD-009** | Material-change threshold policy | Detailed thresholds (>= 3 working days, >= 20%) & mandatory reasons | **DEFERRED TO OPERATIONAL HARDENING** |
| **CPD-010** | Access boundary | Corporate LAN / VPN only | Confirmed proposal |
| **CPD-010** | Authentication model | Corporate IT SSO waiver for pilot local login | **Required before pilot go-live** |
| **CPD-010** | Backup storage destination | Off-server network share / NAS path | **Required before pilot go-live** |
| **CPD-010** | Restore test verification | Test drill owner and scheduled date | **Required before pilot go-live** |

---

### Section 3: Gate Evaluation & Governance Outcome

#### A. Completed Decision Status Table

| CPD ID | Decision Title | Status | Approved Alternative | Approver | Date | Evidence Reference |
|---|---|---|---|---|---|---|
| **CPD-001** | Product Hierarchy & Work-Area Tags | **Cleared (Gated)** | Multi-product model; "EMS ECU Development" initial seed; 14 multi-select tags; no sub-products | Vivek (PO) | 2026-10-10 | Consolidated PO record required before go-live |
| **CPD-002** | Estimate & Capacity Unit | **Cleared (Gated)** | Hours mandatory and exclusive unit; actual effort optional; story points reference only | Vivek (PO) | 2026-10-10 | Consolidated PO record required before go-live |
| **CPD-003** | Organization Calendar | **Cleared (Gated)** | Mon–Fri, 8h/day, Asia/Kolkata calendar base; 2026 holiday list required before data load | Vivek (PO) | 2026-10-10 | Consolidated PO record required before go-live |
| **CPD-004** | Capacity & Overload Thresholds | **Cleared (Gated)** | Dynamic capacity; 90% soft warning; 100% hard block with override reason ≥ 10 chars | Vivek (PO) | 2026-10-10 | Consolidated PO record required before go-live |
| **CPD-005** | Cross-Project Aggregation | **Cleared (Gated)** | Real-time workload aggregation across all active projects | Vivek (PO) | 2026-10-10 | Consolidated PO record required before go-live |
| **CPD-006** | Leave Integration & Privacy | **Cleared (Gated)** | Approved leave deducts; server-side privacy masking; RM/Admin view reasons | Vivek (PO) | 2026-10-10 | Consolidated PO record required before go-live |
| **CPD-007** | Activity Workflow & Transitions | **Cleared (Gated)** | One sub-activity level; corrected transition matrix; System Admin terminal overrides; parent Done requires all direct children Done/Cancelled | Vivek (PO) | 2026-10-10 | Consolidated PO record required before go-live |
| **CPD-008** | Pilot Roles & Scope Boundaries | **Cleared (Gated)** | Five-role model; compound role+scope checks; TM view own only; PM override in scope only | Vivek (PO) | 2026-10-10 | Consolidated PO record required before go-live |
| **CPD-009** | Material-Change Audit Rules | **Deferred** | Detailed material-change thresholds and mandatory-reason prompt policy deferred to Operational Hardening | N/A | N/A | Deferred to Operational Hardening |
| **CPD-010** | Local Deployment & Backup | **Cleared (Gated)** | Docker Compose LAN/VPN deployment; local auth; off-host backup; pre-go-live restore drill | Vivek (PO) | 2026-10-10 | IT confirmation required before go-live |

---

#### B. Open Blockers (Conditions Required Before Pilot Go-Live / Data Load)

1. **Pre-Go-Live Condition 1 (PO Approval Record):** One formal Product Owner approval record covering CPD-001 through CPD-008 (excluding CPD-009) must be filed prior to pilot go-live.
2. **Pre-Data-Load Condition 2 (CPD-003 Holiday List):** Organization public holiday list for 2026 (`Asia/Kolkata`) must be provided by Vivek before pilot data is loaded and capacity planning begins.
3. **Pre-Go-Live Condition 3 (CPD-010 IT Confirmations):** Corporate IT confirmation of LAN/VPN network access, designated off-server backup storage location, and designated restore-test drill owner/scheduled date before pilot go-live.

---

#### C. Final Architecture-Gate Result

# **CLEARED WITH CONDITIONS**

**Build Gate Status:**  
* **Architecture & Technical Design Baseline:** Approved and cleared for Core Pilot build.
* **Build Authorization:** Build authorized to proceed under the Modular Monolith, PostgreSQL 16, and Docker Compose technical design specifications.
* **Go-Live Conditions:** Subject to filing the consolidated PO approval record (CPD-001–CPD-008), the 2026 holiday calendar, and IT deployment confirmations before pilot data load and go-live.
* **Operational Hardening Deferred Items:** CPD-009 detailed material-change thresholds and mandatory-reason policy, full configurable permissions, corporate SSO, advanced backup/recovery, dependency engine, and dashboards are deferred to MVP Operational Hardening.
