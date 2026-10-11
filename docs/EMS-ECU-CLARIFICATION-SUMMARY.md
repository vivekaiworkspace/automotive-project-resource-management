# EMS ECU Development — Pilot Clarification Summary
## Plain-Language Decision Guide for Product Owner Review

**Prepared:** 2026-10-10  
**Based on:** CORE-PILOT-DECISIONS.md v0.1 (proposals only — nothing approved)  
**Status:** Awaiting your review and answers

> [!IMPORTANT]
> Nothing in this document or in CORE-PILOT-DECISIONS.md has been approved.
> Every "proposal" below is a suggestion that requires your explicit sign-off before
> development starts. Reading this document does not constitute approval of anything.

---

## Your Business Context (Confirmed)

Here is what is confirmed and does not need a decision:

- **The product** is **EMS ECU Development** — the software that manages engine control unit development work.
- **The structure** is: one Product (EMS ECU Development) containing **multiple Projects** under it. Each project represents a body of related work (for example, a vehicle program integration, a calibration project, or a platform feature).
- **The teams** are shared. The same engineers and leads work across several projects at the same time.
- **The purpose** of the pilot application is to:
  - Plan activities and assign people.
  - See whether a person has enough capacity to take on new work, taking into account their leave and their existing commitments on other projects.
  - Track delivery dates and spot at-risk work early.
  - Give managers a clear view of workload and project status — without maintaining multiple spreadsheets.

Everything below follows from this confirmed context.

---

## How This Document Is Organized

Ten decisions are listed below, in the order they need to be made. Each decision is written as a simple question with:

- A plain explanation of why it matters
- What is currently proposed in the planning documents
- Two or three practical options (where choices exist)
- A clearly labelled recommendation

You do not need to answer all ten at once. Read, mark your preferred option or write your own answer on each decision, and return the document. Development cannot start until all ten are answered.

---

## Decision 1 — How should projects be classified under EMS ECU Development?

### The question

When someone creates a new project under EMS ECU Development, what **type** of project is it? Does every project look the same, or should the system distinguish between different kinds — for example, a new vehicle integration, a calibration activity, a platform upgrade, or a software feature?

### Why this matters

The answer determines what **optional fields** appear on a project's setup screen. If all projects are the same type, the form is simple and identical for everyone. If there are different types, each type can show or hide fields relevant to it — for example, a vehicle integration project might show a Start of Production date field, while a software feature project might not need that.

This also affects what the system is called, how data is filtered, and what future automotive template fields (APQP phases, ASIL classification, etc.) attach to.

### What is currently proposed (CPD-001)

The planning documents propose that "Product" is a **configurable category**. For EMS ECU Development as a product, the organization would define what project types exist under it. The system is designed as:

```
EMS ECU Development  (the one Product)
  └── Project  (e.g., "Golf Mk9 EMS Integration", "WLTP Calibration 2025")
        └── Phase  (optional grouping, e.g., "Design", "Verification", "Validation")
              └── Activity  (individual work item)
                    └── Sub-activity  (one level only in Core Pilot)
                          └── Assignment  (person assigned to do the work)
```

### Practical options

**Option A — One type, no classification (simplest)**
All projects under EMS ECU Development look the same. There is no project-type field. Simple and fast to start.
- Advantage: Nothing to configure; immediate pilot start.
- Disadvantage: No way to filter "show me only vehicle-integration projects" vs "show me only calibration projects."

**Option B — A small fixed list of project types (recommended)**
Define 3–5 project types that cover your actual work today. For example:
- Vehicle Program Integration
- Calibration
- Platform / Architecture
- Software Feature
- Internal / Support

Each type shows the same core fields. You can add type-specific fields (like SOP date) later without restructuring.
- Advantage: Enables filtering and grouping in reporting; types can be renamed or extended without a rebuild.
- Disadvantage: Requires you to agree the list before pilot data is seeded.

**Option C — Full automotive category model now**
Configure product categories, APQP gates, ASIL levels, and automotive fields at the start.
- Advantage: Fully ready for automotive governance from day one.
- Disadvantage: Significantly increases setup complexity for a pilot; these features are marked as Post-MVP in the current scope.

> **Recommendation (not an approval):** Option B. Agree a short list of 3–5 project type names that reflect your real categories before the pilot data is entered. Keep the list small — you can add types later.

**Your answer:**

