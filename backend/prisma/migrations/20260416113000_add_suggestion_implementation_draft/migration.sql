-- Store implementer template drafts on the suggestion row
ALTER TABLE public.suggestions
ADD COLUMN IF NOT EXISTS "implementation_draft" JSONB;

