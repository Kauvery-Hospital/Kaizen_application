-- Add password column to kaizen_kh.public.hrms_employees (mirror)
ALTER TABLE public.hrms_employees
ADD COLUMN IF NOT EXISTS "password" VARCHAR(255);

