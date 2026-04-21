-- Run this on the SOURCE HRMS database (kaizen_HRMS) if you also want to remove unit_name there.
-- This is separate from Prisma migrations (which apply to kaizen_kh).

ALTER TABLE public.hrms_employees
DROP COLUMN IF EXISTS unit_name;

