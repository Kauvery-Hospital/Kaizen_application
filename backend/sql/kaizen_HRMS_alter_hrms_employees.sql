-- ============================================================
-- Run against database: kaizen_HRMS (or your HRMS database)
-- Table: public.hrms_employees
--
-- Align HRMS table toward Kaizen sync expectations.
-- ============================================================

BEGIN;

-- Drop old unused columns if present
ALTER TABLE hrms_employees DROP COLUMN IF EXISTS password_last_sync;
ALTER TABLE hrms_employees DROP COLUMN IF EXISTS source_system;

-- Ensure a primary key id exists
DO $id$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hrms_employees' AND column_name = 'id'
  ) THEN
    ALTER TABLE hrms_employees ADD COLUMN id BIGSERIAL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'hrms_employees'
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE hrms_employees ADD CONSTRAINT hrms_employees_pkey PRIMARY KEY (id);
  END IF;
END
$id$;

-- Unit master fields (requested)
ALTER TABLE hrms_employees ADD COLUMN IF NOT EXISTS unit_code VARCHAR(10);
ALTER TABLE hrms_employees ADD COLUMN IF NOT EXISTS unit_name VARCHAR(120);

-- Remove legacy "unit" column (unit_code/unit_name replace it)
ALTER TABLE hrms_employees DROP COLUMN IF EXISTS unit;

-- Optional: rename employee_name -> full_name (safe)
DO $rename$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hrms_employees' AND column_name = 'full_name'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hrms_employees' AND column_name = 'employee_name'
  ) THEN
    ALTER TABLE hrms_employees RENAME COLUMN employee_name TO full_name;
  END IF;
END
$rename$;

-- Prefer password_hash; rename legacy "password" if needed
DO $pwd$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hrms_employees' AND column_name = 'password_hash'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hrms_employees' AND column_name = 'password'
  ) THEN
    ALTER TABLE hrms_employees RENAME COLUMN password TO password_hash;
  END IF;
END
$pwd$;

-- Migrate legacy "status" (e.g. 'active' / 'inactive') -> is_active, then drop status
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hrms_employees'
      AND column_name = 'status'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'hrms_employees'
        AND column_name = 'is_active'
    ) THEN
      ALTER TABLE hrms_employees ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;

    UPDATE hrms_employees
    SET is_active = (LOWER(TRIM(COALESCE(status::text, 'active'))) = 'active');

    ALTER TABLE hrms_employees DROP COLUMN status;
  END IF;
END
$migration$;

COMMIT;

-- ============================================================
-- Run against database: kaizen_HRMS (or your HRMS database)
-- Table: public.hrms_employees
--
-- 1) Drops: password_last_sync, source_system
-- 2) Replaces text/status column "status" with boolean is_active (true/false)
-- ============================================================

BEGIN;

ALTER TABLE hrms_employees DROP COLUMN IF EXISTS password_last_sync;
ALTER TABLE hrms_employees DROP COLUMN IF EXISTS source_system;

-- Ensure a primary key id exists (safe for tables created without id).
DO $id$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hrms_employees' AND column_name = 'id'
  ) THEN
    ALTER TABLE hrms_employees ADD COLUMN id BIGSERIAL;
  END IF;

  -- Add PK if not present (will succeed only if no existing PK).
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'hrms_employees'
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE hrms_employees ADD CONSTRAINT hrms_employees_pkey PRIMARY KEY (id);
  END IF;
END
$id$;

-- Add unit master fields (requested): unit_code, unit_name.
ALTER TABLE hrms_employees ADD COLUMN IF NOT EXISTS unit_code VARCHAR(10);
ALTER TABLE hrms_employees ADD COLUMN IF NOT EXISTS unit_name VARCHAR(120);

-- Remove legacy single "unit" column (unit_code/unit_name replace it).
ALTER TABLE hrms_employees DROP COLUMN IF EXISTS unit;

-- Optional: rename employee_name -> full_name (safe).
DO $rename$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hrms_employees' AND column_name = 'full_name'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hrms_employees' AND column_name = 'employee_name'
  ) THEN
    ALTER TABLE hrms_employees RENAME COLUMN employee_name TO full_name;
  END IF;
END
$rename$;

-- Sync expects a VARCHAR business key column employee_code.
-- If you only have a numeric employee_id used as login id, add and backfill, e.g.:
-- Sync expects a VARCHAR business key column employee_id.
-- If you only have a numeric column (e.g. emp_no) and want to use it as employee_id:
--   ALTER TABLE hrms_employees ADD COLUMN employee_id VARCHAR(30);
--   UPDATE hrms_employees SET employee_id = emp_no::text WHERE employee_id IS NULL;
--   ALTER TABLE hrms_employees ALTER COLUMN employee_id SET NOT NULL;
--   CREATE UNIQUE INDEX IF NOT EXISTS uq_hrms_employees_employee_id ON hrms_employees(employee_id);

-- Prefer password_hash; rename legacy "password" if needed.
DO $pwd$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hrms_employees' AND column_name = 'password_hash'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hrms_employees' AND column_name = 'password'
  ) THEN
    ALTER TABLE hrms_employees RENAME COLUMN password TO password_hash;
  END IF;
END
$pwd$;

-- Migrate legacy "status" (e.g. 'active' / 'inactive') -> is_active, then drop status.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hrms_employees'
      AND column_name = 'status'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'hrms_employees'
        AND column_name = 'is_active'
    ) THEN
      ALTER TABLE hrms_employees ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;

    UPDATE hrms_employees
    SET is_active = (LOWER(TRIM(COALESCE(status::text, 'active'))) = 'active');

    ALTER TABLE hrms_employees DROP COLUMN status;
  END IF;
END
$migration$;

COMMIT;
