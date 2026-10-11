-- ==============================================================================
-- Migration: 008_seed_pilot_activities.sql
-- Purpose: Authoritative Core Pilot Seed Activities for EMS-G2-INT and EMS-G2-VAL (Step 4 § 10)
-- Target: PostgreSQL 16
-- Reference: Core Pilot Step 4 § 10 Seed Data Requirements
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Seed Parent Activities for EMS-G2-INT (60000000-0000-0000-0000-000000000001)
-- ------------------------------------------------------------------------------

-- Parent 1: Base Software Integration
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000002', -- Software Integration Phase
    NULL,
    'EMS-G2-INT-1',
    'Base Software Integration',
    '24000000-0000-0000-0000-000000000002', -- INTEGRATION
    '25000000-0000-0000-0000-000000000003', -- HIGH
    'IN_PROGRESS',
    150.00, 150.00, 130.00, -- Roll-up remaining effort: 20 + 60 + 50 = 130
    '2026-12-01', '2027-01-31',
    '40000000-0000-0000-0000-000000000003', -- lead.integration
    1
) ON CONFLICT (id) DO NOTHING;

-- Child 1: Prepare Integration Environment
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    'EMS-G2-INT-2',
    'Prepare Integration Environment',
    '24000000-0000-0000-0000-000000000001', -- DEVELOPMENT
    '25000000-0000-0000-0000-000000000003', -- HIGH
    'IN_PROGRESS',
    40.00, 40.00, 20.00,
    '2026-12-01', '2026-12-15',
    '40000000-0000-0000-0000-000000000005', -- engineer.integration1
    1
) ON CONFLICT (id) DO NOTHING;

-- Child 2: Integrate Base Software Build
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000003',
    '60000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    'EMS-G2-INT-3',
    'Integrate Base Software Build',
    '24000000-0000-0000-0000-000000000002', -- INTEGRATION
    '25000000-0000-0000-0000-000000000003', -- HIGH
    'PLANNED',
    60.00, 60.00, 60.00,
    '2026-12-16', '2027-01-15',
    '40000000-0000-0000-0000-000000000006', -- engineer.integration2
    1
) ON CONFLICT (id) DO NOTHING;

-- Child 3: Resolve Integration Defects
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000004',
    '60000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    'EMS-G2-INT-4',
    'Resolve Integration Defects',
    '24000000-0000-0000-0000-000000000003', -- TESTING
    '25000000-0000-0000-0000-000000000003', -- HIGH
    'PLANNED',
    50.00, 50.00, 50.00,
    '2027-01-16', '2027-01-31',
    '40000000-0000-0000-0000-000000000005', -- engineer.integration1
    1
) ON CONFLICT (id) DO NOTHING;

-- Parent 2: Diagnostics OBD Integration
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000005',
    '60000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000003', -- System Integration Phase
    NULL,
    'EMS-G2-INT-5',
    'Diagnostics OBD Integration',
    '24000000-0000-0000-0000-000000000002', -- INTEGRATION
    '25000000-0000-0000-0000-000000000003', -- HIGH
    'PLANNED',
    100.00, 100.00, 100.00, -- Roll-up remaining effort: 45 + 55 = 100
    '2027-02-01', '2027-03-31',
    '40000000-0000-0000-0000-000000000003', -- lead.integration
    1
) ON CONFLICT (id) DO NOTHING;

-- Child 1: Configure UDS Services
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000006',
    '60000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000005',
    'EMS-G2-INT-6',
    'Configure UDS Services',
    '24000000-0000-0000-0000-000000000001', -- DEVELOPMENT
    '25000000-0000-0000-0000-000000000003', -- HIGH
    'PLANNED',
    45.00, 45.00, 45.00,
    '2027-02-01', '2027-02-28',
    '40000000-0000-0000-0000-000000000006', -- engineer.integration2
    1
) ON CONFLICT (id) DO NOTHING;

-- Child 2: Execute OBD Regression Tests
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000007',
    '60000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000005',
    'EMS-G2-INT-7',
    'Execute OBD Regression Tests',
    '24000000-0000-0000-0000-000000000003', -- TESTING
    '25000000-0000-0000-0000-000000000003', -- HIGH
    'PLANNED',
    55.00, 55.00, 55.00,
    '2027-03-01', '2027-03-31',
    '40000000-0000-0000-0000-000000000005', -- engineer.integration1
    1
) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. Seed Activities for EMS-G2-VAL (60000000-0000-0000-0000-000000000002)
-- ------------------------------------------------------------------------------

