-- Adds password column to users (run on kaizen_kh if migrate/db push is not used).
-- Safe to run once; IF NOT EXISTS may require PostgreSQL 9.1+ (use separate checks on older PG).

ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
