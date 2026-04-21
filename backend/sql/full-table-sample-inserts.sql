-- ============================================================
-- FULL SAMPLE DATA INSERTS (PostgreSQL)
-- Aligned to current snake_case DB schema
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) roles
-- ------------------------------------------------------------
INSERT INTO roles (id, code, name, description, created_at, updated_at)
VALUES
  ('role_employee', 'EMPLOYEE', 'Employee', 'Default role for employees', NOW(), NOW()),
  ('role_unit_coordinator', 'UNIT_COORDINATOR', 'Unit Coordinator', 'Screens and routes submitted ideas', NOW(), NOW()),
  ('role_selection_committee', 'SELECTION_COMMITTEE', 'Selection Committee', 'Assigns implementers and timelines', NOW(), NOW()),
  ('role_implementer', 'IMPLEMENTER', 'Implementer', 'Executes and updates assigned ideas', NOW(), NOW()),
  ('role_be_member', 'BUSINESS_EXCELLENCE', 'Business Excellence Member', 'Reviews implementation templates', NOW(), NOW()),
  ('role_be_head', 'BUSINESS_EXCELLENCE_HEAD', 'Business Excellence Head', 'Final BE evaluation and scoring', NOW(), NOW()),
  ('role_hod_finance', 'HOD_FINANCE', 'Head - Finance', 'Approves finance-related evaluations', NOW(), NOW()),
  ('role_hod_hr', 'HOD_HR', 'Head - HR', 'Approves HR and reward workflow', NOW(), NOW()),
  ('role_hod_quality', 'HOD_QUALITY', 'Head - Quality', 'Approves quality-related evaluations', NOW(), NOW()),
  ('role_admin', 'ADMIN', 'Administrator', 'System administrator', NOW(), NOW()),
  ('role_super_admin', 'SUPER_ADMIN', 'Super Admin', 'System super administrator', NOW(), NOW())
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ------------------------------------------------------------
-- 2) users
-- ------------------------------------------------------------
INSERT INTO users (id, employee_code, email, name, department, designation, is_active, password, last_login_at, created_at, updated_at)
VALUES
  ('usr_emp1001', 'EMP1001', 'geetha.nurse@kaizen.com', 'Nurse Geetha', 'Nursing', 'Staff Nurse', TRUE, 'welcome123', NOW() - INTERVAL '1 day', NOW(), NOW()),
  ('usr_emp1002', 'EMP1002', 'anita.rao@kaizen.com', 'Anita Rao', 'Operations', 'Unit Coordinator', TRUE, 'welcome123', NOW() - INTERVAL '2 days', NOW(), NOW()),
  ('usr_emp1003', 'EMP1003', 'rajesh.kumar@kaizen.com', 'Rajesh Kumar', 'Operations', 'Implementer', TRUE, 'welcome123', NOW() - INTERVAL '3 days', NOW(), NOW()),
  ('usr_emp1004', 'EMP1004', 'be.member@kaizen.com', 'BE Member', 'Business Excellence', 'BE Member', TRUE, 'welcome123', NOW() - INTERVAL '1 hour', NOW(), NOW()),
  ('usr_emp1005', 'EMP1005', 'be.head@kaizen.com', 'BE Head', 'Business Excellence', 'BE Head', TRUE, 'welcome123', NOW() - INTERVAL '30 minutes', NOW(), NOW()),
  ('usr_emp1006', 'EMP1006', 'admin@kaizen.com', 'Admin User', 'IT', 'Administrator', TRUE, 'welcome123', NOW(), NOW(), NOW())
ON CONFLICT (employee_code) DO UPDATE
SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  department = EXCLUDED.department,
  designation = EXCLUDED.designation,
  is_active = EXCLUDED.is_active,
  password = EXCLUDED.password,
  last_login_at = EXCLUDED.last_login_at,
  updated_at = NOW();

-- ------------------------------------------------------------
-- 3) user_role_mapping
-- ------------------------------------------------------------
INSERT INTO user_role_mapping (id, user_id, role_id, assigned_by, assigned_at)
VALUES
  ('map_1004_member', 'usr_emp1004', 'role_be_member', 'seed-script', NOW()),
  ('map_1005_head',   'usr_emp1005', 'role_be_head',   'seed-script', NOW()),
  ('map_1006_admin',  'usr_emp1006', 'role_admin',     'seed-script', NOW())
ON CONFLICT (user_id, role_id) DO UPDATE
SET
  assigned_by = EXCLUDED.assigned_by,
  assigned_at = NOW();

-- ------------------------------------------------------------
-- 4) hrms_employee_staging
-- ------------------------------------------------------------
INSERT INTO hrms_employee_staging (
  id, employee_code, email, name, department, designation,
  is_active, source, synced_at, created_at, updated_at
)
VALUES
  ('stg_emp1001', 'EMP1001', 'geetha.nurse@kaizen.com', 'Nurse Geetha', 'Nursing', 'Staff Nurse', TRUE, 'HRMS', NOW(), NOW(), NOW()),
  ('stg_emp1002', 'EMP1002', 'anita.rao@kaizen.com', 'Anita Rao', 'Operations', 'Unit Coordinator', TRUE, 'HRMS', NOW(), NOW(), NOW()),
  ('stg_emp1003', 'EMP1003', 'rajesh.kumar@kaizen.com', 'Rajesh Kumar', 'Operations', 'Implementer', TRUE, 'HRMS', NOW(), NOW(), NOW()),
  ('stg_emp1004', 'EMP1004', 'be.member@kaizen.com', 'BE Member', 'Business Excellence', 'BE Member', TRUE, 'HRMS', NOW(), NOW(), NOW())
