-- Add address column to hrms_units (kaizen_kh)
ALTER TABLE public.hrms_units
ADD COLUMN IF NOT EXISTS "address" VARCHAR(255);

