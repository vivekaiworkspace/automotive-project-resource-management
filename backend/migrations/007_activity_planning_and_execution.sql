-- ==============================================================================
-- Migration: 007_activity_planning_and_execution.sql
-- Purpose: Authoritative Schema for Activity Planning & Execution Workflow (Step 4)
-- Target: PostgreSQL 16
-- Reference: Core Pilot Step 4 Specification
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Extend and Align Activities Table Schema (Step 4 § 1 & 2)
-- ------------------------------------------------------------------------------

-- Make legacy owner_id nullable and add authoritative owner_user_id (references users)
ALTER TABLE activities ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE RESTRICT;

-- Support immutable project-scoped readable_activity_id (e.g. EMS-G2-INT-1)
ALTER TABLE activities ALTER COLUMN code DROP NOT NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS readable_activity_id VARCHAR(100);

-- Foreign keys to configurable reference data
ALTER TABLE activities ALTER COLUMN activity_type DROP NOT NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_type_id UUID REFERENCES reference_data(id) ON DELETE RESTRICT;

ALTER TABLE activities ALTER COLUMN priority DROP NOT NULL;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS chk_activities_priority;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS priority_id UUID REFERENCES reference_data(id) ON DELETE RESTRICT;

-- Relax non-draft mandatory fields so Draft activities can be saved incomplete
ALTER TABLE activities ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE activities ALTER COLUMN due_date DROP NOT NULL;
ALTER TABLE activities ALTER COLUMN original_estimate_hours DROP NOT NULL;
ALTER TABLE activities ALTER COLUMN current_estimate_hours DROP NOT NULL;
ALTER TABLE activities ALTER COLUMN remaining_effort_hours DROP NOT NULL;
ALTER TABLE activities ALTER COLUMN actual_effort_hours DROP NOT NULL;
ALTER TABLE activities ALTER COLUMN original_estimate_hours DROP DEFAULT;
ALTER TABLE activities ALTER COLUMN current_estimate_hours DROP DEFAULT;
ALTER TABLE activities ALTER COLUMN remaining_effort_hours DROP DEFAULT;

-- Step 4 execution fields
ALTER TABLE activities ADD COLUMN IF NOT EXISTS blocker_description TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS forecast_finish_date DATE;

-- Optimistic locking and audit metadata
ALTER TABLE activities ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 2. Constraints & Invariants (Step 4 § 2, 4, 5)
-- ------------------------------------------------------------------------------

-- Unique readable activity ID within project
ALTER TABLE activities DROP CONSTRAINT IF EXISTS uq_activities_project_readable_id;
ALTER TABLE activities ADD CONSTRAINT uq_activities_project_readable_id UNIQUE (project_id, readable_activity_id);

