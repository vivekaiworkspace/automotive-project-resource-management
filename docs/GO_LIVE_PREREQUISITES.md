# Automotive Project & Resource Management System
## Go-Live Prerequisites & Operational Readiness Runbook — MVP Core Pilot

**Document Version:** 1.0  
**Status:** Operational Gate Document  
**Authoritative Sources:** PRD.md v1.0, docs/MVP-SCOPE.md, docs/CORE-PILOT-DECISIONS.md, docs/ARCHITECTURE.md  

---

## 1. Overview & Operational Governance

The technical architecture for the Core Pilot is formally approved (**CORE PILOT BUILD GATE: CLEARED WITH CONDITIONS**). Detailed material-change thresholds and mandatory-reason policies (CPD-009), corporate SSO, and advanced hardening features are deferred to MVP Operational Hardening.

Live deployment and data entry are subject to **three operational conditions before go-live**:

```mermaid
graph TD
    subgraph Approved_Baseline["Approved Build Baseline"]
        Design["Build Gate: CLEARED WITH CONDITIONS<br/>CPD-001 to CPD-008 Architecture Cleared<br/>CPD-009 Deferred to Hardening"]
    end

    subgraph Go_Live_Gates["Operational Go-Live Conditions"]
        G1["Condition 1: One PO Approval Record (CPD-001 to CPD-008) — Complete<br/>(External evidence optional)"]
        G2["Condition 2: CPD-003 Annual Holiday Configuration<br/>(Production-readiness prerequisite; deferred from implementation)"]
        G3["Condition 3: CPD-010 IT Network, Backup & Restore Drill Sign-off"]
    end

    subgraph Production_Go_Live["Production Pilot Go-Live"]
        Live["Pilot Go-Live Sign-Off & Data Entry"]
    end

    Design --> G1
    Design --> G2
    Design --> G3
    G1 & G2 & G3 --> Live
```

---

## 2. Core Pilot Go-Live Gates Register

| Gate ID | Prerequisite Name | Responsible Party | Current Status | Blocker Description & Next Step |
|---|---|---|---|---|
| **GATE-01** | **Consolidated PO Approval Record** | **Vivek (Product Owner)** | **Complete — Product Owner decisions CPD-001 through CPD-008 are recorded in the Core Pilot decision register. External approval evidence reference is optional and may be added when available.** | CPD-001 through CPD-008 are approved and recorded in the Core Pilot decision register. CPD-009 remains deferred to Operational Hardening and is excluded from Core Pilot scope. An external approval evidence reference is optional (`[APPROVAL_EVIDENCE_REFERENCE]`); its absence does not block Core Pilot governance or pilot readiness. |
| **GATE-02** | **Production-Readiness Annual Holiday Calendar Configuration** | **Authorized Administrator / Vivek** | **PENDING for production forecasting (deferred from implementation; current target: 2026)** | Public holiday dates are deferred for now and are NOT required to continue implementation, automated testing, local development, or non-production validation. Base calendar remains `Asia/Kolkata`, Monday–Friday, 8 hours/day; individual approved leave and calendar exceptions remain supported. Holiday calendars are maintained separately for each calendar year (prior-year records preserved). Before production use of holiday-sensitive capacity forecasts or pilot go-live, an authorized administrator will manually enter and validate the applicable annual holiday list (`[HOLIDAY_LIST]`). Do not insert guessed, web-scraped, or placeholder holiday dates into the database. Metadata placeholders `[HOLIDAY_LIST_SOURCE]` and `[HOLIDAY_LIST_APPROVER]` are optional metadata. |
| **GATE-03** | **IT Network Access & SSO Waiver** | **IT Department / Vivek** | **PENDING** | Corporate IT confirmation of LAN/VPN network access and waiver permitting local Argon2id authentication for pilot. |
| **GATE-04** | **Designated Backup Destination & Restore Test** | **IT Infrastructure / Designated Operator** | **PENDING** | Designated off-host storage path and successful restore drill sign-off on recovery host with verified row counts before go-live. |

---

## 3. Pre-Flight Server Provisioning & Verification Checklist

Prior to launching Docker Compose containers on the designated pilot server, execute the following verification steps:

### 3.1 Host Infrastructure Verification
* [ ] **Operating System:** Linux host (Ubuntu 22.04 LTS / RHEL 9 recommended).
* [ ] **Container Engine:** Docker Engine v24+ and Docker Compose v2+ installed and running.
* [ ] **Network Exposure:** Host bound only to corporate LAN / VPN interfaces. Verified that public internet ingress is blocked.
* [ ] **Port Availability:** Ports `80` (HTTP redirect) and `443` (HTTPS) available and bound to Nginx. Verified port `5432` is not exposed to host network.
* [ ] **Storage Mount:** Verified Docker volume `postgres_data` has at least 50 GB free disk space.
* [ ] **Backup Mount:** Verified `/var/backups/db` mounts the designated separate network share / NAS (GATE-04).

### 3.2 Secrets & Configuration Bootstrapping
* [ ] File `.env` created in root deployment directory with permissions `chmod 400 .env` (read-only root).
* [ ] `DATABASE_URL` configured with strong random password.
* [ ] `SESSION_SECRET` configured with 64-byte random cryptographic key.
* [ ] `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` set for initial System Admin seed.

### 3.3 Database Seeding Verification
* [ ] Run database migration scripts (`migrate up`).
* [ ] Verify seeded entities:
  * [ ] Product: `EMS ECU Development` (`PROD-EMS-ECU`) is created as the single top-level product.
  * [ ] Work-Area Tags: Exactly 14 tags created in `work_area_tags`.
  * [ ] Calendar: Organization time zone verified as `Asia/Kolkata`, standard hours = 8.00.
  * [ ] Public Holidays: Deferred during implementation; before production holiday-sensitive forecasting/go-live, verify populated from manually entered and validated annual holiday list for applicable planning year (2026) (GATE-02: `[HOLIDAY_LIST]`).

