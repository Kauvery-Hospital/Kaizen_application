ALTER TABLE "suggestions" ADD COLUMN IF NOT EXISTS "idea_attachments_folder" VARCHAR(500);
ALTER TABLE "suggestions" ADD COLUMN IF NOT EXISTS "idea_attachment_paths" JSONB;
ALTER TABLE "suggestions" ADD COLUMN IF NOT EXISTS "template_attachments_folder" VARCHAR(500);
ALTER TABLE "suggestions" ADD COLUMN IF NOT EXISTS "template_attachment_paths" JSONB;
