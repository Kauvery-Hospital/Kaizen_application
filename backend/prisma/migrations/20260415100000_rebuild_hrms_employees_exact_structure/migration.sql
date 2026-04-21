-- Rebuild hrms_employees to match requested HRMS mirror structure.
-- User-approved destructive change: drop + recreate (data will be lost).

DROP TABLE IF EXISTS "hrms_employees" CASCADE;

CREATE TABLE "hrms_employees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" VARCHAR(30) NOT NULL,
  "first_name" VARCHAR(120) NOT NULL,
  "last_name" VARCHAR(120) NOT NULL,
  "email" VARCHAR(120),
  "phone" VARCHAR(30) NOT NULL,
  "date_of_birth" DATE NOT NULL,
  "joining_date" DATE NOT NULL,
  "department" TEXT,
  "unit" TEXT,
  "unit_name" TEXT,
  "manager" TEXT,
  "hod" TEXT,
  "jobtitle" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hrms_employees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hrms_employees_employee_id_key" ON "hrms_employees"("employee_id");
CREATE UNIQUE INDEX "hrms_employees_email_key" ON "hrms_employees"("email");

CREATE INDEX "idx_hrms_employees_employee_id" ON "hrms_employees"("employee_id");
CREATE INDEX "idx_hrms_employees_is_active" ON "hrms_employees"("is_active");
CREATE INDEX "idx_hrms_employees_unit" ON "hrms_employees"("unit");
CREATE INDEX "idx_hrms_employees_department" ON "hrms_employees"("department");

