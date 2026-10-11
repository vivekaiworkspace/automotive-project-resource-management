# Automotive Project & Resource Management System
## REST API Specification — MVP Core Pilot

**Document Version:** 1.0  
**Status:** Approved Technical Design  
**Authoritative Sources:** PRD.md v1.0, docs/MVP-SCOPE.md, docs/CORE-PILOT-DECISIONS.md, docs/ARCHITECTURE.md, docs/DATA_MODEL.md  

---

## 1. Global API Conventions

### 1.1 Base URL & Content Type
* Base URL: `https://<host>/api/v1`
* Request and response body: `application/json`
* Character encoding: `UTF-8`

### 1.2 Authentication & Session Context
* Authentication is managed via secure, HTTP-only session cookies (`session_id`).
* Every authenticated request automatically attaches the authenticated user identity, their assigned roles, and their project/team authorization scopes.

### 1.3 Standard Error Response Envelope
All non-2xx responses return a consistent error structure:
```json
{
  "error": {
    "code": "CAPACITY_HARD_CONFLICT",
    "message": "Proposed assignment would cause engineer utilization to reach 115.00%, exceeding the 100% hard block threshold.",
    "correlation_id": "c7a840e6-81cf-49b8-b4b1-845187e1f409",
    "details": {
      "member_id": "9d18c942-2d12-4277-bf30-8c9038228511",
      "week_start": "2026-10-12",
      "planned_utilization": 115.00,
      "threshold": 100.00,
      "requires_override": true
    }
  }
}
```

---

## 2. Authentication & User Endpoints (CPD-010)

### 2.1 User Login
* **Endpoint:** `POST /api/v1/auth/login`
* **Access:** Public (Rate-limited: 5 attempts per minute per IP)
* **Request:**
```json
{
  "email": "vivek.pm@example.com",
  "password": "CorrectHorseBatteryStaple123!"
}
```
* **Response (200 OK):**
```json
{
  "user": {
    "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
    "email": "vivek.pm@example.com",
    "full_name": "Vivek Thakur",
    "roles": ["PROJECT_MANAGER"],
    "scopes": [
      { "scope_type": "PROJECT", "target_id": "550e8400-e29b-41d4-a716-446655440000" }
    ]
  }
}
```
*Sets `Set-Cookie: session_id=...; HttpOnly; Secure; SameSite=Strict; Path=/`*

### 2.2 User Logout
* **Endpoint:** `POST /api/v1/auth/logout`
* **Access:** Authenticated (Any role)
* **Response (204 No Content)**

---

## 3. Product & Project Catalog Endpoints (CPD-001, CPD-008)

### 3.1 List Products
* **Endpoint:** `GET /api/v1/products`
* **Access:** Authenticated (All roles)
* **Response (200 OK):**
```json
{
  "data": [
    {
      "id": "11111111-2222-3333-4444-555555555555",
      "code": "PROD-EMS-ECU",
      "name": "EMS ECU Development",
      "product_type": "EMS ECU",
      "status": "ACTIVE",
      "business_priority": 1
    }
  ]
}
```

### 3.2 Create Product (Restricted)
* **Endpoint:** `POST /api/v1/products`
* **Access:** `SYSTEM_ADMIN` only (CPD-008: Project Managers cannot create products)
* **Request:**
```json
{
  "code": "PROD-BATT-MGMT",
  "name": "Battery Management System",
  "product_type": "BMS ECU",
  "business_priority": 2
}
```
* **Response (201 Created)**

### 3.3 List Work-Area Tags (CPD-001)
* **Endpoint:** `GET /api/v1/work-area-tags`
* **Access:** Authenticated (All roles)
* **Response (200 OK):** Returns the 14 approved configurable tags.

### 3.4 Create Project
* **Endpoint:** `POST /api/v1/projects`
* **Access:** `SYSTEM_ADMIN`
* **Request:**
```json
{
  "product_id": "11111111-2222-3333-4444-555555555555",
  "code": "PRJ-EMS-GEN3",
  "name": "Gen-3 EMS ECU Core Program",
  "project_manager_id": "9d18c942-2d12-4277-bf30-8c9038228511",
  "planned_start_date": "2026-11-01",
  "planned_finish_date": "2027-06-30",
  "work_area_tag_ids": [
    "tag-id-1-customer-prog",
    "tag-id-4-base-sw",
    "tag-id-5-app-sw",
    "tag-id-10-validation"
  ]
}
```
* **Response (201 Created)**

---

## 4. Activity Management Endpoints (CPD-007, CPD-009)

