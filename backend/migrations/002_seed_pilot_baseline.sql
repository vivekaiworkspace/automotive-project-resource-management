-- ==============================================================================
-- Migration: 002_seed_pilot_baseline.sql
-- Purpose: Seed authoritative Core Pilot baseline metadata
-- Target: PostgreSQL 16
-- Reference: CPD-001 (Product & Tags), CPD-003 (Calendar), CPD-008 (5 Pilot Roles)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Seed Five Pilot Roles (CPD-008)
-- ------------------------------------------------------------------------------
INSERT INTO roles (role_code, name, description) VALUES
('SYSTEM_ADMIN', 'System Administrator', 'Full platform governance, security administration, product creation, and audit override.'),
('PROJECT_MANAGER', 'Project Manager', 'Project delivery owner, activity scheduling, team assignments, and project-scoped conflict overrides.'),
('TEAM_LEAD', 'Team Lead', 'Engineering team lead, team member assignments, capacity review, and leave approval.'),
('TEAM_MEMBER', 'Team Member', 'Engineering execution role, status transitions (In Progress, Blocked, Done), personal workload view.'),
('RESOURCE_MANAGER', 'Resource Manager', 'Cross-project capacity monitoring, workload balancing, and staffing demand coordination.')
ON CONFLICT (role_code) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. Seed Standard 40h Organization Calendar (CPD-003, BR-014)
-- ------------------------------------------------------------------------------
INSERT INTO calendar_settings (id, org_timezone, standard_hours_per_day)
VALUES ('00000000-0000-0000-0000-000000000001', 'Asia/Kolkata', 8.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO calendar_working_days (calendar_settings_id, iso_day_of_week, day_name, is_working_day) VALUES
('00000000-0000-0000-0000-000000000001', 1, 'Monday', TRUE),
('00000000-0000-0000-0000-000000000001', 2, 'Tuesday', TRUE),
('00000000-0000-0000-0000-000000000001', 3, 'Wednesday', TRUE),
('00000000-0000-0000-0000-000000000001', 4, 'Thursday', TRUE),
('00000000-0000-0000-0000-000000000001', 5, 'Friday', TRUE),
('00000000-0000-0000-0000-000000000001', 6, 'Saturday', FALSE),
('00000000-0000-0000-0000-000000000001', 7, 'Sunday', FALSE)
ON CONFLICT (calendar_settings_id, iso_day_of_week) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. Seed Pilot Top-Level Product: EMS ECU Development (CPD-001)
-- ------------------------------------------------------------------------------
INSERT INTO products (id, code, name, product_type, status, business_priority)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    'PROD-EMS-ECU',
    'EMS ECU Development',
    'EMS ECU',
    'ACTIVE',
    1
)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. Seed 14 Approved Project Work-Area Tags (CPD-001)
-- ------------------------------------------------------------------------------
INSERT INTO work_area_tags (name, is_active) VALUES
('Customer Vehicle Program', TRUE),
('New ECU Development', TRUE),
('Hardware Variant', TRUE),
('Base Software', TRUE),
('Application Software', TRUE),
('Calibration & Tuning', TRUE),
('HIL / System Testing', TRUE),
('Vehicle Validation', TRUE),
('Functional Safety (ISO 26262)', TRUE),
('Cybersecurity (ISO/SAE 21434)', TRUE),
('Diagnostics (UDS / OBD-II)', TRUE),
('Production Release & Flashing', TRUE),
('Quality & Warranty', TRUE),
('Customer Change Request', TRUE)
ON CONFLICT (name) DO NOTHING;
