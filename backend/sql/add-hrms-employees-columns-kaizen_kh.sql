-- Legacy helper (before normalization).
-- Current schema: unit and department live in hrms_units / hrms_departments;
-- hrms_employees uses unit_id and department_id FKs.
-- Apply: backend/prisma/migrations/20260210120000_hrms_units_departments/migration.sql
--   or: npx prisma migrate deploy

ALTER TABLE hrms_employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