- [ ] Option A — no type classification
- [ ] Option B — a small list of types. My list: ___________________________________
- [ ] Option C — full automotive model now
- [ ] Different answer: ___________________________________________________________

---

## Decision 2 — How do you want to measure and record the size of work?

### The question

When an engineer is assigned an activity, how should its size be measured? In **hours**, or does your team also use story points or some other sizing method?

### Why this matters

The system calculates **how much capacity a person has and how much of it is consumed** by their work. This calculation only works in one unit. Mixing units — for example recording estimates in story points but leave in hours — requires a conversion factor, which introduces error. The unit must be agreed before the first activity is created.

### What is currently proposed (CPD-002)

Hours are the proposed mandatory unit for all planning calculations. Every activity must have an estimate in hours. The fields are:

- **Original estimate** (hours) — set when the activity is planned.
- **Current estimate** (hours) — updated if scope changes; a reason is required for changes above a threshold.
- **Remaining effort** (hours) — updated by the engineer to show how much work is left.
- **Actual effort** (hours) — optional; only tracked if the project chooses to enable it.

Story points may be stored as a note in a free-text field but are not used in any calculation.

### Practical options

**Option A — Hours only (proposed)**
All estimates and capacity figures are in hours. No timesheet required; engineers update remaining effort and forecast finish date.

**Option B — Hours required, but also allow a story-point reference field**
Hours are still the calculation unit. Engineers can additionally record story points in a separate field for sizing discussions, but these drive no calculations.

**Option C — No actual effort tracking; remaining effort is enough**
Engineers do not fill in how many actual hours they have spent. They simply update remaining effort and a forecast finish date. This is simpler and avoids the feeling of a timesheet.

> **Recommendation (not an approval):** Option A + Option C combined. Use hours as the unit, do not require actual-effort timesheets (remaining effort is sufficient for Core Pilot), and optionally add a story-point note field if engineers already use points in planning sessions.

**Your answer:**

- [ ] Option A — hours only, actual effort optional per project
- [ ] Option B — hours as calculation unit, story-point reference field also shown
- [ ] Option C — hours, no actual effort field at all
- [ ] Different answer: ___________________________________________________________

---

## Decision 3 — What are your organization's standard working hours and time zone?

### The question

What are your **standard working days and hours** (e.g., Monday–Friday, 8 hours/day)? And what **time zone** does the organization operate in?

### Why this matters

Every capacity calculation starts here. The system calculates: "This person works X hours per day on Y days per week. They have Z approved leave days. Therefore their available hours this week are W." If the working pattern is wrong, every capacity figure is wrong.

The time zone determines when "today" starts for overdue-task detection and when working days begin for team members.

### What is currently proposed (CPD-003)

The proposed defaults are:

| Setting | Proposed default |
|---|---|
| Working days | Monday – Friday |
| Working hours per day | 8 hours |
| Time zone | **Not yet provided — required from you** |
| Public holidays | **Not yet provided — required from you** |

Individual members can have exceptions (e.g., a specific day off that is not a public holiday).

### What you need to provide

There are no options to choose from here — this is factual information only you can confirm:

1. **Confirm or correct the working pattern:** Is Monday–Friday, 8 hours/day correct for your organization? If your engineers work different hours or include Saturdays, state the actual pattern.
2. **Provide the organization time zone:** For example, `Asia/Kolkata` (IST, UTC+5:30) or `Europe/Berlin` (CET/CEST). If your team spans time zones, state the primary organization time zone; member time zones can be set individually.
3. **Provide the public holiday list:** The list of dates that are non-working days for the organization in the pilot year. These must be entered before any assignments are made.

**Your answer:**

- Working days per week: _______________________________________________________
- Working hours per day: _______________________________________________________
- Organization time zone: _______________________________________________________
- Public holidays list: attached separately / will provide by date: ______________________

---

## Decision 4 — At what point should the system warn or block a person from taking on more work?

### The question

When a planner tries to assign an activity to someone who already has a lot of work scheduled, at what point should the system **warn** them, and at what point should it **stop** them from making the assignment unless they override it?

### Why this matters

This is the core safety rule of the system. Without it, planners can accidentally create impossible workloads, and people end up with more hours assigned than they have available. The system calculates utilization as a percentage of each person's available hours. You need to decide what percentage is "getting full" (warning) and what percentage is "completely full" (block).

### What is currently proposed (CPD-004)

**Capacity formula:**
```
Available hours (per week) =
    (working days this week × hours per day)
  − approved leave hours
  − calendar exceptions (individual non-working days)
  − non-project buffer (if any is configured)
```