-- Fixed Core Pilot status constraint
ALTER TABLE activities DROP CONSTRAINT IF EXISTS chk_activities_status;
ALTER TABLE activities ADD CONSTRAINT chk_activities_status CHECK (
    status IN ('DRAFT', 'READY_FOR_PLANNING', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED')
);

-- Estimates non-negative check
ALTER TABLE activities DROP CONSTRAINT IF EXISTS chk_activities_estimates;
ALTER TABLE activities ADD CONSTRAINT chk_activities_estimates CHECK (
    (original_estimate_hours IS NULL OR original_estimate_hours >= 0) AND
    (current_estimate_hours IS NULL OR current_estimate_hours >= 0) AND
    (remaining_effort_hours IS NULL OR remaining_effort_hours >= 0) AND
    (actual_effort_hours IS NULL OR actual_effort_hours >= 0)
);

-- Dates consistency check: due_date >= start_date
ALTER TABLE activities DROP CONSTRAINT IF EXISTS chk_activities_dates;
ALTER TABLE activities ADD CONSTRAINT chk_activities_dates CHECK (
    due_date IS NULL OR start_date IS NULL OR due_date >= start_date
);

-- Forecast finish date consistency check: forecast_finish_date >= start_date
ALTER TABLE activities DROP CONSTRAINT IF EXISTS chk_activities_forecast;
ALTER TABLE activities ADD CONSTRAINT chk_activities_forecast CHECK (
    forecast_finish_date IS NULL OR start_date IS NULL OR forecast_finish_date >= start_date
);

-- Activity cannot be its own parent
ALTER TABLE activities DROP CONSTRAINT IF EXISTS chk_activities_self_parent;
ALTER TABLE activities ADD CONSTRAINT chk_activities_self_parent CHECK (
    parent_activity_id IS NULL OR parent_activity_id != id
);

-- Leaving Draft invariant: mandatory planning fields required
ALTER TABLE activities DROP CONSTRAINT IF EXISTS chk_activities_draft_exit;
ALTER TABLE activities ADD CONSTRAINT chk_activities_draft_exit CHECK (
    status = 'DRAFT' OR (
        title IS NOT NULL AND
        project_id IS NOT NULL AND
        activity_type_id IS NOT NULL AND
        priority_id IS NOT NULL AND
        original_estimate_hours IS NOT NULL AND original_estimate_hours >= 0 AND
        current_estimate_hours IS NOT NULL AND current_estimate_hours >= 0 AND
        remaining_effort_hours IS NOT NULL AND remaining_effort_hours >= 0 AND
        start_date IS NOT NULL AND
        due_date IS NOT NULL
    )
);

-- ------------------------------------------------------------------------------
-- 3. Per-Project Sequence Generator Table (Step 4 § 3)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_activity_sequences (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    next_seq INT NOT NULL DEFAULT 1
);

-- ------------------------------------------------------------------------------
-- 4. Database Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_activities_project_status ON activities (project_id, status);
CREATE INDEX IF NOT EXISTS idx_activities_owner ON activities (owner_user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activities_parent ON activities (parent_activity_id);
CREATE INDEX IF NOT EXISTS idx_activities_phase ON activities (phase_id);
CREATE INDEX IF NOT EXISTS idx_activities_readable_id ON activities (readable_activity_id);
CREATE INDEX IF NOT EXISTS idx_activities_archived ON activities (archived_at);

-- ------------------------------------------------------------------------------
-- 5. Sub-Activity Hierarchy & Integrity Triggers (Step 4 § 2 & 4)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_activities_integrity()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Activities in archived or cancelled projects cannot be created or updated
    IF EXISTS (
        SELECT 1 FROM projects 
        WHERE id = NEW.project_id AND (archived_at IS NOT NULL OR status IN ('ARCHIVED', 'CANCELLED'))
    ) THEN
        RAISE EXCEPTION 'Activities in archived or cancelled projects cannot be created or updated';
    END IF;

    -- 2. Sub-activity nesting depth and parent integrity
    IF NEW.parent_activity_id IS NOT NULL THEN
        IF NEW.parent_activity_id = NEW.id THEN
            RAISE EXCEPTION 'An activity cannot be its own parent';
        END IF;

        -- Check parent does not have a parent (Max 1 level hierarchy: Activity -> Sub-activity)
        IF EXISTS (
            SELECT 1 FROM activities 
            WHERE id = NEW.parent_activity_id AND parent_activity_id IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'Sub-activity nesting depth cannot exceed 1 level (Activity -> Sub-activity)';
        END IF;

        -- Check parent is not archived
        IF EXISTS (
            SELECT 1 FROM activities 
            WHERE id = NEW.parent_activity_id AND archived_at IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'An archived activity cannot be used as a parent';
        END IF;

        -- Check NEW does not already have children
        IF EXISTS (
            SELECT 1 FROM activities 
            WHERE parent_activity_id = NEW.id AND archived_at IS NULL
        ) THEN
            RAISE EXCEPTION 'An activity with children cannot become a child of another activity';
        END IF;
    END IF;

    -- 3. On UPDATE specific validation
    IF TG_OP = 'UPDATE' THEN
        -- Archived activity cannot be edited (unless being restored: OLD was archived, NEW is active)
        IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NOT NULL THEN
            RAISE EXCEPTION 'An archived activity cannot be edited';
        END IF;

        -- Readable activity ID is immutable
        IF OLD.readable_activity_id IS NOT NULL AND NEW.readable_activity_id <> OLD.readable_activity_id THEN
            RAISE EXCEPTION 'readable_activity_id is immutable';
        END IF;

        -- Original estimate is immutable once planning begins (status != 'DRAFT')
        IF OLD.status <> 'DRAFT' AND OLD.original_estimate_hours IS NOT NULL THEN
            IF NEW.original_estimate_hours IS DISTINCT FROM OLD.original_estimate_hours THEN
                RAISE EXCEPTION 'original_estimate_hours is immutable once planning begins';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activities_depth_check ON activities;
DROP TRIGGER IF EXISTS trg_activities_integrity_check ON activities;
CREATE TRIGGER trg_activities_integrity_check
BEFORE INSERT OR UPDATE ON activities
FOR EACH ROW EXECUTE FUNCTION trg_activities_integrity();

-- ------------------------------------------------------------------------------
-- 6. Extend Audit Log Action Check Constraint (Step 4 § 7)
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
        'USER_DEACTIVATE',
        'ACTIVITY_ROLLUP',
        'ACTIVITY_RESTORE'
    )
);
