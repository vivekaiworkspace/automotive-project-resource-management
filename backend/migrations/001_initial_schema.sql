-- ==============================================================================
-- Migration: 001_initial_schema.sql
-- Purpose: Provision core relational data model for Core Pilot (CPD-001 to CPD-010)
-- Target: PostgreSQL 16
-- Reference: docs/DATA_MODEL.md v1.1
-- ==============================================================================

-- Enable UUID generator (PostgreSQL 13+ includes gen_random_uuid by default)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. Organization & Working Calendar Tables (CPD-003, BR-014)
-- ------------------------------------------------------------------------------
CREATE TABLE calendar_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    standard_hours_per_day DECIMAL(4,2) NOT NULL DEFAULT 8.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_calendar_hours CHECK (standard_hours_per_day > 0)
);

CREATE TABLE calendar_working_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_settings_id UUID NOT NULL REFERENCES calendar_settings(id) ON DELETE CASCADE,
    iso_day_of_week INT NOT NULL,
    day_name VARCHAR(10) NOT NULL,
    is_working_day BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_calendar_iso_day UNIQUE (calendar_settings_id, iso_day_of_week),
    CONSTRAINT chk_calendar_iso_day CHECK (iso_day_of_week BETWEEN 1 AND 7)
);

CREATE TABLE public_holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_settings_id UUID NOT NULL REFERENCES calendar_settings(id) ON DELETE CASCADE,
    holiday_date DATE NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 2. Identity, Roles & Permissions (CPD-008, CPD-010)
-- ------------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    lockout_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE TABLE roles (
    role_code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_code VARCHAR(50) NOT NULL REFERENCES roles(role_code) ON DELETE RESTRICT,
    PRIMARY KEY (user_id, role_code)
);

CREATE TABLE user_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope_type VARCHAR(20) NOT NULL,
    target_id UUID NOT NULL,
    CONSTRAINT chk_scope_type CHECK (scope_type IN ('PROJECT', 'TEAM'))
);

-- ------------------------------------------------------------------------------
-- 3. Teams & Members (CPD-003, CPD-004)
-- ------------------------------------------------------------------------------
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    team_lead_member_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_teams_code UNIQUE (code)
);

CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    employee_id VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    non_project_buffer_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_members_employee_id UNIQUE (employee_id),
    CONSTRAINT uq_members_email UNIQUE (email),
    CONSTRAINT chk_members_buffer CHECK (non_project_buffer_percent BETWEEN 0.00 AND 100.00)
);

-- Add circular FK for team lead
ALTER TABLE teams 
    ADD CONSTRAINT fk_teams_team_lead 
    FOREIGN KEY (team_lead_member_id) 
    REFERENCES members(id) 
    ON DELETE SET NULL;

CREATE TABLE member_calendar_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    exception_date DATE NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leave_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    leave_type VARCHAR(50) NOT NULL,
    leave_reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_leave_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_leave_type CHECK (leave_type IN ('ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'OTHER')),
    CONSTRAINT chk_leave_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'))
);

-- ------------------------------------------------------------------------------
-- 4. Product & Project Catalog (CPD-001, BR-001)
-- ------------------------------------------------------------------------------
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    product_type VARCHAR(50) NOT NULL DEFAULT 'EMS ECU',
    owner_id UUID REFERENCES members(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    business_priority INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_products_code UNIQUE (code),
    CONSTRAINT chk_products_status CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT chk_products_priority CHECK (business_priority BETWEEN 1 AND 5)
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    project_manager_id UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    planned_start_date DATE NOT NULL,
    planned_finish_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_projects_code UNIQUE (code),
    CONSTRAINT chk_projects_status CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED', 'CANCELLED')),
    CONSTRAINT chk_projects_dates CHECK (planned_finish_date >= planned_start_date)
);

CREATE TABLE work_area_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_work_area_tags_name UNIQUE (name)
);

CREATE TABLE project_work_area_tags (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES work_area_tags(id) ON DELETE RESTRICT,
    PRIMARY KEY (project_id, tag_id)
);

CREATE TABLE phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    sequence_order INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    planned_start_date DATE,
    planned_finish_date DATE,
    CONSTRAINT uq_phases_project_id_id UNIQUE (project_id, id),
    CONSTRAINT chk_phases_dates CHECK (planned_finish_date IS NULL OR planned_start_date IS NULL OR planned_finish_date >= planned_start_date)
);

