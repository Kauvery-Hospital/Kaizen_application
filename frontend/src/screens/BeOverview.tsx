import React, { useCallback, useEffect, useState } from 'react';
import { Status, Suggestion } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';

const BE_PAGE_SIZE = 50;

type EmployeeRow = {
  key: string;
  name: string;
  /** When true, `employee-ideas` must filter by `assignedImplementerCode`, not name. */
  matchedByCode?: boolean;
  department?: string;
  unit?: string;
  submittedCount: number;
  implementedCount: number;
};

function norm(v?: string | null): string {
  return String(v ?? '').trim();
}

function statusPill(status: Status): string {
  if (status === Status.IDEA_SUBMITTED) return 'bg-slate-50 text-slate-800 border-slate-200';
  if (status === Status.IDEA_REJECTED) return 'bg-rose-50 text-rose-900 border-rose-200';
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

type BeReportSummary = {
  total: number;
  pre: number;
  post: number;
  rewarded: number;
  inProgressKaizen: number;
  units: string[];
  departments: string[];
};

export const BeOverview: React.FC<{
  apiBase: string;
  accessToken: string;
  onOpenIdea?: (s: Suggestion) => void;
}> = ({ apiBase, accessToken, onOpenIdea }) => {
  const [landscapeTab, setLandscapeTab] = useState<'org' | 'employees'>('org');
  const [orgSearch, setOrgSearch] = useState('');
  const [debouncedOrgSearch, setDebouncedOrgSearch] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState<'all' | 'submitter' | 'implementer'>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [activeEmployee, setActiveEmployee] = useState<EmployeeRow | null>(null);
  const [mode, setMode] = useState<'employees' | 'ideas' | 'idea'>('employees');
  const [ideaMode, setIdeaMode] = useState<'submitted' | 'implemented'>('submitted');
  const [ideaDetail, setIdeaDetail] = useState<Suggestion | null>(null);

  const [orgSummary, setOrgSummary] = useState<BeReportSummary | null>(null);
  const [preRows, setPreRows] = useState<Suggestion[]>([]);
  const [preTotal, setPreTotal] = useState(0);
  const [postRows, setPostRows] = useState<Suggestion[]>([]);
  const [postTotal, setPostTotal] = useState(0);
  const [preSkip, setPreSkip] = useState(0);
  const [postSkip, setPostSkip] = useState(0);

  const [employeeRows, setEmployeeRows] = useState<EmployeeRow[]>([]);
  const [employeesTotal, setEmployeesTotal] = useState(0);
  const [employeesSkip, setEmployeesSkip] = useState(0);

  const [employeeIdeas, setEmployeeIdeas] = useState<Suggestion[]>([]);
  const [employeeIdeasTotal, setEmployeeIdeasTotal] = useState(0);
  const [employeeIdeasSkip, setEmployeeIdeasSkip] = useState(0);

  const [reportError, setReportError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [orgTablesLoading, setOrgTablesLoading] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeIdeasLoading, setEmployeeIdeasLoading] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedOrgSearch(orgSearch.trim()), 350);
    return () => window.clearTimeout(t);
  }, [orgSearch]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPreSkip(0);
    setPostSkip(0);
  }, [debouncedOrgSearch]);

  useEffect(() => {
    setEmployeesSkip(0);
  }, [debouncedQ, employeeFilter, unitFilter, deptFilter]);

  useEffect(() => {
    if (landscapeTab !== 'org') return;
    setMode('employees');
    setActiveEmployee(null);
    setIdeaDetail(null);
  }, [landscapeTab]);

  const authHeaders = useCallback(() => {
    return { Authorization: `Bearer ${accessToken}` } as Record<string, string>;
  }, [accessToken]);

  const beFetch = useCallback(
    async <T,>(path: string): Promise<T> => {
      const res = await fetch(`${apiBase}${path}`, { headers: authHeaders() });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      return res.json() as Promise<T>;
    },
    [apiBase, authHeaders],
  );

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setSummaryLoading(true);
    setReportError(null);
    beFetch<BeReportSummary>(
      `/suggestions/be-report?view=summary`,
    )
      .then((s) => {
        if (!cancelled) setOrgSummary(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReportError(err instanceof Error ? err.message : 'Failed to load report');
          setOrgSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, beFetch]);

  useEffect(() => {
    if (!accessToken || landscapeTab !== 'org') return;
    let cancelled = false;
    setOrgTablesLoading(true);
    setReportError(null);
    const qEnc = encodeURIComponent(debouncedOrgSearch);
    const qParam = debouncedOrgSearch ? `&q=${qEnc}` : '';
    Promise.all([
      beFetch<{ items: Suggestion[]; total: number }>(
        `/suggestions/be-report?view=pre&skip=${preSkip}&take=${BE_PAGE_SIZE}${qParam}`,
      ),
      beFetch<{ items: Suggestion[]; total: number }>(
        `/suggestions/be-report?view=post&skip=${postSkip}&take=${BE_PAGE_SIZE}${qParam}`,
      ),
    ])
      .then(([pre, post]) => {
        if (!cancelled) {
          setPreRows(Array.isArray(pre.items) ? pre.items : []);
          setPreTotal(typeof pre.total === 'number' ? pre.total : 0);
          setPostRows(Array.isArray(post.items) ? post.items : []);
          setPostTotal(typeof post.total === 'number' ? post.total : 0);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReportError(err instanceof Error ? err.message : 'Failed to load registers');
          setPreRows([]);
          setPostRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setOrgTablesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, beFetch, debouncedOrgSearch, landscapeTab, postSkip, preSkip]);

  useEffect(() => {
    if (!accessToken || landscapeTab !== 'employees' || mode !== 'employees') return;
    let cancelled = false;
    setEmployeesLoading(true);
    setReportError(null);
    const params = new URLSearchParams({
      view: 'employees',
      skip: String(employeesSkip),
      take: String(BE_PAGE_SIZE),
      employeeFilter,
    });
    if (debouncedQ) params.set('q', debouncedQ);
    if (unitFilter !== 'all') params.set('unit', unitFilter);
    if (deptFilter !== 'all') params.set('department', deptFilter);
    beFetch<{ items: EmployeeRow[]; total: number }>(`/suggestions/be-report?${params.toString()}`)
      .then((r) => {
        if (!cancelled) {
          setEmployeeRows(Array.isArray(r.items) ? r.items : []);
          setEmployeesTotal(typeof r.total === 'number' ? r.total : 0);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReportError(err instanceof Error ? err.message : 'Failed to load directory');
          setEmployeeRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setEmployeesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    beFetch,
    debouncedQ,
    deptFilter,
    employeeFilter,
    employeesSkip,
    landscapeTab,
    mode,
    unitFilter,
  ]);

  useEffect(() => {
    if (!accessToken || landscapeTab !== 'employees' || mode !== 'ideas' || !activeEmployee) return;
    let cancelled = false;
    setEmployeeIdeasLoading(true);
    setReportError(null);
    const params = new URLSearchParams({
      view: 'employee-ideas',
      employeeKey: activeEmployee.key,
      ideaMode,
      skip: String(employeeIdeasSkip),
      take: String(BE_PAGE_SIZE),
    });
    if (activeEmployee.matchedByCode && ideaMode === 'implemented') {
      params.set('employeeByCode', 'true');
    }
    beFetch<{ items: Suggestion[]; total: number }>(`/suggestions/be-report?${params.toString()}`)
      .then((r) => {
        if (!cancelled) {
          setEmployeeIdeas(Array.isArray(r.items) ? r.items : []);
          setEmployeeIdeasTotal(typeof r.total === 'number' ? r.total : 0);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReportError(err instanceof Error ? err.message : 'Failed to load ideas');
          setEmployeeIdeas([]);
        }
      })
      .finally(() => {
        if (!cancelled) setEmployeeIdeasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeEmployee, beFetch, employeeIdeasSkip, ideaMode, landscapeTab, mode]);

  const unitOptions = orgSummary?.units ?? [];
  const departmentOptions = orgSummary?.departments ?? [];

  const reportTableRow = (s: Suggestion, idx: number, zebra: 'slate' | 'amber') => (
    <tr
      key={s.id}
      className={`align-top border-b border-gray-100 transition-colors hover:bg-purple-50/50 ${
        idx % 2 === 0
          ? 'bg-white'
          : zebra === 'amber'
            ? 'bg-amber-50/25'
            : 'bg-slate-50/50'
      }`}
    >
      <td className="px-4 py-3.5 align-middle font-mono text-xs font-bold text-gray-900">{s.code || '—'}</td>
      <td className="px-4 py-3.5 align-middle font-mono text-xs font-bold text-gray-800">
        {s.implementedKaizen?.implementedCode || '—'}
      </td>
      <td className="px-4 py-3.5 min-w-[160px] max-w-[280px]">
        <div className="font-extrabold text-gray-900 text-sm leading-snug line-clamp-2">{s.theme}</div>
      </td>
      <td className="px-4 py-3.5 text-sm text-gray-800 font-semibold whitespace-nowrap">{norm(s.unit) || '—'}</td>
      <td className="px-4 py-3.5 text-sm text-gray-800 font-semibold max-w-[140px] truncate" title={norm(s.employeeName)}>
        {norm(s.employeeName) || '—'}
      </td>
      <td className="px-4 py-3.5 text-sm text-gray-800 font-semibold max-w-[140px] truncate" title={norm(s.assignedImplementer)}>
        {norm(s.assignedImplementer) || '—'}
      </td>
      <td className="px-4 py-3.5 align-middle">
        <span
          className={`inline-flex max-w-[11rem] px-2 py-1 rounded-lg border text-[10px] font-black leading-tight ${statusPill(s.status)}`}
        >
          {s.status}
        </span>
      </td>
      <td className="px-4 py-3.5 text-sm text-gray-600 font-semibold whitespace-nowrap">{norm(s.dateSubmitted) || '—'}</td>
      <td className="px-4 py-3.5 text-right whitespace-nowrap align-middle">
        {onOpenIdea && (
          <button
            type="button"
            onClick={() => onOpenIdea(s)}
            className="inline-flex items-center gap-1 rounded-lg bg-kauvery-purple px-3 py-1.5 text-xs font-black text-white shadow-sm hover:opacity-95"
          >
            Open
            <span className="material-icons-round text-[14px]">chevron_right</span>
          </button>
        )}
      </td>
    </tr>
  );

  const thCls = 'px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-gray-600 bg-gray-100/90 border-b border-gray-200';

  const pager = (
    label: string,
    skip: number,
    total: number,
    onSkip: (n: number) => void,
    busy: boolean,
  ) => {
    if (total <= 0 && skip <= 0) return null;
    const from = total === 0 ? 0 : skip + 1;
    const to = Math.min(skip + BE_PAGE_SIZE, total);
    const canPrev = skip > 0 && !busy;
    const canNext = skip + BE_PAGE_SIZE < total && !busy;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-2.5 text-xs text-gray-600">
        <span className="font-medium tabular-nums">
          {label}: {from}
          {total > 0 ? `–${to}` : ''} of {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => onSkip(Math.max(0, skip - BE_PAGE_SIZE))}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 font-semibold text-gray-800 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => onSkip(skip + BE_PAGE_SIZE)}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 font-semibold text-gray-800 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  const showOrgBlocking = summaryLoading && !orgSummary;

  return (
    <div className="w-full max-w-[min(100%,1280px)] mx-auto animate-fade-in space-y-6 pb-10">
      <div className="rounded-2xl border border-purple-200/50 bg-gradient-to-br from-white via-white to-purple-50/30 p-6 sm:p-8 shadow-kauvery-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white/90 p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setLandscapeTab('org')}
                className={`rounded-md px-4 py-2 text-sm font-bold transition-colors ${
                  landscapeTab === 'org'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Summary
              </button>
              <button
                type="button"
                onClick={() => setLandscapeTab('employees')}
                className={`rounded-md px-4 py-2 text-sm font-bold transition-colors ${
                  landscapeTab === 'employees'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Directory
              </button>
            </div>
          </div>

          {landscapeTab === 'employees' && mode !== 'employees' && (
            <button
              type="button"
              onClick={() => {
                setMode('employees');
                setActiveEmployee(null);
                setIdeaDetail(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 font-extrabold text-sm"
            >
              <span className="material-icons-round text-base">arrow_back</span>
              Back to employees
            </button>
          )}
        </div>
      </div>

      {reportError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 flex items-start gap-2">
          <span className="material-icons-round text-red-600 shrink-0 text-lg">error_outline</span>
          <span>{reportError}</span>
        </div>
      )}

      {landscapeTab === 'org' && (
        <div className="space-y-8">
          {showOrgBlocking && (
            <div className="flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-6 py-10 text-sm font-medium text-gray-600">
              <div
                className="h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700"
                aria-hidden
              />
              Loading report…
            </div>
          )}
          {!showOrgBlocking && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total ideas</div>
                  <div className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
                    {orgSummary?.total ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pre–implementation</div>
                  <div className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{orgSummary?.pre ?? 0}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Kaizen active</div>
                  <div className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
                    {orgSummary?.inProgressKaizen ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rewarded</div>
                  <div className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{orgSummary?.rewarded ?? 0}</div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="sr-only" htmlFor="be-org-search">
                  Search registers
                </label>
                <div className="relative w-full sm:max-w-md">
                  <span className="material-icons-round pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
                    search
                  </span>
                  <input
                    id="be-org-search"
                    value={orgSearch}
                    onChange={(e) => setOrgSearch(e.target.value)}
                    placeholder="Filter by code, name, unit, theme, status…"
                    className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200"
                  />
                </div>
              </div>

              <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/80 px-4 py-3 sm:px-5">
                  <h2 className="text-base font-semibold text-gray-900">Pre–implementation register</h2>
                  <span className="text-sm tabular-nums text-gray-500">
                    {preTotal} total{orgTablesLoading ? ' · updating…' : ''}
                  </span>
                </header>
                <div className="overflow-x-auto max-h-[min(480px,60vh)] overflow-y-auto">
                  <table className="min-w-[920px] w-full text-sm">
                    <thead className="sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className={thCls} title="Permanent idea reference (KH-year-sequence)">
                          Idea code
                        </th>
                        <th className={thCls} title="Populated only after full closure">
                          Closure code
                        </th>
                        <th className={thCls}>Theme</th>
                        <th className={thCls}>Unit</th>
                        <th className={thCls}>Originator</th>
                        <th className={thCls}>Implementer</th>
                        <th className={thCls}>Workflow status</th>
                        <th className={thCls}>Idea date</th>
                        <th className={`${thCls} text-right`}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preRows.map((s, i) => reportTableRow(s, i, 'slate'))}
                      {!preRows.length && !orgTablesLoading && (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-500">
                            No matching rows.
                          </td>
                        </tr>
                      )}
                      {!preRows.length && orgTablesLoading && (
                        <tr>
                          <td colSpan={9} className="px-6 py-8 text-center text-sm text-gray-500">
                            Loading…
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {pager('Pre–implementation', preSkip, preTotal, setPreSkip, orgTablesLoading)}
              </section>

              <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/80 px-4 py-3 sm:px-5">
                  <h2 className="text-base font-semibold text-gray-900">Post–implementation register</h2>
                  <span className="text-sm tabular-nums text-gray-500">
                    {postTotal} total{orgTablesLoading ? ' · updating…' : ''}
                  </span>
                </header>
                <div className="overflow-x-auto max-h-[min(480px,60vh)] overflow-y-auto">
                  <table className="min-w-[920px] w-full text-sm">
                    <thead className="sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className={thCls} title="Permanent idea reference">
                          Idea code
                        </th>
                        <th className={thCls} title="Kaizen closure series when closed">
                          Closure code
                        </th>
                        <th className={thCls}>Theme</th>
                        <th className={thCls}>Unit</th>
                        <th className={thCls}>Originator</th>
                        <th className={thCls}>Implementer</th>
                        <th className={thCls}>Workflow status</th>
                        <th className={thCls}>Idea date</th>
                        <th className={`${thCls} text-right`}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {postRows.map((s, i) => reportTableRow(s, i, 'amber'))}
                      {!postRows.length && !orgTablesLoading && (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-500">
                            No matching rows.
                          </td>
                        </tr>
                      )}
                      {!postRows.length && orgTablesLoading && (
                        <tr>
                          <td colSpan={9} className="px-6 py-8 text-center text-sm text-gray-500">
                            Loading…
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {pager('Post–implementation', postSkip, postTotal, setPostSkip, orgTablesLoading)}
              </section>
            </>
          )}
        </div>
      )}

      {landscapeTab === 'employees' && mode === 'employees' && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold text-gray-900">Employee directory</h2>
          </div>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-extrabold text-gray-900">
              Directory <span className="text-gray-500 font-black">({employeesTotal})</span>
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
                <SearchableSelect
                  aria-label="Filter by unit"
                  value={unitFilter}
                  onChange={setUnitFilter}
                  options={[{ value: 'all', label: 'All units' }, ...unitOptions.map((u) => ({ value: u, label: u }))]}
                  placeholder="Search units…"
                  inputClassName="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
                />
              </div>

              <div className="w-56">
                <SearchableSelect
                  aria-label="Filter by department"
                  value={deptFilter}
                  onChange={setDeptFilter}
                  options={[
                    { value: 'all', label: 'All departments' },
                    ...departmentOptions.map((d) => ({ value: d, label: d })),
                  ]}
                  placeholder="Search departments…"
                  inputClassName="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
                />
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
                {employeeRows.map((e) => (
                  <tr key={e.key} className="hover:bg-gray-50/60">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-gray-900">{e.name}</div>
                      {e.matchedByCode ? (
                        <div className="mt-0.5 text-[11px] text-gray-500">
                          Code: <span className="font-mono font-semibold text-gray-700">{e.key}</span>
                        </div>
                      ) : null}
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
                        onClick={() => {
                          setActiveEmployee(e);
                          setEmployeeIdeasSkip(0);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 font-extrabold text-xs"
                      >
                        <span className="material-icons-round text-base text-gray-500">open_in_new</span>
                        View
                      </button>
                    </td>
                  </tr>
                ))}

                {!employeeRows.length && !employeesLoading && (
                  <tr>
                    <td className="px-5 py-12 text-center text-gray-600 font-semibold" colSpan={5}>
                      No employees found.
                    </td>
                  </tr>
                )}
                {!employeeRows.length && employeesLoading && (
                  <tr>
                    <td className="px-5 py-12 text-center text-gray-600 font-semibold" colSpan={5}>
                      Loading…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pager('Directory', employeesSkip, employeesTotal, setEmployeesSkip, employeesLoading)}
        </div>
      )}

      {/* Employee modal */}
      {landscapeTab === 'employees' && activeEmployee && mode === 'employees' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActiveEmployee(null)} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900">{activeEmployee.name}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {activeEmployee.department || '—'} · {activeEmployee.unit || '—'}
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
                  setEmployeeIdeasSkip(0);
                  setIdeaMode('submitted');
                  setMode('ideas');
                  setIdeaDetail(null);
                }}
                className="text-left rounded-2xl border border-gray-200 bg-white hover:shadow-md transition-shadow p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black text-gray-900">Ideas submitted</div>
                  <span className="material-icons-round text-kauvery-purple">lightbulb</span>
                </div>
                <div className="mt-2 text-3xl font-black text-gray-900">{activeEmployee.submittedCount}</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEmployeeIdeasSkip(0);
                  setIdeaMode('implemented');
                  setMode('ideas');
                  setIdeaDetail(null);
                }}
                className="text-left rounded-2xl border border-gray-200 bg-white hover:shadow-md transition-shadow p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black text-gray-900">Ideas implemented</div>
                  <span className="material-icons-round text-emerald-700">construction</span>
                </div>
                <div className="mt-2 text-3xl font-black text-gray-900">{activeEmployee.implementedCount}</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ideas list */}
      {landscapeTab === 'employees' && mode === 'ideas' && activeEmployee && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs font-black text-gray-500 uppercase tracking-wide">
                {ideaMode === 'submitted' ? 'Submitted ideas' : 'Implemented ideas'}
              </div>
              <div className="text-xl font-black text-gray-900 mt-0.5">{activeEmployee.name}</div>
              <div className="text-xs text-gray-600 font-semibold mt-1">
                {employeeIdeasTotal} ideas
                {employeeIdeasLoading ? ' · loading…' : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIdeaDetail(null);
                setMode('employees');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 font-extrabold text-sm"
            >
              <span className="material-icons-round text-base">arrow_back</span>
              Back
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {employeeIdeas.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setIdeaDetail(s);
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

            {!employeeIdeas.length && !employeeIdeasLoading && (
              <div className="px-6 py-14 text-center text-sm text-gray-600 font-semibold">
                No ideas found for this employee.
              </div>
            )}
            {!employeeIdeas.length && employeeIdeasLoading && (
              <div className="px-6 py-14 text-center text-sm text-gray-600 font-semibold">Loading…</div>
            )}
          </div>
          {pager('Ideas', employeeIdeasSkip, employeeIdeasTotal, setEmployeeIdeasSkip, employeeIdeasLoading)}
        </div>
      )}

      {/* Idea detail */}
      {landscapeTab === 'employees' && mode === 'idea' && activeEmployee && ideaDetail && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs font-black text-gray-500 uppercase tracking-wide">
                  {ideaDetail.code || ideaDetail.id}
                </div>
                <div className="text-xl font-black text-gray-900 mt-0.5">{ideaDetail.theme}</div>
                <div className="text-xs text-gray-600 font-semibold mt-1">
                  {ideaDetail.status} • {norm(ideaDetail.department)} • {norm(ideaDetail.unit)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIdeaDetail(null);
                    setMode('ideas');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 font-extrabold text-sm"
                >
                  <span className="material-icons-round text-base">arrow_back</span>
                  Back
                </button>
                {onOpenIdea && (
                  <button
                    type="button"
                    onClick={() => onOpenIdea(ideaDetail)}
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
                  {norm(ideaDetail.description) || '—'}
                </div>
                {ideaDetail.implementedKaizen?.implementedCode && (
                  <div className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-black">
                    <span className="material-icons-round text-base">verified</span>
                    Implemented series: {ideaDetail.implementedKaizen.implementedCode}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-xs font-black text-gray-500 uppercase tracking-wide">People</div>
                <div className="mt-2 text-sm font-extrabold text-gray-900">
                  Originator: <span className="font-black">{norm(ideaDetail.employeeName) || '—'}</span>
                </div>
                <div className="mt-1 text-sm font-extrabold text-gray-900">
                  Implementer: <span className="font-black">{norm(ideaDetail.assignedImplementer) || '—'}</span>
                </div>
                <div className="mt-4 text-xs font-black text-gray-500 uppercase tracking-wide">Progress</div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-700 font-bold">
                  <span>{norm(ideaDetail.implementationStage) || '—'}</span>
                  <span>{ideaDetail.implementationProgress || 0}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-kauvery-purple"
                    style={{ width: `${ideaDetail.implementationProgress || 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Idea attachments */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200">
                <div className="text-sm font-semibold text-gray-900">Originator attachments</div>
              </div>
              <div className="p-6">
                {ideaDetail.ideaAttachmentPaths && ideaDetail.ideaAttachmentPaths.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ideaDetail.ideaAttachmentPaths.map((rel) => {
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
                <div className="text-sm font-semibold text-gray-900">Implementer attachments</div>
              </div>
              <div className="p-6">
                {ideaDetail.templateAttachmentPaths && ideaDetail.templateAttachmentPaths.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ideaDetail.templateAttachmentPaths.map((rel) => {
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

