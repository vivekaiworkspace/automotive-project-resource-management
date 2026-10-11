-- ==============================================================================
-- Migration: 005_seed_pilot_teams_projects.sql
-- Purpose: Authoritative Core Pilot Seed Data for Teams, Projects, Scopes & Users
-- Target: PostgreSQL 16
-- Reference: Core Pilot Step 3 § 7
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Seed Login-Capable Test Users with Argon2id Password Hashes (Step 3 § 7)
-- Notice: Passwords are non-production temporary values; must_change_password=TRUE
-- ------------------------------------------------------------------------------
INSERT INTO users (id, email, password_hash, full_name, is_active, must_change_password) VALUES
('40000000-0000-0000-0000-000000000001', 'pm.integration@example.test', '$argon2id$v=19$m=65536,t=3,p=4$rzmNvrzYl7lm0s1TAsqvIw$1vRTtphxA7K9vKEvO6OyGIxqwTko8qXQ5XGJ4Q9QPLg', 'Project Manager (Integration)', TRUE, TRUE),
('40000000-0000-0000-0000-000000000002', 'pm.validation@example.test', '$argon2id$v=19$m=65536,t=3,p=4$IjQLI/yhiJ6j9YqVnooORQ$479/Qn6txi9m7L3xxDO3psPbwGMJrWI24hAvDwZDkCQ', 'Project Manager (Validation)', TRUE, TRUE),
('40000000-0000-0000-0000-000000000003', 'lead.integration@example.test', '$argon2id$v=19$m=65536,t=3,p=4$VP3A2vVmAvmFcsWideDr3Q$D7fAV6djVp+ZvVjbaH6qCxlAGh1NA+WutarmIuTvcvs', 'Team Lead (Platform & Integration)', TRUE, TRUE),
('40000000-0000-0000-0000-000000000004', 'lead.validation@example.test', '$argon2id$v=19$m=65536,t=3,p=4$39G/HSTfr+2mtlwfgcTGkQ$YjStmIsRjm2R+j1p1rrTL+PSyRGpGF/MUnm54JjBli0', 'Team Lead (Validation & Calibration)', TRUE, TRUE),
('40000000-0000-0000-0000-000000000005', 'engineer.integration1@example.test', '$argon2id$v=19$m=65536,t=3,p=4$IO02FnfFwXWzVwij7aIrEQ$dvCivobQJzvvfESJa44N2BBN7zjYrQJjpa9qxr09ie8', 'Integration Engineer 1', TRUE, TRUE),
('40000000-0000-0000-0000-000000000006', 'engineer.integration2@example.test', '$argon2id$v=19$m=65536,t=3,p=4$NxCB3S76TQ4Qub+EfG5rxA$lax5VoMpzV1zurJWSewAgzqvlHoZcz8DfNrWP8ZMDZE', 'Integration Engineer 2', TRUE, TRUE),
('40000000-0000-0000-0000-000000000007', 'engineer.validation1@example.test', '$argon2id$v=19$m=65536,t=3,p=4$Rpy6mrkpfxwlMh3VmIK15A$yfDaEhqp5/4wJm4+3B1c9qYmJdpGPG7+uBWaGkcS4vY', 'Validation Engineer 1', TRUE, TRUE),
('40000000-0000-0000-0000-000000000008', 'engineer.calibration1@example.test', '$argon2id$v=19$m=65536,t=3,p=4$aZnj1TmYgS0VCnCOMoZ1Zw$uWL6qWPnnyKujJxOpqus3FdViTe5LzB8DtXkTBEDLRU', 'Calibration Engineer 1', TRUE, TRUE),
('40000000-0000-0000-0000-000000000009', 'resource.manager@example.test', '$argon2id$v=19$m=65536,t=3,p=4$C+HP+w3SqWLY+JSszfiQFw$SUWHR2elphbhMEEXMa4gpKTCzXw2WSeKoMJHsh8eOIo', 'Resource Manager', TRUE, TRUE)
ON CONFLICT (email) DO UPDATE SET 
    password_hash = EXCLUDED.password_hash,
    must_change_password = TRUE,
    is_active = TRUE;

