-- ==============================================================================
-- Migration: 009_capacity_conflicts_and_milestones.sql
-- Purpose: Schema for Capacity Conflicts, Committed Milestones & Escalation Workflow (Step 5)
-- Target: PostgreSQL 16
-- Reference: Core Pilot Step 5 Specification
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Committed Milestones Table (Step 5 § 2)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    milestone_type VARCHAR(100) NOT NULL,
    target_date DATE NOT NULL,
    is_committed BOOLEAN NOT NULL DEFAULT FALSE,
    committed_type VARCHAR(100),
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PLANNED',
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_milestones_status CHECK (
        status IN ('PLANNED', 'ACHIEVED', 'AT_RISK', 'MISSED', 'CANCELLED')
    ),
    CONSTRAINT chk_committed_milestone_type CHECK (
        is_committed = FALSE OR committed_type IN (
            'CUSTOMER_DELIVERY',
            'VEHICLE_PROGRAM_INTEGRATION',
            'VALIDATION_COMPLETION',
            'COMPLIANCE_REGULATORY',
            'PRODUCTION_RELEASE',
            'Customer delivery or customer release',
            'Vehicle-program integration delivery',
            'Validation completion or test sign-off',
            'Compliance or regulatory submission',
            'Production release or start-of-production support'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_milestones_project_target ON milestones (project_id, target_date);
CREATE INDEX IF NOT EXISTS idx_milestones_committed ON milestones (project_id, is_committed) WHERE is_committed = TRUE;

-- ------------------------------------------------------------------------------
-- 2. Relax Legacy member_id in assignments & leave_records (Align with users model)
-- ------------------------------------------------------------------------------
ALTER TABLE assignments ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE leave_records ALTER COLUMN member_id DROP NOT NULL;

-- Ensure assignments.user_id has index and FK
CREATE INDEX IF NOT EXISTS idx_assignments_user_dates ON assignments (user_id, status, start_date, end_date);

-- ------------------------------------------------------------------------------
-- 3. Capacity Conflict Cases Table (Step 5 § 3, 6, 7)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS capacity_conflict_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_code VARCHAR(50) UNIQUE NOT NULL,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
    affected_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'RESOURCE_RESOLUTION_REQUIRED',
    severity VARCHAR(50) NOT NULL DEFAULT 'CRITICAL_DELIVERY_AT_RISK',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deadline TIMESTAMPTZ NOT NULL,
    escalated_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_type VARCHAR(50),
    resolution_details JSONB,
    case_data JSONB NOT NULL,
    version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_case_status CHECK (
        status IN ('RESOURCE_RESOLUTION_REQUIRED', 'ESCALATED', 'RESOLVED', 'CANCELLED')
    ),
    CONSTRAINT chk_resolution_type CHECK (
        resolution_type IS NULL OR resolution_type IN (
            'REASSIGN_WORK',
            'ADJUST_ASSIGNMENT_DATES',
            'REDUCE_OR_SPLIT_SCOPE',
            'CHANGE_PRIORITY',
            'AUTHORIZE_OVERRIDE'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_cases_status_deadline ON capacity_conflict_cases (status, deadline);
CREATE INDEX IF NOT EXISTS idx_cases_project ON capacity_conflict_cases (project_id);
CREATE INDEX IF NOT EXISTS idx_cases_affected_user ON capacity_conflict_cases (affected_user_id);
CREATE INDEX IF NOT EXISTS idx_cases_activity ON capacity_conflict_cases (activity_id);

-- Sequence table for readable conflict case codes (e.g., CC-2026-0001)
CREATE TABLE IF NOT EXISTS capacity_case_sequence (
    id INT PRIMARY KEY DEFAULT 1,
    next_val INT NOT NULL DEFAULT 1,
    CONSTRAINT chk_single_seq CHECK (id = 1)
);
INSERT INTO capacity_case_sequence (id, next_val) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. In-App Notifications Table (Step 5 § 6)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id UUID REFERENCES capacity_conflict_cases(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON in_app_notifications (user_id, is_read, created_at DESC);

-- ------------------------------------------------------------------------------
-- 5. Extend Audit Action Constraints (Step 5 § 8)
-- ------------------------------------------------------------------------------
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS chk_audit_action;
ALTER TABLE audit_log ADD CONSTRAINT chk_audit_action CHECK (
    action IN (
        'INSERT', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'OVERRIDE',
        'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'PASSWORD_CHANGE',
        'ACCOUNT_LOCKOUT', 'ROLE_ASSIGNMENT', 'ROLE_REMOVAL', 'ARCHIVE',
        'REACTIVATE', 'SCOPE_GRANT', 'SCOPE_REVOKE', 'MEMBERSHIP_CREATE',
        'MEMBERSHIP_UPDATE', 'MEMBERSHIP_ARCHIVE', 'TAG_ASSIGN', 'TAG_REMOVE',
        'CUSTOM_FIELD_CREATE', 'CUSTOM_FIELD_UPDATE', 'CUSTOM_FIELD_ARCHIVE',
        'CUSTOM_FIELD_VALUE_UPDATE', 'REFERENCE_DATA_CREATE', 'REFERENCE_DATA_UPDATE',
        'REFERENCE_DATA_ARCHIVE', 'USER_ACTIVATE', 'USER_DEACTIVATE',
        'CASE_CREATE', 'CASE_RESOLVE', 'CASE_ESCALATE', 'MILESTONE_COMMIT',
        'ASSIGNMENT_CREATE', 'ASSIGNMENT_UPDATE'
    )
);

-- ------------------------------------------------------------------------------
-- 6. Seed Baseline Committed Milestones (Step 5 § 2)
-- ------------------------------------------------------------------------------
INSERT INTO milestones (
    id, project_id, name, milestone_type, target_date, is_committed, committed_type, description, status
) VALUES 
(
    '80000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001', -- EMS-G2-INT
    'Vehicle-Program Integration Delivery M1',
    'Vehicle-program integration delivery',
    '2027-01-31',
    TRUE,
    'Vehicle-program integration delivery',
    'Core Pilot committed integration milestone delivery for EMS Gen2 platform',
    'PLANNED'
),
(
    '80000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000002', -- EMS-G2-VAL
    'Validation Completion & Test Sign-off M1',
    'Validation completion or test sign-off',
    '2027-05-31',
    TRUE,
    'Validation completion or test sign-off',
    'Core Pilot committed validation test sign-off for EMS Gen2 platform',
    'PLANNED'
)
ON CONFLICT (id) DO NOTHING;
