-- ==============================================================================
-- Migration: 004_configurable_records_and_custom_fields.sql
-- Purpose: Provision configurable reference data, custom fields, teams,
--          projects enhancement, optimistic locking, and scope management (Step 3)
-- Target: PostgreSQL 16
-- Reference: Core Pilot Step 3 Specification
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Configurable Reference Data (Step 3 § 3)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reference_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 1,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    archived_at TIMESTAMPTZ,
    archived_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_reference_data_category_code UNIQUE (category, code)
);

CREATE INDEX IF NOT EXISTS idx_reference_data_cat ON reference_data (category, display_order);
CREATE INDEX IF NOT EXISTS idx_reference_data_active ON reference_data (category, is_active) WHERE archived_at IS NULL;

-- ------------------------------------------------------------------------------
-- 2. Metadata-driven Custom Field Definitions & Options (Step 3 § 4)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_type_id UUID NOT NULL REFERENCES reference_data(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    label VARCHAR(150) NOT NULL,
    help_text TEXT,
    field_type VARCHAR(30) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 1,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    archived_at TIMESTAMPTZ,
    archived_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_custom_field_def_prod_code UNIQUE (product_type_id, code),
    CONSTRAINT chk_custom_field_type CHECK (field_type IN ('text', 'number', 'date', 'yes_no', 'single_select', 'multi_select'))
);

CREATE INDEX IF NOT EXISTS idx_custom_field_def_prod ON custom_field_definitions (product_type_id, display_order);

CREATE TABLE IF NOT EXISTS custom_field_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    custom_field_definition_id UUID NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    label VARCHAR(150) NOT NULL,
    display_order INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    archived_at TIMESTAMPTZ,
    archived_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_custom_field_options_def_code UNIQUE (custom_field_definition_id, code)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_options_def ON custom_field_options (custom_field_definition_id, display_order);

-- ------------------------------------------------------------------------------
-- 3. Extend Existing Tables with Versioning, Logical Archive & Foreign Keys
-- ------------------------------------------------------------------------------

-- Users table extension
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'version') THEN
        ALTER TABLE users ADD COLUMN version INT NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'created_by') THEN
        ALTER TABLE users ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'updated_at') THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'updated_by') THEN
        ALTER TABLE users ADD COLUMN updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'archived_at') THEN
        ALTER TABLE users ADD COLUMN archived_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'archived_by') THEN
        ALTER TABLE users ADD COLUMN archived_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Teams table extension
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'description') THEN
        ALTER TABLE teams ADD COLUMN description TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'status') THEN
        ALTER TABLE teams ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'version') THEN
        ALTER TABLE teams ADD COLUMN version INT NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'created_by') THEN
        ALTER TABLE teams ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'updated_at') THEN
        ALTER TABLE teams ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'updated_by') THEN
        ALTER TABLE teams ADD COLUMN updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'archived_at') THEN
        ALTER TABLE teams ADD COLUMN archived_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'archived_by') THEN
        ALTER TABLE teams ADD COLUMN archived_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Team Memberships (Step 3 § 2: User-to-Team mapping with team lead flag & active date range)
CREATE TABLE IF NOT EXISTS team_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_team_lead BOOLEAN NOT NULL DEFAULT FALSE,
    active_from DATE NOT NULL DEFAULT CURRENT_DATE,
    active_to DATE,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    archived_at TIMESTAMPTZ,
    archived_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_team_membership_dates CHECK (active_to IS NULL OR active_to >= active_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_memberships_active_user 
ON team_memberships (team_id, user_id) 
WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_memberships_team ON team_memberships (team_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_memberships_user ON team_memberships (user_id) WHERE archived_at IS NULL;

-- Products table extension
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'product_type_id') THEN
        ALTER TABLE products ADD COLUMN product_type_id UUID REFERENCES reference_data(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'business_priority_id') THEN
        ALTER TABLE products ADD COLUMN business_priority_id UUID REFERENCES reference_data(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'owner_user_id') THEN
        ALTER TABLE products ADD COLUMN owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'version') THEN
        ALTER TABLE products ADD COLUMN version INT NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'created_by') THEN
        ALTER TABLE products ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'updated_by') THEN
        ALTER TABLE products ADD COLUMN updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'archived_at') THEN
        ALTER TABLE products ADD COLUMN archived_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'archived_by') THEN
        ALTER TABLE products ADD COLUMN archived_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Projects table extension
