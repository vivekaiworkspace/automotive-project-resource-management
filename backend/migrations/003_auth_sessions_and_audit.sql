-- ==============================================================================
-- Migration: 003_auth_sessions_and_audit.sql
-- Purpose: Provision server-side session management and extend audit actions
-- Target: PostgreSQL 16
-- Reference: Step 2 Authentication, Sessions, Authorization & Audit Requirements
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Server-Side User Sessions Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    csrf_secret VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    user_agent TEXT,
    ip_address VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions (token_hash) WHERE is_revoked = FALSE;
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at);

-- ------------------------------------------------------------------------------
-- 2. Extend Audit Log Table for Authentication Actions (Step 2 Req 4)
-- ------------------------------------------------------------------------------
-- Make actor_id and entity_id nullable for login failures or pre-auth events
ALTER TABLE audit_log ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE audit_log ALTER COLUMN entity_id DROP NOT NULL;
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_id_fkey;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

-- Add ip_address and user_agent columns to audit_log if not present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'ip_address') THEN
        ALTER TABLE audit_log ADD COLUMN ip_address VARCHAR(45);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'user_agent') THEN
        ALTER TABLE audit_log ADD COLUMN user_agent TEXT;
    END IF;
END $$;

-- Update chk_audit_action constraint to support authentication and authorization events
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
        'ROLE_REMOVAL'
    )
);
