import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { USER_ROLE_FILTER_OPTIONS } from '../constants/adminUserRoles';

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

export const RoleListView: React.FC<{
  apiBase: string;
  authHeaders: () => Record<string, string>;
}> = ({ apiBase, authHeaders }) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [skip, setSkip] = useState(0);
  const [pageSize, setPageSize] = useState<number>(50);

  const [rows, setRows] = useState<UsersApiRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<UsersSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 450);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setSkip(0);
  }, [debouncedQuery, roleFilter, activeFilter, pageSize]);

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

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('includeUnitScopes', 'true');
      params.set('skip', String(skip));
      params.set('take', String(pageSize));
      if (debouncedQuery) params.set('search', debouncedQuery);
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (activeFilter === 'active') params.set('isActive', 'true');
      if (activeFilter === 'inactive') params.set('isActive', 'false');

      const res = await fetch(`${apiBase}/users?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await messageFromFailedResponse(res));
      const data = (await res.json()) as UsersListResponse;
      const items = Array.isArray(data?.items) ? data.items : [];
      setRows(items);
      setTotal(typeof data?.total === 'number' ? data.total : items.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
      setRows([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [
    apiBase,
    authHeaders,
    skip,
    pageSize,
    debouncedQuery,
    roleFilter,
    activeFilter,
  ]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void load();
  }, [load]);

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
        accounts
      </>
    );
  }, [summary]);

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Role List</h1>
          <p className="text-xs text-gray-600 font-semibold mt-1">
            Directory-wide view with server-side paging — suitable for very large user bases (10k+).
          </p>
          {summaryLine && (
            <p className="text-[11px] text-gray-500 font-bold mt-2">{summaryLine}</p>
          )}
        </div>

        <div className="flex flex-col items-stretch sm:flex-row sm:flex-wrap gap-2">
          <div className="relative">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              toggle_on
            </span>
            <select
              value={activeFilter}
              onChange={(e) =>
                setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')
              }
              className="w-[200px] max-w-[70vw] pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
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
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-[240px] max-w-[70vw] pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
              aria-label="Filter by role"
              title="Filter by role"
            >
              <option value="all">Has any role (no filter)</option>
              {USER_ROLE_FILTER_OPTIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  Has role: {r.label}
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
              placeholder="Search name, employee code, email, department…"
              className="w-full min-w-[260px] max-w-[90vw] pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
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
            onClick={() => void load()}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-kauvery-purple to-kauvery-violet text-white font-extrabold text-sm shadow-lg shadow-purple-200 hover:opacity-95 disabled:opacity-60"
            disabled={isLoading}
            title="Refresh"
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

      <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgba(15,23,42,0.06)] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-sm font-extrabold text-gray-900">
            Matching users{' '}
            <span className="text-gray-500 font-black">({total.toLocaleString()})</span>
          </div>
          <div className="text-[11px] text-gray-500 font-bold">
            {total > 0
              ? `Showing ${showingFrom.toLocaleString()}–${showingTo.toLocaleString()} · Page ${currentPage} / ${pageCount}`
              : 'Adjust filters or search'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-600 font-black">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Employee Unit</th>
                <th className="px-5 py-3">Unit Scopes</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Roles</th>
                <th className="px-5 py-3">Last login</th>
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
                    <div className="font-extrabold text-gray-900">{u.unitCode || '—'}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(u.unitScopes?.UNIT_COORDINATOR || []).map((code) => (
                        <span
                          key={`${u.id}-uc-${code}`}
                          className="inline-flex items-center px-2 py-1 rounded-full border text-[11px] font-extrabold bg-purple-50 text-purple-800 border-purple-200"
                          title="UNIT_COORDINATOR scope"
                        >
                          UC:{code}
                        </span>
                      ))}
                      {(u.unitScopes?.SELECTION_COMMITTEE || []).map((code) => (
                        <span
                          key={`${u.id}-sc-${code}`}
                          className="inline-flex items-center px-2 py-1 rounded-full border text-[11px] font-extrabold bg-blue-50 text-blue-800 border-blue-200"
                          title="SELECTION_COMMITTEE scope"
                        >
                          SC:{code}
                        </span>
                      ))}
                      {(u.unitScopes?.HOD_FINANCE || []).map((code) => (
                        <span
                          key={`${u.id}-hf-${code}`}
                          className="inline-flex items-center px-2 py-1 rounded-full border text-[11px] font-extrabold bg-amber-50 text-amber-800 border-amber-200"
                          title="HOD_FINANCE scope"
                        >
                          Fin:{code}
                        </span>
                      ))}
                      {(u.unitScopes?.HOD_QUALITY || []).map((code) => (
                        <span
                          key={`${u.id}-hq-${code}`}
                          className="inline-flex items-center px-2 py-1 rounded-full border text-[11px] font-extrabold bg-amber-50 text-amber-800 border-amber-200"
                          title="HOD_QUALITY scope"
                        >
                          Qual:{code}
                        </span>
                      ))}
                      {(u.unitScopes?.HOD_HR || []).map((code) => (
                        <span
                          key={`${u.id}-hh-${code}`}
                          className="inline-flex items-center px-2 py-1 rounded-full border text-[11px] font-extrabold bg-amber-50 text-amber-800 border-amber-200"
                          title="HOD_HR scope"
                        >
                          HR:{code}
                        </span>
                      ))}
                      {(u.unitScopes?.HOD_OPS || []).map((code) => (
                        <span
                          key={`${u.id}-ho-${code}`}
                          className="inline-flex items-center px-2 py-1 rounded-full border text-[11px] font-extrabold bg-amber-50 text-amber-800 border-amber-200"
                          title="HOD_OPS scope"
                        >
                          Ops:{code}
                        </span>
                      ))}
                      {(u.unitScopes?.HOD_NURSING || []).map((code) => (
                        <span
                          key={`${u.id}-hn-${code}`}
                          className="inline-flex items-center px-2 py-1 rounded-full border text-[11px] font-extrabold bg-amber-50 text-amber-800 border-amber-200"
                          title="HOD_NURSING scope"
                        >
                          Nur:{code}
                        </span>
                      ))}
                      {!(
                        u.unitScopes?.UNIT_COORDINATOR?.length ||
                        u.unitScopes?.SELECTION_COMMITTEE?.length ||
                        u.unitScopes?.HOD_FINANCE?.length ||
                        u.unitScopes?.HOD_QUALITY?.length ||
                        u.unitScopes?.HOD_HR?.length ||
                        u.unitScopes?.HOD_OPS?.length ||
                        u.unitScopes?.HOD_NURSING?.length
                      ) && (
                        <span className="text-xs text-gray-500 font-bold">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-bold text-gray-900">{u.department || '—'}</div>
                    <div className="text-xs text-gray-600 font-semibold">{u.designation || '—'}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(u.roles || []).length ? (
                        (u.roles || []).map((r) => (
                          <span
                            key={`${u.id}-${r}`}
                            className="inline-flex items-center px-2 py-1 rounded-full border text-[11px] font-extrabold bg-slate-50 text-slate-800 border-slate-200"
                            title={r}
                          >
                            {r}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-500 font-bold">No roles</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-700 font-bold">
                    {formatDateTime(u.lastLoginAt)}
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-600 font-bold" colSpan={6}>
                    {isLoading ? 'Loading users…' : 'No users in this page — try another search or page.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 bg-gray-50/60">
          <div className="text-[11px] font-bold text-gray-500">
            Tip: narrow by role or search before paging — fastest with large directories.
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
    </div>
  );
};