DO $$
BEGIN
    -- Allow project_manager_id to be nullable so projects can use owner_user_id / PM scopes
    ALTER TABLE projects ALTER COLUMN project_manager_id DROP NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'owner_user_id') THEN
        ALTER TABLE projects ADD COLUMN owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'project_priority_id') THEN
        ALTER TABLE projects ADD COLUMN project_priority_id UUID REFERENCES reference_data(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'project_status_id') THEN
        ALTER TABLE projects ADD COLUMN project_status_id UUID REFERENCES reference_data(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'version') THEN
        ALTER TABLE projects ADD COLUMN version INT NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'created_by') THEN
        ALTER TABLE projects ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'updated_by') THEN
        ALTER TABLE projects ADD COLUMN updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'archived_at') THEN
        ALTER TABLE projects ADD COLUMN archived_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'archived_by') THEN
        ALTER TABLE projects ADD COLUMN archived_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Project Manager Scopes Table (Step 3 § 2)
CREATE TABLE IF NOT EXISTS project_manager_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_pm_scopes UNIQUE (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_pm_scopes_user ON project_manager_scopes (user_id);
CREATE INDEX IF NOT EXISTS idx_pm_scopes_project ON project_manager_scopes (project_id);

-- Resource Manager Scopes Table (Step 3 § 5)
CREATE TABLE IF NOT EXISTS resource_manager_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_rm_scopes UNIQUE (user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_rm_scopes_user ON resource_manager_scopes (user_id);
CREATE INDEX IF NOT EXISTS idx_rm_scopes_team ON resource_manager_scopes (team_id);

-- Phases table extension
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'phases' AND column_name = 'sequence_number') THEN
        ALTER TABLE phases ADD COLUMN sequence_number INT;
        UPDATE phases SET sequence_number = sequence_order WHERE sequence_number IS NULL;
        ALTER TABLE phases ALTER COLUMN sequence_number SET NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'phases' AND column_name = 'version') THEN
        ALTER TABLE phases ADD COLUMN version INT NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'phases' AND column_name = 'created_at') THEN
        ALTER TABLE phases ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'phases' AND column_name = 'created_by') THEN
        ALTER TABLE phases ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'phases' AND column_name = 'updated_at') THEN
        ALTER TABLE phases ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'phases' AND column_name = 'updated_by') THEN
        ALTER TABLE phases ADD COLUMN updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'phases' AND column_name = 'archived_at') THEN
        ALTER TABLE phases ADD COLUMN archived_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'phases' AND column_name = 'archived_by') THEN
        ALTER TABLE phases ADD COLUMN archived_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_phases_proj_seq 
ON phases (project_id, sequence_number) 
WHERE archived_at IS NULL;

