
export enum Role {
  EMPLOYEE = 'Employee',
  UNIT_COORDINATOR = 'Unit Coordinator',
  SELECTION_COMMITTEE = 'Selection Committee',
  IMPLEMENTER = 'Implementer', // The person assigned to implement
  QUALITY_HOD = 'Head - Quality',
  FINANCE_HOD = 'Head - Finance',
  HR_HEAD = 'Head - HR',
  BUSINESS_EXCELLENCE = 'Business Excellence Member',
  BUSINESS_EXCELLENCE_HEAD = 'Business Excellence Head',
  ADMIN = 'Admin',
  SUPER_ADMIN = 'Super Admin',
}

export enum Status {
  IDEA_SUBMITTED = 'Idea Submitted',
  IDEA_REJECTED = 'Idea Rejected',
  APPROVED_FOR_ASSIGNMENT = 'Approved',
  ASSIGNED_FOR_IMPLEMENTATION = 'Assigned',
  IMPLEMENTATION_DONE = 'Implementation Submitted',
  BE_REVIEW_DONE = 'BE Reviewed',
  VERIFIED_PENDING_APPROVAL = 'Verified',
  BE_EVALUATION_PENDING = 'Pending BE Evaluation',
  REWARD_PENDING = 'Reward Processing',
  REWARDED = 'Rewarded & Closed'
}

export interface EvaluationScore {
  [key: string]: number;
}

export interface RewardEvaluation {
  scores: EvaluationScore;
  totalScore: number;
  grade: string;
  /** Total voucher amount recommended by BE Head */
  voucherValue: number;
  /** Optional split of voucher between originator (submitter) and implementer */
  split?: {
    originatorName?: string;
    implementerName?: string;
    originatorAmount: number;
    implementerAmount: number;
  };
  evaluatedBy: string;
  evaluationDate: string;
}

export interface Comment {
  id: string;
  author: string;
  role: Role;
  text: string;
  date: string;
}

export interface WorkflowEvent {
  id: string;
  actor: string;
  role: Role;
  text: string;
  date: string;
}

export interface Suggestion {
  id: string;
  /** Human-readable Kaizen series (e.g. KZ-2026-00042) from the server; not the internal DB id */
  code?: string;

  // -- Phase 1: Idea Submission (Employee) --
  theme: string;
  unit: string;
  area: string;
  department: string; // Originator Dept
  dateSubmitted: string;
  employeeName: string; // Originator
  description: string; // Basic idea description
  expectedBenefits: {
    productivity: boolean;
    quality: boolean;
    cost: boolean;
    delivery: boolean;
    safety: boolean;
    energy: boolean;
    environment: boolean;
    morale: boolean;
  };

  /** Relative to server upload root, e.g. kaizen/EMP001/kaizen_idea */
  ideaAttachmentsFolder?: string | null;
  /** Relative paths; served under GET /kaizen-files/... */
  ideaAttachmentPaths?: string[] | null;
  templateAttachmentsFolder?: string | null;
  templateAttachmentPaths?: string[] | null;

  // -- Phase 2: Selection (Committee) --
  assignedImplementer?: string; // Name of person/team
  assignedImplementerCode?: string; // Employee code of implementer (for role mapping)
  assignedUnit?: string; // Unit where implementation is owned (set by Selection Committee)
  assignedDepartment?: string;
  implementationDeadline?: string;
  implementationAssignedDate?: string;
  deadlineChangeRemark?: string;
  implementationStage?: 'Started' | 'In Progress' | 'Completed';
  implementationProgress?: number;
  implementationUpdate?: string;
  implementationUpdateDate?: string;
  templateUploads?: {
    images: string[];
    documents: string[];
    beforeImages?: string[];
    afterImages?: string[];
    processBeforeFiles?: string[];
    processAfterFiles?: string[];
  };
  
  // -- Phase 3: Implementation (Implementer) --
  // The Full Kaizen Template
  problem?: {
    what: string;
    where: string;
    when: string;
    who: string;
    how: string;
  };
  /** Sheet 2 — “How Much” in Present Status */
  howMuch?: string;
  analysis?: {
    why1: string;
    why2: string;
    why3: string;
    why4: string;
    why5: string;
    rootCause: string;
  };
  counterMeasure?: string;
  ideaToEliminate?: string;
  beforeDescription?: string;
  afterDescription?: string;
  benefitsDescription?: string; // Graphical rep details
  standardization?: {
    opl: boolean;
    sop: boolean;
    manual: boolean;
    others: boolean;
    othersDescription?: string;
  };
  horizontalDeployment?: string;
  /** Sheet 2 — quantitative results box (before detailed result lines on later pages) */
  quantitativeResults?: string;
  teamMembers?: string;
  implementationDate?: string;
  kaizenNumber?: string;
  empNo?: string;
  category?: 'Clinical' | 'Supportive';
  startDate?: string;
  completionDate?: string;
  preparedBy?: string;
  validatedBy?: string;
  approvedBy?: string;
  result1?: string;
  result2?: string;
  result3?: string;
  /** Slide 5 chart numeric inputs for auto-generated graph */
  result1Before?: number;
  result1After?: number;
  result2Before?: number;
  result2After?: number;
  result3Before?: number;
  result3After?: number;
  teamPhoto?: string;
  processBefore?: string;
  processAfter?: string;
  /** Template fields changed by BE review step */
  beEditedFields?: string[];
  beReviewNotes?: string;

  // -- Phase 4: Verification (Coordinator) --
  coordinatorSuggestion?: string;
  requiredApprovals?: Role[]; // Which HODs need to approve
  /** Display names chosen by Unit Coordinator when routing (per approver role) */
  hodApproverNames?: Partial<Record<Role, string>>;
  approvals?: Record<string, boolean>; // Map of Role -> Approved
  
  // -- Metadata --
  status: Status;
  comments?: Comment[];
  workflowThread?: WorkflowEvent[];
  /** Draft for implementer template (saved via "Save Draft") */
  implementationDraft?: any;
  
  // AI Data
  aiImpactScore?: number;
  aiCategory?: string;
  aiFeedback?: string;
  
  // Internal Notes
  screeningNotes?: string;
  rewardEvaluation?: RewardEvaluation;
}

export interface DashboardStats {
  total: number;
  implemented: number;
  pending: number;
  rewarded: number;
  totalSavings: number;
}

export type ViewType =
  | 'dashboard'
  | 'kanban'
  | 'list'
  | 'analytics'
  | 'create'
  | 'pipeline'
  | 'users'
  | 'template';

export interface User {
  id: string;
  name: string;
  role: Role;
  /** All roles assigned to this user (used for role switching). */
  roles?: Role[];
  employeeCode?: string;
  accessToken?: string;
}
