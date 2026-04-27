
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './screens/LoginPage';
import { Dashboard } from './screens/Dashboard';
import { SuggestionList } from './screens/SuggestionList';
import { SuggestionForm } from './components/SuggestionForm';
import { SuggestionDetailModal } from './components/SuggestionDetailModal';
import { NotificationsButton } from './components/NotificationsButton';
import { PipelineView } from './screens/PipelineView';
import { UserManagement } from './screens/UserManagement';
import { BeOverview } from './screens/BeOverview';
import { Role, Suggestion, Status, ViewType, User } from './types';
import { clearSession, loadSession, saveSession } from './auth/session';

const getRoleScopedSuggestions = (
  allSuggestions: Suggestion[],
  role: Role,
  currentUserName?: string
) => {
  if (role === Role.ADMIN) return allSuggestions;

  if (role === Role.EMPLOYEE) {
    if (!currentUserName) return [];
    return allSuggestions.filter(
      s => s.employeeName.trim().toLowerCase() === currentUserName.trim().toLowerCase()
    );
  }

  if (role === Role.UNIT_COORDINATOR) {
    return allSuggestions.filter(s =>
      [
        Status.IDEA_SUBMITTED,
        Status.BE_REVIEW_DONE,
        Status.REWARD_PENDING,
        Status.REWARDED,
      ].includes(s.status)
    );
  }

  if (role === Role.SELECTION_COMMITTEE) {
    return allSuggestions.filter(s => s.status === Status.APPROVED_FOR_ASSIGNMENT);
  }

  if (role === Role.IMPLEMENTER) {
    return allSuggestions.filter(s => {
      const isAssignedToMe = currentUserName
        ? s.assignedImplementer === currentUserName
        : true;
      return isAssignedToMe && [Status.ASSIGNED_FOR_IMPLEMENTATION, Status.IMPLEMENTATION_DONE, Status.BE_REVIEW_DONE].includes(s.status);
    });
  }

  if (role === Role.BUSINESS_EXCELLENCE) {
    return allSuggestions;
  }

  if (role === Role.BUSINESS_EXCELLENCE_HEAD) {
    return allSuggestions.filter(s =>
      [Status.BE_EVALUATION_PENDING, Status.REWARD_PENDING, Status.REWARDED].includes(s.status)
    );
  }

  if (role === Role.HR_HEAD) {
    return allSuggestions.filter(s => {
      if ([Status.REWARD_PENDING, Status.REWARDED].includes(s.status)) return true;
      return (
        s.status === Status.VERIFIED_PENDING_APPROVAL &&
        s.requiredApprovals?.includes(role) &&
        !s.approvals?.[role]
      );
    });
  }

  if (role === Role.QUALITY_HOD || role === Role.FINANCE_HOD) {
    return allSuggestions.filter(
      s =>
        s.status === Status.VERIFIED_PENDING_APPROVAL &&
        s.requiredApprovals?.includes(role) &&
        !s.approvals?.[role]
    );
  }

  return allSuggestions;
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailViewMode, setDetailViewMode] = useState<'default' | 'tracking'>('default');
  const [unitOptions, setUnitOptions] = useState<
    { id: string; code: string; name: string }[]
  >([]);
  const [departmentOptions, setDepartmentOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [meDefaults, setMeDefaults] = useState<{ unit?: string; department?: string }>(
    {},
  );

  useEffect(() => {
    const stored = loadSession();
    if (stored) setCurrentUser(stored);
  }, []);

  const handleLogin = useCallback((user: User) => {
    saveSession(user);
    setCurrentUser(user);
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
        return updated;
      });
      setSelectedSuggestion(null);
      setIsDetailModalOpen(false);
      setCurrentView('dashboard');
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

  const currentRole: Role = currentUser?.role || Role.EMPLOYEE;
  const roleScopedSuggestions = getRoleScopedSuggestions(
    suggestions,
    currentRole,
    currentUser?.name
  );

  useEffect(() => {
    if (!currentUser) return;

    const query = new URLSearchParams({
      role: currentUser.role,
      currentUserName: currentUser.name,
    });

    fetch(`${apiBase}/suggestions?${query.toString()}`, {
      headers: authHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(await res.text());
        }
        return res.json();
      })
      .then((items: Suggestion[]) => {
        setSuggestions(Array.isArray(items) ? items : []);
      })
      .catch((err) => {
        console.error('Failed to load suggestions', err);
      });
  }, [apiBase, authHeaders, currentUser]);

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
      setCurrentView('dashboard');
    } catch (err) {
      console.error('Failed to create suggestion', err);
    }
  };

  const handleUpdateStatus = useCallback(async (id: string, status: Status, extraData?: Partial<Suggestion>) => {
    try {
      const res = await fetch(`${apiBase}/suggestions/${id}/status`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          actor: {
            name: currentUser?.name || 'System User',
            role: currentUser?.role || Role.ADMIN,
          },
          status,
          extraData,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as Suggestion;
      setSuggestions((prev) => prev.map((s) => (s.id === id ? updated : s)));
      setSelectedSuggestion((prev) => (prev && prev.id === id ? updated : prev));
    } catch (err) {
      console.error('Failed to update status', err);
      throw err;
    }
  }, [apiBase, authHeaders, currentUser]);

  const renderContent = () => {
    if (currentView === 'pipeline') {
      return (
        <PipelineView
          suggestions={suggestions}
          role={currentRole}
          currentUserName={currentUser.name}
          currentUserEmployeeCode={currentUser.employeeCode}
          onSelect={(s) => {
            setDetailViewMode('default');
            setSelectedSuggestion(s);
            setIsDetailModalOpen(true);
          }}
        />
      );
    }
    if (currentView === 'be-overview') {
      return (
        <div className="animate-fade-in">
          <BeOverview
            suggestions={suggestions}
            apiBase={apiBase}
            accessToken={currentUser.accessToken}
            onOpenIdea={(s) => {
              setDetailViewMode('default');
              setSelectedSuggestion(s);
              setIsDetailModalOpen(true);
            }}
          />
        </div>
      );
    }
    if (currentView === 'create') {
      return (
        <div className="max-w-4xl mx-auto animate-fade-in">
             <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800">Submit New Kaizen Idea</h1>
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
                 <div className="mb-6 flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-gray-800">All Suggestions</h1>
                 </div>
                 <SuggestionList 
                    suggestions={suggestions} 
                    role={currentRole} 
                    currentUserName={currentUser.name}
                    onQuickUpdate={handleUpdateStatus}
                    onSelect={(s) => {
                      setDetailViewMode('tracking');
                      setSelectedSuggestion(s);
                      setIsDetailModalOpen(true);
                    }}
                />
            </div>
        )
    }

    if (currentView === 'users') {
      return (
        <UserManagement apiBase={apiBase} authHeaders={authHeaders} />
      );
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
        <div className="max-w-6xl mx-auto animate-fade-in">
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
              // Reuse existing modal submit handler by updating status via API.
              // The SuggestionDetailModal uses handleImplementationSubmit; here we call updateStatus directly.
              await handleUpdateStatus(selectedSuggestion.id, Status.IMPLEMENTATION_DONE, {
                ...data,
                implementationProgress: 100,
                implementationStage: 'Completed',
                implementationDate: new Date().toISOString().split('T')[0],
                // Keep a snapshot of the submitted template (used for preview/export later)
                implementationDraft: data,
              });
            }}
            onSaveDraft={(data) => {
              // draft save keeps status the same
              handleUpdateStatus(selectedSuggestion.id, selectedSuggestion.status as Status, {
                implementationDraft: data,
              });
            }}
            onCancel={() => setCurrentView('dashboard')}
          />
        </div>
      );
    }

    // Default Dashboard for all roles (role-scoped graphs)
    return (
      <div className="animate-fade-in">
        <Dashboard suggestions={roleScopedSuggestions} role={currentRole} userName={currentUser?.name} />
      </div>
    );
  };

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 font-sans">
      <Sidebar 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        currentRole={currentRole}
        availableRoles={currentUser.roles}
        onRoleChange={handleRoleChange}
        currentUserName={currentUser.name}
        onLogout={() => {
          clearSession();
          setSelectedSuggestion(null);
          setIsDetailModalOpen(false);
          setCurrentView('dashboard');
          setCurrentUser(null);
        }}
      />
      
      <div className="pl-64 flex flex-col min-h-screen">
        {/* Top Navigation */}
        <header className="h-16 bg-white/90 backdrop-blur border-b border-gray-200 px-8 flex items-center justify-between sticky top-0 z-30">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">Kaizen Management</div>
            <div className="text-sm font-bold text-gray-900">
              {currentView === 'dashboard'
                ? 'Executive Overview'
                : currentView === 'pipeline'
                  ? 'Pipeline Workspace'
                  : currentView === 'be-overview'
                    ? 'BE Overview'
                  : currentView === 'list'
                    ? 'All Suggestions'
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
                setDetailViewMode('tracking');
                setSelectedSuggestion(s);
                setIsDetailModalOpen(true);
              }}
            />
            <button
              onClick={() => setCurrentView('create')}
              className="bg-gradient-to-r from-kauvery-purple to-kauvery-violet hover:opacity-95 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-purple-200 transition-all flex items-center gap-2"
            >
              <span className="material-icons-round text-sm">add</span>
              New Idea
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      <SuggestionDetailModal
        isOpen={isDetailModalOpen && !!selectedSuggestion}
        suggestion={selectedSuggestion}
        onClose={() => setIsDetailModalOpen(false)}
        onOpenTemplatePage={(s, opts) => {
          setSelectedSuggestion(s);
          setDetailViewMode('default');
          setCurrentView('template');
          setIsDetailModalOpen(false);
        }}
        role={currentRole}
        currentUserName={currentUser.name}
        onUpdateStatus={handleUpdateStatus}
        initialView={detailViewMode}
        apiBase={apiBase}
        accessToken={currentUser.accessToken}
        unitOptions={unitOptions}
        departmentOptions={departmentOptions}
      />
    </div>
  );
};

export default App;
