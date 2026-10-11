# Automotive Project & Resource Management System
## Security Architecture & Access Control Specification — MVP Core Pilot

**Document Version:** 1.0  
**Status:** Approved Technical Design  
**Authoritative Sources:** PRD.md v1.0, docs/MVP-SCOPE.md, docs/CORE-PILOT-DECISIONS.md, docs/ARCHITECTURE.md  

---

## 1. Threat Model & Trust Boundaries

The system is engineered as an on-premise enterprise planning tool deployed on a single host in a corporate datacenter.

```mermaid
graph TD
    subgraph Corporate_Network["Corporate Network Perimeter"]
        LAN["Corporate LAN"]
        VPN["Corporate VPN"]
        
        subgraph Host_System["Application Server (Single Host)"]
            Proxy["Nginx TLS Reverse Proxy (Edge)"]
            App["Modular Monolith App Core (Private Bridge)"]
            DB[("PostgreSQL 16 (No Host Port Mapping)")]
        end
    end

    ExternalInternet(("Public Internet (BLOCKED)")) -.->|No Route| Proxy
    LAN -->|HTTPS (443)| Proxy
    VPN -->|HTTPS (443)| Proxy
    Proxy -->|Local HTTP (3000)| App
    App -->|Local TCP (5432)| DB
```

### 1.1 Network Boundary (CPD-010)
* **Access Control:** The application is accessible **exclusively** via the corporate LAN and authenticated corporate VPN. Public internet access is blocked at the firewall.
* **TLS Encryption:** All traffic is encrypted in transit using TLS 1.3/1.2 terminated at the Nginx reverse proxy. Plain HTTP requests (port 80) are redirected with HTTP 301 to HTTPS.
* **Network Isolation:** PostgreSQL is attached only to the internal Docker bridge network; port 5432 is not bound to host interfaces.

---

## 2. Authentication & Credential Security (CPD-010)

### 2.1 Password Storage & Adaptive Hashing
* **Algorithm:** **Argon2id** (OWASP recommended standard for password hashing).
* **Parameters:**
  * Memory: 64 MB (`m=65536`)
  * Iterations: 3 (`t=3`)
  * Parallelism: 4 (`p=4`)
  * Salt: 16 cryptographically random bytes generated via OS CSPRNG per user.
* **Validation Policy:**
  * Minimum length: 12 characters.
  * Must contain at least one uppercase letter, one lowercase letter, one number, and one special character.
  * Passwords checked against standard common-password dictionaries.

### 2.2 Brute-Force & Lockout Controls
* **Rate Limiting:** IP-level rate limiting on `/api/v1/auth/login` (5 requests per minute).
* **Account Lockout:** An account is locked for 15 minutes after 5 consecutive failed login attempts within 10 minutes. An audit event is generated.
* **Timing Attack Prevention:** Password comparison and dummy hashing on non-existent accounts execute in constant time to prevent user enumeration.

### 2.3 Session Management
* **Storage:** Server-side cryptographically random session IDs (256-bit entropy) stored in PostgreSQL or Redis.
* **Cookies:**
  * `HttpOnly`: Enabled (prevents JavaScript access via XSS).
  * `Secure`: Enabled (ensures transmission only over HTTPS).
  * `SameSite=Strict`: Enabled (prevents CSRF attacks).
* **Lifecycles:**
  * Idle timeout: 30 minutes of user inactivity terminates the session.
  * Absolute timeout: 8 hours maximum session lifetime forces re-authentication.
  * Session rotation: Session ID regenerates immediately upon successful authentication.

### 2.4 First-Run Admin Bootstrapping
* On first container startup, if no active `SYSTEM_ADMIN` user exists in the database, the bootstrapping service reads:
  * `ADMIN_EMAIL`
  * `ADMIN_INITIAL_PASSWORD`
  from a protected `.env` file mounted with read-only root permissions (`chmod 400`).
* The bootstrapped admin account is flagged with `must_change_password = TRUE`, requiring an immediate password change before accessing any planning endpoints.

---

## 3. Role- and Scope-Based Access Control (RBAC & SBAC)

Access authorization is evaluated as the **intersection of Role Permissions and Organizational Scope** (BR-018, CPD-008).

> [!NOTE]
> **Decision-Traceability Note:**  
> Authorization rules are design proposals derived from CPD-007, CPD-008, and CPD-009. They are not approved implementation requirements until the relevant Core Pilot decision records have formal Product Owner or delegated-approver sign-off. Where no decision explicitly grants a permission, the matrix uses deny-by-default.

### 3.1 Pilot Roles (CPD-008)
1. **`SYSTEM_ADMIN`:** Full system authority. Configures global settings, manages all users, creates Products, creates projects, overrides conflicts, approves leave in all cases.
2. **`PROJECT_MANAGER`:** Full operational authority within **assigned projects**. Manages activities, assigns members, overrides capacity conflicts within assigned projects with recorded reason. **Cannot create Product entities and cannot create Project entities** (project creation is Admin-only; PM project creation deferred).
3. **`TEAM_LEAD`:** Operational view of assigned team members. Updates activity status and remaining effort, approves leave for own team members. Cannot create projects.
4. **`TEAM_MEMBER`:** Manages own assigned tasks, updates status, remaining effort, and submits personal leave. **Can view own assigned activities only and view own assignments only** (peer/project viewing denied).
5. **`RESOURCE_MANAGER`:** Manages organization team structure, capacity settings, member buffers. Approves leave within resource scope. Does not assign project tasks. **Audit log access is deferred.**

### 3.2 Authorization Enforcement Matrix

