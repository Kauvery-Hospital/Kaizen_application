-- AlterTable
ALTER TABLE "suggestions" ADD COLUMN "originator_employee_code" VARCHAR(30);

-- CreateIndex
CREATE INDEX "idx_suggestions_originator_employee_code" ON "suggestions"("originator_employee_code");