-- Parent 1: Calibration Preparation
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000008',
    '60000000-0000-0000-0000-000000000002',
    '62000000-0000-0000-0000-000000000002', -- Calibration Phase
    NULL,
    'EMS-G2-VAL-1',
    'Calibration Preparation',
    '24000000-0000-0000-0000-000000000004', -- CALIBRATION
    '25000000-0000-0000-0000-000000000003', -- HIGH
    'IN_PROGRESS',
    80.00, 80.00, 55.00, -- Roll-up remaining effort: 25 + 30 = 55
    '2027-01-01', '2027-03-31',
    '40000000-0000-0000-0000-000000000004', -- lead.validation
    1
) ON CONFLICT (id) DO NOTHING;

-- Child 1: Prepare Calibration Dataset
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000009',
    '60000000-0000-0000-0000-000000000002',
    '62000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000008',
    'EMS-G2-VAL-2',
    'Prepare Calibration Dataset',
    '24000000-0000-0000-0000-000000000004', -- CALIBRATION
    '25000000-0000-0000-0000-000000000003', -- HIGH
    'IN_PROGRESS',
    50.00, 50.00, 25.00,
    '2027-01-01', '2027-02-15',
    '40000000-0000-0000-0000-000000000008', -- engineer.calibration1
    1
) ON CONFLICT (id) DO NOTHING;

-- Child 2: Review Calibration Parameters
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000010',
    '60000000-0000-0000-0000-000000000002',
    '62000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000008',
    'EMS-G2-VAL-3',
    'Review Calibration Parameters',
    '24000000-0000-0000-0000-000000000007', -- QUALITY
    '25000000-0000-0000-0000-000000000002', -- MEDIUM
    'PLANNED',
    30.00, 30.00, 30.00,
    '2027-02-16', '2027-03-31',
    '40000000-0000-0000-0000-000000000008', -- engineer.calibration1
    1
) ON CONFLICT (id) DO NOTHING;

-- Parent 2: Vehicle Validation
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000011',
    '60000000-0000-0000-0000-000000000002',
    '62000000-0000-0000-0000-000000000003', -- Vehicle Validation Phase
    NULL,
    'EMS-G2-VAL-4',
    'Vehicle Validation',
    '24000000-0000-0000-0000-000000000005', -- VALIDATION
    '25000000-0000-0000-0000-000000000003', -- HIGH
    'PLANNED',
    100.00, 100.00, 100.00, -- Roll-up remaining effort: 70 + 30 = 100
    '2027-04-01', '2027-05-31',
    '40000000-0000-0000-0000-000000000004', -- lead.validation
    1
) ON CONFLICT (id) DO NOTHING;

-- Child 1: Execute Vehicle Validation Tests
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000012',
    '60000000-0000-0000-0000-000000000002',
    '62000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000011',
    'EMS-G2-VAL-5',
    'Execute Vehicle Validation Tests',
    '24000000-0000-0000-0000-000000000005', -- VALIDATION
    '25000000-0000-0000-0000-000000000004', -- CRITICAL
    'PLANNED',
    70.00, 70.00, 70.00,
    '2027-04-01', '2027-04-30',
    '40000000-0000-0000-0000-000000000007', -- engineer.validation1
    1
) ON CONFLICT (id) DO NOTHING;

-- Child 2: Document Validation Findings
INSERT INTO activities (
    id, project_id, phase_id, parent_activity_id, readable_activity_id,
    title, activity_type_id, priority_id, status,
    original_estimate_hours, current_estimate_hours, remaining_effort_hours,
    start_date, due_date, owner_user_id, version
) VALUES (
    '70000000-0000-0000-0000-000000000013',
    '60000000-0000-0000-0000-000000000002',
    '62000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000011',
    'EMS-G2-VAL-6',
    'Document Validation Findings',
    '24000000-0000-0000-0000-000000000006', -- DOCUMENTATION
    '25000000-0000-0000-0000-000000000002', -- MEDIUM
    'PLANNED',
    30.00, 30.00, 30.00,
    '2027-05-01', '2027-05-31',
    '40000000-0000-0000-0000-000000000007', -- engineer.validation1
    1
) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. Initialize Per-Project Sequence Counters (Step 4 § 3)
-- ------------------------------------------------------------------------------
INSERT INTO project_activity_sequences (project_id, next_seq) VALUES
('60000000-0000-0000-0000-000000000001', 8),
('60000000-0000-0000-0000-000000000002', 7)
ON CONFLICT (project_id) DO UPDATE SET next_seq = EXCLUDED.next_seq;
