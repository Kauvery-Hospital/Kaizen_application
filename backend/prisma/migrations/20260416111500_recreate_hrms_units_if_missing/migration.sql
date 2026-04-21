-- Recreate hrms_units if it was dropped manually.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.hrms_units (
  id VARCHAR(50) NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(255),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT hrms_units_pkey PRIMARY KEY (id),
  CONSTRAINT hrms_units_code_key UNIQUE (code)
);

