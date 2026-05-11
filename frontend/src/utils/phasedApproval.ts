import type { Suggestion } from '../types';
import { Status } from '../types';

export function isL2ApprovalPhase(s: Pick<Suggestion, 'approvalPhase' | 'departmentApprovals'>): boolean {
  if (s.approvalPhase === 'L1') return false;
  if (s.approvalPhase === 'L2') return true;
  const arr = Array.isArray(s.departmentApprovals) ? s.departmentApprovals : [];
  return arr.length === 0;
}

function namesLooselyMatch(a: string, b: string): boolean {
  const x = String(a ?? '')
    .trim()
    .toLowerCase();
  const y = String(b ?? '')
    .trim()
    .toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  return false;
}

export function userMatchesDepartmentSlot(
  slot: { approverName?: string; approverEmployeeCode?: string | null },
  userName?: string,
  employeeCode?: string,
): boolean {
  const meName = String(userName ?? '').trim();
  const meCode = String(employeeCode ?? '').trim().toLowerCase();
  const slotCode = String(slot.approverEmployeeCode ?? '').trim().toLowerCase();
  if (meCode && slotCode && meCode === slotCode) return true;
  return namesLooselyMatch(meName, String(slot.approverName ?? ''));
}

export function pendingDepartmentL1ForUser(
  s: Suggestion,
  userName?: string,
  employeeCode?: string,
): boolean {
  if (s.status !== Status.VERIFIED_PENDING_APPROVAL) return false;
  if (isL2ApprovalPhase(s)) return false;
  const slots = Array.isArray(s.departmentApprovals) ? s.departmentApprovals : [];
  return slots.some(
    (row) =>
      !String(row?.approvedAt ?? '').trim() &&
      userMatchesDepartmentSlot(row, userName, employeeCode),
  );
}