**Utilization = (hours assigned this week) ÷ (available hours) × 100**

**Proposed thresholds:**

| Level | Proposed percentage | What happens |
|---|---|---|
| Soft warning | 90% | The system warns the planner but allows the assignment to be saved |
| Hard block | 100% | The system blocks the save; a Project Manager or Admin must override and record a reason |

**Non-project buffer:** Proposed default is 0% (no buffer). If your engineers routinely spend time in meetings, support duties, or non-project work, you can set a percentage per person (e.g., 20%) to reduce their available planning hours. This is a flat reserve — no calendar entries required.

**Special rule:** If someone is entirely on leave for a week and has assignments, the system treats this as a hard conflict. It does not show "infinity percent." This is correct behaviour and cannot be changed.

### Practical options

**Option A — 90% warning / 100% block (proposed)**
Standard practice. Warns when close to full, blocks at exactly full. Strict but fair.

**Option B — 80% warning / 100% block**
More conservative. Engineers are warned earlier, leaving headroom for unexpected work.

**Option C — 90% warning / 110% block**
Allows some planned overload before blocking. Not recommended — it legitimizes overcommitment and the system will not stop it.

> **Recommendation (not an approval):** Option A (90/100). This is the industry standard for planning tools. Set non-project buffer to match the actual percentage of time your engineers spend in non-project activities (meetings, support, admin). If engineers spend approximately 1 day/week on non-project work, set the buffer to 20%.

**Your answer:**

- [ ] Option A — 90% warning / 100% block
- [ ] Option B — 80% warning / 100% block
- [ ] Option C — 90% warning / 110% block
- [ ] Different thresholds: warning at ____% / block at ____%
- Non-project buffer default: 0% / or set to ____% per engineer

---

## Decision 5 — Should the system see a person's workload across all EMS ECU projects at once?

### The question

When a planner assigns work to an engineer on Project A, should the system also show the engineer's existing commitments from Projects B and C — so the overload warning is based on their **total** workload, not just what is in the current project?

### Why this matters

Engineers on EMS ECU Development work across multiple projects simultaneously. If the system only looks at workload within the current project, it is possible to accidentally overload someone whose remaining capacity has already been consumed by their commitments in other projects.

### What is currently proposed (CPD-005)

Two explicit rules are proposed:

**Rule (a) — Utilization is always cross-project:**
When calculating whether an engineer is available, the system adds up all their assignments from all active projects — not just the one the planner is currently working in. An "active project" is any project that is not archived or cancelled.

**Rule (b) — The unassigned-demand list is cross-project:**
The list of activities that need a person assigned (status: Ready for Planning, no assignee yet) shows work from all active projects — not just the one you are currently viewing.

These two rules are what make it possible to show a genuinely accurate picture of whether someone is available.

### Is there a meaningful alternative?

**Single-project view:** The system could be simplified to only look at workload within the open project. This is simpler to build but produces misleading utilization figures for anyone working across projects — which is your entire team.

> **Recommendation (not an approval):** The proposed cross-project rules are correct for your context and should be approved as stated. The single-project alternative would produce dangerously misleading overload figures for shared engineers.

**Your answer:**

- [ ] Approve — load is cross-project; unassigned demand is cross-project
- [ ] Different answer: ___________________________________________________________

---

## Decision 6 — How should leave affect capacity, and who can see leave details?

### The question

There are two parts:

**Part A:** When an engineer submits a leave request, when exactly should that leave reduce their available capacity — immediately on submission, only after a manager approves it, or not at all?

**Part B:** Who is allowed to see why someone is on leave (e.g., sick leave, personal leave, annual leave)? Should project managers be able to see that detail, or only resource/HR managers?

### Why this matters

**Part A** affects how accurate the capacity figures are before leave is approved. If pending leave reduces capacity immediately, planners see a more conservative picture. If only approved leave reduces capacity, planners may not realize someone's availability is about to shrink.

**Part B** is a privacy matter. Knowing that someone is on sick leave is personal health information. The system must not expose that to anyone who does not need it.

### What is currently proposed (CPD-006)

**Part A — Leave and capacity:**

| Leave status | Effect on capacity | Effect on existing assignments |
|---|---|---|
| Pending (submitted, not approved) | **No reduction** — capacity is unchanged | A soft warning appears on any assignment that overlaps the leave dates |
| Approved | **Reduces capacity** for the affected days; conflicts are raised immediately | Hard conflict if the new load would breach the threshold |
| Rejected or cancelled | No reduction; warning is removed | No change |

