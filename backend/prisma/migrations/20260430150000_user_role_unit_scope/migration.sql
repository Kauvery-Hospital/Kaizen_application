-- Add unit-scoped role assignments for UNIT_COORDINATOR / SELECTION_COMMITTEE (and future use).

CREATE TABLE "public"."user_role_unit_scope" (
  "id" VARCHAR(50) NOT NULL,
  "user_id" VARCHAR(50) NOT NULL,
  "role_code" "public"."role_code_enum" NOT NULL,
  "unit_code" VARCHAR(30) NOT NULL,
  "assigned_by" VARCHAR(120),
  "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_role_unit_scope_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_user_role_unit_scope" ON "public"."user_role_unit_scope"("user_id", "role_code", "unit_code");
CREATE INDEX "idx_user_role_unit_scope_role_unit" ON "public"."user_role_unit_scope"("role_code", "unit_code");
CREATE INDEX "idx_user_role_unit_scope_user_id" ON "public"."user_role_unit_scope"("user_id");

ALTER TABLE "public"."user_role_unit_scope"
ADD CONSTRAINT "fk_user_unit_scope_user"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;