-- Assign Roles
INSERT INTO user_roles (user_id, role_code) VALUES
('40000000-0000-0000-0000-000000000001', 'PROJECT_MANAGER'),
('40000000-0000-0000-0000-000000000002', 'PROJECT_MANAGER'),
('40000000-0000-0000-0000-000000000003', 'TEAM_LEAD'),
('40000000-0000-0000-0000-000000000004', 'TEAM_LEAD'),
('40000000-0000-0000-0000-000000000005', 'TEAM_MEMBER'),
('40000000-0000-0000-0000-000000000006', 'TEAM_MEMBER'),
('40000000-0000-0000-0000-000000000007', 'TEAM_MEMBER'),
('40000000-0000-0000-0000-000000000008', 'TEAM_MEMBER'),
('40000000-0000-0000-0000-000000000009', 'RESOURCE_MANAGER')
ON CONFLICT (user_id, role_code) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. Seed Pilot Teams (Step 3 § 7)
-- ------------------------------------------------------------------------------
INSERT INTO teams (id, code, name, description, status) VALUES
('50000000-0000-0000-0000-000000000001', 'TEAM-PLAT-INT', 'EMS Platform & Integration Team', 'Platform software, AUTOSAR base software and system integration engineering', 'ACTIVE'),
('50000000-0000-0000-0000-000000000002', 'TEAM-VAL-CAL', 'EMS Validation & Calibration Team', 'Hardware-in-the-loop validation, dyno engine calibration and vehicle testing', 'ACTIVE')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. Seed Team Memberships (Step 3 § 2 & 7)
-- ------------------------------------------------------------------------------
INSERT INTO team_memberships (id, team_id, user_id, is_team_lead, active_from) VALUES
('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', TRUE, '2026-10-01'),
('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', FALSE, '2026-10-01'),
('51000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000006', FALSE, '2026-10-01'),
('51000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', TRUE, '2026-10-01'),
('51000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000007', FALSE, '2026-10-01'),
('51000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000008', FALSE, '2026-10-01')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. Seed Pilot Projects (Step 3 § 7)
-- ------------------------------------------------------------------------------
INSERT INTO projects (
    id, product_id, code, name, description, status,
    project_priority_id, project_status_id,
    planned_start_date, planned_finish_date
) VALUES (
    '60000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'EMS-G2-INT',
    'EMS Gen2 Platform Integration',
    'Gen2 EMS platform integration, base software migration and architecture compliance',
    'ACTIVE',
    '22000000-0000-0000-0000-000000000003', -- HIGH priority
    '23000000-0000-0000-0000-000000000002', -- ACTIVE status
    '2026-11-02',
    '2027-03-31'
),
(
    '60000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'EMS-G2-VAL',
    'EMS Gen2 Validation & Calibration',
    'Gen2 vehicle calibration dataset development and HIL rig validation',
    'ACTIVE',
    '22000000-0000-0000-0000-000000000003', -- HIGH priority
    '23000000-0000-0000-0000-000000000002', -- ACTIVE status
    '2026-12-01',
    '2027-05-31'
)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. Seed Project Phases (Step 3 § 7)
-- ------------------------------------------------------------------------------
-- Project 1 (EMS-G2-INT) Phases
INSERT INTO phases (id, project_id, name, sequence_number, sequence_order, is_active, planned_start_date, planned_finish_date) VALUES
('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Architecture & Planning', 1, 1, TRUE, '2026-11-02', '2026-11-30'),
('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Software Integration', 2, 2, TRUE, '2026-12-01', '2027-01-31'),
('61000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', 'System Integration', 3, 3, TRUE, '2027-02-01', '2027-03-31')
ON CONFLICT DO NOTHING;

