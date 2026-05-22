import { AppRole, AppStatus } from '../suggestions/suggestions.types';

export type ServiceCategory = 'CLINICAL' | 'SUPPORTIVE';

export type ReportAudience = 'BE';

export type ReportGroup =
  | 'overall'
  | 'received'
  | 'accepted'
  | 'notAccepted'
  | 'assignment'
  | 'approvals'
  | 'implementation'
  | 'top10';

/**
 * Report IDs map to the reference list items.
 * These IDs drive both JSON tables and Excel exports.
 */
export type ReportId =
  | 'overallRegister'
  | 'receivedSummary'
  | 'receivedByUnit'
  | 'receivedByDepartment'
  | 'receivedByServiceCategory'
  | 'acceptedBySelectionCommittee'
  | 'acceptedTop10Group'
  | 'acceptedTop10Unit'
  | 'acceptedByUnit'
  | 'acceptedByDepartment'
  | 'acceptedByServiceCategory'
  | 'notAcceptedBySelectionCommittee'
  | 'notAcceptedByUnit'
  | 'notAcceptedByDepartment'
  | 'notAcceptedByServiceCategory'
  | 'assignmentStatus'
  | 'waitingForAssignment'
  | 'approvalStatus'
  | 'approvalStatusByRole'
  | 'implementationStatus'
  | 'implementationStatusOverallAndUnit'
  | 'implementationStatusByServiceCategory'
  | 'implementationStatusByDepartment'
  | 'kpiCounts';

export type ReportKind = 'kpi' | 'breakdown' | 'table';

export type ReportCatalogItem = {
  id: ReportId;
  label: string;
  group: ReportGroup;
  kind: ReportKind;
  /** Roles that may access this report (Business Excellence team only). */
  allowedRoles: AppRole[];
};

export const REPORT_CATALOG: ReportCatalogItem[] = [
  {
    id: 'overallRegister',
    label: 'Overall Kaizen register (all submissions)',
    group: 'overall',
    kind: 'table',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'kpiCounts',
    label: 'KPI counts (received/accepted/implemented/ongoing/pending/not feasible)',
    group: 'overall',
    kind: 'kpi',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'receivedSummary',
    label: 'Total Kaizen received (summary)',
    group: 'received',
    kind: 'kpi',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'receivedByUnit',
    label: 'Received Kaizen by Unit',
    group: 'received',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'receivedByDepartment',
    label: 'Received Kaizen by Department',
    group: 'received',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'receivedByServiceCategory',
    label: 'Received Kaizen by Clinical/Supportive',
    group: 'received',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },

  {
    id: 'acceptedBySelectionCommittee',
    label: 'Accepted Kaizens by Selection Committee',
    group: 'accepted',
    kind: 'table',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'acceptedTop10Group',
    label: 'Top 10 Kaizens (Group level)',
    group: 'top10',
    kind: 'table',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'acceptedTop10Unit',
    label: 'Top 10 Kaizens (Unit level)',
    group: 'top10',
    kind: 'table',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'acceptedByUnit',
    label: 'Accepted Kaizens by Unit',
    group: 'accepted',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'acceptedByDepartment',
    label: 'Accepted Kaizens by Department',
    group: 'accepted',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'acceptedByServiceCategory',
    label: 'Accepted Kaizens by Clinical/Supportive',
    group: 'accepted',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },

  {
    id: 'notAcceptedBySelectionCommittee',
    label: 'Not accepted Kaizens by Selection Committee',
    group: 'notAccepted',
    kind: 'table',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'notAcceptedByUnit',
    label: 'Not accepted Kaizens by Unit',
    group: 'notAccepted',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'notAcceptedByDepartment',
    label: 'Not accepted Kaizens by Department',
    group: 'notAccepted',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'notAcceptedByServiceCategory',
    label: 'Not accepted Kaizens by Clinical/Supportive',
    group: 'notAccepted',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },

  {
    id: 'assignmentStatus',
    label: 'Kaizen assignment status (table)',
    group: 'assignment',
    kind: 'table',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'waitingForAssignment',
    label: 'Waiting for assignment (count + table)',
    group: 'assignment',
    kind: 'table',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },

  {
    id: 'approvalStatus',
    label: 'Approval status dashboard',
    group: 'approvals',
    kind: 'kpi',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'approvalStatusByRole',
    label: 'Approval status by approver role (HOD/Quality/Nursing/Ops/etc.)',
    group: 'approvals',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },

  {
    id: 'implementationStatus',
    label: 'Total implementation status (table)',
    group: 'implementation',
    kind: 'table',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'implementationStatusOverallAndUnit',
    label: 'Implementation status (overall + by unit)',
    group: 'implementation',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'implementationStatusByServiceCategory',
    label: 'Implementation status by Clinical/Supportive',
    group: 'implementation',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'implementationStatusByDepartment',
    label: 'Implementation status by Department',
    group: 'implementation',
    kind: 'breakdown',
    allowedRoles: [AppRole.BUSINESS_EXCELLENCE, AppRole.BUSINESS_EXCELLENCE_HEAD],
  },
];

export const REPORT_ALLOWED_FOR = (id: ReportId, role: AppRole): boolean => {
  const def = REPORT_CATALOG.find((r) => r.id === id);
  if (!def) return false;
  return def.allowedRoles.includes(role);
};

export const IMPLEMENTED_STATUSES = new Set<string>([
  AppStatus.IMPLEMENTATION_DONE,
  AppStatus.BE_REVIEW_DONE,
  AppStatus.VERIFIED_PENDING_APPROVAL,
  AppStatus.BE_EVALUATION_PENDING,
  AppStatus.REWARD_PENDING,
  AppStatus.REWARDED,
]);

export const ACCEPTED_STATUSES = new Set<string>([
  AppStatus.APPROVED_FOR_ASSIGNMENT,
  AppStatus.ASSIGNED_FOR_IMPLEMENTATION,
  AppStatus.IMPLEMENTATION_DONE,
  AppStatus.BE_REVIEW_DONE,
  AppStatus.VERIFIED_PENDING_APPROVAL,
  AppStatus.BE_EVALUATION_PENDING,
  AppStatus.REWARD_PENDING,
  AppStatus.REWARDED,
]);

export function isNotFeasibleOrWithdrawn(status: string): boolean {
  const s = String(status || '').toLowerCase();
  return s.includes('not feasible') || s.includes('withdraw');
}

export function isRejected(status: string): boolean {
  return String(status || '') === AppStatus.IDEA_REJECTED;
}

