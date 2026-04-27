import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Role, Status, Suggestion } from '../types';

type NotificationItem = {
  id: string;
  title: string;
  subtitle: string;
  suggestion: Suggestion;
  kind: 'action' | 'info';
};

function suggestionLabel(s: Suggestion) {
  return String(s.code || s.id);
}

function makeItems(args: {
  suggestions: Suggestion[];
  role: Role;
  currentUserName: string;
  currentUserEmployeeCode?: string;
}): NotificationItem[] {
  const { suggestions, role, currentUserName, currentUserEmployeeCode } = args;

  const meName = String(currentUserName || '').trim().toLowerCase();
  const meCode = String(currentUserEmployeeCode || '').trim().toLowerCase();

  const isAssignedToMe = (s: Suggestion) => {
    const byCode = String(s.assignedImplementerCode || '').trim().toLowerCase();
    const byName = String(s.assignedImplementer || '').trim().toLowerCase();
    if (meCode && byCode) return byCode === meCode;
    if (meName && byName) return byName === meName;
    return true;
  };

  const isMine = (s: Suggestion) =>
    String(s.employeeName || '')
      .trim()
      .toLowerCase() === meName;

  const needsHodApproval = (s: Suggestion) =>
    s.status === Status.VERIFIED_PENDING_APPROVAL &&
    Array.isArray(s.requiredApprovals) &&
    s.requiredApprovals.includes(role) &&
    !s.approvals?.[role];

  const items: NotificationItem[] = [];

  for (const s of suggestions) {
    if (!s) continue;

    if (role === Role.UNIT_COORDINATOR) {
      if (s.status === Status.IDEA_SUBMITTED) {
        items.push({
          id: `${s.id}-uc-screen`,
          kind: 'action',
          suggestion: s,
          title: `Screen idea · ${suggestionLabel(s)}`,
          subtitle: `${s.unit} • ${s.department}`,
        });
      }
      if (s.status === Status.BE_REVIEW_DONE) {
        items.push({
          id: `${s.id}-uc-approve`,
          kind: 'action',
          suggestion: s,
          title: `Approve after BE review · ${suggestionLabel(s)}`,
          subtitle: `${s.unit} • ${s.department}`,
        });
      }
    } else if (role === Role.SELECTION_COMMITTEE) {
      if (s.status === Status.APPROVED_FOR_ASSIGNMENT) {
        items.push({
          id: `${s.id}-sc-assign`,
          kind: 'action',
          suggestion: s,
          title: `Assign implementer · ${suggestionLabel(s)}`,
          subtitle: `${s.unit} • ${s.department}`,
        });
      }
    } else if (role === Role.IMPLEMENTER) {
      if (s.status === Status.ASSIGNED_FOR_IMPLEMENTATION && isAssignedToMe(s)) {
        items.push({
          id: `${s.id}-impl-template`,
          kind: 'action',
          suggestion: s,
          title: `Submit implementation template · ${suggestionLabel(s)}`,
          subtitle: `${s.unit} • Deadline: ${s.implementationDeadline || 'NA'}`,
        });
      }
    } else if (role === Role.BUSINESS_EXCELLENCE) {
      if (s.status === Status.IMPLEMENTATION_DONE) {
        items.push({
          id: `${s.id}-be-review`,
          kind: 'action',
          suggestion: s,
          title: `Review implementer template · ${suggestionLabel(s)}`,
          subtitle: `${s.unit} • ${s.department}`,
        });
      }
    } else if (role === Role.BUSINESS_EXCELLENCE_HEAD) {
      if (s.status === Status.BE_EVALUATION_PENDING) {
        items.push({
          id: `${s.id}-behead-score`,
          kind: 'action',
          suggestion: s,
          title: `Evaluate reward · ${suggestionLabel(s)}`,
          subtitle: `${s.unit} • ${s.department}`,
        });
      }
    } else if (role === Role.FINANCE_HOD || role === Role.QUALITY_HOD || role === Role.HR_HEAD) {
      if (needsHodApproval(s)) {
        items.push({
          id: `${s.id}-hod-approve`,
          kind: 'action',
          suggestion: s,
          title: `Approval required · ${suggestionLabel(s)}`,
          subtitle: `${s.unit} • ${s.department}`,
        });
      }
      if (role === Role.HR_HEAD && s.status === Status.REWARD_PENDING) {
        items.push({
          id: `${s.id}-hr-reward`,
          kind: 'action',
          suggestion: s,
          title: `Process reward · ${suggestionLabel(s)}`,
          subtitle: `${s.unit} • ${s.department}`,
        });
      }
    } else if (role === Role.ADMIN || role === Role.SUPER_ADMIN) {
      // Simple admin queue: everything not closed/rejected.
      if (![Status.REWARDED, Status.IDEA_REJECTED].includes(s.status)) {
        items.push({
          id: `${s.id}-admin-watch`,
          kind: 'info',
          suggestion: s,
          title: `In progress · ${suggestionLabel(s)}`,
          subtitle: `${s.status} • ${s.unit}`,
        });
      }
    } else if (role === Role.EMPLOYEE) {
      if (isMine(s) && ![Status.REWARDED, Status.IDEA_REJECTED].includes(s.status)) {
        items.push({
          id: `${s.id}-emp-track`,
          kind: 'info',
          suggestion: s,
          title: `Update · ${suggestionLabel(s)}`,
          subtitle: `${s.status} • ${s.unit}`,
        });
      }
    }
  }

  // Prefer actions first, then newest-ish by code/id (best effort)
  return items
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'action' ? -1 : 1))
    .slice(0, 20);
}

export const NotificationsButton: React.FC<{
  suggestions: Suggestion[];
  role: Role;
  currentUserName: string;
  currentUserEmployeeCode?: string;
  onOpenSuggestion: (s: Suggestion) => void;
}> = ({ suggestions, role, currentUserName, currentUserEmployeeCode, onOpenSuggestion }) => {
  const [open, setOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(
    () =>
      makeItems({
        suggestions,
        role,
        currentUserName,
        currentUserEmployeeCode,
      }),
    [suggestions, role, currentUserEmployeeCode, currentUserName],
  );

  const count = items.length;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const el = hostRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={hostRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 shadow-sm"
        title={count ? `Notifications (${count})` : 'Notifications'}
      >
        <span className="material-icons-round text-[20px] text-gray-800">notifications</span>
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-kauvery-purple text-white text-[10px] font-extrabold flex items-center justify-center border border-purple-900">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[420px] max-w-[80vw] bg-white border border-gray-200 rounded-2xl shadow-2xl shadow-slate-200/60 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-white">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-extrabold">
              Notifications
            </div>
            <div className="text-sm font-black text-gray-900">
              {count ? `You have ${count} item(s)` : 'No pending items'}
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-4 text-sm text-gray-600 font-medium">
                Nothing to action right now for <span className="font-extrabold">{role}</span>.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenSuggestion(it.suggestion);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center border ${
                          it.kind === 'action'
                            ? 'bg-kauvery-purple/10 border-purple-200 text-kauvery-purple'
                            : 'bg-gray-100 border-gray-200 text-gray-700'
                        }`}
                      >
                        <span className="material-icons-round text-[18px]">
                          {it.kind === 'action' ? 'task_alt' : 'info'}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-extrabold text-gray-900 truncate">
                          {it.title}
                        </div>
                        <div className="text-xs text-gray-600 font-semibold truncate">
                          {it.subtitle}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500 font-mono">
                          {suggestionLabel(it.suggestion)} • {it.suggestion.status}
                        </div>
                      </div>
                      <span className="material-icons-round text-[18px] text-gray-400">
                        chevron_right
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

