export enum AppRole {
  EMPLOYEE = 'Employee',
  UNIT_COORDINATOR = 'Unit Coordinator',
  SELECTION_COMMITTEE = 'Selection Committee',
  IMPLEMENTER = 'Implementer',
  QUALITY_HOD = 'Head - Quality',
  FINANCE_HOD = 'Head - Finance',
  HR_HEAD = 'Head - HR',
  BUSINESS_EXCELLENCE = 'Business Excellence Member',
  BUSINESS_EXCELLENCE_HEAD = 'Business Excellence Head',
  ADMIN = 'Admin',
}

export enum AppStatus {
  IDEA_SUBMITTED = 'Idea Submitted',
  IDEA_REJECTED = 'Idea Rejected',
  APPROVED_FOR_ASSIGNMENT = 'Approved',
  ASSIGNED_FOR_IMPLEMENTATION = 'Assigned',
  IMPLEMENTATION_DONE = 'Implementation Submitted',
  BE_REVIEW_DONE = 'BE Reviewed',
  VERIFIED_PENDING_APPROVAL = 'Verified',
  BE_EVALUATION_PENDING = 'Pending BE Evaluation',
  REWARD_PENDING = 'Reward Processing',
  REWARDED = 'Rewarded & Closed',
}

export interface WorkflowEvent {
  id: string;
  actor: string;
  role: AppRole;
  text: string;
  date: string;
}
