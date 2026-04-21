import { Role } from '../types';

/** Departments shown to Unit Coordinator; each maps to one functional approver role + named users */
export const HOD_DIRECTORY: Record<
  string,
  { role: Role; description: string; users: string[] }
> = {
  Quality: {
    role: Role.QUALITY_HOD,
    description: 'Head - Quality',
    users: ['Dr. Anil Kumar', 'Meera Subramanian', 'Quality Head'],
  },
  Finance: {
    role: Role.FINANCE_HOD,
    description: 'Head - Finance',
    users: ['Ramesh P', 'Lakshmi Venkat', 'Finance Head'],
  },
  HR: {
    role: Role.HR_HEAD,
    description: 'Head - HR',
    users: ['HR Head', 'Priya Sharma', 'Karthik N'],
  },
  Nursing: {
    role: Role.QUALITY_HOD,
    description: 'Nursing (Quality oversight)',
    users: ['Chief Nursing Officer', 'Deputy Nursing Superintendent'],
  },
  Pharmacy: {
    role: Role.QUALITY_HOD,
    description: 'Pharmacy (Quality oversight)',
    users: ['Chief Pharmacist', 'Pharmacy In-charge'],
  },
  Operations: {
    role: Role.FINANCE_HOD,
    description: 'Operations (Finance sign-off)',
    users: ['Operations Head', 'Admin Manager'],
  },
};

export const HOD_DEPARTMENT_OPTIONS = Object.keys(HOD_DIRECTORY);