### 4.1 Create Activity
* **Endpoint:** `POST /api/v1/projects/{project_id}/activities`
* **Access:** `PROJECT_MANAGER` (scoped to project), `SYSTEM_ADMIN`
* **Request:**
```json
{
  "title": "BSW CAN Communication Stack Integration",
  "parent_activity_id": null,
  "activity_type": "Base Software",
  "priority": "HIGH",
  "owner_id": "9d18c942-2d12-4277-bf30-8c9038228511",
  "original_estimate_hours": 64.00,
  "start_date": "2026-11-02",
  "due_date": "2026-11-20"
}
```
* **Response (201 Created):** Returns created activity with generated `code: "PRJ-EMS-GEN3-1001"` and `status: "DRAFT"`.

### 4.2 Update Activity (Material Change Evaluation — CPD-009)
* **Endpoint:** `PATCH /api/v1/activities/{id}`
* **Access:** `PROJECT_MANAGER` (assigned project), `SYSTEM_ADMIN`
* **Validation Rule:** If start or due date shifts >= 3 working days, or current estimate changes >= 20 percent, `change_reason` is **mandatory (min 10 chars)**.
* **Request:**
```json
{
  "due_date": "2026-11-27",
  "change_reason": "Customer release schedule pushed by OEM validation team"
}
```
* **Response (200 OK):** Saves update and writes immutable entry to `audit_log`.

### 4.3 Change Activity Status (Non-Linear State Machine — CPD-007)
* **Endpoint:** `POST /api/v1/activities/{id}/status`
* **Access:** Scoped by role and transition rule.
* **Transition Matrix & Authorization:**
  * `* → CANCELLED`: PM, Admin (Reason required >= 10 chars). Releases future workload immediately.
  * `* → DONE`: PM, Admin, Team Lead, Member (Reason required >= 10 chars).
  * `IN_PROGRESS ⇄ BLOCKED`: Assignee, Team Lead, PM, Admin (Reversible without Admin intervention).
  * `DONE → IN_PROGRESS` or `CANCELLED → IN_PROGRESS`: **SYSTEM_ADMIN ONLY** (Reason required >= 10 chars).
* **Request:**
```json
{
  "target_status": "BLOCKED",
  "reason": "Hardware variant prototype board revision delayed in customs"
}
```
* **Response (200 OK):** Status updated, audit entry correlated.

---

## 5. Assignment & Capacity Engine Endpoints (CPD-002, CPD-004, CPD-005)

### 5.1 Assign Member to Activity
* **Endpoint:** `POST /api/v1/activities/{activity_id}/assignments`
* **Access:** `PROJECT_MANAGER` (assigned project), `SYSTEM_ADMIN`
* **Engine Evaluation:**
  1. Calculates member's total load across **all active pilot projects** for affected weeks.
  2. If utilization reaches **90% to 99.99%**, returns `201 Created` with header `X-Warning-Capacity: SOFT_WARNING_90_PERCENT`.
  3. If utilization reaches **>= 100.00%**, blocks save and returns `409 Conflict` (Hard Block).
* **Request:**
```json
{
  "member_id": "9d18c942-2d12-4277-bf30-8c9038228511",
  "start_date": "2026-11-02",
  "end_date": "2026-11-13",
  "planned_hours": 64.00
}
```
* **Conflict Response (409 Conflict):**
```json
{
  "error": {
    "code": "CAPACITY_HARD_CONFLICT",
    "message": "Assignment blocked: member planned utilization would reach 110.00% in week 2026-W45.",
    "details": {
      "member_id": "9d18c942-2d12-4277-bf30-8c9038228511",
      "week": "2026-W45",
      "net_capacity": 40.00,
      "total_load": 44.00,
      "utilization_percent": 110.00,
      "override_permitted": true
    }
  }
}
```

### 5.2 Override Hard Capacity Conflict (CPD-004, CPD-008)
* **Endpoint:** `POST /api/v1/activities/{activity_id}/assignments/override`
* **Access:** `SYSTEM_ADMIN` or `PROJECT_MANAGER` for assigned project.
* **Request:**
```json
{
  "member_id": "9d18c942-2d12-4277-bf30-8c9038228511",
  "start_date": "2026-11-02",
  "end_date": "2026-11-13",
  "planned_hours": 64.00,
  "override_reason": "Critical customer release gate; engineer approved temporary overtime"
}
```
* **Response (201 Created):** Creates assignment, records immutable row in `conflict_overrides` and `audit_log`.

