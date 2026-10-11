-- ==============================================================================
-- Migration 006: Extend Users Schema for Step 3 Configurable Records
-- Adds versioning, optimistic locking, audit attributes, and logical archival to users table
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'version') THEN
        ALTER TABLE users ADD COLUMN version INT NOT NULL DEFAULT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'created_by') THEN
        ALTER TABLE users ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
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