ON CONFLICT (employee_code) DO UPDATE
SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  department = EXCLUDED.department,
  designation = EXCLUDED.designation,
  is_active = EXCLUDED.is_active,
  source = EXCLUDED.source,
  synced_at = NOW(),
  updated_at = NOW();

-- ------------------------------------------------------------
-- 5) hrms_sync_log
-- ------------------------------------------------------------
INSERT INTO hrms_sync_log (
  id, sync_started_at, sync_ended_at, status, inserted_count, updated_count, error_message
)
VALUES
  ('sync_ok_001', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '10 seconds', 'SUCCESS', 4, 2, NULL),
  ('sync_ok_002', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour' + INTERVAL '8 seconds', 'SUCCESS', 1, 5, NULL),
  ('sync_fail_001', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes' + INTERVAL '5 seconds', 'FAILED', 0, 0, 'Connection timeout from HRMS DB')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 6) suggestions
-- ------------------------------------------------------------
INSERT INTO suggestions (
  id, code, theme, unit, area, department, date_submitted, employee_name, description, status,
  current_stage_role,
  expected_benefits, assigned_implementer, assigned_unit, assigned_department,
  implementation_deadline, implementation_assigned_date, implementation_stage, implementation_progress,
  implementation_update, implementation_update_date, screening_notes, coordinator_suggestion,
  required_approvals, hod_approver_names, approvals, reward_evaluation, be_review_notes, be_edited_fields,
  workflow_thread, comments, created_at, updated_at
)
VALUES
(
  'sg_001', 'KZ-2026-001', 'Reduce OP Waiting Time', 'Main Hospital', 'OPD', 'Operations', '2026-04-01', 'Nurse Geetha',
  'Introduce triage counter to reduce OP registration queue.', 'Assigned',
  'Implementer',
  '{"productivity":true,"quality":true,"cost":false,"delivery":true,"safety":false,"energy":false,"environment":false,"morale":true}'::jsonb,
  'Rajesh Kumar', 'Main Hospital', 'Operations',
  '2026-04-20', '2026-04-02', 'In Progress', 55,
  'Counter design finalized and pilot started.', '2026-04-02',
  'Feasible with current team.', NULL,
  '["Head - Quality","Head - Finance"]'::jsonb,
  '{"Head - Quality":"Quality Head","Head - Finance":"Finance Head"}'::jsonb,
  '{"Head - Quality":true,"Head - Finance":false}'::jsonb,
  NULL,
  NULL,
  '[]'::jsonb,
  '[{"id":"wf1","actor":"Nurse Geetha","role":"Employee","text":"Nurse Geetha submitted the idea.","date":"2026-04-01T10:00:00.000Z"},{"id":"wf2","actor":"Anita Rao","role":"Unit Coordinator","text":"Anita Rao approved the idea.","date":"2026-04-01T14:00:00.000Z"}]'::jsonb,
  '[]'::jsonb,
  NOW(), NOW()
),
(
  'sg_002', 'KZ-2026-002', 'Optimize Linen Movement', 'Heart City', 'Ward', 'Nursing', '2026-04-01', 'Nurse Geetha',
  'Color code linen bins by ward for faster distribution.', 'Rewarded & Closed',
  'Employee',
  '{"productivity":true,"quality":true,"cost":true,"delivery":false,"safety":true,"energy":false,"environment":true,"morale":true}'::jsonb,
  'Rajesh Kumar', 'Heart City', 'Nursing',
  '2026-04-10', '2026-04-02', 'Completed', 100,
  'Implemented across all wards.', '2026-04-10',
  'Good impact and easy adoption.',
  'Standardize color tags hospital-wide.',
  '[]'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{"scores":{"impact":22,"innovation":20,"sustainability":18},"totalScore":60,"grade":"A","voucherValue":3000,"evaluatedBy":"BE Head","evaluationDate":"2026-04-11"}'::jsonb,
  'Template validated and approved.',
  '["counterMeasure","benefitsDescription"]'::jsonb,
  '[{"id":"wf3","actor":"BE Head","role":"Business Excellence Head","text":"BE Head completed evaluation.","date":"2026-04-11T12:00:00.000Z"}]'::jsonb,
  '[{"id":"cm1","author":"HR Head","role":"Head - HR","text":"Reward processed.","date":"2026-04-12"}]'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (code) DO UPDATE
SET
  theme = EXCLUDED.theme,
  unit = EXCLUDED.unit,
  area = EXCLUDED.area,
  department = EXCLUDED.department,
  date_submitted = EXCLUDED.date_submitted,
  employee_name = EXCLUDED.employee_name,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  current_stage_role = EXCLUDED.current_stage_role,
  expected_benefits = EXCLUDED.expected_benefits,
  assigned_implementer = EXCLUDED.assigned_implementer,
  assigned_unit = EXCLUDED.assigned_unit,
  assigned_department = EXCLUDED.assigned_department,
  implementation_deadline = EXCLUDED.implementation_deadline,
  implementation_assigned_date = EXCLUDED.implementation_assigned_date,
  implementation_stage = EXCLUDED.implementation_stage,
  implementation_progress = EXCLUDED.implementation_progress,
  implementation_update = EXCLUDED.implementation_update,
  implementation_update_date = EXCLUDED.implementation_update_date,
  screening_notes = EXCLUDED.screening_notes,
  coordinator_suggestion = EXCLUDED.coordinator_suggestion,
  required_approvals = EXCLUDED.required_approvals,
  hod_approver_names = EXCLUDED.hod_approver_names,
  approvals = EXCLUDED.approvals,
  reward_evaluation = EXCLUDED.reward_evaluation,
  be_review_notes = EXCLUDED.be_review_notes,
  be_edited_fields = EXCLUDED.be_edited_fields,
  workflow_thread = EXCLUDED.workflow_thread,
  comments = EXCLUDED.comments,
  updated_at = NOW();

COMMIT;
