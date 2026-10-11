# Automotive Project & Resource Management System
## CPD-007 Approval Request

**Document Type:** Formal Decision Approval Package
**Target Decision:** CPD-007 — Activity Structure and Status Workflow
**Prepared Date:** 2026-10-10
**Current Status:** **Approved by Product Owner, Vivek (2026-10-11)**
**Authoritative References:** [docs/CORE-PILOT-DECISIONS.md](file:///c:/DATA/Antigravity/Projects/automotive-project-resource-management/docs/CORE-PILOT-DECISIONS.md#L252), [docs/ROLE-AND-SCOPE-AUTHORIZATION-MATRIX.md](file:///c:/DATA/Antigravity/Projects/automotive-project-resource-management/docs/ROLE-AND-SCOPE-AUTHORIZATION-MATRIX.md), [docs/DATA_MODEL.md](file:///c:/DATA/Antigravity/Projects/automotive-project-resource-management/docs/DATA_MODEL.md)

---

### 1. What Is Being Approved

Formal sign-off is recorded for **CPD-007 (Activity Structure and Status Workflow)**, comprising:
1. **Activity Hierarchy:** Exactly one level of sub-activities supported in Core Pilot (Activity → Sub-activity; maximum depth = 2).
2. **Corrected Activity Status Transition Matrix:** 7 core lifecycle statuses (`Draft`, `Ready for Planning`, `Planned`, `In Progress`, `Blocked`, `Done`, `Cancelled`) with explicit permitted roles, scope checks, preconditions, audit actions, and capacity effects.
3. **CPD-007 Clarifications:**
   * **Terminal Authority:** Strictly restricted to `SYSTEM_ADMIN` ONLY for entering `Done` or `Cancelled`, revoking `Done → Cancelled`, and reopening `Done` or `Cancelled`. Every terminal action is an administrative override requiring a trimmed written justification ≥ 10 characters.
   * **Audit Behavior:** One immutable audit record written per terminal override with core action `OVERRIDE` (standard transitions use `STATUS_CHANGE`) and human-readable metadata event types (`ACTIVITY_COMPLETED`, `ACTIVITY_CANCELLED`, `ACTIVITY_REOPENED`, `ACTIVITY_REVOCATION`).
   * **Single-Transaction Atomic Cancellation:** Cancelling an activity atomically sets status to `Cancelled`, terminates future planned load from cancellation date forward, recalculates capacity, preserves audit/history, and ensures cancelled assignments consume 0 future capacity. Sub-activities retain independent status (no automatic child cascade).
   * **Parent-Child Completion Rule:** A parent activity may transition to `Done` only when every direct child sub-activity is either `Done` or `Cancelled`. Any child in `Draft`, `Ready for Planning`, `Planned`, `In Progress`, or `Blocked` prevents the parent from entering `Done`.
   * **Conditional & Deferred Rules:** No automatic actual-start-date capture in Core Pilot. Any prior proposal for ordinary-edit material-change thresholds (date shift >= 3 working days, estimate change >= 20%, assignee change, priority change) is deferred because CPD-009 is deferred to Operational Hardening. Ordinary backward replanning does not enforce material-change reason prompts in Core Pilot. Entering `Blocked` requires a blocker description; exiting `Blocked → In Progress` optionally records a note.

---

### 2. Why Approval Is Needed

This decision establishes the foundational business logic governing:
- Database-level state validation and state-machine transitions;
- Terminal authority boundaries and administrative override rules;
- Real-time member capacity consumption and immediate load termination upon cancellation;
- Parent rollup and child-completion constraints;
- Immutable audit log tracking for all status modifications.

---

### 3. Decision Recorded

The Product Owner (Vivek) has approved CPD-007 as documented, subject to the CPD-009 deferral:
- **Decision Outcome:** Approved for Core Pilot.

---

### 4. Governance & Approval Control Fields

| Field | Value / Recorded Fact |
|---|---|
| **Decision ID** | CPD-007 |
| **Decision Title** | Activity Structure and Status Workflow |
| **Decision Outcome** | `[x] Approve proposed decision as stated` (Approved for Core Pilot) |
| **Approved Alternative** | Corrected Activity Status Transition Matrix as the authoritative Core Pilot transition specification, subject to CPD-009 deferral |
| **Approver Full Name** | Vivek |
| **Approver Role / Title** | Product Owner |
| **Delegated Authority Confirmation** | Direct Product Owner approval (Vivek) |
| **Decision Date** | 2026-10-11 |
| **Decision Deadline** | Closed / Decided (2026-10-11) |
| **Approval Evidence / Reference** | Product Owner decision recorded in Core Pilot decision register |
| **Approval Scope Confirmed** | Corrected activity status transition matrix and CPD-007 clarifications, subject to the CPD-009 deferral |
| **Approved Document Version** | Core Pilot Decisions v0.1 / CPD-007 Specification |
| **Conditions / Exceptions** | Subject to CPD-009 deferral to Operational Hardening (detailed date/effort material-change thresholds and ordinary-edit reason prompts excluded from Core Pilot) |
| **Record Owner** | Vivek (Product Owner) |

---

### 5. Implementation Gate

> [!NOTE]
> **Implementation Gate Cleared (2026-10-11):**
> CPD-007 is approved by Product Owner Vivek on 2026-10-11. Activity structure, 1-level sub-activity depth, non-linear status workflow, terminal administrative overrides, atomic cancellation, parent-child completion rules, and immutable audit logging are approved for Core Pilot. Ordinary-edit material-change threshold prompts are deferred per CPD-009.