-- Work Area Tags extension
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_area_tags' AND column_name = 'code') THEN
        ALTER TABLE work_area_tags ADD COLUMN code VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_area_tags' AND column_name = 'display_order') THEN
        ALTER TABLE work_area_tags ADD COLUMN display_order INT NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_area_tags' AND column_name = 'version') THEN
        ALTER TABLE work_area_tags ADD COLUMN version INT NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_area_tags' AND column_name = 'created_by') THEN
        ALTER TABLE work_area_tags ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_area_tags' AND column_name = 'updated_at') THEN
        ALTER TABLE work_area_tags ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_area_tags' AND column_name = 'updated_by') THEN
        ALTER TABLE work_area_tags ADD COLUMN updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_area_tags' AND column_name = 'archived_at') THEN
        ALTER TABLE work_area_tags ADD COLUMN archived_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_area_tags' AND column_name = 'archived_by') THEN
        ALTER TABLE work_area_tags ADD COLUMN archived_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Project Work Area Tags mapping extension
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_work_area_tags' AND column_name = 'created_at') THEN
        ALTER TABLE project_work_area_tags ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_work_area_tags' AND column_name = 'created_by') THEN
        ALTER TABLE project_work_area_tags ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. Project Custom Field Values Normalized Tables (Step 3 § 4)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_custom_field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    custom_field_definition_id UUID NOT NULL REFERENCES custom_field_definitions(id) ON DELETE RESTRICT,
    text_value TEXT,
    number_value NUMERIC,
    date_value DATE,
    boolean_value BOOLEAN,
    option_id UUID REFERENCES custom_field_options(id) ON DELETE RESTRICT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_proj_custom_field_val UNIQUE (project_id, custom_field_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_custom_field_proj ON project_custom_field_values (project_id);

CREATE TABLE IF NOT EXISTS project_custom_field_multi_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_custom_field_value_id UUID NOT NULL REFERENCES project_custom_field_values(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES custom_field_options(id) ON DELETE RESTRICT,
    CONSTRAINT uq_proj_custom_multi_opt UNIQUE (project_custom_field_value_id, option_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_custom_multi_val ON project_custom_field_multi_options (project_custom_field_value_id);

-- ------------------------------------------------------------------------------
-- 5. Future-Ready Entities Foreign Key Extension (Step 3 § 2)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'owner_user_id') THEN
        ALTER TABLE activities ADD COLUMN owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'version') THEN
        ALTER TABLE activities ADD COLUMN version INT NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assignments' AND column_name = 'user_id') THEN
        ALTER TABLE assignments ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assignments' AND column_name = 'version') THEN
        ALTER TABLE assignments ADD COLUMN version INT NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leave_records' AND column_name = 'user_id') THEN
        ALTER TABLE leave_records ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leave_records' AND column_name = 'version') THEN
        ALTER TABLE leave_records ADD COLUMN version INT NOT NULL DEFAULT 1;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6. Extend Audit Log Actions (Step 3 § 1)
-- ------------------------------------------------------------------------------
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS chk_audit_action;
ALTER TABLE audit_log ADD CONSTRAINT chk_audit_action CHECK (
    action IN (
        'INSERT',
        'UPDATE',
        'DELETE',
        'STATUS_CHANGE',
        'OVERRIDE',
        'LOGIN_SUCCESS',
        'LOGIN_FAILURE',
        'LOGOUT',
        'PASSWORD_CHANGE',
        'ACCOUNT_LOCKOUT',
        'ROLE_ASSIGNMENT',
        'ROLE_REMOVAL',
        'ARCHIVE',
        'REACTIVATE',
        'SCOPE_GRANT',
        'SCOPE_REVOKE',
        'MEMBERSHIP_CREATE',
        'MEMBERSHIP_UPDATE',
        'MEMBERSHIP_ARCHIVE',
        'TAG_ASSIGN',
        'TAG_REMOVE',
        'CUSTOM_FIELD_CREATE',
        'CUSTOM_FIELD_UPDATE',
        'CUSTOM_FIELD_ARCHIVE',
        'CUSTOM_FIELD_VALUE_UPDATE',
        'REFERENCE_DATA_CREATE',
        'REFERENCE_DATA_UPDATE',
        'REFERENCE_DATA_ARCHIVE',
        'USER_ACTIVATE',
        'USER_DEACTIVATE'
    )
);

-- ------------------------------------------------------------------------------
-- 7. Seed Initial Configurable Reference Data (Step 3 § 3)
-- ------------------------------------------------------------------------------

-- Product Types
INSERT INTO reference_data (id, category, code, name, display_order) VALUES
('20000000-0000-0000-0000-000000000001', 'PRODUCT_TYPE', 'EMS_ECU', 'EMS ECU', 1),
('20000000-0000-0000-0000-000000000002', 'PRODUCT_TYPE', 'VEHICLE_PROGRAM', 'Vehicle Program', 2),
('20000000-0000-0000-0000-000000000003', 'PRODUCT_TYPE', 'PLATFORM', 'Platform', 3),
('20000000-0000-0000-0000-000000000004', 'PRODUCT_TYPE', 'SOFTWARE_SERVICE', 'Software Service', 4),
('20000000-0000-0000-0000-000000000005', 'PRODUCT_TYPE', 'CUSTOM', 'Custom', 5)
ON CONFLICT (category, code) DO NOTHING;

-- Product Business Priorities
INSERT INTO reference_data (id, category, code, name, display_order) VALUES
('21000000-0000-0000-0000-000000000001', 'PRODUCT_PRIORITY', 'LOW', 'Low', 1),
('21000000-0000-0000-0000-000000000002', 'PRODUCT_PRIORITY', 'MEDIUM', 'Medium', 2),
('21000000-0000-0000-0000-000000000003', 'PRODUCT_PRIORITY', 'HIGH', 'High', 3),
('21000000-0000-0000-0000-000000000004', 'PRODUCT_PRIORITY', 'CRITICAL', 'Critical', 4)
ON CONFLICT (category, code) DO NOTHING;

-- Project Priorities
INSERT INTO reference_data (id, category, code, name, display_order) VALUES
('22000000-0000-0000-0000-000000000001', 'PROJECT_PRIORITY', 'LOW', 'Low', 1),
('22000000-0000-0000-0000-000000000002', 'PROJECT_PRIORITY', 'MEDIUM', 'Medium', 2),
('22000000-0000-0000-0000-000000000003', 'PROJECT_PRIORITY', 'HIGH', 'High', 3),
('22000000-0000-0000-0000-000000000004', 'PROJECT_PRIORITY', 'CRITICAL', 'Critical', 4)
ON CONFLICT (category, code) DO NOTHING;

-- Project Statuses
INSERT INTO reference_data (id, category, code, name, display_order) VALUES
('23000000-0000-0000-0000-000000000001', 'PROJECT_STATUS', 'DRAFT', 'Draft', 1),
('23000000-0000-0000-0000-000000000002', 'PROJECT_STATUS', 'ACTIVE', 'Active', 2),
('23000000-0000-0000-0000-000000000003', 'PROJECT_STATUS', 'ON_HOLD', 'On Hold', 3),
('23000000-0000-0000-0000-000000000004', 'PROJECT_STATUS', 'COMPLETED', 'Completed', 4),
('23000000-0000-0000-0000-000000000005', 'PROJECT_STATUS', 'CANCELLED', 'Cancelled', 5),
('23000000-0000-0000-0000-000000000006', 'PROJECT_STATUS', 'ARCHIVED', 'Archived', 6)
ON CONFLICT (category, code) DO NOTHING;

-- Activity Types
INSERT INTO reference_data (id, category, code, name, display_order) VALUES
('24000000-0000-0000-0000-000000000001', 'ACTIVITY_TYPE', 'DEVELOPMENT', 'Development', 1),
('24000000-0000-0000-0000-000000000002', 'ACTIVITY_TYPE', 'INTEGRATION', 'Integration', 2),
('24000000-0000-0000-0000-000000000003', 'ACTIVITY_TYPE', 'TESTING', 'Testing', 3),
('24000000-0000-0000-0000-000000000004', 'ACTIVITY_TYPE', 'CALIBRATION', 'Calibration', 4),
('24000000-0000-0000-0000-000000000005', 'ACTIVITY_TYPE', 'VALIDATION', 'Validation', 5),
('24000000-0000-0000-0000-000000000006', 'ACTIVITY_TYPE', 'DOCUMENTATION', 'Documentation', 6),
('24000000-0000-0000-0000-000000000007', 'ACTIVITY_TYPE', 'QUALITY', 'Quality', 7),
('24000000-0000-0000-0000-000000000008', 'ACTIVITY_TYPE', 'OTHER', 'Other', 8)
ON CONFLICT (category, code) DO NOTHING;

-- Activity Priorities
INSERT INTO reference_data (id, category, code, name, display_order) VALUES
('25000000-0000-0000-0000-000000000001', 'ACTIVITY_PRIORITY', 'LOW', 'Low', 1),
('25000000-0000-0000-0000-000000000002', 'ACTIVITY_PRIORITY', 'MEDIUM', 'Medium', 2),
('25000000-0000-0000-0000-000000000003', 'ACTIVITY_PRIORITY', 'HIGH', 'High', 3),
('25000000-0000-0000-0000-000000000004', 'ACTIVITY_PRIORITY', 'CRITICAL', 'Critical', 4)
ON CONFLICT (category, code) DO NOTHING;

-- Work-Area Tags
INSERT INTO reference_data (id, category, code, name, display_order) VALUES
('26000000-0000-0000-0000-000000000001', 'WORK_AREA_TAG', 'CUSTOMER_VEHICLE_PROGRAM', 'Customer Vehicle Program', 1),
('26000000-0000-0000-0000-000000000002', 'WORK_AREA_TAG', 'NEW_ECU_DEVELOPMENT', 'New ECU Development', 2),
('26000000-0000-0000-0000-000000000003', 'WORK_AREA_TAG', 'HARDWARE_VARIANT', 'Hardware Variant', 3),
('26000000-0000-0000-0000-000000000004', 'WORK_AREA_TAG', 'BASE_SOFTWARE', 'Base Software', 4),
('26000000-0000-0000-0000-000000000005', 'WORK_AREA_TAG', 'APPLICATION_SOFTWARE', 'Application Software', 5),
('26000000-0000-0000-0000-000000000006', 'WORK_AREA_TAG', 'CALIBRATION', 'Calibration', 6),
('26000000-0000-0000-0000-000000000007', 'WORK_AREA_TAG', 'DIAGNOSTICS_OBD', 'Diagnostics OBD', 7),
('26000000-0000-0000-0000-000000000008', 'WORK_AREA_TAG', 'FEATURE_CHANGE', 'Feature Change', 8),
('26000000-0000-0000-0000-000000000009', 'WORK_AREA_TAG', 'INTEGRATION', 'Integration', 9),
('26000000-0000-0000-0000-000000000010', 'WORK_AREA_TAG', 'VALIDATION', 'Validation', 10),
('26000000-0000-0000-0000-000000000011', 'WORK_AREA_TAG', 'COMPLIANCE', 'Compliance', 11),
('26000000-0000-0000-0000-000000000012', 'WORK_AREA_TAG', 'QUALITY', 'Quality', 12),
('26000000-0000-0000-0000-000000000013', 'WORK_AREA_TAG', 'PRODUCTION_SUPPORT', 'Production Support', 13),
('26000000-0000-0000-0000-000000000014', 'WORK_AREA_TAG', 'INTERNAL_PROCESS_TOOL_IMPROVEMENT', 'Internal Process Tool Improvement', 14)
ON CONFLICT (category, code) DO NOTHING;

-- Populate code in work_area_tags table if missing and link with reference_data
UPDATE work_area_tags SET code = 'CUSTOMER_VEHICLE_PROGRAM', display_order = 1 WHERE name ILIKE '%Customer Vehicle Program%';
UPDATE work_area_tags SET code = 'NEW_ECU_DEVELOPMENT', display_order = 2 WHERE name ILIKE '%New ECU Development%';
UPDATE work_area_tags SET code = 'HARDWARE_VARIANT', display_order = 3 WHERE name ILIKE '%Hardware Variant%';
UPDATE work_area_tags SET code = 'BASE_SOFTWARE', display_order = 4 WHERE name ILIKE '%Base Software%';
UPDATE work_area_tags SET code = 'APPLICATION_SOFTWARE', display_order = 5 WHERE name ILIKE '%Application Software%';
UPDATE work_area_tags SET code = 'CALIBRATION', display_order = 6 WHERE name ILIKE '%Calibration%';
UPDATE work_area_tags SET code = 'DIAGNOSTICS_OBD', display_order = 7 WHERE name ILIKE '%Diagnostics%';
UPDATE work_area_tags SET code = 'FEATURE_CHANGE', display_order = 8 WHERE name ILIKE '%Customer Change Request%';
UPDATE work_area_tags SET code = 'INTEGRATION', display_order = 9 WHERE name ILIKE '%HIL / System Testing%';
UPDATE work_area_tags SET code = 'VALIDATION', display_order = 10 WHERE name ILIKE '%Vehicle Validation%';
UPDATE work_area_tags SET code = 'COMPLIANCE', display_order = 11 WHERE name ILIKE '%Functional Safety%' OR name ILIKE '%Cybersecurity%';
UPDATE work_area_tags SET code = 'QUALITY', display_order = 12 WHERE name ILIKE '%Quality & Warranty%';
UPDATE work_area_tags SET code = 'PRODUCTION_SUPPORT', display_order = 13 WHERE name ILIKE '%Production Release%';

-- Insert missing tags into work_area_tags if needed
INSERT INTO work_area_tags (name, code, is_active, display_order) VALUES
('Feature Change', 'FEATURE_CHANGE', TRUE, 8),
('Integration', 'INTEGRATION', TRUE, 9),
('Validation', 'VALIDATION', TRUE, 10),
('Compliance', 'COMPLIANCE', TRUE, 11),
('Quality', 'QUALITY', TRUE, 12),
('Production Support', 'PRODUCTION_SUPPORT', TRUE, 13),
('Internal Process Tool Improvement', 'INTERNAL_PROCESS_TOOL_IMPROVEMENT', TRUE, 14)
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, display_order = EXCLUDED.display_order;

-- Update existing product 'PROD-EMS-ECU' to reference product_type_id and priority_id
UPDATE products
SET 
    product_type_id = '20000000-0000-0000-0000-000000000001',
    business_priority_id = '21000000-0000-0000-0000-000000000001'
WHERE code = 'PROD-EMS-ECU';

-- ------------------------------------------------------------------------------
-- 8. Seed Default EMS ECU Custom Fields (Step 3 § 4)
-- ------------------------------------------------------------------------------

-- 1. CUSTOMER_OEM (single_select, Required)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'CUSTOMER_OEM',
    'Customer / OEM',
    'Target automotive vehicle manufacturer or internal pilot program',
    'single_select',
    TRUE,
    TRUE,
    1
) ON CONFLICT (product_type_id, code) DO NOTHING;