### 5.3 Cross-Project Workload Query (CPD-005)
* **Endpoint:** `GET /api/v1/capacity/workload?start_date=2026-11-01&end_date=2026-12-31`
* **Access:** Authenticated (PM, Team Lead, Resource Manager, Admin)
* **Response (200 OK):**
```json
{
  "weeks": ["2026-W45", "2026-W46", "2026-W47"],
  "members": [
    {
      "member_id": "9d18c942-2d12-4277-bf30-8c9038228511",
      "name": "Ananya Sharma",
      "team": "Base Software Team",
      "workload": [
        {
          "week": "2026-W45",
          "net_capacity": 40.0,
          "assigned_hours": 36.0,
          "utilization_percent": 90.0,
          "status": "WARNING",
          "projects_contributing": ["PRJ-EMS-GEN3", "PRJ-CALIB-MY27"]
        }
      ]
    }
  ]
}
```

---

## 6. Leave Management & Privacy Masking Endpoints (CPD-006)

### 6.1 Submit Leave
* **Endpoint:** `POST /api/v1/leave`
* **Access:** Team Member (for self), Team Lead, Resource Manager, Admin
* **Request:**
```json
{
  "member_id": "9d18c942-2d12-4277-bf30-8c9038228511",
  "start_date": "2026-11-16",
  "end_date": "2026-11-20",
  "leave_type": "ANNUAL",
  "leave_reason": "Family vacation"
}
```
* **Response (201 Created):** Status is `PENDING`. Does not reduce capacity yet.

### 6.2 Approve Leave
* **Endpoint:** `POST /api/v1/leave/{id}/approve`
* **Access:** Team Lead (own team), Resource Manager (in scope), Admin
* **Response (200 OK):** Status becomes `APPROVED`. Immediately deducts net capacity for affected working days and triggers cross-project overload checks. Approver fields are never serialized to Team Leads.

### 6.3 Reject Leave
* **Endpoint:** `POST /api/v1/leave/{id}/reject`
* **Access:** Team Lead (own team), Resource Manager (in scope), Admin
* **Request:** Optional `{ "rejection_reason": "Project delivery conflict" }`
* **Response (200 OK):** Status becomes `REJECTED`. Net capacity remains unreduced.

### 6.4 Cancel Leave
* **Endpoint:** `POST /api/v1/leave/{id}/cancel`
* **Access:** Requester (self), Team Lead (own team), Resource Manager (in scope), Admin
* **Response (200 OK):** Status becomes `CANCELLED`. Restores previously committed capacity if previously approved.

### 6.5 Get Leave Record by ID
* **Endpoint:** `GET /api/v1/leave/{id}`
* **Access:** Role-matched scope (PM/TM: availability only; TL: own team only, dates & type; RM: in scope full; Admin: full). Out-of-scope requests return `403 Forbidden`.

### 6.6 Query Leave (Server-Side Privacy Serialization — CPD-006)
* **Endpoint:** `GET /api/v1/leave?start_date=2026-11-01&end_date=2026-11-30`
* **Privacy Filtering Rules:**
  * *Called by Project Manager or Peer Team Member:* `leave_type` and `leave_reason` are returned as `null`. Only duration and unavailable dates are returned. Approver identity is never returned.
  * *Called by Team Lead:* `leave_type` is returned for own team members; `leave_reason` is `null`. Approver identity is never returned. Out-of-team leave records are excluded.
  * *Called by Resource Manager (in scope) or Admin:* Full object returned within authorized scope.
* **Response (200 OK):**
```json
{
  "data": [
    {
      "id": "77777777-1111-2222-3333-444444444444",
      "user_id": "40000000-0000-0000-0000-000000000005",
      "start_date": "2026-11-16",
      "end_date": "2026-11-20",
      "unavailable_from": "2026-11-16",
      "unavailable_to": "2026-11-20",
      "duration_days": 5,
      "duration_hours": 40.0,
      "leave_type": "ANNUAL",
      "leave_reason": null,
      "status": "APPROVED"
    }
  ],
  "count": 1
}
```

---

## 7. Out of Scope / Deferred Endpoints (Operational Hardening)

The following endpoints are **explicitly excluded** from the Core Pilot API:
* `POST /api/v1/dependencies` (Finish-to-Start dependency creation deferred to Operational Hardening).
* `GET /api/v1/critical-path` (Critical path calculation deferred).
* `POST /api/v1/baselines` (Baseline snapshots deferred to Operational Hardening).
* `POST /api/v1/import/wizard` (Bulk Excel/CSV upload deferred).
* `POST /api/v1/auth/sso/*` (Corporate SSO integration deferred).
