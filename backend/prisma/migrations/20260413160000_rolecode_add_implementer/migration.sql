-- Ensure Postgres enum RoleCode contains IMPLEMENTER (if RoleCode is an enum type).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RoleCode') THEN
    BEGIN
      ALTER TYPE "RoleCode" ADD VALUE IF NOT EXISTS 'IMPLEMENTER';
    EXCEPTION
      WHEN duplicate_object THEN
        -- value already exists
        NULL;
    END;
  END IF;
END $$;

