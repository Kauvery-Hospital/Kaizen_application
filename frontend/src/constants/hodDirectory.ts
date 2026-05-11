import { Role } from '../types';

/**
 * Level 2 (functional) routes only — Finance, Operations, Nursing.
 * Unit Coordinator picks named heads from unit-scoped portal users per role.
 */
export const LEVEL_2_APPROVAL_ROUTES: ReadonlyArray<{ label: string; role: Role }> = [
  { label: 'Finance Head', role: Role.FINANCE_HOD },
  { label: 'Ops Head', role: Role.OPS_HEAD },
  { label: 'Nursing', role: Role.NURSING_HEAD },
];

/** Legacy directory — retained for older ideas / reporting hints only (not used for Level 1/2 pickers). */
export const HOD_DIRECTORY: Record<
  string,
  { role: Role; description: string; users: string[] }
> = {
  Quality: {
    role: Role.QUALITY_HOD,
    description: 'Head - Quality',
    users: [],
  },
  Finance: {
    role: Role.FINANCE_HOD,
    description: 'Head - Finance',
    users: [],
  },
  HR: {
    role: Role.HR_HEAD,
    description: 'Head - HR',
    users: [],
  },
  Nursing: {
    role: Role.QUALITY_HOD,
    description: 'Nursing (Quality oversight)',
    users: [],
  },
  Pharmacy: {
    role: Role.QUALITY_HOD,
    description: 'Pharmacy (Quality oversight)',
    users: [],
  },
  Operations: {
    role: Role.FINANCE_HOD,
    description: 'Operations (Finance sign-off)',
    users: [],
  },
};

export const HOD_DEPARTMENT_OPTIONS = Object.keys(HOD_DIRECTORY);

/** Label for rehydrating UC lists from saved `requiredApprovals` / Level 2 routes. */
export function firstDepartmentKeyForRole(r: Role): string {
  const l2 = LEVEL_2_APPROVAL_ROUTES.find((x) => x.role === r);
  if (l2) return l2.label;
  const found = Object.entries(HOD_DIRECTORY).find(([, v]) => v.role === r);
  return found ? found[0] : '';
}

/** Maps UI functional role → JWT / DB role_code for unit-scope lookup (Level 2 heads). */
export function appRoleToHodRoleCode(r: Role): string | null {
  if (r === Role.QUALITY_HOD) return 'HOD_QUALITY';
  if (r === Role.FINANCE_HOD) return 'HOD_FINANCE';
  if (r === Role.HR_HEAD) return 'HOD_HR';
  if (r === Role.OPS_HEAD) return 'HOD_OPS';
  if (r === Role.NURSING_HEAD) return 'HOD_NURSING';
  return null;
}
