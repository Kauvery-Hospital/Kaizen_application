/**
 * Role codes accepted by GET /users?role= (must match Prisma RoleCode).
 * Used for server-side filters on large user directories (~10k+ users).
 */
export const USER_ROLE_FILTER_OPTIONS: { code: string; label: string }[] = [
  { code: 'EMPLOYEE', label: 'Employee' },
  { code: 'IMPLEMENTER', label: 'Implementer' },
  { code: 'UNIT_COORDINATOR', label: 'Unit Coordinator' },
  { code: 'SELECTION_COMMITTEE', label: 'Selection Committee' },
  { code: 'BUSINESS_EXCELLENCE', label: 'Business Excellence' },
  { code: 'BUSINESS_EXCELLENCE_HEAD', label: 'Business Excellence Head' },
  { code: 'HOD_QUALITY', label: 'Head - Quality' },
  { code: 'HOD_FINANCE', label: 'Head - Finance' },
  { code: 'HOD_HR', label: 'Head - HR' },
  { code: 'HOD_OPS', label: 'Head - Operations' },
  { code: 'HOD_NURSING', label: 'Head - Nursing' },
  { code: 'ADMIN', label: 'Admin' },
  { code: 'SUPER_ADMIN', label: 'Super Admin' },
  { code: 'BE_MEMBER', label: 'BE Member (legacy)' },
  { code: 'BE_HEAD', label: 'BE Head (legacy)' },
];
