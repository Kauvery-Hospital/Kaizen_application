import React, { useMemo, useState } from 'react';
import { Role, ViewType } from '../types';
import { PORTAL_NAME, PORTAL_NAME_SHORT, PORTAL_TAGLINE } from '../constants';
import { KAUVERY_SIDEBAR_BG } from '../theme/kauverySurfaces';

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  currentRole: Role;
  availableRoles?: Role[];
  departmentHodAssignments?: string[];
  onRoleChange?: (role: Role) => void;
  currentUserName?: string;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed = false,
  onToggleCollapsed,
  currentView,
  onViewChange,
  currentRole,
  availableRoles,
  departmentHodAssignments,
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

  const departmentHodOptions = useMemo(() => {
    const items = (departmentHodAssignments ?? [])
      .map((name) => String(name || '').trim())
      .filter(Boolean);
    return items.filter((name, index) => items.indexOf(name) === index);
  }, [departmentHodAssignments]);

  const canSwitchRole =
    Boolean(onRoleChange) && (roleOptions.length > 1 || departmentHodOptions.length > 0);

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
    [Role.OPS_HEAD]: {
      label: 'Ops Head',
      icon: 'precision_manufacturing',
      gradient: 'from-slate-50 to-zinc-100',
    },
    [Role.NURSING_HEAD]: {
      label: 'Nursing Head',
      icon: 'medical_services',
      gradient: 'from-indigo-50 to-violet-100',
    },
    [Role.ADMIN]: {
      label: 'Admin',
      icon: 'admin_panel_settings',
      gradient: 'from-gray-100 to-gray-200',
    },
  } as any;
  
  const isHodRole = [
    Role.HR_HEAD,
    Role.QUALITY_HOD,
    Role.FINANCE_HOD,
    Role.OPS_HEAD,
    Role.NURSING_HEAD,
  ].includes(currentRole);

  const menuItems = isHodRole
    ? [{ id: 'hod-desk', label: 'Approval desk', icon: 'task_alt' }]
    : [
        { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
        { id: 'pipeline', label: 'Pipeline', icon: 'view_column' },
        ...(currentRole === Role.BUSINESS_EXCELLENCE ||
        currentRole === Role.BUSINESS_EXCELLENCE_HEAD
          ? [{ id: 'be-overview', label: 'BE reports', icon: 'assessment' }]
          : []),
        ...(currentRole === Role.BUSINESS_EXCELLENCE ||
        currentRole === Role.BUSINESS_EXCELLENCE_HEAD
          ? [{ id: 'reports', label: 'Reports', icon: 'table_view' }]
          : []),
        { id: 'list', label: 'All Suggestions', icon: 'format_list_bulleted' },
        ...(currentRole === Role.ADMIN || currentRole === Role.SUPER_ADMIN
          ? [
              { id: 'role-list', label: 'Role List', icon: 'shield' },
              { id: 'users', label: 'User Management', icon: 'manage_accounts' },
            ]
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
            <div className="w-full max-w-3xl bg-white border border-kauvery-purple/20 rounded-2xl shadow-2xl shadow-kauvery-soft overflow-hidden">
              <div className="px-6 py-5 border-b border-kauvery-purple/15 flex items-start justify-between bg-gradient-to-r from-kauvery-purple/8 via-kauvery-violet/5 to-transparent">
                <div>
                  <div className="text-xs uppercase tracking-wide text-kauvery-peach/90 font-extrabold">
                    {PORTAL_NAME_SHORT}
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 mt-1">
                    Who’s using the portal?
                  </h2>
                  <p className="text-sm text-slate-400 font-semibold mt-1">
                    Choose a role to continue.
                  </p>
                </div>
                <button
                  onClick={() => setIsRoleSwitcherOpen(false)}
                  className="text-slate-500 hover:text-kauvery-purple p-2 rounded-full hover:bg-kauvery-purple/10 transition-colors"
                  aria-label="Close role switcher"
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>

              <div className="px-6 py-6 bg-slate-50/90">
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

                {departmentHodOptions.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-kauvery-purple/15 bg-kauvery-purple/5 px-4 py-4">
                    <div className="text-xs uppercase tracking-wide text-kauvery-purple/80 font-extrabold">
                      Department HOD assignments
                    </div>
                    <p className="mt-1 text-xs text-slate-600 font-semibold">
                      These assignments appear in your Employee workspace when Level 1 approval is routed to you.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {departmentHodOptions.map((department) => (
                        <span
                          key={department}
                          className="inline-flex items-center rounded-full border border-kauvery-purple/25 bg-kauvery-purple/10 px-3 py-1 text-xs font-black text-kauvery-purple"
                        >
                          {`HOD - ${department}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

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

      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen flex-col overflow-hidden border-r border-kauvery-purple/15 ${KAUVERY_SIDEBAR_BG} shadow-[8px_0_32px_-8px_rgba(150,32,103,0.12)] transition-[width] duration-300 ease-in-out ${
          collapsed ? 'w-[4.5rem]' : 'w-64'
        }`}
      >
        {/* Brand — K toggles collapse */}
        <div
          className={`relative flex h-[4.25rem] shrink-0 items-center border-b border-kauvery-purple/15 bg-gradient-to-r from-kauvery-purple/8 via-transparent to-kauvery-pink/8 ${
            collapsed ? 'justify-center px-2' : 'px-5'
          }`}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-kauvery-purple/[0.12] via-transparent to-kauvery-pink/[0.08]" />
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            className={`relative z-10 flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-kauvery-purple via-kauvery-violet to-kauvery-pink text-sm font-black text-white shadow-lg shadow-kauvery-soft ring-2 ring-white/20 transition-transform hover:scale-[1.03] active:scale-[0.98] ${
              collapsed ? 'h-10 w-10' : 'mr-3 h-10 w-10'
            }`}
          >
            K
          </button>
          {!collapsed && (
            <div className="relative min-w-0 flex-1">
              <div className="truncate font-black leading-tight text-slate-900">
                {PORTAL_NAME_SHORT}
              </div>
              <div className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-kauvery-purple/70">
                {PORTAL_TAGLINE}
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <div className={`py-4 ${collapsed ? 'px-2' : 'px-4'}`}>
          {!collapsed && (
            <div className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Main menu
            </div>
          )}
          <nav className="space-y-1.5">
            {menuItems.map((item) => {
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={collapsed ? item.label : undefined}
                  onClick={() => onViewChange(item.id as ViewType)}
                  className={`group relative flex w-full items-center rounded-xl text-sm font-extrabold transition-all ${
                    collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3.5 py-2.5'
                  } ${
                    active
                      ? 'border border-kauvery-purple/30 bg-gradient-to-r from-kauvery-purple to-kauvery-violet text-white shadow-kauvery-card'
                      : 'border border-transparent text-slate-600 hover:border-kauvery-purple/25 hover:bg-kauvery-purple/8 hover:text-kauvery-purple'
                  }`}
                >
                  {active && !collapsed && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-gradient-to-b from-kauvery-purple via-kauvery-violet to-kauvery-pink shadow-sm" />
                  )}
                  <span
                    className={`material-icons-round text-[20px] ${
                      active
                        ? 'text-kauvery-peach'
                        : 'text-slate-500 group-hover:text-kauvery-peach'
                    }`}
                  >
                    {item.icon}
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer / Profile */}
        <div
          className={`mt-auto border-t border-kauvery-purple/20 bg-gradient-to-t from-kauvery-purple/10 to-transparent ${
            collapsed ? 'p-2' : 'p-4'
          }`}
        >
          <div
            className={`rounded-2xl border border-kauvery-purple/15 bg-white shadow-kauvery-card ${
              collapsed ? 'flex flex-col items-center gap-2 p-2' : 'p-4'
            }`}
          >
            <div
              className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}
              title={collapsed ? `${currentUserName || currentRole} · ${currentRole}` : undefined}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-gradient-to-br from-kauvery-purple to-kauvery-violet text-sm font-black text-white shadow-md shadow-purple-900/40">
                {(currentUserName || currentRole).charAt(0)}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
                    Logged in as
                  </div>
                  <div
                    className="truncate text-sm font-black text-slate-900"
                    title={currentUserName || currentRole}
                  >
                    {currentUserName || currentRole}
                  </div>
                  <div className="truncate text-[10px] font-semibold text-slate-400">
                    {currentRole}
                  </div>
                </div>
              )}
            </div>

            {canSwitchRole && (
              <button
                type="button"
                title="Switch role"
                onClick={() => setIsRoleSwitcherOpen(true)}
                className={`flex items-center rounded-xl border border-kauvery-purple/25 bg-kauvery-purple/10 font-extrabold text-kauvery-purple shadow-sm transition-colors hover:bg-kauvery-purple/15 ${
                  collapsed
                    ? 'h-9 w-9 justify-center'
                    : 'mt-3 w-full justify-between px-3 py-2.5 text-xs'
                }`}
              >
                <span className="material-icons-round text-base text-kauvery-peach">
                  switch_account
                </span>
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left pl-2">Switch role</span>
                    <span className="max-w-[88px] truncate text-[10px] font-black text-slate-300">
                      {currentRole}
                    </span>
                  </>
                )}
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                title="Logout"
                onClick={onLogout}
                className={`flex items-center rounded-xl border border-kauvery-purple/20 bg-transparent font-extrabold text-slate-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 ${
                  collapsed
                    ? 'h-9 w-9 justify-center'
                    : 'mt-2 w-full justify-center gap-2 px-3 py-2.5 text-xs'
                }`}
              >
                <span className="material-icons-round text-base">logout</span>
                {!collapsed && <span>Logout</span>}
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};