**Part B — Who can see leave details:**

| Role | What they see |
|---|---|
| Project Manager, Team Member | "Unavailable from [date] to [date]" only — no type, no reason |
| Team Lead | Leave dates and general type (Annual, Sick, etc.) for their own team; no reason |
| Resource Manager | Full record: dates, type, reason, approver — for members in their scope |
| System Admin | Full record for everyone |

Leave approval authority: Team Lead approves for their own team; Resource Manager can approve for any member; System Admin can always approve.

### Practical options for Part A

**Option A — Pending leave: soft warning only (proposed)**
Only approved leave reduces capacity. Pending leave is flagged as a warning so planners are aware of the risk.

**Option B — Pending leave: immediate capacity reduction**
Any submitted leave request immediately reduces committed capacity, regardless of approval. More conservative but may cause false conflicts if leave requests are often rejected.

> **Recommendation (not an approval):** Option A. Approved leave is a fact; pending leave is a request. Show the warning so planners are aware, but only commit the capacity reduction when the request is approved.

**Your answer — Part A:**

- [ ] Option A — only approved leave reduces capacity; pending = soft warning
- [ ] Option B — pending leave also reduces capacity immediately
- [ ] Different answer: ___________________________________________________________

**Your answer — Part B (leave visibility):**

- [ ] Approve the visibility rules as proposed
- [ ] Change: ___________________________________________________________________

---

## Decision 7 — How should activities be structured, and what statuses should they use?

### The question

There are three sub-questions:

1. Can an activity have sub-activities (a breakdown into smaller tasks), and if so, how many levels deep?
2. What are the states an activity moves through (e.g., Not Started → In Progress → Done)?
3. What happens to the work and assignments when an activity is cancelled mid-flight?

### Why this matters

The structure and statuses of activities are the core of the work-management system. Getting them wrong requires a database migration to fix. The system also needs to know exactly what cancelling an activity means for the engineer's workload — does their load instantly free up, or does it stay booked?

### What is currently proposed (CPD-007)

**Sub-activity depth:** One level only in Core Pilot. An activity can have sub-activities, but a sub-activity cannot have its own sub-activities. Example: "Software Integration Testing" → "Unit Test Setup", "Test Execution", "Defect Resolution." This is expandable in later phases.

**Status flow:**

```
Draft → Ready for Planning → Planned → In Progress ⇄ Blocked
                                             ↓              ↓
                                           Done          Done
                                             ↓
                                         Cancelled  (from any active state)
```

Key rules:
- **Blocked ↔ In Progress** can switch back and forth freely. An engineer marks something Blocked when there is an obstacle; a Team Lead or PM marks it back to In Progress when resolved.
- **Done** is final. Moving a Done activity back to active requires a System Admin override with a recorded reason.
- **Cancelled** is permanent. Reopening requires a System Admin override with a recorded reason.

**When an activity is cancelled:**
- All future planned workload for that activity is immediately removed from the engineer's load from the cancellation date onwards.
- Historical records (audit entries, any actual effort already logged) are fully preserved.
- Related assignments show as "cancelled" in the history — they are visible for reference but consume no future capacity.

**When a cancelled activity had successors** (activities that were supposed to start after it finished):
- Successor activities are **not** automatically cancelled or blocked.
- Each successor receives a flag: **"Predecessor cancelled — Project Manager review required."**
- The Project Manager must then decide for each successor: continue as-is, revise its scope/dates, block it, cancel it, or attach it to a different predecessor.
- This review is shown as an Amber warning, not Red Blocked, until the PM decides.

### Practical options

**Option A — One level of sub-activities (proposed)**
Activities can have sub-activities but no deeper nesting. Simple and practical for a pilot.

**Option B — No sub-activities**
Activities are flat — one level only. Even simpler. Choose this if your current process does not break work down into sub-tasks.

**Option C — More levels (not recommended for Core Pilot)**
Two or more levels of nesting. More flexible but significantly increases setup complexity and reporting complexity. Proposed as a future-phase item.

> **Recommendation (not an approval):** Option A. One level of sub-activities is the right balance for a first pilot. If you find you never use sub-activities, you can simply not create them — they are optional.

**Your answer:**

