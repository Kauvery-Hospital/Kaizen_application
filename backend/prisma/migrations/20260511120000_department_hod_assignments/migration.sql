-- Admin-managed one-HOD-per-department-per-unit assignments for Level 1 routing.
CREATE TABLE IF NOT EXISTS "department_hod_assignment" (
  "id" VARCHAR(50) PRIMARY KEY,
  "user_id" VARCHAR(50) NOT NULL,
  "unit_code" VARCHAR(30) NOT NULL,
  "department_name" VARCHAR(120) NOT NULL,
  "assigned_by" VARCHAR(120),
  "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_department_hod_assignment_user"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_department_hod_assignment_unit_department"
  ON "department_hod_assignment" ("unit_code", "department_name");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_department_hod_assignment_user_unit_department"
  ON "department_hod_assignment" ("user_id", "unit_code", "department_name");

CREATE INDEX IF NOT EXISTS "idx_department_hod_assignment_user_id"
  ON "department_hod_assignment" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_department_hod_assignment_department_name"
  ON "department_hod_assignment" ("department_name");
