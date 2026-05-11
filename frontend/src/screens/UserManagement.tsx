import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { USER_ROLE_FILTER_OPTIONS } from '../constants/adminUserRoles';

type BackendRoleCode =
  | 'EMPLOYEE'
  | 'UNIT_COORDINATOR'
  | 'SELECTION_COMMITTEE'
  | 'IMPLEMENTER'
  | 'BUSINESS_EXCELLENCE'
  | 'BUSINESS_EXCELLENCE_HEAD'
  | 'HOD_FINANCE'
  | 'HOD_HR'
  | 'HOD_QUALITY'
  | 'HOD_OPS'
  | 'HOD_NURSING'
  | 'ADMIN'
  | 'SUPER_ADMIN'
  | 'BE_MEMBER'
  | 'BE_HEAD';

const ROLE_LABEL: Record<BackendRoleCode, string> = {
  EMPLOYEE: 'Employee',
  UNIT_COORDINATOR: 'Unit Coordinator',
  SELECTION_COMMITTEE: 'Selection Committee',
  IMPLEMENTER: 'Implementer',
  BUSINESS_EXCELLENCE: 'Business Excellence Member',
  BUSINESS_EXCELLENCE_HEAD: 'Business Excellence Head',
  HOD_FINANCE: 'Head - Finance',
  HOD_HR: 'Head - HR',
  HOD_QUALITY: 'Head - Quality',
  HOD_OPS: 'Head - Operations',
  HOD_NURSING: 'Head - Nursing',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
  BE_MEMBER: 'Business Excellence Member (legacy)',
  BE_HEAD: 'Business Excellence Head (legacy)',
};

const ROLE_OPTIONS: { code: BackendRoleCode; label: string; tone: 'purple' | 'slate' | 'amber' | 'emerald' }[] = [
  { code: 'EMPLOYEE', label: ROLE_LABEL.EMPLOYEE, tone: 'slate' },
  { code: 'IMPLEMENTER', label: ROLE_LABEL.IMPLEMENTER, tone: 'emerald' },
  { code: 'UNIT_COORDINATOR', label: ROLE_LABEL.UNIT_COORDINATOR, tone: 'purple' },
  { code: 'SELECTION_COMMITTEE', label: ROLE_LABEL.SELECTION_COMMITTEE, tone: 'purple' },
  { code: 'BUSINESS_EXCELLENCE', label: ROLE_LABEL.BUSINESS_EXCELLENCE, tone: 'amber' },
  { code: 'BUSINESS_EXCELLENCE_HEAD', label: ROLE_LABEL.BUSINESS_EXCELLENCE_HEAD, tone: 'amber' },
  { code: 'HOD_QUALITY', label: ROLE_LABEL.HOD_QUALITY, tone: 'slate' },
  { code: 'HOD_FINANCE', label: ROLE_LABEL.HOD_FINANCE, tone: 'slate' },
  { code: 'HOD_HR', label: ROLE_LABEL.HOD_HR, tone: 'slate' },
  { code: 'HOD_OPS', label: ROLE_LABEL.HOD_OPS, tone: 'slate' },
  { code: 'HOD_NURSING', label: ROLE_LABEL.HOD_NURSING, tone: 'slate' },
  { code: 'ADMIN', label: ROLE_LABEL.ADMIN, tone: 'purple' },
  { code: 'SUPER_ADMIN', label: ROLE_LABEL.SUPER_ADMIN, tone: 'purple' },
];

type UsersApiRow = {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  unitCode?: string | null;
  unitScopes?: {
    UNIT_COORDINATOR?: string[];
    SELECTION_COMMITTEE?: string[];
    HOD_FINANCE?: string[];
    HOD_QUALITY?: string[];
    HOD_HR?: string[];
    HOD_OPS?: string[];
    HOD_NURSING?: string[];
  };
  departmentHodAssignments?: Array<{
    departmentName: string;
    unitCode: string;
  }>;
  department?: string | null;
  designation?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  roles: string[];
};

type UsersListResponse = {
  items: UsersApiRow[];
  total: number;
  skip: number;
  take: number;
};

type UsersSummaryResponse = {
  totalUsers: number;
  activeUsers: number;
};

