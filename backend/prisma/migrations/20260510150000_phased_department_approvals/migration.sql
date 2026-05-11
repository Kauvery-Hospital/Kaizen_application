-- Two-phase verification: Level 1 department slots, then Level 2 functional heads.
ALTER TABLE "suggestions" ADD COLUMN IF NOT EXISTS "approval_phase" VARCHAR(8);
ALTER TABLE "suggestions" ADD COLUMN IF NOT EXISTS "department_approvals" JSONB;