INSERT INTO custom_field_options (id, custom_field_definition_id, code, label, display_order) VALUES
('30000001-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'INTERNAL', 'Internal', 1),
('30000001-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'CUSTOMER_A', 'Customer A', 2),
('30000001-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'CUSTOMER_B', 'Customer B', 3),
('30000001-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'OTHER', 'Other', 4)
ON CONFLICT (custom_field_definition_id, code) DO NOTHING;

-- 2. VEHICLE_PLATFORM (text, Required)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'VEHICLE_PLATFORM',
    'Vehicle Platform / Program',
    'Target vehicle line, architecture platform or test mule series',
    'text',
    TRUE,
    TRUE,
    2
) ON CONFLICT (product_type_id, code) DO NOTHING;

-- 3. ECU_HARDWARE_REVISION (text, Optional)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    'ECU_HARDWARE_REVISION',
    'ECU Hardware Revision',
    'Hardware board revision (e.g., HW Rev B2, Sample C)',
    'text',
    FALSE,
    TRUE,
    3
) ON CONFLICT (product_type_id, code) DO NOTHING;

-- 4. MCU_PROCESSOR_FAMILY (text, Optional)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000001',
    'MCU_PROCESSOR_FAMILY',
    'MCU / Processor Family',
    'Microcontroller family (e.g. Infineon AURIX TC3xx, NXP S32K)',
    'text',
    FALSE,
    TRUE,
    4
) ON CONFLICT (product_type_id, code) DO NOTHING;

-- 5. BASE_SOFTWARE_RELEASE (text, Optional)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000001',
    'BASE_SOFTWARE_RELEASE',
    'Base Software Release',
    'AUTOSAR / BSW release version identifier',
    'text',
    FALSE,
    TRUE,
    5
) ON CONFLICT (product_type_id, code) DO NOTHING;