- [ ] Option A — activities and one level of sub-activities
- [ ] Option B — flat activities only, no sub-activities
- [ ] Option C — deeper nesting (note: increases pilot complexity significantly)

**Do the proposed statuses (Draft / Ready for Planning / Planned / In Progress / Blocked / Done / Cancelled) cover your workflow?**

- [ ] Yes — statuses are correct as proposed
- [ ] No — I would add or rename: ________________________________________________

---

## Decision 8 — Who can do what in the system during the pilot?

### The question

Five roles are proposed for the pilot. Does each role's authority match the way your organization actually works? Specifically:
- Who assigns work to engineers?
- Who approves leave?
- Who can override a capacity hard block when there is genuinely no alternative?

### Why this matters

Roles determine who can read, write, approve, and override in the system. A role that is too restrictive blocks real work. A role that is too permissive defeats the purpose of capacity control. The roles must reflect your actual approval chain — not a generic one.

### What is currently proposed (CPD-008)

| Role | What they can do in Core Pilot |
|---|---|
| **System Admin** | Everything: configure, override, approve, manage users |
| **Project Manager** | Full control within their assigned projects. Assign engineers (subject to capacity rules), update any activity, view audit log for their projects. Cannot create the EMS ECU Development product — only Admin can do that. |
| **Team Lead** | Update activities for their team. Approve leave for their own team members. See team workload. Cannot create projects. |
| **Team Member** | Update their own assigned activities only: status, remaining effort, forecast finish, blocker notes. Submit their own leave. |
| **Resource Manager** | Manage team structure, member capacity, and skills. Approve leave for any member in their scope. See full leave records (including reasons). View cross-project workload. Cannot assign activities. |

Additional points:
- One person can hold multiple roles (e.g., a Team Lead who is also a Project Manager on one project).
- A Project Manager only sees the projects they are explicitly assigned to.
- **Leave approval:** Team Lead approves first; Resource Manager approves if no Team Lead or as secondary; System Admin can always approve.
- **Capacity override:** Only System Admin and the responsible Project Manager can override a hard block (they must record a reason).

### Practical options

**Option A — Approve as proposed**
The five roles and their boundaries are correct for your organization.

**Option B — Adjust who approves leave**
If leave approval works differently in your organization (e.g., only HR/Resource Manager approves, Team Lead has no approval authority), state the correct chain.

**Option C — Adjust who can override a capacity conflict**
If Project Managers should not be able to override capacity conflicts, restrict override to System Admin only. Or if Team Leads should also be able to override, include them.

> **Recommendation (not an approval):** Review the Project Manager and Team Lead authority carefully. In an EMS ECU context, the question is whether the person who creates the plan (Project Manager) is the same person who manages the team daily (Team Lead). If they are different people, both roles are needed as proposed. If one person fills both roles, they can be assigned both.

**Your answer:**

- [ ] Option A — roles and authorities approved as proposed
- [ ] Option B — leave approval chain is different: ___________________________________
- [ ] Option C — capacity override authority is different: ______________________________
- [ ] Other changes to role boundaries: _____________________________________________

---

## Decision 9 — When does a change to an activity require a written reason?

### The question

When a Project Manager moves a deadline, changes an estimate, or reassigns an engineer, should the system ask them to explain why — and record that explanation permanently?

### Why this matters

EMS ECU development involves committed delivery dates. If a date slips or scope changes, the organization needs to know why. A recorded reason also discourages casual date-shifting without thought. However, asking for a reason on every small correction is annoying and will cause people to avoid using the system. The threshold defines where the line is.

### What is currently proposed (CPD-009)

A reason is required and saved to the permanent audit log when:

| Change | Threshold |
|---|---|
| Activity due-date moved later or earlier | More than 3 working days |
| Activity start date moved | More than 3 working days |
| Estimated hours changed | More than 20% of the current estimate |
| Assigned engineer changed | Any change, if the activity is Planned or In Progress |
| Activity priority changed | Any change, if the activity is Planned or In Progress |
| Activity marked Cancelled | Always |
| Activity marked Done | Always |
| Capacity hard-block override | Always |

Small corrections (e.g., moving a date by 1 day, correcting a typo in the estimate) save without asking for a reason. An audit row is still written automatically, but no prompt appears.

Reason text must be at least 10 characters (to prevent entries like "x" or "ok").

### Practical options

**Option A — Approve thresholds as proposed (3 working days, 20% effort)**
Balances governance with usability. Minor corrections are silent; significant changes require explanation.

