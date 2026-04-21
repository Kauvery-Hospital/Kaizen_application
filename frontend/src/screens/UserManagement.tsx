import React, { useEffect, useMemo, useState } from 'react';

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
  { code: 'ADMIN', label: ROLE_LABEL.ADMIN, tone: 'purple' },
  { code: 'SUPER_ADMIN', label: ROLE_LABEL.SUPER_ADMIN, tone: 'purple' },
];

type UsersApiRow = {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  department?: string | null;
  designation?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  roles: string[];
};

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
}> = ({ apiBase, authHeaders }) => {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<UsersApiRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeUser, setActiveUser] = useState<UsersApiRow | null>(null);
  const [selectedRoleCode, setSelectedRoleCode] = useState<BackendRoleCode>('EMPLOYEE');
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) => {
      const hay = [
        u.employeeCode,
        u.name,
        u.email,
        u.department || '',
        u.designation || '',
        (u.roles || []).join(','),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, rows]);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('search', query.trim());
      const res = await fetch(`${apiBase}/users?${params.toString()}`, {
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

  const handleAssignRole = async () => {
    if (!activeUser) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/users/${activeUser.id}/roles`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          roleCode: selectedRoleCode,
          assignedBy: 'SUPER_ADMIN_UI',
        }),
      });
      if (!res.ok) throw new Error(await messageFromFailedResponse(res));
      await load();
      setActiveUser(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign role.');
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
      await load();
      // Keep modal open; refresh active user snapshot from rows
      const refreshed = rows.find((r) => r.id === activeUser.id) || null;
      setActiveUser(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove role.');
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-gray-900">User Management</h1>
          <p className="text-xs text-gray-600 font-semibold mt-1">
            Search employees, review role access, and assign additional roles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, employee code, email, dept…"
              className="w-[340px] max-w-[80vw] pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
            />
          </div>
          <button
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

      <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgba(15,23,42,0.06)] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="text-sm font-extrabold text-gray-900">
            Employees <span className="text-gray-500 font-black">({filtered.length})</span>
          </div>
          <div className="text-[11px] text-gray-500 font-bold">
            Tip: Assign multiple roles to allow “Employee + Implementer”
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-600 font-black">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Roles</th>
                <th className="px-5 py-3">Last login</th>
                <th className="px-5 py-3 text-right">Actions</th>
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

              {!filtered.length && (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-600 font-bold" colSpan={5}>
                    {isLoading ? 'Loading users…' : 'No users found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {activeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActiveUser(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between">
              <div>
                <div className="text-xs font-black text-gray-500 uppercase tracking-wide">Manage access</div>
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
                  onChange={(e) => setSelectedRoleCode(e.target.value as BackendRoleCode)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-gray-500 font-semibold mt-2">
                  This adds an additional role (it does not remove existing roles).
                </div>
              </div>

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
                {isSaving ? 'Saving…' : 'Assign role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

