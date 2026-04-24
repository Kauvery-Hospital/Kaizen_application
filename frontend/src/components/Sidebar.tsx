import React, { useMemo, useState } from 'react';
import { Role, ViewType } from '../types';

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  currentRole: Role;
  availableRoles?: Role[];
  onRoleChange?: (role: Role) => void;
  currentUserName?: string;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onViewChange,
  currentRole,
  availableRoles,
  onRoleChange,
  currentUserName,
  onLogout,
}) => {
  const [isRoleSwitcherOpen, setIsRoleSwitcherOpen] = useState(false);

  const roleOptions = useMemo(() => {
    const roles = (availableRoles ?? []).filter(Boolean);
    const unique = roles.filter((r, i) => roles.indexOf(r) === i);
    return unique.length > 0 ? unique : [currentRole];
  }, [availableRoles, currentRole]);

  const canSwitchRole = Boolean(onRoleChange) && roleOptions.length > 1;

  /** Light, on-brand header strips for role cards (matches app chrome, not dark-theme cinema UI) */
  const roleMeta: Record<
    Role,
    { label: string; icon: string; gradient: string }
  > = {
    [Role.EMPLOYEE]: {
      label: 'Employee',
      icon: 'person',
      gradient: 'from-slate-100 to-slate-200',
    },
    [Role.UNIT_COORDINATOR]: {
      label: 'Unit Coordinator',
      icon: 'verified_user',
      gradient: 'from-indigo-50 to-purple-100',
    },
    [Role.SELECTION_COMMITTEE]: {
      label: 'Selection Committee',
      icon: 'how_to_vote',
      gradient: 'from-emerald-50 to-teal-100',
    },
    [Role.IMPLEMENTER]: {
      label: 'Implementer',
      icon: 'construction',
      gradient: 'from-purple-100 via-violet-50 to-purple-50',
    },
    [Role.BUSINESS_EXCELLENCE]: {
      label: 'Business Excellence',
      icon: 'workspace_premium',
      gradient: 'from-amber-50 to-orange-100',
    },
    [Role.BUSINESS_EXCELLENCE_HEAD]: {
      label: 'BE Head',
      icon: 'military_tech',
      gradient: 'from-fuchsia-50 to-pink-100',
    },
    [Role.HR_HEAD]: {
      label: 'HR Head',
      icon: 'badge',
      gradient: 'from-rose-50 to-red-100',
    },
    [Role.QUALITY_HOD]: {
      label: 'Quality HOD',
      icon: 'fact_check',
      gradient: 'from-cyan-50 to-sky-100',
    },
    [Role.FINANCE_HOD]: {
      label: 'Finance HOD',
      icon: 'account_balance',
      gradient: 'from-teal-50 to-emerald-100',
    },
    [Role.ADMIN]: {
      label: 'Admin',
      icon: 'admin_panel_settings',
      gradient: 'from-gray-100 to-gray-200',
    },
  } as any;
  
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'pipeline', label: 'Pipeline', icon: 'view_column' },
    ...(currentRole === Role.BUSINESS_EXCELLENCE ||
    currentRole === Role.BUSINESS_EXCELLENCE_HEAD
      ? [{ id: 'be-overview', label: 'BE Overview', icon: 'manage_search' }]
      : []),
    { id: 'list', label: 'All Suggestions', icon: 'format_list_bulleted' },
    ...(currentRole === Role.ADMIN
      ? [{ id: 'users', label: 'User Management', icon: 'manage_accounts' }]
      : []),
  ];

  return (
    <>
      {canSwitchRole && isRoleSwitcherOpen && (
        <div className="fixed inset-0 z-[100]">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsRoleSwitcherOpen(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl shadow-2xl shadow-slate-300/30 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between bg-gradient-to-r from-white via-white to-purple-50/50">
                <div>
                  <div className="text-xs uppercase tracking-wide text-kauvery-purple font-extrabold">
                    Kaizen Flow
                  </div>
                  <h2 className="text-2xl font-black text-gray-900 mt-1">
                    Who’s using Kaizen?
                  </h2>
                  <p className="text-sm text-gray-600 font-semibold mt-1">
                    Choose a role to continue.
                  </p>
                </div>
                <button
                  onClick={() => setIsRoleSwitcherOpen(false)}
                  className="text-gray-500 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="Close role switcher"
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>

              <div className="px-6 py-6 bg-slate-50/50">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {roleOptions.map((r) => {
                    const meta = roleMeta[r] || {
                      label: String(r),
                      icon: 'badge',
                      gradient: 'from-gray-100 to-gray-200',
                    };
                    const isActive = r === currentRole;
                    return (
                      <button
                        key={r}
                        onClick={() => {
                          onRoleChange?.(r);
                          setIsRoleSwitcherOpen(false);
                        }}
                        className={`group text-left rounded-2xl border transition-all overflow-hidden bg-white shadow-sm ${
                          isActive
                            ? 'border-kauvery-purple ring-2 ring-purple-100 shadow-md shadow-purple-100/80'
                            : 'border-gray-200 hover:border-purple-200 hover:shadow-md'
                        }`}
                      >
                        <div
                          className={`h-24 bg-gradient-to-br ${meta.gradient} relative border-b border-gray-100`}
                        >
                          <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.9),transparent_55%)]" />
                          <div className="absolute top-3 left-3 w-10 h-10 rounded-xl bg-white/90 border border-gray-200 flex items-center justify-center shadow-sm">
                            <span className="material-icons-round text-kauvery-purple">
                              {meta.icon}
                            </span>
                          </div>
                          {isActive && (
                            <div className="absolute top-3 right-3 px-2 py-1 rounded-full text-[10px] font-black bg-kauvery-purple text-white border border-purple-800/10 shadow-sm">
                              CURRENT
                            </div>
                          )}
                        </div>
                        <div className="px-4 py-3 bg-white">
                          <div className="text-sm font-extrabold text-gray-900">
                            {meta.label}
                          </div>
                          <div className="text-[11px] text-gray-600 font-semibold mt-0.5">
                            Switch workspace & permissions
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => setIsRoleSwitcherOpen(false)}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-kauvery-purple to-kauvery-violet text-white font-black text-sm shadow-md shadow-purple-200/60 hover:opacity-95 transition-opacity"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <aside className="w-64 bg-gradient-to-b from-white via-white to-purple-50/50 backdrop-blur-xl border-r border-gray-200 h-screen flex flex-col fixed left-0 top-0 z-40 shadow-[12px_0_32px_rgba(15,23,42,0.06)]">
        {/* Brand */}
        <div className="h-16 flex items-center px-5 border-b border-gray-200/70 bg-white/60">
          <div className="w-9 h-9 bg-gradient-to-br from-kauvery-purple to-kauvery-violet rounded-2xl flex items-center justify-center text-white font-black mr-3 shadow-md shadow-purple-200 ring-1 ring-purple-200">
            K
          </div>
          <div className="min-w-0">
            <div className="font-black text-gray-900 leading-tight truncate">
              Kaizen Flow
            </div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide truncate">
              Workflow Suite
            </div>
          </div>
        </div>

        {/* Nav */}
        <div className="px-4 py-4">
          <div className="text-[11px] font-extrabold text-gray-500 uppercase tracking-wider px-2 mb-2">
            Main Menu
          </div>
          <nav className="space-y-1.5">
            {menuItems.map((item) => {
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id as ViewType)}
                  className={`group relative w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-extrabold rounded-xl transition-all ${
                    active
                      ? 'text-kauvery-purple bg-gradient-to-r from-purple-50 to-white border border-purple-200 shadow-sm shadow-purple-100'
                      : 'text-gray-800 hover:bg-white/70 hover:shadow-sm hover:shadow-slate-200/60'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-gradient-to-b from-kauvery-purple to-kauvery-violet" />
                  )}
                  <span
                    className={`material-icons-round text-[18px] ${
                      active ? 'text-kauvery-purple' : 'text-gray-500 group-hover:text-gray-700'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer / Profile */}
        <div className="p-4 mt-auto border-t border-gray-200/70 bg-white/60">
          <div className="bg-gradient-to-br from-white via-white to-purple-50 border border-gray-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center text-kauvery-purple font-black border border-purple-200 shadow-sm">
                {currentRole.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-gray-500 font-extrabold uppercase tracking-wide">
                  Logged in as
                </div>
                <div
                  className="text-sm font-black text-gray-900 truncate"
                  title={currentUserName || currentRole}
                >
                  {currentUserName || currentRole}
                </div>
                <div className="text-[10px] text-gray-600 font-semibold truncate">
                  {currentRole}
                </div>
              </div>
            </div>

            {canSwitchRole && (
              <button
                onClick={() => setIsRoleSwitcherOpen(true)}
                className="mt-3 w-full px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 font-extrabold text-xs flex items-center justify-between shadow-sm hover:shadow-md hover:shadow-slate-200/60 transition-shadow"
              >
                <span className="flex items-center gap-2">
                  <span className="material-icons-round text-base text-gray-700">
                    switch_account
                  </span>
                  Switch role
                </span>
                <span className="text-[10px] text-gray-600 font-black truncate max-w-[88px]">
                  {currentRole}
                </span>
              </button>
            )}

            {onLogout && (
              <button
                onClick={onLogout}
                className="mt-2 w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 hover:text-red-700 hover:border-red-200 hover:bg-red-50 font-extrabold text-xs flex items-center justify-center gap-2"
              >
                <span className="material-icons-round text-base">logout</span>
                Logout
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};