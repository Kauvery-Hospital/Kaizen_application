-- Denormalized workflow stage role (AppRole display string) for role-based queries and indexes.
ALTER TABLE "suggestions" ADD COLUMN IF NOT EXISTS "current_stage_role" VARCHAR(80);

UPDATE "suggestions"
SET "current_stage_role" = CASE "status"
  WHEN 'Idea Submitted' THEN 'Unit Coordinator'
  WHEN 'Idea Rejected' THEN 'Employee'
  WHEN 'Approved' THEN 'Selection Committee'
  WHEN 'Assigned' THEN 'Implementer'
  WHEN 'Implementation Submitted' THEN 'Business Excellence Member'
  WHEN 'BE Reviewed' THEN 'Unit Coordinator'
  WHEN 'Verified' THEN 'Head - Quality'
  WHEN 'Pending BE Evaluation' THEN 'Business Excellence Head'
  WHEN 'Reward Processing' THEN 'Head - HR'
  WHEN 'Rewarded & Closed' THEN 'Employee'
  ELSE 'Employee'
END
WHERE "current_stage_role" IS NULL;

ALTER TABLE "suggestions" ALTER COLUMN "current_stage_role" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_suggestions_current_stage_role" ON "suggestions" ("current_stage_role");
