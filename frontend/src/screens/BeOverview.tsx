import React, { useMemo, useState } from 'react';
import { Role, Status, Suggestion } from '../types';

type EmployeeRow = {
  key: string; // stable key
  name: string;
  department?: string;
  unit?: string;
  submittedCount: number;
  implementedCount: number;
};

function norm(v?: string | null): string {
  return String(v ?? '').trim();
}

function lc(v?: string | null): string {
  return norm(v).toLowerCase();
}

function statusPill(status: Status): string {
  if (status === Status.IDEA_SUBMITTED) return 'bg-slate-50 text-slate-800 border-slate-200';
  if (status === Status.APPROVED_FOR_ASSIGNMENT) return 'bg-blue-50 text-blue-800 border-blue-200';
  if (status === Status.ASSIGNED_FOR_IMPLEMENTATION) return 'bg-indigo-50 text-indigo-800 border-indigo-200';
  if (status === Status.IMPLEMENTATION_DONE) return 'bg-amber-50 text-amber-900 border-amber-200';
  if (status === Status.BE_REVIEW_DONE) return 'bg-purple-50 text-purple-800 border-purple-200';
  if (status === Status.VERIFIED_PENDING_APPROVAL) return 'bg-sky-50 text-sky-900 border-sky-200';
  if (status === Status.BE_EVALUATION_PENDING) return 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200';
  if (status === Status.REWARD_PENDING) return 'bg-orange-50 text-orange-900 border-orange-200';
  if (status === Status.REWARDED) return 'bg-emerald-50 text-emerald-900 border-emerald-200';
  return 'bg-gray-50 text-gray-800 border-gray-200';
}

function isImagePath(p: string): boolean {
  const s = p.toLowerCase();
  return s.endsWith('.png') || s.endsWith('.jpg') || s.endsWith('.jpeg') || s.endsWith('.gif') || s.endsWith('.webp');
}

function fileLabel(relPath: string): string {
  const p = relPath.replace(/\\/g, '/');
  const parts = p.split('/');
  return parts[parts.length - 1] || p;
}