---

## 4. Pre-Pilot Database Backup & Restore Drill Runbook (CPD-010, AG-6)

An untested backup is not a backup. In compliance with **CPD-010** and PRD acceptance criteria **AG-6**, a successful restore into a separate machine must be demonstrated and documented prior to pilot go-live.

### Step 1: Execute Production Backup Dump
On the pilot production host, trigger the automated backup script:
```bash
#!/bin/bash
set -e
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/db"
BACKUP_FILE="${BACKUP_DIR}/automotive_pilot_backup_${TIMESTAMP}.dump"

echo "Executing PostgreSQL custom-format dump..."
docker compose exec -T db pg_dump \
    -U postgres \
    -d automotive_pm_db \
    -F c \
    -b -v \
    -f "/tmp/backup.dump"

docker compose cp db:/tmp/backup.dump "${BACKUP_FILE}"
docker compose exec db rm /tmp/backup.dump

echo "Backup completed successfully: ${BACKUP_FILE}"
ls -lh "${BACKUP_FILE}"
```

### Step 2: Transfer Backup to Separate Recovery Host
Transfer the backup file to a designated secondary recovery machine or isolated test environment:
```bash
scp /var/backups/db/automotive_pilot_backup_*.dump operator@recovery-test-host:/tmp/
```

### Step 3: Execute Full Restore on Recovery Host
On the recovery host (running an isolated PostgreSQL 16 container):
```bash
#!/bin/bash
set -e
RECOVERY_FILE="/tmp/automotive_pilot_backup_*.dump"

echo "Creating clean recovery database..."
docker exec -i recovery_db dropdb -U postgres --if-exists automotive_recovery_db
docker exec -i recovery_db createdb -U postgres automotive_recovery_db

echo "Restoring database from backup file..."
docker exec -i recovery_db pg_restore \
    -U postgres \
    -d automotive_recovery_db \
    -v \
    ${RECOVERY_FILE}

echo "Database restore completed successfully."
```

### Step 4: Verification & Integrity Assertions
Run verification script on the recovery host comparing table row counts and schema integrity against the production source:
```sql
-- Verify key table row counts
SELECT 'products' AS entity, COUNT(*) FROM products
UNION ALL
SELECT 'work_area_tags', COUNT(*) FROM work_area_tags
UNION ALL
SELECT 'projects', COUNT(*) FROM projects
UNION ALL
SELECT 'activities', COUNT(*) FROM activities
UNION ALL
SELECT 'assignments', COUNT(*) FROM assignments
UNION ALL
SELECT 'leave_records', COUNT(*) FROM leave_records
UNION ALL
SELECT 'audit_log', COUNT(*) FROM audit_log;
```

---

## 5. Go/No-Go Sign-Off Form

This sign-off form must be formally executed prior to onboarding pilot engineering teams:

```
================================================================================
AUTOMOTIVE PROJECT & RESOURCE MANAGEMENT SYSTEM — PILOT GO-LIVE SIGN-OFF
================================================================================

GATE-01 — Consolidated Product Owner Approval Evidence:
[x] Complete — Product Owner decisions CPD-001 through CPD-008 are recorded in the Core Pilot decision register. External approval evidence reference is optional and may be added when available.
Approver: Vivek (Product Owner)  External Reference ID (Optional when available): [APPROVAL_EVIDENCE_REFERENCE]
(CPD-009 excluded per Operational Hardening deferral; absence of external reference does not block governance or go-live)

GATE-02 — Production-Readiness Annual Holiday Calendar Configuration (Deferred from implementation):
[ ] Manually entered and validated official holiday list before production holiday-sensitive forecasting for applicable planning year (2026) (Asia/Kolkata, Mon-Fri, 8h/day)
Planning Year: 2026 (separate annual record; prior years preserved)
Date Configured: _____________  Source (Optional): [HOLIDAY_LIST_SOURCE]  Verified by (Optional): [HOLIDAY_LIST_APPROVER]
(Absence of optional metadata does not invalidate an otherwise authorized holiday calendar)

GATE-03 — Corporate IT SSO Waiver:
[ ] Formally granted by Corporate IT Security for pilot duration
Confirmation Reference / Ticket ID: ______________________________________
IT Approver Name: ________________________________________________________

GATE-04 — Designated Off-Host Backup Storage & Pre-Pilot Restore Test Drill:
[ ] Network share / NAS confirmed separated from host machine
Storage Mount Path: ______________________________________________________
Storage Capacity Available: _____________________________________________
[ ] Pre-pilot restore test drill executed onto separate recovery machine
Drill Date: _______________  Operator Name: ______________________________
Row Counts Verified: [ ] PASS / [ ] FAIL
Target Environment Hostname / IP: ________________________________________

FINAL GO / NO-GO PILOT AUTHORIZATION:
[ ] GO — Approved to start pilot data entry and user onboarding
[ ] NO-GO — Outstanding operational blockers

Product Owner Signature: ________________________________  Date: ___________
IT / Operations Signature: ______________________________  Date: ___________
================================================================================
```

---

## 6. Out of Scope / Deferred Operational Items

* **Automated Spare-Host Failover / High-Availability Clustering:** (Deferred to Operational Hardening).
* **Automated WAL Shipping & Point-in-Time Recovery (PITR):** (Deferred to Operational Hardening; RPO commit is daily backup in pilot).
* **Corporate SSO (AD / LDAP / OIDC) Deployment:** (Deferred to Release 2).
* **Automated Disaster Recovery Drill Pipelines:** (Deferred to Operational Hardening).