*(For the complete 28-action matrix with sensitive-data and audit requirements, see [docs/ROLE-AND-SCOPE-AUTHORIZATION-MATRIX.md](file:///c:/DATA/Antigravity/Projects/automotive-project-resource-management/docs/ROLE-AND-SCOPE-AUTHORIZATION-MATRIX.md))*

| Feature / Action | System Admin | Project Manager | Team Lead | Team Member | Resource Manager |
|---|---|---|---|---|---|
| **Create Product** | **YES** | NO (CPD-008) | NO | NO | NO |
| **Create Project** | **YES ONLY** | NO | NO | NO | NO |
| **Edit / Archive Project** | **YES** | **YES** (Scoped) | NO | NO | NO |
| **Manage Work-Area Tags** | **YES** | NO | NO | NO | NO |
| **Create/Edit Activity** | **YES** | **YES** (Scoped) | NO | NO | NO |
| **View Activities / Assignments** | **YES** (Global) | **YES** (Scoped) | **YES** (Team) | **YES (Own Only)** | **YES** (In Scope) |
| **Assign Member** | **YES** | **YES** (Scoped) | NO | NO | NO |
| **Override Hard Capacity Conflict** | **YES** (Any, Reason ≥ 10) | **YES** (Scoped, Reason ≥ 10) | NO | NO | NO |
| **Update Non-Terminal Task Status** | **YES** | **YES** (Scoped) | **YES** (Team) | **YES** (Own) | NO |
| **Enter Done or Cancelled** | **YES ONLY** (Reason ≥ 10) | NO | NO | NO | NO |
| **Revoke Done → Cancelled** | **YES ONLY** (Reason ≥ 10) | NO | NO | NO | NO |
| **Reopen Done / Cancelled Activity** | **YES ONLY** (Reason ≥ 10) | NO | NO | NO | NO |
| **Submit Leave** | **YES** | **YES** (Self) | **YES** (Self/Team) | **YES** (Self) | **YES** (Scope) |
| **Approve Leave** | **YES** (Escalation) | NO | **YES** (Team) | NO | **YES** (Scope) |
| **View Full Leave Reason** | **YES** | NO (CPD-006) | NO (CPD-006) | **YES** (Self) | **YES** (Scope) |
| **View Immutable Audit Log** | **YES** (All) | **YES** (Scoped) | NO | NO | **NO (Deferred)** |
| **Modify or Delete Audit Records** | **FORBIDDEN** | **FORBIDDEN** | **FORBIDDEN** | **FORBIDDEN** | **FORBIDDEN** |

---

## 4. Leave Privacy & Data Protection (CPD-006)

To protect sensitive employee health and personal information, leave records are strictly sanitized at the **server-side serialization layer**.

### 4.1 Field-Level Visibility Rules
```mermaid
graph TD
    subgraph Raw_DB_Record["Raw Leave Record in Database"]
        Dates["start_date, end_date, duration"]
        Type["leave_type (e.g. SICK / PERSONAL)"]
        Reason["leave_reason (Sensitive Details)"]
    end

    subgraph Serializer["Server-Side Privacy Serializer"]
        RuleCheck{"Check Caller Role & Scope"}
    end

    subgraph Client_Responses["JSON API Response Output"]
        Masked["{ dates, duration, type: null, reason: null }"]
        TypeOnly["{ dates, duration, type: SICK, reason: null }"]
        Full["{ dates, duration, type: SICK, reason: ... }"]
    end

    Raw_DB_Record --> RuleCheck
    RuleCheck -->|PM or Peer Member| Masked
    RuleCheck -->|Team Lead (Own Team)| TypeOnly
    RuleCheck -->|Resource Manager or Admin| Full
```

* **Client Masking is Forbidden:** Field suppression is enforced in the API gateway/controller before JSON serialization. Masked fields are emitted as `null` or omitted entirely.

---

## 5. Immutable Audit Log Architecture (CPD-009, BR-011)

The audit log enforces institutional memory and regulatory compliance across automotive engineering milestones.

### 5.1 Immutability Guarantees
* The `audit_log` table is **append-only**.
* Database permissions for the application user grant `INSERT` and `SELECT` only; `UPDATE` and `DELETE` on `audit_log` are explicitly revoked.
* Any administrative attempt to truncate or delete audit records requires manual superuser intervention and triggers external database alarms.

### 5.2 Material Change Interceptor
Before persisting modifications to activities or assignments, the `AuditInterceptor` compares the before-state and proposed after-state:
* **Trigger 1:** Date change: shift of >= 3 working days from current due date.
* **Trigger 2:** Date change: shift of >= 3 working days from current start date.
* **Trigger 3:** Estimate change: change of >= 20 percent of current estimate.
* **Trigger 4:** Assignee change: any assignee change on a Planned or In Progress activity.
* **Trigger 5:** Priority change: any priority change on a Planned or In Progress activity.
* **Trigger 6:** Status changed to `DONE` or `CANCELLED` (Terminal administrative override).
* **Trigger 7:** Hard conflict override (> 100%).
* **Enforcement:** If any trigger fires, the request must include a `change_reason` string with length `>= 10` characters. Requests failing this check are rejected with `400 Bad Request`.

---

## 6. Out of Scope / Deferred Items (MVP Operational Hardening & Release 2)

* **Corporate SSO / Active Directory / OIDC Integration:** (Deferred to Release 2; local authentication approved for pilot subject to IT waiver).
* **Hardware Security Module (HSM) / Enterprise KMS:** (Deferred to Operational Hardening; environment variable secret injection used for pilot).
* **Automated Penetration Testing & Static Code Analysis CI Gate:** (Operational Hardening).
* **Field-Level Database Column Encryption (pgcrypto):** (Evaluated for Release 1.1).