**Option B — Tighter thresholds (e.g., 1 working day, 10% effort)**
More audit trail but more friction for routine planning adjustments.

**Option C — Looser thresholds (e.g., 5 working days, 30% effort)**
Less friction but less accountability. Changes that would raise concern in a real project review may slip through without a recorded reason.

> **Recommendation (not an approval):** Option A. Three working days is roughly half a week — meaningful enough to flag, but tolerant of routine planning adjustments. Adjust after the pilot if the thresholds feel wrong in practice.

**Your answer:**

- [ ] Option A — 3 working days, 20% effort, 10-character minimum reason
- [ ] Option B — tighter thresholds: date shift > ____ days, effort change > ____%
- [ ] Option C — looser thresholds: date shift > ____ days, effort change > ____%
- [ ] Different answer: ___________________________________________________________

---

## Decision 10 — How will the system be installed, accessed, and backed up?

### The question

The system will run on a server inside your organization. Three questions need answers:

1. **Who can access it?** Only people on the internal network / VPN, or also from outside?
2. **Can the pilot use local usernames and passwords**, or does your IT policy require corporate single sign-on (SSO/Active Directory) from day one?
3. **What is the backup arrangement?** Where does the backup copy go, and has a restore been tested before the pilot starts?

### Why this matters

These are not optional — they are go/no-go conditions for the pilot. An application with no backup is a data-loss risk. An application that violates IT security policy cannot be deployed. Knowing the answers before development starts avoids rebuilding authentication or backup mechanisms at the last minute.

### What is currently proposed (CPD-010)

**Access:**
- Internal network and VPN only. No public internet exposure during the pilot.
- All traffic over HTTPS (secure connection). A self-signed certificate is acceptable for the pilot, provided every pilot user's computer is configured to trust it.

**Authentication:**
- Local usernames and passwords during the pilot (no corporate SSO).
- This requires IT to grant an exception for the pilot tool. If IT cannot grant this exception, corporate SSO (Active Directory / LDAP) becomes a pilot blocker and must be built before launch.
- Passwords are stored with strong encryption (Argon2id). Accounts lock after repeated failed login attempts.

**Backup:**
- A daily backup copy of the database is taken automatically.
- The backup copy is stored on a separate server, network share, or NAS — never on the same machine as the application.
- **Before the pilot goes live:** A full restore test must be completed on a separate machine (not the pilot server). This must be signed off in writing by IT or the product owner. An untested backup is not a backup.

### What you need to confirm

1. **Network boundary:** Is LAN + VPN access correct, or do remote users need access without VPN?
2. **SSO waiver:** Will IT grant a waiver allowing local username/password for the pilot? If not, who should be contacted to scope the SSO integration?
3. **Backup destination:** What is available — a NAS, a separate file server, a network share? Who from IT will configure and own the backup destination?
4. **Restore test:** Who will conduct the restore test, and by what date before pilot go-live?

**Your answer:**

- [ ] Network: LAN + VPN only (as proposed)
- [ ] Network: different arrangement: ________________________________________________
- [ ] Authentication: local login is acceptable for pilot (IT waiver in progress / confirmed)
- [ ] Authentication: SSO required — contact: __________________________________________
- [ ] Backup destination confirmed: ___________________________________________________
- [ ] Restore test will be completed by: _________________ conducted by: ________________

---

## Summary — What Is Needed Before Development Starts

| # | Topic | Your input needed |
|---|---|---|
| 1 | Project classification | List of 3–5 project type names under EMS ECU Development |
| 2 | Estimate unit | Confirm hours; confirm whether remaining-effort-only is acceptable |
| 3 | Working calendar | Confirm working days/hours, provide time zone and holiday list |
| 4 | Capacity thresholds | Confirm warning % and block %; confirm non-project buffer % |
| 5 | Cross-project load | Confirm or change the cross-project aggregation rule |
| 6 | Leave rules | Confirm pending-leave behaviour and leave visibility by role |
| 7 | Activity structure | Confirm sub-activity depth and status list |
| 8 | Roles and authority | Confirm or adjust the five role boundaries |
| 9 | Material-change thresholds | Confirm date and effort thresholds that require a reason |
| 10 | Deployment | Confirm network boundary, SSO waiver, backup destination, restore test plan |

> Once all ten are answered, the team will update CORE-PILOT-DECISIONS.md with your approved decisions and development can begin.

---

*End of EMS ECU Clarification Summary — v0.1*