const PAGE_SIZES = [25, 50, 100] as const;

const DEPARTMENT_HOD_PREFIX = 'DEPARTMENT_HOD::';

function makeDepartmentHodRoleCode(departmentName: string): string {
  return `${DEPARTMENT_HOD_PREFIX}${departmentName}`;
}

function isDepartmentHodRoleCode(value: string): boolean {
  return value.startsWith(DEPARTMENT_HOD_PREFIX);
}

function getDepartmentNameFromDepartmentHodRoleCode(value: string): string {
  return isDepartmentHodRoleCode(value)
    ? value.slice(DEPARTMENT_HOD_PREFIX.length).trim()
    : '';
}

function toneClasses(tone: 'purple' | 'slate' | 'amber' | 'emerald'): string {
  if (tone === 'purple') return 'bg-purple-50 text-purple-800 border-purple-200';
  if (tone === 'amber') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (tone === 'emerald') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  return 'bg-slate-50 text-slate-800 border-slate-200';
}

function formatDateTime(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

async function messageFromFailedResponse(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return `Request failed (${res.status})`;
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    const m = body.message;
    if (Array.isArray(m)) return m.join(' ');
    if (typeof m === 'string') return m;
  } catch {
    // ignore
  }
  return text;
}

export const UserManagement: React.FC<{
  apiBase: string;
  authHeaders: () => Record<string, string>;
  /** Refetch Kaizen suggestions in the shell after HRMS mobile ideas are imported */
  onAfterMobileSuggestionSync?: () => void | Promise<void>;
}> = ({ apiBase, authHeaders, onAfterMobileSuggestionSync }) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [department, setDepartment] = useState<string>('');
  const [roleHasFilter, setRoleHasFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [skip, setSkip] = useState(0);
  const [pageSize, setPageSize] = useState<number>(50);

  const [departments, setDepartments] = useState<string[]>([]);
  const [units, setUnits] = useState<Array<{ code: string; name?: string }>>([]);
  const [rows, setRows] = useState<UsersApiRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<UsersSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSyncingMobile, setIsSyncingMobile] = useState(false);

  const [activeUser, setActiveUser] = useState<UsersApiRow | null>(null);
  const [selectedRoleCode, setSelectedRoleCode] = useState<string>('EMPLOYEE');
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  // Unit-scoped role configuration
  const selectedDepartmentHodName =
    getDepartmentNameFromDepartmentHodRoleCode(selectedRoleCode);
  const isUnitScopedRole =
    selectedRoleCode === 'UNIT_COORDINATOR' ||
    selectedRoleCode === 'SELECTION_COMMITTEE' ||
    selectedRoleCode === 'HOD_FINANCE' ||
    selectedRoleCode === 'HOD_QUALITY' ||
    selectedRoleCode === 'HOD_HR' ||
    selectedRoleCode === 'HOD_OPS' ||
    selectedRoleCode === 'HOD_NURSING' ||
    isDepartmentHodRoleCode(selectedRoleCode);
  const [unitScopeQuery, setUnitScopeQuery] = useState('');
  const [selectedUnitCodes, setSelectedUnitCodes] = useState<string[]>([]);
  const [isLoadingScopes, setIsLoadingScopes] = useState(false);
  const [isSavingScopes, setIsSavingScopes] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 450);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setSkip(0);
  }, [debouncedQuery, department, roleHasFilter, activeFilter, pageSize]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/users/summary`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as UsersSummaryResponse;
      setSummary(data);
    } catch {
      setSummary(null);
    }
  }, [apiBase, authHeaders]);

  const loadDepartments = async () => {
    try {
      const res = await fetch(`${apiBase}/hrms/departments`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as Array<{ name?: string }>;
      const names = (Array.isArray(data) ? data : [])
        .map((d) => String(d?.name || '').trim())
        .filter(Boolean);
      setDepartments(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)));
    } catch {
      // non-blocking
    }
  };

  const loadUnits = async () => {
    try {
      const res = await fetch(`${apiBase}/hrms/units`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as Array<{ code?: string; name?: string }>;
      const clean = (Array.isArray(data) ? data : [])
        .map((u) => ({
          code: String(u?.code || '').trim(),
          name: u?.name ? String(u.name) : undefined,
        }))
        .filter((u) => !!u.code);
      setUnits(clean.sort((a, b) => a.code.localeCompare(b.code)));
    } catch {
      // non-blocking
    }
  };

  const load = useCallback(async (): Promise<UsersApiRow[] | undefined> => {
    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(skip));
      params.set('take', String(pageSize));
      if (debouncedQuery) params.set('search', debouncedQuery);
      if (department.trim()) params.set('department', department.trim());
      if (roleHasFilter !== 'all') params.set('role', roleHasFilter);
      if (activeFilter === 'active') params.set('isActive', 'true');
      if (activeFilter === 'inactive') params.set('isActive', 'false');
      params.set('includeUnitScopes', 'true');
      const res = await fetch(`${apiBase}/users?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await messageFromFailedResponse(res));
      const data = (await res.json()) as UsersListResponse;
      const items = Array.isArray(data?.items) ? data.items : [];
      setRows(items);
      setTotal(typeof data?.total === 'number' ? data.total : items.length);
      return items;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
      setRows([]);
      setTotal(0);
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, [
    apiBase,
    authHeaders,
    skip,
    pageSize,
    debouncedQuery,
    department,
    roleHasFilter,
    activeFilter,
  ]);

  const runMobileIdeasSync = async () => {
    setIsSyncingMobile(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${apiBase}/mobile-ideas-sync/run-now`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await messageFromFailedResponse(res));
      const body = (await res.json()) as {
        scanned?: number;
        inserted?: number;
        updated?: number;
        skippedUnmappedEmployee?: number;
        disabled?: boolean;
        message?: string;
      };
      const scanned = Number(body?.scanned ?? 0);
      const inserted = Number(body?.inserted ?? 0);
      const updated = Number(body?.updated ?? 0);
      const skipped = Number(body?.skippedUnmappedEmployee ?? 0);

      if (body.disabled && body.message) {
        setNotice(body.message);
      } else {
        let line = `Mobile sync done. Scanned: ${scanned}, Inserted: ${inserted}, Updated: ${updated}, Skipped (unmapped employee): ${skipped}.`;
        if (scanned === 0 && inserted === 0 && updated === 0) {
          line +=
            ' No rows returned from hrms_suggestions (empty table, none active, or HRMS_DATABASE_URL points to an empty DB).';
        } else {
          line +=
            ' Dashboard / Pipeline lists refresh automatically — switch there to see new ideas.';
        }
        setNotice(line);
      }

      await load();
      await onAfterMobileSuggestionSync?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mobile sync failed.');
    } finally {
      setIsSyncingMobile(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadDepartments();
    void loadUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUnitScopes = async (userId: string, roleCode: BackendRoleCode) => {
    setIsLoadingScopes(true);
    try {
      const params = new URLSearchParams({ roleCode });
      const res = await fetch(`${apiBase}/users/${userId}/unit-scopes?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await messageFromFailedResponse(res));
      const data = (await res.json()) as Array<{ unitCode?: string }>;
      const codes = (Array.isArray(data) ? data : [])
        .map((r) => String(r?.unitCode || '').trim())
        .filter(Boolean);
      setSelectedUnitCodes(Array.from(new Set(codes)).sort((a, b) => a.localeCompare(b)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load unit scopes.');
      setSelectedUnitCodes([]);
    } finally {
      setIsLoadingScopes(false);
    }
  };

  const loadDepartmentHodScopes = async (
    userId: string,
    departmentName: string,
  ) => {
    setIsLoadingScopes(true);
    try {
      const params = new URLSearchParams({ department: departmentName });
      const res = await fetch(
        `${apiBase}/users/${userId}/department-hod-scopes?${params.toString()}`,
        {
          headers: authHeaders(),
        },
      );
      if (!res.ok) throw new Error(await messageFromFailedResponse(res));
      const data = (await res.json()) as Array<{ unitCode?: string }>;
      const codes = (Array.isArray(data) ? data : [])
        .map((r) => String(r?.unitCode || '').trim())
        .filter(Boolean);
      setSelectedUnitCodes(Array.from(new Set(codes)).sort((a, b) => a.localeCompare(b)));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to load department HOD unit scopes.',
      );
      setSelectedUnitCodes([]);
    } finally {
      setIsLoadingScopes(false);
    }
  };

  useEffect(() => {
    if (!activeUser) return;
    if (!isUnitScopedRole) {
      setSelectedUnitCodes([]);
      setUnitScopeQuery('');
      return;
    }
    if (isDepartmentHodRoleCode(selectedRoleCode)) {
      void loadDepartmentHodScopes(activeUser.id, selectedDepartmentHodName);
      return;
    }
    void loadUnitScopes(activeUser.id, selectedRoleCode as BackendRoleCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUser?.id, selectedRoleCode]);

  const handleSaveUnitScopes = async () => {
    if (!activeUser) return;
    if (!isUnitScopedRole) return;
    setIsSavingScopes(true);
    setError(null);
    setNotice(null);
    try {
      const isDeptHod = isDepartmentHodRoleCode(selectedRoleCode);
      const res = await fetch(
        isDeptHod
          ? `${apiBase}/users/${activeUser.id}/department-hod-scopes`
          : `${apiBase}/users/${activeUser.id}/unit-scopes`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(
            isDeptHod
              ? {
                  departmentName: selectedDepartmentHodName,
                  unitCodes: selectedUnitCodes,
                  assignedBy: 'SUPER_ADMIN_UI',
                }
              : {
                  roleCode: selectedRoleCode,
                  unitCodes: selectedUnitCodes,
                  assignedBy: 'SUPER_ADMIN_UI',
                },
          ),
        },
      );
      if (!res.ok) throw new Error(await messageFromFailedResponse(res));
      setNotice(
        `${
          isDeptHod ? `HOD - ${selectedDepartmentHodName}` : ROLE_LABEL[selectedRoleCode as BackendRoleCode]
        } unit scopes saved (${selectedUnitCodes.length}).`,
      );
      const freshRows = await load();
      const refreshed = (freshRows || []).find((r) => r.id === activeUser.id) || activeUser;
      setActiveUser(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save unit scopes.');
    } finally {
      setIsSavingScopes(false);
    }
  };

  const handleAssignRole = async () => {
    if (!activeUser) return;
    const isDeptHod = isDepartmentHodRoleCode(selectedRoleCode);
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(
        isDeptHod
          ? `${apiBase}/users/${activeUser.id}/department-hod-scopes`
          : `${apiBase}/users/${activeUser.id}/roles`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(
            isDeptHod
              ? {
                  departmentName: selectedDepartmentHodName,
                  unitCodes: selectedUnitCodes,
                  assignedBy: 'SUPER_ADMIN_UI',
                }
              : {
                  roleCode: selectedRoleCode,
                  assignedBy: 'SUPER_ADMIN_UI',
                },
          ),
        },
      );
      if (!res.ok) throw new Error(await messageFromFailedResponse(res));
      await load();
      setActiveUser(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : isDeptHod
            ? 'Failed to assign department HOD.'
            : 'Failed to assign role.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveRole = async (roleCode: string) => {
    if (!activeUser) return;
    if (!roleCode) return;
    const ok = window.confirm(`Remove role "${roleCode}" from ${activeUser.name}?`);
    if (!ok) return;
    setIsRemoving(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/users/${activeUser.id}/roles/${encodeURIComponent(roleCode)}`,
        {
          method: 'DELETE',
          headers: authHeaders(),
        },
      );
      if (!res.ok) throw new Error(await messageFromFailedResponse(res));
      const freshRows = await load();
      const refreshed =
        (freshRows || []).find((r) => r.id === activeUser.id) || null;
      setActiveUser(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove role.');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleRemoveDepartmentHod = async (departmentName: string) => {
    if (!activeUser) return;
    if (!departmentName) return;
    const ok = window.confirm(
      `Remove department HOD assignment "${departmentName}" from ${activeUser.name}?`,
    );
    if (!ok) return;
    setIsRemoving(true);
    setError(null);
    try {
      const params = new URLSearchParams({ department: departmentName });
      const res = await fetch(
        `${apiBase}/users/${activeUser.id}/department-hod-scopes?${params.toString()}`,
        {
          method: 'DELETE',
          headers: authHeaders(),
        },
      );
      if (!res.ok) throw new Error(await messageFromFailedResponse(res));
      const freshRows = await load();
      const refreshed = (freshRows || []).find((r) => r.id === activeUser.id) || null;
      setActiveUser(refreshed);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to remove department HOD assignment.',
      );
    } finally {
      setIsRemoving(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(skip / pageSize) + 1;
  const showingFrom = total === 0 ? 0 : skip + 1;
  const showingTo = Math.min(skip + rows.length, total);
  const canPrev = skip > 0;
  const canNext = skip + pageSize < total;

  const summaryLine = useMemo(() => {
    if (!summary) return null;
    return (
      <>
        Directory:{' '}
        <span className="font-black text-gray-900">{summary.activeUsers.toLocaleString()}</span>{' '}
        active ·{' '}
        <span className="font-black text-gray-900">{summary.totalUsers.toLocaleString()}</span> total
      </>
    );
  }, [summary]);

  const departmentHodRoleOptions = useMemo(
    () =>
      [...departments]
        .sort((a, b) => a.localeCompare(b))
        .map((d) => ({
          code: makeDepartmentHodRoleCode(d),
          label: `HOD - ${d}`,
        })),
    [departments],
  );

  const activeUserDepartmentHodGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of activeUser?.departmentHodAssignments || []) {
      const dept = String(row.departmentName || '').trim();
      const unit = String(row.unitCode || '').trim();
      if (!dept || !unit) continue;
      const prev = map.get(dept) ?? [];
      prev.push(unit);
      map.set(dept, prev);
    }
    return [...map.entries()]
      .map(([departmentName, unitCodes]) => ({
        departmentName,
        unitCodes: Array.from(new Set(unitCodes)).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.departmentName.localeCompare(b.departmentName));
  }, [activeUser?.departmentHodAssignments]);

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-gray-900">User Management</h1>
          <p className="text-xs text-gray-600 font-semibold mt-1">
            Server-side search and paging — built for large directories (10k+ users).
          </p>
          {summaryLine && (
            <p className="text-[11px] text-gray-500 font-bold mt-2">{summaryLine}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <div className="relative">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              toggle_on
            </span>
            <select
              value={activeFilter}
              onChange={(e) =>
                setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')
              }
              className="w-full sm:w-[200px] pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
              aria-label="Active status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </div>
          <div className="relative">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              filter_alt
            </span>
            <select
              value={roleHasFilter}
              onChange={(e) => setRoleHasFilter(e.target.value)}
              className="w-full sm:w-[260px] pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
              aria-label="Filter by assigned role"
            >
              <option value="all">Any role assignment</option>
              {USER_ROLE_FILTER_OPTIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  Has role: {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              apartment
            </span>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full sm:w-[260px] max-w-[70vw] pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
              aria-label="Filter by department"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, code, email, department…"
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-black text-gray-500 whitespace-nowrap">Rows</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="pl-3 pr-2 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void runMobileIdeasSync()}
            className="px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-900 font-extrabold text-sm shadow-sm hover:bg-gray-50"
            disabled={isSyncingMobile}
            title="Import ideas submitted from the mobile app into Kaizen portal"
          >
            <span className="material-icons-round text-[18px] align-[-4px] mr-1.5">sync</span>
            {isSyncingMobile ? 'Syncing…' : 'Sync Mobile Ideas'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-kauvery-purple to-kauvery-violet text-white font-extrabold text-sm shadow-lg shadow-purple-200 hover:opacity-95"
            disabled={isLoading}
          >
            {isLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-xs text-red-800 font-bold bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 text-xs text-emerald-900 font-bold bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          {notice}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgba(15,23,42,0.06)] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-sm font-extrabold text-gray-900">
            Matching employees{' '}
            <span className="text-gray-500 font-black">({total.toLocaleString()})</span>
          </div>
          <div className="text-[11px] text-gray-500 font-bold">
            {total > 0
              ? `Showing ${showingFrom.toLocaleString()}–${showingTo.toLocaleString()} · Page ${currentPage} / ${pageCount}`
              : 'Use search or filters to find users'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-600 font-black">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Employee unit</th>
                <th className="px-5 py-3">Unit scopes</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Roles</th>
                <th className="px-5 py-3">Last login</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-4">
                    <div className="font-extrabold text-gray-900">{u.name}</div>
                    <div className="text-xs text-gray-600 font-semibold mt-0.5">
                      <span className="font-black text-gray-700">{u.employeeCode}</span> • {u.email}
                      {!u.isActive && (
                        <span className="ml-2 inline-flex items-center text-[10px] font-black text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {(() => {
                      const code = String(u.unitCode || '').trim();
                      if (!code) return <span className="text-gray-500 font-bold">—</span>;
                      const name = units.find((x) => x.code === code)?.name;
                      return (
                        <div className="min-w-0">
                          <div className="font-extrabold text-gray-900">{code}</div>
                          <div className="text-xs text-gray-600 font-semibold">{name ? name : '—'}</div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-5 py-4">
                    {(() => {
                      const uc = (u.unitScopes?.UNIT_COORDINATOR || [])
                        .map((x) => String(x).trim())
                        .filter(Boolean);
                      const sc = (u.unitScopes?.SELECTION_COMMITTEE || [])
                        .map((x) => String(x).trim())
                        .filter(Boolean);
                      const hq = (u.unitScopes?.HOD_QUALITY || [])
                        .map((x) => String(x).trim())
                        .filter(Boolean);
                      const hf = (u.unitScopes?.HOD_FINANCE || [])
                        .map((x) => String(x).trim())
                        .filter(Boolean);
                      const hh = (u.unitScopes?.HOD_HR || [])
                        .map((x) => String(x).trim())
                        .filter(Boolean);
                      const ho = (u.unitScopes?.HOD_OPS || [])
                        .map((x) => String(x).trim())
                        .filter(Boolean);
                      const hn = (u.unitScopes?.HOD_NURSING || [])
                        .map((x) => String(x).trim())
                        .filter(Boolean);
                      const chips: Array<{ k: string; label: string; tone: 'purple' | 'slate' | 'amber' }> =
                        [];
                      uc.forEach((x) => chips.push({ k: `uc-${u.id}-${x}`, label: `UC:${x}`, tone: 'purple' }));
                      sc.forEach((x) => chips.push({ k: `sc-${u.id}-${x}`, label: `SC:${x}`, tone: 'slate' }));
                      hq.forEach((x) =>
                        chips.push({ k: `hq-${u.id}-${x}`, label: `Qual:${x}`, tone: 'amber' }),
                      );
                      hf.forEach((x) =>
                        chips.push({ k: `hf-${u.id}-${x}`, label: `Fin:${x}`, tone: 'amber' }),
                      );
                      hh.forEach((x) =>
                        chips.push({ k: `hh-${u.id}-${x}`, label: `HR:${x}`, tone: 'amber' }),
                      );
                      ho.forEach((x) =>
                        chips.push({ k: `ho-${u.id}-${x}`, label: `Ops:${x}`, tone: 'amber' }),
                      );
                      hn.forEach((x) =>
                        chips.push({ k: `hn-${u.id}-${x}`, label: `Nur:${x}`, tone: 'amber' }),
                      );
                      if (!chips.length) return <span className="text-gray-500 font-bold">—</span>;
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {chips.map((c) => (
                            <span
                              key={c.k}
                              className={`inline-flex items-center px-2 py-1 rounded-full border text-[11px] font-extrabold ${toneClasses(
                                c.tone,
                              )}`}
                            >
                              {c.label}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-bold text-gray-900">{u.department || '—'}</div>
                    <div className="text-xs text-gray-600 font-semibold">{u.designation || '—'}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(u.roles || []).length ? (
                        u.roles.map((r) => {
                          const code = String(r) as BackendRoleCode;
                          const opt = ROLE_OPTIONS.find((o) => o.code === code);
                          const label = (ROLE_LABEL as Record<string, string>)[code] || code;
                          return (
                            <span
                              key={`${u.id}-${r}`}
                              className={`inline-flex items-center px-2 py-1 rounded-full border text-[11px] font-extrabold ${toneClasses(
                                opt?.tone ?? 'slate',
                              )}`}
                              title={code}
                            >
                              {label}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-xs text-gray-500 font-bold">No roles</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-700 font-bold">{formatDateTime(u.lastLoginAt)}</td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => {
                        setActiveUser(u);
                        setSelectedRoleCode('EMPLOYEE');
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 font-extrabold text-xs"
                    >
                      <span className="material-icons-round text-base text-gray-500">manage_accounts</span>
                      Manage roles
                    </button>
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-600 font-bold" colSpan={7}>
                    {isLoading ? 'Loading users…' : 'No users on this page — adjust filters or search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 bg-gray-50/60">
          <div className="text-[11px] font-bold text-gray-500">
            Tip: assign multiple roles (e.g. Employee + Implementer). Narrow with “Has role” + search.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canPrev || isLoading}
              onClick={() => setSkip((s) => Math.max(0, s - pageSize))}
              className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-black text-gray-800 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!canNext || isLoading}
              onClick={() => setSkip((s) => s + pageSize)}
              className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-black text-gray-800 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Modal — portaled to body: ancestor `animate-fade-in` uses transform, which breaks `fixed` inside `<main>` scroll */}
      {activeUser &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] overflow-y-auto overscroll-contain touch-pan-y"
            role="presentation"
          >
          <div className="relative flex min-h-full items-start justify-center px-4 sm:px-6 pt-8 sm:pt-10 pb-12 sm:pb-16">
            <div
              className="absolute inset-0 bg-black/40"
              aria-hidden
              onClick={() => setActiveUser(null)}
            />
            <div
              className="relative z-10 w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="user-management-modal-title"
            >
            <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between shrink-0">
              <div>
                <div
                  id="user-management-modal-title"
                  className="text-xs font-black text-gray-500 uppercase tracking-wide"
                >
                  Manage access
                </div>
                <div className="text-lg font-black text-gray-900 mt-0.5">{activeUser.name}</div>
                <div className="text-xs text-gray-600 font-semibold mt-1">
                  {activeUser.employeeCode} • {activeUser.email}
                </div>
              </div>
              <button
                onClick={() => setActiveUser(null)}
                className="text-gray-500 hover:text-gray-900"
                aria-label="Close"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                  Assign new role
                </label>
                <select
                  value={selectedRoleCode}
                  onChange={(e) => setSelectedRoleCode(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                  {departmentHodRoleOptions.length > 0 && (
                    <optgroup label="Department HOD assignments">
                      {departmentHodRoleOptions.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <div className="text-[11px] text-gray-500 font-semibold mt-2">
                  {isDepartmentHodRoleCode(selectedRoleCode)
                    ? 'This assigns the selected department HOD for the chosen unit code(s).'
                    : 'This adds an additional role (it does not remove existing roles).'}
                </div>
              </div>

              {isUnitScopedRole && (
                <div className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-black text-gray-700 uppercase tracking-wide">
                        Unit scopes for{' '}
                        {isDepartmentHodRoleCode(selectedRoleCode)
                          ? `HOD - ${selectedDepartmentHodName}`
                          : ROLE_LABEL[selectedRoleCode as BackendRoleCode]}
                      </div>
                      <div className="text-[11px] text-gray-500 font-semibold mt-1">
                        {isDepartmentHodRoleCode(selectedRoleCode)
                          ? 'Select the unit code(s) where this user is the assigned department HOD.'
                          : 'Select which unit(s) this user can act on for this role.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveUnitScopes()}
                      disabled={isLoadingScopes || isSavingScopes || isSaving || isRemoving}
                      className="shrink-0 px-3 py-2 rounded-xl bg-white border border-gray-300 text-gray-900 font-extrabold text-xs hover:bg-gray-50 disabled:opacity-60"
                      title="Save unit scopes"
                    >
                      {isSavingScopes ? 'Saving…' : 'Save scopes'}
                    </button>
                  </div>

                  <div className="mt-3">
                    <div className="relative">
                      <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
                        search
                      </span>
                      <input
                        value={unitScopeQuery}
                        onChange={(e) => setUnitScopeQuery(e.target.value)}
                        placeholder="Search unit code/name…"
                        className="w-full pl-10 pr-3 py-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900"
                      />
                    </div>
                    <div className="mt-3 max-h-44 overflow-y-auto border border-gray-200 rounded-xl bg-gray-50">
                      {isLoadingScopes ? (
                        <div className="px-3 py-3 text-xs text-gray-600 font-bold">
                          Loading scopes…
                        </div>
                      ) : (
                        (units.length ? units : []).filter((u) => {
                          const q = unitScopeQuery.trim().toLowerCase();
                          if (!q) return true;
                          const hay = `${u.code} ${u.name || ''}`.toLowerCase();
                          return hay.includes(q);
                        }).map((u) => {
                          const checked = selectedUnitCodes.includes(u.code);
                          return (
                            <label
                              key={u.code}
                              className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-white"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const on = e.target.checked;
                                  setSelectedUnitCodes((prev) => {
                                    const set = new Set(prev);
                                    if (on) set.add(u.code);
                                    else set.delete(u.code);
                                    return (Array.from(set) as string[]).sort((a, b) =>
                                      String(a).localeCompare(String(b)),
                                    );
                                  });
                                }}
                                className="accent-kauvery-purple"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-extrabold text-gray-900">
                                  {u.code}
                                </div>
                                {u.name && (
                                  <div className="text-[11px] text-gray-600 font-semibold truncate">
                                    {u.name}
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        })
                      )}

                      {!isLoadingScopes && units.length === 0 && (
                        <div className="px-3 py-3 text-xs text-gray-600 font-bold">
                          No units loaded.
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-[11px] text-gray-600 font-semibold">
                      Selected: <span className="font-black text-gray-900">{selectedUnitCodes.length}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                <div className="text-xs font-black text-gray-600 uppercase tracking-wide mb-2">Current roles</div>
                <div className="flex flex-wrap gap-1.5">
                  {(activeUser.roles || []).map((r) => (
                    <span
                      key={`m-${activeUser.id}-${r}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full border bg-white text-[11px] font-extrabold text-gray-800 border-gray-200"
                    >
                      {(ROLE_LABEL as Record<string, string>)[String(r)] || String(r)}
                      <button
                        type="button"
                        onClick={() => void handleRemoveRole(String(r))}
                        disabled={isSaving || isRemoving}
                        className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-200 text-gray-500 hover:text-red-700 hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
                        title="Remove role"
                        aria-label={`Remove role ${String(r)}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                <div className="text-xs font-black text-gray-600 uppercase tracking-wide mb-2">
                  Department HOD assignments
                </div>
                {activeUserDepartmentHodGroups.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {activeUserDepartmentHodGroups.map((row) => (
                      <span
                        key={`dept-hod-${activeUser.id}-${row.departmentName}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full border bg-white text-[11px] font-extrabold text-gray-800 border-gray-200"
                      >
                        {`HOD - ${row.departmentName} (${row.unitCodes.join(', ')})`}
                        <button
                          type="button"
                          onClick={() => void handleRemoveDepartmentHod(row.departmentName)}
                          disabled={isSaving || isRemoving}
                          className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-200 text-gray-500 hover:text-red-700 hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
                          title="Remove department HOD assignment"
                          aria-label={`Remove department HOD assignment ${row.departmentName}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-500 font-semibold">
                    No department HOD assignments.
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-5 border-t border-gray-200 flex gap-2">
              <button
                onClick={() => setActiveUser(null)}
                className="flex-1 border border-gray-300 text-gray-900 font-extrabold py-2.5 rounded-xl"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleAssignRole()}
                className="flex-1 bg-gradient-to-r from-kauvery-purple to-kauvery-violet hover:opacity-95 text-white font-extrabold py-2.5 rounded-xl shadow-lg shadow-purple-200 disabled:opacity-60"
                disabled={isSaving || isRemoving}
              >
                {isSaving
                  ? 'Saving…'
                  : isDepartmentHodRoleCode(selectedRoleCode)
                    ? 'Assign department HOD'
                    : 'Assign role'}
              </button>
            </div>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
};

