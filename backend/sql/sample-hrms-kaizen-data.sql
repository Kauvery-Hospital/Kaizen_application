-- ==========================================
-- SAMPLE DATA: HRMS + Kaizen
-- ==========================================
-- 1) Run HRMS section in kaizen_HRMS
-- 2) Run Kaizen section in kaizen_kh

-- ==========================================
-- HRMS DATABASE (kaizen_HRMS)
-- ==========================================
CREATE TABLE IF NOT EXISTS hrms_employees (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(180) UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  department VARCHAR(120),
  designation VARCHAR(120),
  password_hash TEXT,
  unit_code VARCHAR(10),
  unit_name VARCHAR(120),
  is_active BOOLEAN DEFAULT TRUE,
  hrms_updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

TRUNCATE TABLE hrms_employees RESTART IDENTITY;

INSERT INTO hrms_employees (
  employee_id, email, full_name, password_hash, department, designation, unit_code, unit_name, is_active
)
VALUES
  ('EMP1001', 'geetha.nurse@kaizen.com', 'Nurse Geetha', 'welcome123', 'Nursing', 'Staff Nurse', 'MAA', 'MAA', TRUE),
  ('EMP1002', 'anita.rao@kaizen.com', 'Anita Rao', 'welcome123', 'Operations', 'Unit Coordinator', 'KHC', 'KHC', TRUE),
  ('EMP1003', 'rajesh.kumar@kaizen.com', 'Rajesh Kumar', 'welcome123', 'Operations', 'Implementer', 'KCN', 'KCN', TRUE),
  ('EMP1004', 'be.member@kaizen.com', 'BE Member', 'welcome123', 'Business Excellence', 'BE Member', 'KCH', 'KCH', TRUE),
  ('EMP1005', 'be.head@kaizen.com', 'BE Head', 'welcome123', 'Business Excellence', 'BE Head', 'KVP', 'KVP', TRUE),
  ('EMP1006', 'admin@kaizen.com', 'Admin User', 'welcome123', 'IT', 'Administrator', 'ECB', 'ECB', TRUE),
  ('EMP1999', 'inactive@kaizen.com', 'Inactive User', 'welcome123', 'IT', 'Old Staff', 'KSM', 'KSM', FALSE)
ON CONFLICT (employee_id) DO UPDATE
SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  password_hash = EXCLUDED.password_hash,
  department = EXCLUDED.department,
  designation = EXCLUDED.designation,
  unit_code = EXCLUDED.unit_code,
  unit_name = EXCLUDED.unit_name,
  is_active = EXCLUDED.is_active,
  hrms_updated_at = NOW();

