# Automotive Project & Resource Management System
## Core Pilot Foundation — EMS ECU Development

An internal, self-hosted web application engineered for automotive product development environments. It establishes an authoritative single source of truth connecting products, projects, activities, and resource allocations—ensuring deterministic capacity limits, working calendars, leave deductions, and cross-project workload aggregation.

---

## 1. Quick Start (One-Command Local Startup)

Ensure Docker Desktop is running, then run:

```bash
docker compose up --build
```

This single command provisions the isolated container network, PostgreSQL database, applies versioned database migrations, and boots both backend and frontend services.

### Service Endpoints

| Service | URL | Description |
|---|---|---|
| **Frontend UI** | [http://localhost:8080](http://localhost:8080) | Pilot SPA with live health diagnostics, metrics, and architecture viewer |
| **Backend API** | [http://localhost:3000](http://localhost:3000) | Modular Monolith API service |
| **Health Liveness Probe** | [http://localhost:3000/health](http://localhost:3000/health) | Lightweight HTTP 200 liveness check |
| **Readiness & DB Probe** | [http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health) | Full system readiness, DB status, migrations count, and pilot baseline |
| **Domain Modules API** | [http://localhost:3000/api/v1/modules](http://localhost:3000/api/v1/modules) | In-process modular monolith boundaries register |
| **PostgreSQL Database** | `localhost:5432` | PostgreSQL 16 transactional core (`automotive_rpm`) |

To stop the containers:

```bash
docker compose down
```

To stop and remove persistent database volumes:

```bash
docker compose down -v
```

---

## 2. Environment Configuration

Copy the `.env.example` template to `.env` before running:

```bash
# Windows PowerShell:
Copy-Item .env.example .env

# Linux / macOS:
cp .env.example .env
```

> **Security Rule:** Real credentials, certificates, and production keys must never be committed to version control. The `.env` file is excluded in `.gitignore`.

---

## 3. Project Structure

```text
automotive-project-resource-management/
├── .env.example                 # Environment variable template (never commit real secrets)
├── .gitignore                   # Version control exclusions
├── docker-compose.yml           # Multi-container orchestration (db, backend, frontend)
├── README.md                    # System documentation and operational runbook
├── PRD.md                       # Authoritative Product Requirements Document
├── docs/                        # Approved architecture, data model, and decision registers
│   ├── ARCHITECTURE.md          # Modular Monolith system design and deployment specs
│   ├── DATA_MODEL.md            # PostgreSQL 16 physical schema ERD and DDL
│   ├── CORE-PILOT-DECISIONS.md  # Approved decisions (CPD-001 through CPD-010)
│   └── TEST_STRATEGY.md         # Quality assurance standards and test pyramid
├── backend/                     # Backend API service (Modular Monolith)
│   ├── Dockerfile               # Node.js 20 Alpine container specification
│   ├── package.json             # Service metadata, scripts, and dependencies
│   ├── migrations/              # Versioned SQL migrations (PostgreSQL 16)
│   │   ├── 001_initial_schema.sql       # 19 core tables, triggers, indexes
│   │   └── 002_seed_pilot_baseline.sql  # 5 roles, EMS ECU product, 14 tags, calendar
│   ├── src/
│   │   ├── app.js               # HTTP router, middleware, and route registry
│   │   ├── server.js            # Server entry point, DB startup hook, graceful shutdown
│   │   ├── config/              # Centralized configuration & environment loader
│   │   ├── db/
│   │   │   ├── index.js         # Connection pool manager & health probe
│   │   │   └── migrate.js       # Transaction-safe versioned migration runner
│   │   ├── middleware/          # Security headers, request logging, error envelopes
│   │   └── modules/             # In-process domain modules
│   │       ├── health/          # Liveness & readiness probe controllers
│   │       ├── iam/             # Identity & Access (5 pilot roles, scopes)
│   │       ├── organization/    # Teams, members, 40h Asia/Kolkata calendar
│   │       ├── project_catalog/ # EMS ECU Development product & 14 tags
│   │       ├── activity/        # Max depth 2 activities & non-linear status workflow
│   │       ├── capacity_scheduling/ # 90% warning, 100% hard block capacity engine
│   │       ├── leave/           # Approved leave deductions & privacy field masking
│   │       └── audit/           # Immutable append-only audit trail
│   └── tests/                   # Automated test suite
│       ├── health.test.js       # Liveness probe & system health schema tests
│       ├── migrations.test.js   # Migration files, DDL constraints, and seed tests
│       ├── config.test.js       # Calendar & capacity invariant tests
│       ├── domain_capacity.test.js # Pure-function deterministic capacity tests
│       └── app_routes.test.js   # HTTP route integration tests
└── frontend/                    # Frontend Web UI service
    ├── Dockerfile               # Nginx Alpine container specification
    ├── nginx.conf               # Nginx reverse proxy configuration for /api & /health
    └── public/                  # Static SPA assets
        ├── index.html           # Diagnostic dashboard & system architecture inspector
        ├── css/
        │   └── app.css          # Rich automotive engineering dark theme (Vanilla CSS)
        └── js/
            └── app.js           # Live diagnostic polling & tab interaction logic
```

---

## 4. Versioned Database Migrations

Database schema evolution is managed via SQL migration scripts in `backend/migrations/` and tracked in the `schema_migrations` table.

### Check Migration Status

Within the running container:
```bash
docker compose exec backend npm run migrate:status
```

Locally from `backend/`:
```bash
node src/db/migrate.js --status
```

### Apply Migrations

```bash
docker compose exec backend npm run migrate
```

Migrations are executed inside atomic database transactions (`BEGIN` ... `COMMIT`). If any statement fails, the transaction is immediately rolled back.

---

## 5. Automated Tests

The test suite validates health probes, configuration invariants, migration schemas, pure-function capacity formulas, and HTTP route handling.

### Run Tests Locally

Using Bun:
```bash
cd backend
bun test
```

Using Node.js test runner:
```bash
cd backend
npm test
```

### Test Coverage Highlights

- **`health.test.js`**: Asserts HTTP 200 liveness and readiness response structure.
- **`migrations.test.js`**: Asserts all 19 required physical tables, constraints, depth triggers, partial indexes, and seed records exist.
- **`config.test.js`**: Asserts calendar defaults (`Asia/Kolkata`, 8h/day, 40h/week) and capacity thresholds (90% soft warning, 100% hard block).
- **`domain_capacity.test.js`**: Validates deterministic capacity mathematics:
  - 5 days &times; 8h = 40.0h net base capacity.
  - Approved leave deduction (1 day = 8h &rarr; 32.0h net).
  - Buffer deductions (10% &rarr; 36.0h net).
  - 90% planned load triggers `SOFT_WARNING`.
  - &gt;100% planned load triggers `HARD_BLOCK`.
  - Zero-capacity week triggers `HARD_BLOCK` (999.99%).
- **`app_routes.test.js`**: Spins up the server on an ephemeral port and tests endpoints (`/health`, `/api/v1/modules`, `/`, 404 error envelope).

---

## 6. Core Pilot Scope & Boundaries

In accordance with Product Owner approval (**CPD-001 through CPD-010**):
- **Single Product Focus**: **EMS ECU Development** (`PROD-EMS-ECU`) is the sole top-level Product for the pilot.
- **14 Work-Area Tags**: Configured via the `project_work_area_tags` junction table (not as separate Product entities).
- **Deferred Out of Scope**: Business features such as SSO, interactive Gantt charts, dashboards, CSV/Excel bulk imports, email notifications, advanced WAL backups, and dependency-scheduling automation are deferred to MVP Operational Hardening and Post-MVP.
