-- ==============================================================================
-- Migration: 010_leave_management.sql
-- Purpose: Authoritative Step 6 Leave Management schema extensions & audit constraints
-- Target: PostgreSQL 16
-- Reference: Core Pilot Step 6 & CPD-006, CPD-008
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Extend audit_log action constraint to include leave lifecycle actions
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
        'ASSIGNMENT_CREATE', 'ASSIGNMENT_UPDATE',
        'LEAVE_SUBMITTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'LEAVE_CANCELLED'
    )
);

-- ------------------------------------------------------------------------------
-- 2. Performance indexes on leave_records for high-efficiency capacity evaluation
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leave_records_user_dates ON leave_records (user_id, status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_records_member_dates ON leave_records (member_id, status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_records_status_dates ON leave_records (status, start_date, end_date);