-- 6. APPLICATION_SOFTWARE_RELEASE (text, Optional)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000006',
    '20000000-0000-0000-0000-000000000001',
    'APPLICATION_SOFTWARE_RELEASE',
    'Application Software Release',
    'Application software (ASW) release version',
    'text',
    FALSE,
    TRUE,
    6
) ON CONFLICT (product_type_id, code) DO NOTHING;

-- 7. CALIBRATION_RELEASE (text, Optional)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000007',
    '20000000-0000-0000-0000-000000000001',
    'CALIBRATION_RELEASE',
    'Calibration Release',
    'A2L / HEX calibration dataset baseline',
    'text',
    FALSE,
    TRUE,
    7
) ON CONFLICT (product_type_id, code) DO NOTHING;

-- 8. DIAGNOSTICS_STANDARD (multi_select, Optional)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000008',
    '20000000-0000-0000-0000-000000000001',
    'DIAGNOSTICS_STANDARD',
    'Diagnostics Standard',
    'Diagnostic protocols supported by this project',
    'multi_select',
    FALSE,
    TRUE,
    8
) ON CONFLICT (product_type_id, code) DO NOTHING;

INSERT INTO custom_field_options (id, custom_field_definition_id, code, label, display_order) VALUES
('30000008-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000008', 'UDS', 'UDS', 1),
('30000008-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000008', 'OBD_II', 'OBD-II', 2),
('30000008-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000008', 'J1939', 'J1939', 3),
('30000008-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000008', 'PROPRIETARY', 'Proprietary', 4)
ON CONFLICT (custom_field_definition_id, code) DO NOTHING;

