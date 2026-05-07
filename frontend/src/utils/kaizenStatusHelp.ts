import { Status } from '../types';

/** One-line hint for employees — what is happening at this stage */
export function employeeStatusStep(status: Status): string {
  switch (status) {
    case Status.IDEA_SUBMITTED:
      return 'Waiting for unit coordinator review.';
    case Status.IDEA_REJECTED:
      return 'Not selected — open the idea to read remarks.';
    case Status.APPROVED_FOR_ASSIGNMENT:
      return 'Approved — selection committee will assign an implementer.';
    case Status.ASSIGNED_FOR_IMPLEMENTATION:
      return 'Assigned — implementation is underway.';
    case Status.IMPLEMENTATION_DONE:
      return 'Template submitted — Business Excellence is reviewing.';
    case Status.BE_REVIEW_DONE:
      return 'BE reviewed — routed for the next approvals.';
    case Status.VERIFIED_PENDING_APPROVAL:
      return 'Verified — pending functional head approvals.';
    case Status.BE_EVALUATION_PENDING:
      return 'Awaiting Business Excellence evaluation and scoring.';
    case Status.REWARD_PENDING:
      return 'Reward is being processed.';
    case Status.REWARDED:
      return 'Closed — thank you for your contribution.';
    default:
      return '';
  }
}
