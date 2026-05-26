
import React, { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './screens/LoginPage';
import { Dashboard } from './screens/Dashboard';
import { SuggestionList } from './screens/SuggestionList';
import { SuggestionForm } from './components/SuggestionForm';
import SuggestionDetailModal from './components/SuggestionDetailModal';
import { NotificationsButton } from './components/NotificationsButton';
import { PipelineView } from './screens/PipelineView';
import { UserManagement } from './screens/UserManagement';
import { BeOverview } from './screens/BeOverview';
import { Reports } from './screens/Reports';
import { RoleListView } from './screens/RoleListView';
import { HodApprovalDesk } from './screens/HodApprovalDesk';
import { KAUVERY_SHELL_MESH } from './theme/kauverySurfaces';
import { identifyUser, resetAnalytics, track } from './analytics/mixpanel';
import { PORTAL_NAME } from './constants';
import { Role, Suggestion, Status, ViewType, User, type UserUnitScopes } from './types';
import {
  consumeSessionExpiredFlag,
  isIdleSessionExpired,
  markSessionExpired,
  touchSessionActivity,
} from './auth/idleSession';
import { useIdleSessionTimeout } from './auth/useIdleSessionTimeout';
import { clearSession, loadSession, saveSession } from './auth/session';
import { resolveImplementationPatchActor } from './utils/implementationPatchActor';
import {
  clampImplementationPercent,
  computeImplementationProgressPercentFromDraft,
} from './utils/implementerTemplateProgress';
import {
  isL2ApprovalPhase,
  pendingDepartmentL1ForUser,
} from './utils/phasedApproval';

const BACKEND_TO_UI_ROLE: Record<string, Role> = {
  EMPLOYEE: Role.EMPLOYEE,
  UNIT_COORDINATOR: Role.UNIT_COORDINATOR,
  SELECTION_COMMITTEE: Role.SELECTION_COMMITTEE,
  IMPLEMENTER: Role.IMPLEMENTER,
  BUSINESS_EXCELLENCE: Role.BUSINESS_EXCELLENCE,
  BUSINESS_EXCELLENCE_HEAD: Role.BUSINESS_EXCELLENCE_HEAD,
  HOD_FINANCE: Role.FINANCE_HOD,
  HOD_HR: Role.HR_HEAD,
  HOD_QUALITY: Role.QUALITY_HOD,
  HOD_OPS: Role.OPS_HEAD,
  HOD_NURSING: Role.NURSING_HEAD,
  BE_MEMBER: Role.BUSINESS_EXCELLENCE,
  BE_HEAD: Role.BUSINESS_EXCELLENCE_HEAD,
  ADMIN: Role.ADMIN,
  SUPER_ADMIN: Role.ADMIN,
};

function getAssignedUnitCodesForRole(
  unitScopes: UserUnitScopes | undefined,
  role: Role,
): string[] {
  if (!unitScopes) return [];
  if (role === Role.UNIT_COORDINATOR) return unitScopes.UNIT_COORDINATOR ?? [];
  if (role === Role.SELECTION_COMMITTEE) return unitScopes.SELECTION_COMMITTEE ?? [];
  return [];
}

function mapBackendRolesToUiRoles(rawRoles: string[] | undefined): Role[] {
  const mapped = (Array.isArray(rawRoles) ? rawRoles : [])
    .map((r) => BACKEND_TO_UI_ROLE[String(r)] ?? Role.EMPLOYEE)
    .filter((v, i, arr) => arr.indexOf(v) === i);
  return mapped.length ? mapped : [Role.EMPLOYEE];
}

const getRoleScopedSuggestions = (
  allSuggestions: Suggestion[],
  role: Role,
  currentUserName?: string,
  currentUserEmployeeCode?: string,
) => {
  if (role === Role.ADMIN) return allSuggestions;

  if (role === Role.EMPLOYEE) {
    if (!currentUserName) return [];
    return allSuggestions.filter((s) => {
      const mine =
        s.employeeName.trim().toLowerCase() === currentUserName.trim().toLowerCase();
      if (mine) return true;
      return pendingDepartmentL1ForUser(s, currentUserName, currentUserEmployeeCode);
    });
  }

  if (role === Role.UNIT_COORDINATOR) {
    // Full unit pipeline: once screening approves, coordinators must still see ideas through
    // assignment, implementation, head approvals, BE evaluation, and closure (backend list matches).
    return allSuggestions.filter((s) =>
      [
        Status.IDEA_SUBMITTED,
        Status.APPROVED_FOR_ASSIGNMENT,
        Status.ASSIGNED_FOR_IMPLEMENTATION,
        Status.IMPLEMENTATION_DONE,
        Status.BE_REVIEW_DONE,
        Status.VERIFIED_PENDING_APPROVAL,
        Status.BE_EVALUATION_PENDING,
        Status.REWARD_PENDING,
        Status.REWARDED,
      ].includes(s.status),
    );
  }

  if (role === Role.SELECTION_COMMITTEE) {
    return allSuggestions.filter(s => s.status === Status.APPROVED_FOR_ASSIGNMENT);
  }

  if (role === Role.IMPLEMENTER) {
    return allSuggestions.filter((s) => {
      const sugCode = (s.assignedImplementerCode || '').trim().toLowerCase();
      const myCode = (currentUserEmployeeCode || '').trim().toLowerCase();
      const sugName = (s.assignedImplementer || '').trim().toLowerCase();
      const myName = (currentUserName || '').trim().toLowerCase();
      const isAssignedToMe = (() => {
        if (myCode && sugCode) return sugCode === myCode;
        if (myName && sugName) return sugName === myName;
        // Be resilient to minor name mismatches (HRMS vs login display name).
        if (myName && sugName) {
          if (sugName.includes(myName) || myName.includes(sugName)) return true;
        }
        if (!myCode && !myName) return true;
        return false;
      })();
      return (
        isAssignedToMe &&
        [
          Status.ASSIGNED_FOR_IMPLEMENTATION,
          Status.IMPLEMENTATION_DONE,
          Status.BE_REVIEW_DONE,
          Status.VERIFIED_PENDING_APPROVAL,
          Status.BE_EVALUATION_PENDING,
          Status.REWARD_PENDING,
          Status.REWARDED,
        ].includes(s.status)
      );
    });
  }

  if (role === Role.BUSINESS_EXCELLENCE || role === Role.BUSINESS_EXCELLENCE_HEAD) {
    return allSuggestions;
  }

  if (role === Role.HR_HEAD) {
    return allSuggestions.filter((s) => {
      if ([Status.REWARD_PENDING, Status.REWARDED].includes(s.status)) return true;
      if (!s.requiredApprovals?.includes(role)) return false;
      if (
        s.status === Status.VERIFIED_PENDING_APPROVAL &&
        !s.approvals?.[role] &&
        isL2ApprovalPhase(s)
      )
        return true;
      if (s.approvals?.[role]) return true;
      return false;
    });
  }

  if (
    role === Role.QUALITY_HOD ||
    role === Role.FINANCE_HOD ||
    role === Role.OPS_HEAD ||
    role === Role.NURSING_HEAD
  ) {
    return allSuggestions.filter((s) => {
      if (!s.requiredApprovals?.includes(role)) return false;
      if (
        s.status === Status.VERIFIED_PENDING_APPROVAL &&
        !s.approvals?.[role] &&
        isL2ApprovalPhase(s)
      )
        return true;
      if (s.approvals?.[role]) return true;
      return false;
    });
  }

  return allSuggestions;
};

const HOD_DESK_ROLES: Role[] = [
  Role.HR_HEAD,
  Role.QUALITY_HOD,
  Role.FINANCE_HOD,
  Role.OPS_HEAD,
  Role.NURSING_HEAD,
];

const SIDEBAR_COLLAPSED_KEY = 'kaizen.sidebar.collapsed';

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

const App: React.FC = () => {
  const lastSessionSyncTokenRef = useRef<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [suggestionDetailReturnView, setSuggestionDetailReturnView] = useState<ViewType>('dashboard');
  const [detailViewMode, setDetailViewMode] = useState<
    'default' | 'tracking' | 'hod-review'
  >('default');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [unitOptions, setUnitOptions] = useState<
    { id: string; code: string; name: string }[]
  >([]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // ignore quota / private mode
      }
      return next;
    });
  }, []);
  const [departmentOptions, setDepartmentOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [meDefaults, setMeDefaults] = useState<{ unit?: string; department?: string }>(
    {},
  );
  const [sessionExpired, setSessionExpired] = useState(() => consumeSessionExpiredFlag());

  useEffect(() => {
    const stored = loadSession();
    if (!stored) return;
    if (isIdleSessionExpired()) {
      clearSession();
      markSessionExpired();
      setSessionExpired(true);
      return;
    }
    touchSessionActivity();
    setCurrentUser(stored);
    identifyUser({
      id: stored.id,
      name: stored.name,
      role: stored.role,
      employeeCode: stored.employeeCode,
      roles: stored.roles,
    });
    track('Session Restored', { role: stored.role });
  }, []);

  const handleSessionExpire = useCallback(() => {
    track('Session Expired');
    resetAnalytics();
    clearSession();
    markSessionExpired();
    setSelectedSuggestion(null);
    setCurrentView('dashboard');
    setCurrentUser(null);
    setSessionExpired(true);
  }, []);

  useIdleSessionTimeout(Boolean(currentUser), handleSessionExpire);

  const handleLogin = useCallback((user: User) => {
    touchSessionActivity();
    saveSession(user);
    setSessionExpired(false);
    setCurrentUser(user);
    identifyUser({
      id: user.id,
      name: user.name,
      role: user.role,
      employeeCode: user.employeeCode,
      roles: user.roles,
    });
    track('Login Success', { role: user.role });
  }, []);

  const handleRoleChange = useCallback(
    (nextRole: Role) => {
      setCurrentUser((prev) => {
        if (!prev) return prev;
        if (prev.role === nextRole) return prev;
        const roles = prev.roles && prev.roles.length ? prev.roles : [prev.role];
        if (!roles.includes(nextRole)) return prev;
        const updated: User = { ...prev, role: nextRole, roles };
        saveSession(updated);
        identifyUser({
          id: updated.id,
          name: updated.name,
          role: updated.role,
          employeeCode: updated.employeeCode,
          roles: updated.roles,
        });
        track('Role Switched', { role: nextRole });
        return updated;
      });
      setSelectedSuggestion(null);
      setCurrentView(HOD_DESK_ROLES.includes(nextRole) ? 'hod-desk' : 'dashboard');
    },
    [],
  );

  const apiBase = useMemo(
    () =>
      (import.meta.env.VITE_API_BASE_URL ||
        (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin)
      ).replace(/\/+$/, ''),
    [],
  );

  const authHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (currentUser?.accessToken) headers.Authorization = `Bearer ${currentUser.accessToken}`;
    return headers;
  }, [currentUser]);

  const refreshSession = useCallback(async () => {
    const token = currentUser?.accessToken;
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/auth/refresh-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        accessToken?: string;
        user?: {
          id?: string;
          name?: string;
          employeeCode?: string;
          roles?: string[];
          departmentHodAssignments?: string[];
          unitScopes?: UserUnitScopes;
        };
      };
      const nextToken = String(data?.accessToken || token);
      const nextRoles = mapBackendRolesToUiRoles(data?.user?.roles);
      lastSessionSyncTokenRef.current = nextToken;
      setCurrentUser((prev) => {
        if (!prev) return prev;
        const nextRole = nextRoles.includes(prev.role)
          ? prev.role
          : nextRoles.includes(Role.ADMIN)
            ? Role.ADMIN
            : nextRoles.includes(Role.EMPLOYEE)
              ? Role.EMPLOYEE
              : nextRoles[0];
        const updated: User = {
          ...prev,
          id: String(data?.user?.id || prev.id),
          name: String(data?.user?.name || prev.name),
          employeeCode: String(data?.user?.employeeCode || prev.employeeCode || ''),
          accessToken: nextToken,
          role: nextRole,
          roles: nextRoles,
          departmentHodAssignments: Array.isArray(data?.user?.departmentHodAssignments)
            ? data.user.departmentHodAssignments.filter(Boolean)
            : (prev.departmentHodAssignments ?? []),
          unitScopes: data?.user?.unitScopes ?? prev.unitScopes,
        };
        saveSession(updated);
        return updated;
      });
    } catch {
      // ignore: the existing session remains usable
    }
  }, [apiBase, currentUser?.accessToken]);

  useEffect(() => {
    if (!currentUser?.accessToken) {
      lastSessionSyncTokenRef.current = null;
      return;
    }
    if (lastSessionSyncTokenRef.current !== currentUser.accessToken) {
      void refreshSession();
    }
    const handleSessionVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshSession();
      }
    };
    const handleWindowFocus = () => {
      void refreshSession();
    };
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleSessionVisibility);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleSessionVisibility);
    };
  }, [currentUser?.accessToken, refreshSession]);

  useEffect(() => {
    if (!currentUser?.accessToken) {
      setUnitOptions([]);
      setDepartmentOptions([]);
      setMeDefaults({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [unitsRes, deptsRes, meRes] = await Promise.all([
          fetch(`${apiBase}/hrms/units`, { headers: authHeaders() }),
          fetch(`${apiBase}/hrms/departments`, { headers: authHeaders() }),
          fetch(`${apiBase}/users/me`, { headers: authHeaders() }),
        ]);
        if (!unitsRes.ok || !deptsRes.ok) return;
        const [units, depts, me] = await Promise.all([
          unitsRes.json(),
          deptsRes.json(),
          meRes.ok ? meRes.json() : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setUnitOptions(Array.isArray(units) ? units : []);
        setDepartmentOptions(Array.isArray(depts) ? depts : []);
        setMeDefaults({
          unit: me?.unit?.code || '',
          department: me?.department || '',
        });
      } catch {
        // ignore: dropdowns will remain empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, currentUser?.accessToken]);

  useEffect(() => {
    if (!currentUser) return;
    if (HOD_DESK_ROLES.includes(currentUser.role)) {
      setCurrentView('hod-desk');
    }
  }, [currentUser?.id]);

  const currentRole: Role = currentUser?.role || Role.EMPLOYEE;
  const canAccessKaizenReports =
    currentRole === Role.BUSINESS_EXCELLENCE || currentRole === Role.BUSINESS_EXCELLENCE_HEAD;
  const roleScopedSuggestions = getRoleScopedSuggestions(
    suggestions,
    currentRole,
    currentUser?.name,
    currentUser?.employeeCode,
  );
  const dashboardAssignedUnitCodes = getAssignedUnitCodesForRole(
    currentUser?.unitScopes,
    currentRole,
  );

  const refreshSuggestions = useCallback(async () => {
    if (!currentUser) return;
    const query = new URLSearchParams({
      role: currentUser.role,
      currentUserName: currentUser.name,
    });
    try {
      const res = await fetch(`${apiBase}/suggestions?${query.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const items = (await res.json()) as Suggestion[];
      setSuggestions(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('Failed to load suggestions', err);
    }
  }, [apiBase, authHeaders, currentUser]);

  useEffect(() => {
    void refreshSuggestions();
  }, [refreshSuggestions]);

  const handleCreateSuggestion = async (
    data: Partial<Suggestion>,
    meta?: { ideaFiles?: File[] },
  ) => {
    try {
      let ideaAttachmentsFolder: string | undefined;
      let ideaAttachmentPaths: string[] | undefined;
      const files = meta?.ideaFiles ?? [];
      if (files.length > 0) {
        if (!currentUser?.accessToken) {
          throw new Error('Not authenticated');
        }
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        const up = await fetch(`${apiBase}/attachments/kaizen-idea`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${currentUser.accessToken}` },
          body: fd,
        });
        if (!up.ok) throw new Error(await up.text());
        const uploaded = (await up.json()) as {
          folderPath: string;
          filePaths: string[];
        };
        ideaAttachmentsFolder = uploaded.folderPath;
        ideaAttachmentPaths = uploaded.filePaths;
      }

      // Backend uses strict DTO validation (forbidNonWhitelisted),
      // so only send fields accepted by CreateSuggestionDto.
      const createBody: Record<string, unknown> = {
        theme: data.theme,
        unit: data.unit,
        area: data.area,
        department: data.department,
        description: data.description,
        expectedBenefits: data.expectedBenefits,
        actorName: currentUser?.name,
        employeeName: data.employeeName || currentUser?.name || 'Current User',
      };
      if (ideaAttachmentsFolder && ideaAttachmentPaths?.length) {
        createBody.ideaAttachmentsFolder = ideaAttachmentsFolder;
        createBody.ideaAttachmentPaths = ideaAttachmentPaths;
      }
      const res = await fetch(`${apiBase}/suggestions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(createBody),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = (await res.json()) as Suggestion;
      setSuggestions((prev) => [created, ...prev]);
      track('Idea Submitted', {
        role: currentUser?.role,
        unit: created.unit,
        department: created.department,
        status: created.status,
      });
      setCurrentView('dashboard');
    } catch (err) {
      console.error('Failed to create suggestion', err);
    }
  };

  const handleUpdateStatus = useCallback(
    async (
      id: string,
      status: Status,
      extraData?: Partial<Suggestion>,
      /** Use for implementation submit so multi-role users are not treated as Unit Coordinator */
      actorRoleOverride?: Role,
    ) => {
    try {
      const actorRole = actorRoleOverride ?? currentUser?.role ?? Role.ADMIN;
      const res = await fetch(`${apiBase}/suggestions/${id}/status`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          actor: {
            name: currentUser?.name || 'System User',
            role: actorRole,
            employeeCode: currentUser?.employeeCode,
          },
          status,
          extraData,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as Suggestion;
      setSuggestions((prev) => prev.map((s) => (s.id === id ? updated : s)));
      setSelectedSuggestion((prev) => (prev && prev.id === id ? updated : prev));
      track('Idea Status Updated', {
        role: actorRole,
        status,
        suggestion_id: id,
      });
    } catch (err) {
      console.error('Failed to update status', err);
      throw err;
    }
  },
  [apiBase, authHeaders, currentUser],
);

  const handleViewChange = useCallback((view: ViewType) => {
    if (view !== 'template' && view !== 'suggestion-detail') {
      setSelectedSuggestion(null);
    }
    setCurrentView(view);
  }, []);

  const closeSuggestionDetail = useCallback(() => {
    setCurrentView(suggestionDetailReturnView);
    setSelectedSuggestion(null);
  }, [suggestionDetailReturnView]);

  useEffect(() => {
    if (currentView === 'suggestion-detail' && !selectedSuggestion) {
      setCurrentView('dashboard');
    }
  }, [currentView, selectedSuggestion]);

  useLayoutEffect(() => {
    if (currentView === 'reports' && !canAccessKaizenReports) {
      setCurrentView('dashboard');
    }
  }, [currentView, canAccessKaizenReports]);

  useLayoutEffect(() => {
    if (currentView === 'create' && currentRole !== Role.EMPLOYEE) {
      setCurrentView('dashboard');
    }
  }, [currentView, currentRole]);

  useEffect(() => {
    if (!currentUser) return;
    track('Page Viewed', { view: currentView, role: currentRole });
  }, [currentView, currentUser, currentRole]);

  const renderContent = () => {
    if (currentView === 'suggestion-detail' && selectedSuggestion) {
      return (
        <div className="animate-fade-in w-full min-h-0 max-w-[1920px] mx-auto flex flex-col">
          <SuggestionDetailModal
            layout="page"
            isOpen
            suggestion={selectedSuggestion}
            onClose={closeSuggestionDetail}
            onOpenTemplatePage={(s) => {
              setSelectedSuggestion(s);
              setDetailViewMode('default');
              setCurrentView('template');
            }}
            role={currentRole}
            currentUserName={currentUser.name}
            userRoles={currentUser.roles?.length ? currentUser.roles : [currentUser.role]}
            implementationActorUser={currentUser}
            onUpdateStatus={handleUpdateStatus}
            onSuggestionRefreshed={(s) => {
              setSuggestions((prev) => prev.map((x) => (x.id === s.id ? s : x)));
              setSelectedSuggestion((prev) => (prev?.id === s.id ? s : prev));
            }}
            initialView={detailViewMode}
            apiBase={apiBase}
            accessToken={currentUser.accessToken}
            unitOptions={unitOptions}
            departmentOptions={departmentOptions}
          />
        </div>
      );
    }
    if (currentView === 'hod-desk') {
      if (!HOD_DESK_ROLES.includes(currentRole)) {
        return (
          <div className="animate-fade-in">
            <Dashboard
              suggestions={roleScopedSuggestions}
              role={currentRole}
              userName={currentUser?.name}
              assignedUnitCodes={dashboardAssignedUnitCodes}
              onNavigateToReports={canAccessKaizenReports ? () => setCurrentView('reports') : undefined}
              onNewIdea={
                currentRole === Role.EMPLOYEE ? () => setCurrentView('create') : undefined
              }
            />
          </div>
        );
      }
      return (
        <HodApprovalDesk
          suggestions={roleScopedSuggestions}
          role={currentRole}
          onSelectIdea={(s) => {
            setSuggestionDetailReturnView('hod-desk');
            setDetailViewMode('hod-review');
            setSelectedSuggestion(s);
            setCurrentView('suggestion-detail');
          }}
        />
      );
    }
    if (currentView === 'pipeline') {
      return (
        <PipelineView
          suggestions={suggestions}
          role={currentRole}
          currentUserName={currentUser.name}
          currentUserEmployeeCode={currentUser.employeeCode}
          assignedUnitCodes={dashboardAssignedUnitCodes}
          onSelect={(s) => {
            setSuggestionDetailReturnView('pipeline');
            setDetailViewMode('default');
            setSelectedSuggestion(s);
            setCurrentView('suggestion-detail');
          }}
        />
      );
    }
    if (currentView === 'be-overview') {
      return (
        <div className="animate-fade-in">
          <BeOverview
            apiBase={apiBase}
            accessToken={currentUser.accessToken}
            onOpenIdea={(s) => {
              setSuggestionDetailReturnView('be-overview');
              setDetailViewMode('default');
              setSelectedSuggestion(s);
              setCurrentView('suggestion-detail');
            }}
          />
        </div>
      );
    }
    if (currentView === 'reports') {
      return (
        <div className="animate-fade-in">
          <Reports
            apiBase={apiBase}
            accessToken={currentUser.accessToken}
            role={currentRole}
            unitOptions={unitOptions.map((u) => ({ code: u.code, name: u.name }))}
            departmentOptions={departmentOptions.map((d) => ({ name: d.name }))}
          />
        </div>
      );
    }
    if (currentView === 'create') {
      return (
        <div className="max-w-4xl mx-auto animate-fade-in">
             <div className="mb-4 flex justify-end">
                <button onClick={() => setCurrentView('dashboard')} className="text-gray-500 hover:text-gray-700">Cancel</button>
             </div>
             <SuggestionForm 
                initialData={{
                  employeeName: currentUser.name,
                  unit: meDefaults.unit || '',
                  department: meDefaults.department || '',
                }}
                mode="create"
                unitOptions={unitOptions}
                departmentOptions={departmentOptions}
                lockUnitDepartment
                apiBase={apiBase}
                accessToken={currentUser.accessToken}
                onSubmit={handleCreateSuggestion} 
                onCancel={() => setCurrentView('dashboard')} 
            />
        </div>
      );
    }

    if (currentView === 'list') {
        return (
             <div className="animate-fade-in">
                 <SuggestionList 
                    suggestions={suggestions} 
                    role={currentRole} 
                    currentUserName={currentUser.name}
                    onSelect={(s) => {
                      setSuggestionDetailReturnView('list');
                      setDetailViewMode('tracking');
                      setSelectedSuggestion(s);
                      setCurrentView('suggestion-detail');
                    }}
                />
            </div>
        )
    }

    if (currentView === 'users') {
      return (
        <UserManagement
          apiBase={apiBase}
          authHeaders={authHeaders}
          onAfterMobileSuggestionSync={refreshSuggestions}
        />
      );
    }

    if (currentView === 'role-list') {
      return <RoleListView apiBase={apiBase} authHeaders={authHeaders} />;
    }

    if (currentView === 'template') {
      if (!selectedSuggestion) {
        return (
          <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-2xl p-6">
            <div className="text-sm font-bold text-gray-800">No suggestion selected.</div>
            <button
              onClick={() => setCurrentView('dashboard')}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 font-extrabold text-sm hover:bg-gray-50"
            >
              Back
            </button>
          </div>
        );
      }
      return (
        <div className="w-full max-w-6xl mx-auto animate-fade-in [@media(orientation:landscape)]:max-w-none min-w-0">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">
                Implementation Template
              </div>
              <div className="text-lg font-black text-gray-900">
                {selectedSuggestion.code || selectedSuggestion.id} · {selectedSuggestion.theme}
              </div>
            </div>
            <button
              onClick={() => {
                setCurrentView('dashboard');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 font-extrabold text-sm hover:bg-gray-50"
            >
              <span className="material-icons-round text-base">arrow_back</span>
              Back
            </button>
          </div>

          <SuggestionForm
            mode="implement"
            initialData={selectedSuggestion}
            editedFieldKeys={selectedSuggestion.beEditedFields || []}
            apiBase={apiBase}
            accessToken={currentUser.accessToken}
            onSubmit={async (data, meta) => {
              const implActor = resolveImplementationPatchActor(
                selectedSuggestion,
                currentUser,
              );
              await handleUpdateStatus(
                selectedSuggestion.id,
                Status.IMPLEMENTATION_DONE,
                {
                  ...data,
                  implementationProgress: 100,
                  implementationStage: 'Completed',
                  implementationDate: new Date().toISOString().split('T')[0],
                  implementationDraft: data,
                },
                implActor,
              );
            }}
            onSaveDraft={async (data) => {
              const implActor = resolveImplementationPatchActor(
                selectedSuggestion,
                currentUser,
              );
              const draft = data as Record<string, unknown>;
              await handleUpdateStatus(
                selectedSuggestion.id,
                selectedSuggestion.status as Status,
                {
                  implementationDraft: data,
                  implementationProgress: clampImplementationPercent(
                    computeImplementationProgressPercentFromDraft(draft),
                  ),
                  implementationUpdateDate: new Date().toISOString().split('T')[0],
                },
                implActor,
              );
              await refreshSuggestions();
            }}
            onCancel={() => setCurrentView('dashboard')}
          />
        </div>
      );
    }

    // Default Dashboard for all roles (role-scoped graphs)
    return (
      <div className="animate-fade-in">
        <Dashboard
          suggestions={roleScopedSuggestions}
          role={currentRole}
          userName={currentUser?.name}
          assignedUnitCodes={dashboardAssignedUnitCodes}
          onNavigateToReports={canAccessKaizenReports ? () => setCurrentView('reports') : undefined}
          onNewIdea={
            currentRole === Role.EMPLOYEE ? () => setCurrentView('create') : undefined
          }
        />
      </div>
    );
  };

  if (!currentUser) {
    return (
      <LoginPage
        onLogin={handleLogin}
        sessionExpired={sessionExpired}
        onDismissSessionExpired={() => setSessionExpired(false)}
      />
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden font-sans text-slate-800">
      <div
        className={`pointer-events-none fixed inset-0 ${KAUVERY_SHELL_MESH} opacity-70`}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed -top-32 right-0 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-kauvery-pink/15 via-kauvery-violet/12 to-transparent blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed bottom-0 left-1/4 h-[320px] w-[480px] rounded-full bg-gradient-to-tr from-kauvery-purple/12 via-kauvery-orange/8 to-transparent blur-3xl"
        aria-hidden="true"
      />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
        currentView={currentView}
        onViewChange={handleViewChange}
        currentRole={currentRole}
        availableRoles={currentUser.roles}
        departmentHodAssignments={currentUser.departmentHodAssignments}
        onRoleChange={handleRoleChange}
        currentUserName={currentUser.name}
        onLogout={() => {
          track('Logout');
          resetAnalytics();
          clearSession();
          setSessionExpired(false);
          setSelectedSuggestion(null);
          setCurrentView('dashboard');
          setCurrentUser(null);
        }}
      />
      
      <div
        className={`relative flex min-h-screen flex-col transition-[padding-left] duration-300 ease-in-out ${
          sidebarCollapsed ? 'pl-[4.5rem]' : 'pl-64'
        }`}
      >
        {/* Top Navigation */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-kauvery-purple/15 bg-white/85 px-8 shadow-kauvery-card backdrop-blur-md">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-kauvery-purple/80 font-extrabold">
              {PORTAL_NAME}
            </div>
            <div className="text-sm sm:text-base font-black bg-gradient-to-r from-kauvery-purple via-kauvery-violet to-kauvery-pink bg-clip-text text-transparent truncate">
              {currentView === 'dashboard'
                ? currentRole === Role.EMPLOYEE
                  ? 'My Kaizen overview'
                  : 'Executive Overview'
                : currentView === 'pipeline'
                  ? currentRole === Role.EMPLOYEE
                    ? 'My ideas pipeline'
                    : 'Pipeline Workspace'
                  : currentView === 'be-overview'
                    ? 'Business Excellence reports'
                  : currentView === 'hod-desk'
                    ? 'Head approval desk'
                  : currentView === 'suggestion-detail'
                    ? 'Kaizen detail'
                  : currentView === 'list'
                    ? 'All Suggestions'
                    : currentView === 'reports'
                      ? 'Kaizen Reports'
                    : currentView === 'role-list'
                      ? 'Role List'
                    : currentView === 'users'
                      ? 'User Management'
                      : currentView === 'template'
                        ? 'Implementation Template'
                      : 'Create New Idea'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsButton
              suggestions={suggestions}
              role={currentRole}
              currentUserName={currentUser.name}
              currentUserEmployeeCode={currentUser.employeeCode}
              onOpenSuggestion={(s) => {
                setSuggestionDetailReturnView(currentView);
                setDetailViewMode(
                  HOD_DESK_ROLES.includes(currentRole) ? 'hod-review' : 'tracking',
                );
                setSelectedSuggestion(s);
                setCurrentView('suggestion-detail');
              }}
            />
            {currentRole === Role.EMPLOYEE && (
              <button
                type="button"
                onClick={() => setCurrentView('create')}
                className="bg-gradient-to-r from-kauvery-purple via-kauvery-violet to-kauvery-pink hover:opacity-95 text-white px-4 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-kauvery-soft ring-1 ring-white/20 transition-all flex items-center gap-2"
              >
                <span className="material-icons-round text-sm">add</span>
                New Idea
              </button>
            )}
          </div>
        </header>

        <main
          className={`flex-1 overflow-y-auto bg-gradient-to-br from-kauvery-purple/[0.04] via-white to-kauvery-pink/[0.03] ${
            currentView === 'template'
              ? 'p-4 [@media(orientation:landscape)]:p-2 [@media(orientation:landscape)]:lg:p-4'
              : currentView === 'suggestion-detail'
                ? 'p-3 sm:p-5 lg:p-6'
                : 'p-6'
          }`}
        >
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default App;