-- 9. FUNCTIONAL_SAFETY_LEVEL (single_select, Optional)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000009',
    '20000000-0000-0000-0000-000000000001',
    'FUNCTIONAL_SAFETY_LEVEL',
    'Functional Safety Level',
    'ISO 26262 ASIL classification target',
    'single_select',
    FALSE,
    TRUE,
    9
) ON CONFLICT (product_type_id, code) DO NOTHING;

INSERT INTO custom_field_options (id, custom_field_definition_id, code, label, display_order) VALUES
('30000009-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000009', 'QM', 'QM', 1),
('30000009-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000009', 'ASIL_A', 'ASIL A', 2),
('30000009-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000009', 'ASIL_B', 'ASIL B', 3),
('30000009-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000009', 'ASIL_C', 'ASIL C', 4),
('30000009-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000009', 'ASIL_D', 'ASIL D', 5)
ON CONFLICT (custom_field_definition_id, code) DO NOTHING;

-- 10. CYBERSECURITY_RELEVANCE (single_select, Required)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000010',
    '20000000-0000-0000-0000-000000000001',
    'CYBERSECURITY_RELEVANCE',
    'Cybersecurity Relevance',
    'ISO/SAE 21434 applicability triage status',
    'single_select',
    TRUE,
    TRUE,
    10
) ON CONFLICT (product_type_id, code) DO NOTHING;

