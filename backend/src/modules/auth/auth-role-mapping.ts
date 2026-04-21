import { AppRole } from '../suggestions/suggestions.types';

const TOKEN_TO_APP_ROLE: Record<string, AppRole> = {
  EMPLOYEE: AppRole.EMPLOYEE,
  UNIT_COORDINATOR: AppRole.UNIT_COORDINATOR,
  SELECTION_COMMITTEE: AppRole.SELECTION_COMMITTEE,
  IMPLEMENTER: AppRole.IMPLEMENTER,
  BUSINESS_EXCELLENCE: AppRole.BUSINESS_EXCELLENCE,
  BUSINESS_EXCELLENCE_HEAD: AppRole.BUSINESS_EXCELLENCE_HEAD,
  BE_MEMBER: AppRole.BUSINESS_EXCELLENCE,
  BE_HEAD: AppRole.BUSINESS_EXCELLENCE_HEAD,
  HOD_FINANCE: AppRole.FINANCE_HOD,
  HOD_HR: AppRole.HR_HEAD,
  HOD_QUALITY: AppRole.QUALITY_HOD,
  ADMIN: AppRole.ADMIN,
  SUPER_ADMIN: AppRole.ADMIN,
};

export function mapTokenRolesToAppRoles(tokenRoles: string[]): AppRole[] {
  const mapped = tokenRoles
    .map((r) => TOKEN_TO_APP_ROLE[r] ?? AppRole.EMPLOYEE)
    .filter((v, i, arr) => arr.indexOf(v) === i);
  return mapped.length ? mapped : [AppRole.EMPLOYEE];
}
