-- Remove unit_name from mirror table (kaizen_kh.public.hrms_employees)
ALTER TABLE public.hrms_employees
DROP COLUMN IF EXISTS "unit_name";

