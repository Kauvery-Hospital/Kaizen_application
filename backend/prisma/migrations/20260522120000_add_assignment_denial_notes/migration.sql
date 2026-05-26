-- Implementer can decline assignment; reason stored for Selection Committee reassignment.
ALTER TABLE "suggestions" ADD COLUMN IF NOT EXISTS "assignment_denial_notes" TEXT;
