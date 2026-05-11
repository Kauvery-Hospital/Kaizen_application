-- Repair drift: migration history may show applied while column was never created or was dropped.
ALTER TABLE "suggestions" ADD COLUMN IF NOT EXISTS "extra_slides" JSONB;