-- Project 2 (EMS-G2-VAL) Phases
INSERT INTO phases (id, project_id, name, sequence_number, sequence_order, is_active, planned_start_date, planned_finish_date) VALUES
('62000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Test Planning', 1, 1, TRUE, '2026-12-01', '2026-12-31'),
('62000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'Calibration', 2, 2, TRUE, '2027-01-01', '2027-03-31'),
('62000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000002', 'Vehicle Validation', 3, 3, TRUE, '2027-04-01', '2027-05-31')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 6. Seed Project Work-Area Tags Mapping (Step 3 § 7)
-- ------------------------------------------------------------------------------
-- Project 1 Tags: New ECU Development, Base Software, Application Software, Integration, Diagnostics OBD
INSERT INTO project_work_area_tags (project_id, tag_id)
SELECT '60000000-0000-0000-0000-000000000001', id FROM work_area_tags 
WHERE code IN ('NEW_ECU_DEVELOPMENT', 'BASE_SOFTWARE', 'APPLICATION_SOFTWARE', 'INTEGRATION', 'DIAGNOSTICS_OBD')
ON CONFLICT (project_id, tag_id) DO NOTHING;

-- Project 2 Tags: Calibration, Validation, Quality, Compliance, Customer Vehicle Program
INSERT INTO project_work_area_tags (project_id, tag_id)
SELECT '60000000-0000-0000-0000-000000000002', id FROM work_area_tags 
WHERE code IN ('CALIBRATION', 'VALIDATION', 'QUALITY', 'COMPLIANCE', 'CUSTOMER_VEHICLE_PROGRAM')
ON CONFLICT (project_id, tag_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 7. Seed Project Custom Field Values (Step 3 § 7)
-- Customer/OEM: Internal, Vehicle Platform: EMS Gen2 Platform, Cybersecurity: Applicable
-- ------------------------------------------------------------------------------
-- Project 1 (EMS-G2-INT) Custom Field Values
INSERT INTO project_custom_field_values (
    project_id, custom_field_definition_id, option_id, text_value
) VALUES
-- CUSTOMER_OEM = Internal (option 30000001-0000-0000-0000-000000000001)
('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '30000001-0000-0000-0000-000000000001', NULL),
-- VEHICLE_PLATFORM = EMS Gen2 Platform
('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', NULL, 'EMS Gen2 Platform'),
-- CYBERSECURITY_RELEVANCE = Applicable (option 30000010-0000-0000-0000-000000000003)
('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000010', '30000010-0000-0000-0000-000000000003', NULL)
ON CONFLICT (project_id, custom_field_definition_id) DO NOTHING;

-- Project 2 (EMS-G2-VAL) Custom Field Values
INSERT INTO project_custom_field_values (
    project_id, custom_field_definition_id, option_id, text_value
) VALUES
-- CUSTOMER_OEM = Internal
('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '30000001-0000-0000-0000-000000000001', NULL),
-- VEHICLE_PLATFORM = EMS Gen2 Platform
('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', NULL, 'EMS Gen2 Platform'),
-- CYBERSECURITY_RELEVANCE = Applicable
('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000010', '30000010-0000-0000-0000-000000000003', NULL)
ON CONFLICT (project_id, custom_field_definition_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 8. Seed Scopes (Step 3 § 5 & 7)
-- pm.integration scoped only to EMS-G2-INT
-- pm.validation scoped only to EMS-G2-VAL
-- resource.manager scoped to both teams
-- ------------------------------------------------------------------------------
INSERT INTO project_manager_scopes (user_id, project_id) VALUES
('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001'),
('40000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002')
ON CONFLICT (user_id, project_id) DO NOTHING;

INSERT INTO resource_manager_scopes (user_id, team_id) VALUES
('40000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000001'),
('40000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000002')
ON CONFLICT (user_id, team_id) DO NOTHING;

-- Mirror into legacy user_scopes table for backward compatibility
INSERT INTO user_scopes (user_id, scope_type, target_id) VALUES
('40000000-0000-0000-0000-000000000001', 'PROJECT', '60000000-0000-0000-0000-000000000001'),
('40000000-0000-0000-0000-000000000002', 'PROJECT', '60000000-0000-0000-0000-000000000002'),
('40000000-0000-0000-0000-000000000009', 'TEAM', '50000000-0000-0000-0000-000000000001'),
('40000000-0000-0000-0000-000000000009', 'TEAM', '50000000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;
