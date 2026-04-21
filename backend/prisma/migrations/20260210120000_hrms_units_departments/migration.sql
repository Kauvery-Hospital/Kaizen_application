-- Master tables: unit (code + name) and department; hrms_employees links via FKs.

CREATE TABLE IF NOT EXISTS "hrms_units" (
    "id" VARCHAR(50) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hrms_units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hrms_units_code_key" ON "hrms_units"("code");

CREATE TABLE IF NOT EXISTS "hrms_departments" (
    "id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hrms_departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hrms_departments_name_key" ON "hrms_departments"("name");

-- hrms_employees is a mirrored table that may already exist in some environments.
-- Prisma shadow DB starts empty, so guard all operations on hrms_employees.
DO $$
BEGIN
  IF to_regclass('public.hrms_employees') IS NOT NULL THEN
    ALTER TABLE "hrms_employees" ADD COLUMN IF NOT EXISTS "unit_id" VARCHAR(50);
    ALTER TABLE "hrms_employees" ADD COLUMN IF NOT EXISTS "department_id" VARCHAR(50);

    -- Seed units from legacy columns when present
    INSERT INTO "hrms_units" ("id", "code", "name", "created_at", "updated_at")
    SELECT
        'unt_' || substr(md5(random()::text || clock_timestamp()::text || q.unit_code), 1, 22),
        q.unit_code,
        COALESCE(NULLIF(TRIM(q.unit_name), ''), q.unit_code),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    FROM (
        SELECT unit_code, MAX(unit_name) AS unit_name
        FROM "hrms_employees"
        WHERE unit_code IS NOT NULL AND TRIM(unit_code) <> ''
        GROUP BY unit_code
    ) q
    ON CONFLICT ("code") DO UPDATE SET
        "name" = EXCLUDED."name",
        "updated_at" = CURRENT_TIMESTAMP;

    -- Seed departments from legacy column when present
    INSERT INTO "hrms_departments" ("id", "name", "created_at", "updated_at")
    SELECT
        'dep_' || substr(md5(random()::text || clock_timestamp()::text || d.dept), 1, 22),
        d.dept,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    FROM (
        SELECT DISTINCT TRIM(department) AS dept
        FROM "hrms_employees"
        WHERE department IS NOT NULL AND TRIM(department) <> ''
    ) d
    ON CONFLICT ("name") DO NOTHING;

    -- Point employees at masters
    UPDATE "hrms_employees" e
    SET "unit_id" = u."id"
    FROM "hrms_units" u
    WHERE e."unit_code" IS NOT NULL
      AND TRIM(e."unit_code") <> ''
      AND u."code" = e."unit_code";

    UPDATE "hrms_employees" e
    SET "department_id" = d."id"
    FROM "hrms_departments" d
    WHERE e."department" IS NOT NULL
      AND TRIM(e."department") <> ''
      AND d."name" = TRIM(e."department");

    ALTER TABLE "hrms_employees" DROP COLUMN IF EXISTS "unit_code";
    ALTER TABLE "hrms_employees" DROP COLUMN IF EXISTS "unit_name";
    ALTER TABLE "hrms_employees" DROP COLUMN IF EXISTS "department";

    ALTER TABLE "hrms_employees" DROP CONSTRAINT IF EXISTS "fk_hrms_employees_unit";
    ALTER TABLE "hrms_employees"
        ADD CONSTRAINT "fk_hrms_employees_unit"
        FOREIGN KEY ("unit_id") REFERENCES "hrms_units"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "hrms_employees" DROP CONSTRAINT IF EXISTS "fk_hrms_employees_department";
    ALTER TABLE "hrms_employees" DROP CONSTRAINT IF EXISTS "fk_hrms_employees_department";
    ALTER TABLE "hrms_employees"
        ADD CONSTRAINT "fk_hrms_employees_department"
        FOREIGN KEY ("department_id") REFERENCES "hrms_departments"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION;

    CREATE INDEX IF NOT EXISTS "idx_hrms_employees_unit_id" ON "hrms_employees"("unit_id");
    CREATE INDEX IF NOT EXISTS "idx_hrms_employees_department_id" ON "hrms_employees"("department_id");
  END IF;
END $$;