-- ------------------------------------------------------------------------------
-- 5. Activities & Lifecycle State Machine (CPD-007, BR-002, BR-004)
-- ------------------------------------------------------------------------------
CREATE TABLE activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    phase_id UUID,
    parent_activity_id UUID,
    code VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    activity_type VARCHAR(50) NOT NULL DEFAULT 'Engineering Task',
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    owner_id UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
    original_estimate_hours DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    current_estimate_hours DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    remaining_effort_hours DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    actual_effort_hours DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    start_date DATE NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uq_activities_project_id_id UNIQUE (project_id, id),
    CONSTRAINT uq_activities_project_code UNIQUE (project_id, code),
    
    CONSTRAINT fk_activities_phase_same_project
        FOREIGN KEY (project_id, phase_id)
        REFERENCES phases (project_id, id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
        
    CONSTRAINT fk_activities_parent_same_project
        FOREIGN KEY (project_id, parent_activity_id)
        REFERENCES activities (project_id, id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
        
    CONSTRAINT chk_activities_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT chk_activities_status CHECK (status IN ('DRAFT', 'READY_FOR_PLANNING', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED')),
    CONSTRAINT chk_activities_estimates CHECK (
        original_estimate_hours >= 0 AND 
        current_estimate_hours >= 0 AND 
        remaining_effort_hours >= 0 AND 
        actual_effort_hours >= 0
    ),
    CONSTRAINT chk_activities_dates CHECK (due_date >= start_date)
);

-- Sub-activity nesting depth constraint trigger (Max 1 level: Activity -> Sub-activity)
CREATE OR REPLACE FUNCTION trg_check_subactivity_depth()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.parent_activity_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM activities 
            WHERE id = NEW.parent_activity_id AND parent_activity_id IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'Sub-activity nesting depth cannot exceed 1 level (Activity -> Sub-activity)';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activities_depth_check
BEFORE INSERT OR UPDATE OF parent_activity_id ON activities
FOR EACH ROW EXECUTE FUNCTION trg_check_subactivity_depth();

-- ------------------------------------------------------------------------------
-- 6. Resource Assignments & Overload Overrides (CPD-002, CPD-004, CPD-005)
-- ------------------------------------------------------------------------------
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    planned_hours DECIMAL(8,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_assignments_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_assignments_hours CHECK (planned_hours > 0),
    CONSTRAINT chk_assignments_status CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED'))
);

-- Exactly one active assignee per activity; preserves historical assignments
CREATE UNIQUE INDEX uq_assignments_one_active_per_activity
ON assignments (activity_id)
WHERE status = 'ACTIVE';

CREATE TABLE conflict_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    overridden_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    override_role VARCHAR(30) NOT NULL,
    utilization_percent_at_override DECIMAL(6,2) NOT NULL,
    justification_reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_override_role CHECK (override_role IN ('SYSTEM_ADMIN', 'PROJECT_MANAGER')),
    CONSTRAINT chk_override_reason CHECK (length(trim(justification_reason)) >= 10)
);

-- ------------------------------------------------------------------------------
-- 7. Immutable Audit Trail (CPD-009)
-- ------------------------------------------------------------------------------
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id UUID NOT NULL,
    entity_name VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(30) NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    before_state JSONB,
    after_state JSONB,
    change_reason TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_audit_action CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'OVERRIDE'))
);

-- ------------------------------------------------------------------------------
-- 8. Core Pilot Performance Indexes (§ 5)
-- ------------------------------------------------------------------------------
CREATE INDEX idx_assignments_member_dates ON assignments (member_id, status, start_date, end_date);
CREATE INDEX idx_projects_active ON projects (status) WHERE status NOT IN ('ARCHIVED', 'CANCELLED');
CREATE INDEX idx_activities_project_status ON activities (project_id, status);
CREATE INDEX idx_activities_unassigned_demand ON activities (status) WHERE status = 'READY_FOR_PLANNING';
CREATE INDEX idx_audit_log_entity ON audit_log (entity_name, entity_id, recorded_at);
CREATE INDEX idx_audit_log_correlation ON audit_log (correlation_id);
CREATE INDEX idx_leave_member_status ON leave_records (member_id, status, start_date, end_date);
