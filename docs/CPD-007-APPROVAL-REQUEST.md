# Automotive Project & Resource Management System
## CPD-007 Approval Request

**Document Type:** Formal Decision Approval Package  
**Target Decision:** CPD-007 — Activity Structure and Status Workflow  
**Prepared Date:** 2026-10-10  
**Current Status:** **Pending Formal Product Owner or Delegated Approver Sign-off**  
**Authoritative References:** [docs/CORE-PILOT-DECISIONS.md](file:///c:/DATA/Antigravity/Projects/automotive-project-resource-management/docs/CORE-PILOT-DECISIONS.md#L242), [docs/ROLE-AND-SCOPE-AUTHORIZATION-MATRIX.md](file:///c:/DATA/Antigravity/Projects/automotive-project-resource-management/docs/ROLE-AND-SCOPE-AUTHORIZATION-MATRIX.md), [docs/DATA_MODEL.md](file:///c:/DATA/Antigravity/Projects/automotive-project-resource-management/docs/DATA_MODEL.md)  

---

### 1. What Is Being Approved

Formal sign-off is requested for **CPD-007 (Activity Structure and Status Workflow)**, comprising:
1. **Activity Hierarchy:** Exactly one level of sub-activities supported in Core Pilot (Activity → Sub-activity; maximum depth = 2).
2. **Corrected Activity Status Transition Matrix:** 7 core lifecycle statuses (`Draft`, `Ready for Planning`, `Planned`, `In Progress`, `Blocked`, `Done`, `Cancelled`) with explicit permitted roles, scope checks, preconditions, audit actions, and capacity effects.
3. **CPD-007 Clarifications:**
   * **Terminal Authority:** Strictly restricted to `SYSTEM_ADMIN` ONLY for entering `Done` or `Cancelled`, revoking `Done → Cancelled`, and reopening `Done` or `Cancelled`. Every terminal action is an administrative override requiring a trimmed written justification ≥ 10 characters.
   * **Audit Behavior:** One immutable audit record written per terminal override with core action `OVERRIDE` (standard transitions use `STATUS_CHANGE`) and human-readable metadata event types (`ACTIVITY_COMPLETED`, `ACTIVITY_CANCELLED`, `ACTIVITY_REOPENED`, `ACTIVITY_REVOCATION`).
   * **Single-Transaction Atomic Cancellation:** Cancelling an activity atomically sets status to `Cancelled`, terminates future planned load from cancellation date forward, recalculates capacity, preserves audit/history, and ensures cancelled assignments consume 0 future capacity. Sub-activities retain independent status (no automatic child cascade).
   * **Parent-Child Completion Rule:** A parent activity may transition to `Done` only when every direct child sub-activity is either `Done` or `Cancelled`. Any child in `Draft`, `Ready for Planning`, `Planned`, `In Progress`, or `Blocked` prevents the parent from entering `Done`.
   * **Conditional & Deferred Rules:** No automatic actual-start-date capture in Core Pilot. Backward replanning requires justification only when meeting material-change thresholds (date change: shift of >= 3 working days; estimate change: change of >= 20 percent; assignee change; or priority change on `Planned`/`In Progress`). Entering `Blocked` requires a blocker description; exiting `Blocked → In Progress` optionally records a note.

---

### 2. Why Approval Is Needed

This decision establishes the foundational business logic governing:
- Database-level state validation and state-machine transitions;
- Terminal authority boundaries and administrative override rules;
- Real-time member capacity consumption and immediate load termination upon cancellation;
- Parent rollup and child-completion constraints;
- Immutable audit log tracking for all status modifications.

---

### 3. Decision Requested

The Product Owner or formally delegated authority is requested to:
- **Option A (Approve):** Approve the revised CPD-007 alternative as documented.
- **Option B (Change / Reject):** Reject or modify the proposal by providing a complete approved replacement alternative.

---

### 4. Governance & Approval Control Fields

| Field | Value / Placeholder |
|---|---|
| **Decision ID** | CPD-007 |
| **Decision Title** | Activity Structure and Status Workflow |
| **Decision Outcome** | `[x] Change proposed decision` *(pending sign-off)* |
| **Approved Alternative** | *"Approve CPD-007 with the corrected Activity Status Transition Matrix as the authoritative Core Pilot transition specification, subject to Product Owner or delegated approver sign-off."* |
| **Approver Full Name** | `<Product Owner / Delegated Approver Name to be supplied>` |
| **Approver Role / Title** | `<Product Owner / Delegated Title to be supplied>` |
| **Delegated Authority Confirmation** | `<Confirmation that approver is PO or formally delegated authority>` |
| **Decision Date** | `<Date to be supplied in UTC or Asia/Kolkata format>` |
| **Decision Deadline** | `<Decision deadline to be supplied>` |
| **Approval Evidence / Reference** | `<Required: signed document reference, dated email approval, meeting-minutes ID, or ticket/issue ID>` |
| **Approval Scope Confirmed** | Confirmed: CPD-007 clarifications A–G and corrected Activity Status Transition Matrix |
| **Approved Document Version** | `<Document / revision version approved>` |
| **Conditions / Exceptions** | `<None or specific conditions to be supplied>` |
| **Record Owner** | `<Responsible owner filing approval evidence to be supplied>` |

---

### 5. Implementation Gate

> [!CAUTION]
> **Implementation Gate:**  
> Architecture and implementation work cannot treat CPD-007 as final until formal approval evidence is recorded. Implementation architecture must not begin while any required Core Pilot decision remains unresolved.