export const BeOverview: React.FC<{
  suggestions: Suggestion[];
  apiBase: string;
  accessToken: string;
  onOpenIdea?: (s: Suggestion) => void;
}> = ({ suggestions, apiBase, accessToken, onOpenIdea }) => {
  const [q, setQ] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState<'all' | 'submitter' | 'implementer'>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [activeEmployee, setActiveEmployee] = useState<EmployeeRow | null>(null);
  const [mode, setMode] = useState<'employees' | 'ideas' | 'idea'>('employees');
  const [ideaMode, setIdeaMode] = useState<'submitted' | 'implemented'>('submitted');
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);

  const employees = useMemo(() => {
    const submittedBy = new Map<string, Suggestion[]>();
    const implementedBy = new Map<string, Suggestion[]>();

    for (const s of suggestions) {
      const submitKey = lc(s.employeeName) || 'unknown';
      if (!submittedBy.has(submitKey)) submittedBy.set(submitKey, []);
      submittedBy.get(submitKey)!.push(s);

      const implName = lc(s.assignedImplementer);
      if (implName) {
        if (!implementedBy.has(implName)) implementedBy.set(implName, []);
        implementedBy.get(implName)!.push(s);
      }
    }

    const keys =
      employeeFilter === 'submitter'
        ? new Set<string>([...submittedBy.keys()])
        : employeeFilter === 'implementer'
          ? new Set<string>([...implementedBy.keys()])
          : new Set<string>([...submittedBy.keys(), ...implementedBy.keys()]);
    const rows: EmployeeRow[] = [];

    for (const key of keys) {
      const submitted = submittedBy.get(key) || [];
      const implemented = implementedBy.get(key) || [];
      const best = submitted[0] || implemented[0];
      const name =
        norm(best?.employeeName) ||
        norm(best?.assignedImplementer) ||
        (key === 'unknown' ? 'Unknown employee' : key);
      rows.push({
        key,
        name,
        department: norm(best?.department) || undefined,
        unit: norm(best?.unit) || undefined,
        submittedCount: submitted.length,
        implementedCount: implemented.length,
      });
    }

    rows.sort((a, b) => (b.submittedCount + b.implementedCount) - (a.submittedCount + a.implementedCount));
    return rows;
  }, [employeeFilter, suggestions]);

  const unitOptions = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      const u = norm(e.unit);
      if (u) set.add(u);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      const d = norm(e.department);
      if (d) set.add(d);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const query = q.trim().toLowerCase();
    const u = unitFilter.trim().toLowerCase();
    const d = deptFilter.trim().toLowerCase();
    const base = employees.filter((e) => {
      if (unitFilter !== 'all' && lc(e.unit) !== u) return false;
      if (deptFilter !== 'all' && lc(e.department) !== d) return false;
      return true;
    });
    if (!query) return base;
    return base.filter((e) => {
      const hay = `${e.name} ${e.department || ''} ${e.unit || ''}`.toLowerCase();
      return hay.includes(query);
    });
  }, [deptFilter, employees, q, unitFilter]);

  const ideasForActive = useMemo(() => {
    if (!activeEmployee) return [];
    const key = activeEmployee.key;
    if (ideaMode === 'submitted') {
      return suggestions
        .filter((s) => lc(s.employeeName) === key)
        .sort((a, b) => (b.code || b.id).localeCompare(a.code || a.id));
    }
    return suggestions
      .filter((s) => lc(s.assignedImplementer) === key)
      .sort((a, b) => (b.code || b.id).localeCompare(a.code || a.id));
  }, [activeEmployee, ideaMode, suggestions]);

  const selectedIdea = useMemo(() => {
    if (!selectedIdeaId) return null;
    return suggestions.find((s) => s.id === selectedIdeaId) || null;
  }, [selectedIdeaId, suggestions]);

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${accessToken}`,
    }),
    [accessToken],
  );

  return (
    <div className="max-w-6xl mx-auto animate-fade-in space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wide text-kauvery-purple font-extrabold">
              Business Excellence
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">Ideas overview</h1>
            <p className="text-sm text-gray-600 font-semibold mt-1">
              Browse employees and review submitted and implemented ideas with supporting documents.
            </p>
          </div>

          {mode !== 'employees' && (
            <button
              type="button"
              onClick={() => {
                setMode('employees');
                setActiveEmployee(null);
                setSelectedIdeaId(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 font-extrabold text-sm"
            >
              <span className="material-icons-round text-base">arrow_back</span>
              Back to employees
            </button>
          )}
        </div>
      </div>

      {mode === 'employees' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-extrabold text-gray-900">
              Employees <span className="text-gray-500 font-black">({filteredEmployees.length})</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-xl border border-gray-300 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setEmployeeFilter('all')}
                  className={`px-3 py-2 text-xs font-extrabold ${
                    employeeFilter === 'all' ? 'bg-kauvery-purple text-white' : 'text-gray-900 hover:bg-gray-50'
                  }`}
                  title="Show all employees"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setEmployeeFilter('submitter')}
                  className={`px-3 py-2 text-xs font-extrabold border-l border-gray-200 ${
                    employeeFilter === 'submitter'
                      ? 'bg-kauvery-purple text-white'
                      : 'text-gray-900 hover:bg-gray-50'
                  }`}
                  title="Show only idea submitters"
                >
                  Submitter
                </button>
                <button
                  type="button"
                  onClick={() => setEmployeeFilter('implementer')}
                  className={`px-3 py-2 text-xs font-extrabold border-l border-gray-200 ${
                    employeeFilter === 'implementer'
                      ? 'bg-kauvery-purple text-white'
                      : 'text-gray-900 hover:bg-gray-50'
                  }`}
                  title="Show only implementers"
                >
                  Implementer
                </button>
              </div>

              <div className="w-44">
                <select
                  value={unitFilter}
                  onChange={(e) => setUnitFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
                  aria-label="Filter by unit"
                >
                  <option value="all">All units</option>
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-56">
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
                  aria-label="Filter by department"
                >
                  <option value="all">All departments</option>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
                  search
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search employee, department, unit…"
                  className="w-[360px] max-w-[90vw] pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
                />
              </div>

              {(unitFilter !== 'all' || deptFilter !== 'all' || q.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setUnitFilter('all');
                    setDeptFilter('all');
                    setQ('');
                  }}
                  className="px-3 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 font-extrabold text-xs"
                  title="Clear filters"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-600 font-black">
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Unit / Department</th>
                  <th className="px-5 py-3">Submitted</th>
                  <th className="px-5 py-3">Implemented</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEmployees.map((e) => (
                  <tr key={e.key} className="hover:bg-gray-50/60">
                    <td className="px-5 py-4">
                      <div className="font-extrabold text-gray-900">{e.name}</div>
                      <div className="text-xs text-gray-600 font-semibold mt-0.5">
                        Activity: <span className="font-black text-gray-800">{e.submittedCount + e.implementedCount}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-xs text-gray-900 font-bold">{e.unit || '—'}</div>
                      <div className="text-xs text-gray-600 font-semibold">{e.department || '—'}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full border bg-white text-[11px] font-extrabold text-gray-900 border-gray-200">
                        {e.submittedCount}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full border bg-white text-[11px] font-extrabold text-gray-900 border-gray-200">
                        {e.implementedCount}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setActiveEmployee(e)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 font-extrabold text-xs"
                      >
                        <span className="material-icons-round text-base text-gray-500">open_in_new</span>
                        Overview
                      </button>
                    </td>
                  </tr>
                ))}

                {!filteredEmployees.length && (
                  <tr>
                    <td className="px-5 py-12 text-center text-gray-600 font-semibold" colSpan={5}>
                      No employees found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Employee modal */}
      {activeEmployee && mode === 'employees' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActiveEmployee(null)} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between">
              <div>
                <div className="text-xs font-black text-gray-500 uppercase tracking-wide">Employee overview</div>
                <div className="text-xl font-black text-gray-900 mt-0.5">{activeEmployee.name}</div>
                <div className="text-xs text-gray-600 font-semibold mt-1">
                  {activeEmployee.department || '—'} • {activeEmployee.unit || '—'}
                </div>
              </div>
              <button
                onClick={() => setActiveEmployee(null)}
                className="text-gray-500 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100"
                aria-label="Close"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setIdeaMode('submitted');
                  setMode('ideas');
                  setSelectedIdeaId(null);
                }}
                className="text-left rounded-2xl border border-gray-200 bg-white hover:shadow-md transition-shadow p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black text-gray-900">Ideas submitted</div>
                  <span className="material-icons-round text-kauvery-purple">lightbulb</span>
                </div>
                <div className="mt-2 text-3xl font-black text-gray-900">{activeEmployee.submittedCount}</div>
                <div className="mt-1 text-xs text-gray-600 font-semibold">View all submissions by this employee.</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIdeaMode('implemented');
                  setMode('ideas');
                  setSelectedIdeaId(null);
                }}
                className="text-left rounded-2xl border border-gray-200 bg-white hover:shadow-md transition-shadow p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black text-gray-900">Ideas implemented</div>
                  <span className="material-icons-round text-emerald-700">construction</span>
                </div>
                <div className="mt-2 text-3xl font-black text-gray-900">{activeEmployee.implementedCount}</div>
                <div className="mt-1 text-xs text-gray-600 font-semibold">View ideas where this employee is the implementer.</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ideas list */}
      {mode === 'ideas' && activeEmployee && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs font-black text-gray-500 uppercase tracking-wide">
                {ideaMode === 'submitted' ? 'Submitted ideas' : 'Implemented ideas'}
              </div>
              <div className="text-xl font-black text-gray-900 mt-0.5">{activeEmployee.name}</div>
              <div className="text-xs text-gray-600 font-semibold mt-1">
                {ideasForActive.length} ideas
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMode('employees')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 font-extrabold text-sm"
            >
              <span className="material-icons-round text-base">arrow_back</span>
              Back
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {ideasForActive.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedIdeaId(s.id);
                  setMode('idea');
                }}
                className="w-full text-left px-6 py-4 hover:bg-gray-50/60"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-extrabold ${statusPill(s.status)}`}>
                        {s.status}
                      </span>
                      <span className="text-[11px] font-mono text-gray-500">{s.code || s.id}</span>
                      {s.implementedKaizen?.implementedCode && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-900 border-emerald-200 text-[11px] font-black">
                          {s.implementedKaizen.implementedCode}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-extrabold text-gray-900 line-clamp-1">{s.theme}</div>
                    <div className="mt-1 text-xs text-gray-600 font-semibold line-clamp-1">
                      {norm(s.department)} • {norm(s.unit)} • Originator: {norm(s.employeeName)}
                      {norm(s.assignedImplementer) ? ` • Implementer: ${norm(s.assignedImplementer)}` : ''}
                    </div>
                  </div>
                  <span className="material-icons-round text-gray-400 shrink-0">chevron_right</span>
                </div>
              </button>
            ))}

            {ideasForActive.length === 0 && (
              <div className="px-6 py-14 text-center text-sm text-gray-600 font-semibold">
                No ideas found for this employee.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Idea detail */}
      {mode === 'idea' && activeEmployee && selectedIdea && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs font-black text-gray-500 uppercase tracking-wide">
                  {selectedIdea.code || selectedIdea.id}
                </div>
                <div className="text-xl font-black text-gray-900 mt-0.5">{selectedIdea.theme}</div>
                <div className="text-xs text-gray-600 font-semibold mt-1">
                  {selectedIdea.status} • {norm(selectedIdea.department)} • {norm(selectedIdea.unit)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('ideas')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 font-extrabold text-sm"
                >
                  <span className="material-icons-round text-base">arrow_back</span>
                  Back
                </button>
                {onOpenIdea && (
                  <button
                    type="button"
                    onClick={() => onOpenIdea(selectedIdea)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-kauvery-purple to-kauvery-violet text-white font-extrabold text-sm shadow-lg shadow-purple-200 hover:opacity-95"
                  >
                    <span className="material-icons-round text-base">open_in_new</span>
                    Open in workflow
                  </button>
                )}
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-5">
                <div className="text-xs font-black text-gray-500 uppercase tracking-wide">Description</div>
                <div className="mt-2 text-sm text-gray-900 font-semibold whitespace-pre-wrap">
                  {norm(selectedIdea.description) || '—'}
                </div>
                {selectedIdea.implementedKaizen?.implementedCode && (
                  <div className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-black">
                    <span className="material-icons-round text-base">verified</span>
                    Implemented series: {selectedIdea.implementedKaizen.implementedCode}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-xs font-black text-gray-500 uppercase tracking-wide">People</div>
                <div className="mt-2 text-sm font-extrabold text-gray-900">
                  Originator: <span className="font-black">{norm(selectedIdea.employeeName) || '—'}</span>
                </div>
                <div className="mt-1 text-sm font-extrabold text-gray-900">
                  Implementer: <span className="font-black">{norm(selectedIdea.assignedImplementer) || '—'}</span>
                </div>
                <div className="mt-4 text-xs font-black text-gray-500 uppercase tracking-wide">Progress</div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-700 font-bold">
                  <span>{norm(selectedIdea.implementationStage) || '—'}</span>
                  <span>{selectedIdea.implementationProgress || 0}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-kauvery-purple"
                    style={{ width: `${selectedIdea.implementationProgress || 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Idea attachments */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200">
                <div className="text-sm font-black text-gray-900">Originator uploads</div>
                <div className="text-xs text-gray-600 font-semibold mt-1">Images and documents submitted with the idea.</div>
              </div>
              <div className="p-6">
                {selectedIdea.ideaAttachmentPaths && selectedIdea.ideaAttachmentPaths.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedIdea.ideaAttachmentPaths.map((rel) => {
                      const url = `${apiBase}/kaizen-files/${String(rel).replace(/^\/+/, '')}`;
                      const label = fileLabel(String(rel));
                      return (
                        <a
                          key={String(rel)}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="group rounded-xl border border-gray-200 bg-white hover:shadow-md transition-shadow overflow-hidden"
                        >
                          {isImagePath(label) ? (
                            <div className="h-36 bg-gray-50">
                              <img
                                src={url}
                                alt={label}
                                className="h-36 w-full object-cover"
                                crossOrigin="anonymous"
                              />
                            </div>
                          ) : (
                            <div className="h-36 bg-gray-50 flex items-center justify-center">
                              <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center">
                                <span className="material-icons-round text-gray-500">description</span>
                              </div>
                            </div>
                          )}
                          <div className="px-3 py-2">
                            <div className="text-xs font-extrabold text-gray-900 line-clamp-1">{label}</div>
                            <div className="text-[11px] text-gray-600 font-semibold mt-0.5">Open</div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 font-semibold">No originator uploads.</div>
                )}
              </div>
            </div>

            {/* Template attachments */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200">
                <div className="text-sm font-black text-gray-900">Implementer uploads</div>
                <div className="text-xs text-gray-600 font-semibold mt-1">Documents/images submitted with the template.</div>
              </div>
              <div className="p-6">
                {selectedIdea.templateAttachmentPaths && selectedIdea.templateAttachmentPaths.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedIdea.templateAttachmentPaths.map((rel) => {
                      const url = `${apiBase}/kaizen-files/${String(rel).replace(/^\/+/, '')}`;
                      const label = fileLabel(String(rel));
                      return (
                        <a
                          key={String(rel)}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="group rounded-xl border border-gray-200 bg-white hover:shadow-md transition-shadow overflow-hidden"
                        >
                          {isImagePath(label) ? (
                            <div className="h-36 bg-gray-50">
                              <img
                                src={url}
                                alt={label}
                                className="h-36 w-full object-cover"
                                crossOrigin="anonymous"
                              />
                            </div>
                          ) : (
                            <div className="h-36 bg-gray-50 flex items-center justify-center">
                              <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center">
                                <span className="material-icons-round text-gray-500">folder</span>
                              </div>
                            </div>
                          )}
                          <div className="px-3 py-2">
                            <div className="text-xs font-extrabold text-gray-900 line-clamp-1">{label}</div>
                            <div className="text-[11px] text-gray-600 font-semibold mt-0.5">Open</div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 font-semibold">No implementer uploads.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

