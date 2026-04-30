import React, { useEffect, useMemo, useState } from 'react';

type UsersApiRow = {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  unitCode?: string | null;
  unitScopes?: {
    UNIT_COORDINATOR?: string[];
    SELECTION_COMMITTEE?: string[];
  };
  department?: string | null;
  designation?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  roles: string[];
};

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
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [rows, setRows] = useState<UsersApiRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/users?includeUnitScopes=true`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await messageFromFailedResponse(res));
      const data = (await res.json()) as UsersApiRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byRole =
      roleFilter === 'all'
        ? rows
        : rows.filter((u) => (u.roles || []).includes(roleFilter));
    if (!q) return byRole;
    return byRole.filter((u) => {
      const hay = [
        u.employeeCode,
        u.name,
        u.email,
        u.unitCode || '',
        u.department || '',
        u.designation || '',
        (u.roles || []).join(','),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, roleFilter, rows]);

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((u) => (u.roles || []).forEach((r) => set.add(String(r))));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Role List</h1>
          <p className="text-xs text-gray-600 font-semibold mt-1">
            Read-only view of all users and their assigned roles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              filter_alt
            </span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-[220px] max-w-[70vw] pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
              aria-label="Filter by role"
              title="Filter by role"
            >
              <option value="all">All roles</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, code, email, role…"
              className="w-[380px] max-w-[80vw] pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
            />
          </div>
          <button
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
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="text-sm font-extrabold text-gray-900">
            Users <span className="text-gray-500 font-black">({filtered.length})</span>
          </div>
          <div className="text-[11px] text-gray-500 font-bold">
            Tip: use “User Management” to edit roles
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
              {filtered.map((u) => (
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
                      {!(u.unitScopes?.UNIT_COORDINATOR?.length || u.unitScopes?.SELECTION_COMMITTEE?.length) && (
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

              {!filtered.length && (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-600 font-bold" colSpan={6}>
                    {isLoading ? 'Loading users…' : 'No users found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