INSERT INTO custom_field_options (id, custom_field_definition_id, code, label, display_order) VALUES
('30000010-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000010', 'NOT_ASSESSED', 'Not Assessed', 1),
('30000010-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000010', 'NOT_APPLICABLE', 'Not Applicable', 2),
('30000010-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000010', 'APPLICABLE', 'Applicable', 3)
ON CONFLICT (custom_field_definition_id, code) DO NOTHING;

-- 11. COMPLIANCE_SCOPE (multi_select, Optional)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000011',
    '20000000-0000-0000-0000-000000000001',
    'COMPLIANCE_SCOPE',
    'Compliance Scope',
    'Regulatory standards and mandates in scope',
    'multi_select',
    FALSE,
    TRUE,
    11
) ON CONFLICT (product_type_id, code) DO NOTHING;

INSERT INTO custom_field_options (id, custom_field_definition_id, code, label, display_order) VALUES
('30000011-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', 'OBD', 'OBD', 1),
('30000011-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000011', 'EMISSIONS', 'Emissions', 2),
('30000011-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000011', 'FUNCTIONAL_SAFETY', 'Functional Safety', 3),
('30000011-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000011', 'CYBERSECURITY', 'Cybersecurity', 4),
('30000011-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000011', 'CUSTOMER_QUALITY', 'Customer Quality', 5)
ON CONFLICT (custom_field_definition_id, code) DO NOTHING;

-- 12. TARGET_SOP_DATE (date, Optional)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000012',
    '20000000-0000-0000-0000-000000000001',
    'TARGET_SOP_DATE',
    'Target SOP Date',
    'Start of Production target milestone date',
    'date',
    FALSE,
    TRUE,
    12
) ON CONFLICT (product_type_id, code) DO NOTHING;

-- 13. PROJECT_NOTES (text, Optional)
INSERT INTO custom_field_definitions (
    id, product_type_id, code, label, help_text, field_type, is_required, is_active, display_order
) VALUES (
    '30000000-0000-0000-0000-000000000013',
    '20000000-0000-0000-0000-000000000001',
    'PROJECT_NOTES',
    'Project Notes',
    'Administrative notes and pilot delivery instructions',
    'text',
    FALSE,
    TRUE,
    13
) ON CONFLICT (product_type_id, code) DO NOTHING;
