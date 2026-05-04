import type { Suggestion } from '../types';
import { Role, type User } from '../types';

/**
 * PATCH `/suggestions/:id/status` uses `actor.role`. Implementation template submit must use
 * {@link Role.IMPLEMENTER} when the user is the assigned implementer — even if the sidebar role is
 * Unit Coordinator or `user.roles` is missing from an older session — otherwise the backend can
 * treat BE Review → Implementation Submitted as a coordinator "send back" and require remarks.
 */
export function resolveImplementationPatchActor(
  suggestion: Suggestion,
  user: User | null | undefined,
): Role | undefined {
  if (!user) return undefined;
  const roleList = user.roles?.length ? user.roles : [user.role];
  if (roleList.includes(Role.IMPLEMENTER)) return Role.IMPLEMENTER;

  const myCode = (user.employeeCode || '').trim().toLowerCase();
  const sugCode = (suggestion.assignedImplementerCode || '').trim().toLowerCase();
  if (myCode && sugCode && myCode === sugCode) return Role.IMPLEMENTER;

  const myName = (user.name || '').trim().toLowerCase();
  const sugName = (suggestion.assignedImplementer || '').trim().toLowerCase();
  if (myName && sugName && myName === sugName) return Role.IMPLEMENTER;

  return undefined;
}
