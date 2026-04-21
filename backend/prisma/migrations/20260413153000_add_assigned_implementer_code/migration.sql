-- Add employee code reference for implementer assignments
ALTER TABLE "suggestions"
ADD COLUMN IF NOT EXISTS "assigned_implementer_code" VARCHAR(30);

CREATE INDEX IF NOT EXISTS "idx_suggestions_assigned_implementer_code"
ON "suggestions" ("assigned_implementer_code");

