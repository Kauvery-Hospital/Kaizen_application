-- Level 2 functional routes: Operations Head and Nursing (unit-scoped approvals).
ALTER TYPE "role_code_enum" ADD VALUE IF NOT EXISTS 'HOD_OPS';
ALTER TYPE "role_code_enum" ADD VALUE IF NOT EXISTS 'HOD_NURSING';
