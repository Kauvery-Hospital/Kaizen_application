/** Unit + department → implementer names for Selection Committee assignment (mock directory). */

export const IMPLEMENTER_BY_UNIT_AND_DEPT: Record<string, Record<string, string[]>> = {
  'Main Hospital': {
    Quality: ['Dr. Anil Kumar', 'Meera Subramanian'],
    Finance: ['Ramesh P', 'Lakshmi Venkat'],
    HR: ['Priya Sharma', 'Karthik N'],
    Nursing: ['Rajesh Kumar', 'Chief Nursing Officer'],
    Operations: ['Operations Head', 'Floor Manager A'],
    Admin: ['Admin Manager', 'Facility Lead'],
    Pharmacy: ['Anil Joseph', 'Pharmacy In-charge'],
  },
  'Heart City': {
    Quality: ['Sunita Rao', 'Quality Exec HC'],
    Finance: ['Finance Lead HC'],
    HR: ['HR Officer HC'],
    Nursing: ['Nursing Superintendent HC', 'Staff Nurse Lead'],
    Operations: ['Ops Coordinator HC'],
    Admin: ['Admin HC'],
    Pharmacy: ['Pharmacist HC', 'Pharmacy Lead HC'],
  },
  'Specialty Centre': {
    Quality: ['SC Quality Lead'],
    Finance: ['SC Finance'],
    HR: ['SC HR'],
    Nursing: ['SC Nursing'],
    Operations: ['SC Ops'],
    Admin: ['SC Admin'],
    Pharmacy: ['SC Pharmacy', 'SC Clinical Pharmacist'],
  },
};

/** Always include for Selection Committee testing; deduped with directory names */
const TEST_IMPLEMENTER = 'Rajesh Kumar';

export function getImplementerOptions(unit: string, department: string): string[] {
  if (!unit || !department) return [];
  const byUnit = IMPLEMENTER_BY_UNIT_AND_DEPT[unit];
  if (!byUnit) return [TEST_IMPLEMENTER];
  const raw = byUnit[department] ?? [];
  return [...new Set([TEST_IMPLEMENTER, ...raw])];
}
