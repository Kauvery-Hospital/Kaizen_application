import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Role, Status, type Suggestion } from '../types';

type ReportId =
  | 'overallRegister'
  | 'kpiCounts'
  | 'receivedByUnit'
  | 'receivedByDepartment'
  | 'receivedByServiceCategory'
  | 'acceptedBySelectionCommittee'
  | 'acceptedTop10Group'
  | 'acceptedTop10Unit'
  | 'acceptedByUnit'
  | 'acceptedByDepartment'
  | 'acceptedByServiceCategory'
  | 'notAcceptedBySelectionCommittee'
  | 'notAcceptedByUnit'
  | 'notAcceptedByDepartment'
  | 'notAcceptedByServiceCategory'
  | 'assignmentStatus'
  | 'waitingForAssignment'
  | 'approvalStatus'
  | 'approvalStatusByRole'
  | 'implementationStatus'
  | 'implementationStatusOverallAndUnit'
  | 'implementationStatusByServiceCategory'
  | 'implementationStatusByDepartment';

type ReportItem = {
  id: ReportId;
  /** Short name in the menu */
  title: string;
  /** Section heading in the sidebar */
  section: string;
  /** One line: what this report shows */
  description: string;
  allow?: Role[];
};

const REPORTS: ReportItem[] = [
  {
    id: 'kpiCounts',
    title: 'Key numbers (dashboard)',
    section: 'Start here',
    description: 'Totals: received, accepted, in progress, completed, and more — in one glance.',
  },
  {
    id: 'overallRegister',
    title: 'All ideas (full list)',
    section: 'Start here',
    description: 'Every idea matching your filters, as a detailed table. Use search to find one idea quickly.',
  },
  {
    id: 'receivedByUnit',
    title: 'How many ideas per unit?',
    section: 'Submissions',
    description: 'Count of ideas submitted, grouped by unit.',
  },
  {
    id: 'receivedByDepartment',
    title: 'How many ideas per department?',
    section: 'Submissions',
    description: 'Count of ideas submitted, grouped by department.',
  },
  {
    id: 'receivedByServiceCategory',
    title: 'Clinical vs supportive (submitted)',
    section: 'Submissions',
    description: 'How many ideas were submitted in each category (when set on the idea).',
  },
  {
    id: 'acceptedBySelectionCommittee',
    title: 'Ideas that moved forward',
    section: 'After selection',
    description: 'Ideas accepted by the selection committee — full detail table.',
  },
  {
    id: 'acceptedByUnit',
    title: 'Accepted ideas by unit',
    section: 'After selection',
    description: 'Count of accepted ideas per unit.',
  },
  {
    id: 'acceptedByDepartment',
    title: 'Accepted ideas by department',
    section: 'After selection',
    description: 'Count of accepted ideas per department.',
  },
  {
    id: 'acceptedByServiceCategory',
    title: 'Clinical vs supportive (accepted)',
    section: 'After selection',
    description: 'Accepted ideas split by clinical / supportive.',
  },
  {
    id: 'acceptedTop10Group',
    title: 'Latest 10 accepted (whole org)',
    section: 'Highlights',
    description: 'The 10 most recently accepted ideas, organization-wide. Business Excellence only.',
    allow: [Role.BUSINESS_EXCELLENCE, Role.BUSINESS_EXCELLENCE_HEAD],
  },
  {
    id: 'acceptedTop10Unit',
    title: 'Latest 10 accepted (one unit)',
    section: 'Highlights',
    description: 'Pick a unit in filters to see the 10 most recently accepted ideas for that unit.',
  },
  {
    id: 'notAcceptedBySelectionCommittee',
    title: 'Ideas not taken forward',
    section: 'Not selected',
    description: 'Rejected, withdrawn, or not feasible — as a table.',
  },
  {
    id: 'notAcceptedByUnit',
    title: 'Not selected — by unit',
    section: 'Not selected',
    description: 'Counts of not-accepted ideas per unit.',
  },
  {
    id: 'notAcceptedByDepartment',
    title: 'Not selected — by department',
    section: 'Not selected',
    description: 'Counts of not-accepted ideas per department.',
  },
  {
    id: 'notAcceptedByServiceCategory',
    title: 'Not selected — clinical vs supportive',
    section: 'Not selected',
    description: 'Not-accepted ideas by category.',
  },
  {
    id: 'assignmentStatus',
    title: 'Waiting vs assigned',
    section: 'Assignment',
    description: 'Ideas waiting to be assigned to an implementer, and those already assigned.',
  },
  {
    id: 'waitingForAssignment',
    title: 'Only waiting for assignment',
    section: 'Assignment',
    description: 'Ideas that are approved but not yet assigned — who should implement them.',
  },
  {
    id: 'approvalStatus',
    title: 'Leadership approval summary',
    section: 'Approvals',
    description: 'How many ideas are waiting on HOD / quality / other sign-offs.',
  },
  {
    id: 'approvalStatusByRole',
    title: 'Approvals by role',
    section: 'Approvals',
    description: 'Pending vs completed approvals, broken down by approver type.',
  },
  {
    id: 'implementationStatusOverallAndUnit',
    title: 'Implementation — totals & by unit',
    section: 'Implementation',
    description: 'Overall implemented pipeline count and a breakdown by unit.',
  },
  {
    id: 'implementationStatus',
    title: 'Implementation — detail list',
    section: 'Implementation',
    description: 'Table of ideas in implementation stages (progress, updates).',
  },
  {
    id: 'implementationStatusByDepartment',
    title: 'Implementation — by department',
    section: 'Implementation',
    description: 'Count of ideas in implementation, grouped by department.',
  },
  {
    id: 'implementationStatusByServiceCategory',
    title: 'Implementation — clinical vs supportive',
    section: 'Implementation',
    description: 'Implementation volume by category.',
  },
];

/** Backend field names → plain English */
const KPI_LABELS: Record<string, string> = {
  totalReceived: 'Ideas received',
  accepted: 'Accepted (moving forward)',
  implemented: 'In implementation / done pipeline',
  ongoing: 'Still in progress (after acceptance)',
  pending: 'Waiting at “idea submitted”',
  rewarded: 'Closed / rewarded',
  notFeasibleOrWithdrawn: 'Not feasible or withdrawn',
  totalInApprovalStage: 'Ideas at approval step',
  approvalsComplete: 'Fully approved (all sign-offs done)',
  approvalsPending: 'Waiting on a sign-off',
  overall: 'Total in implementation stages',
  waitingForAssignment: 'Waiting to be assigned',
  assignedForImplementation: 'Already assigned to implementer',
};

type BreakdownRow = {
  key: string;
  count?: number;
  pending?: number;
  approved?: number;
  total?: number;
};

const PAGE_SIZE = 50;

function breakdownLabel(report: ReportId): string {
  if (report === 'approvalStatusByRole') return 'Approver role';
  if (report.includes('Department')) return 'Department';
  if (report.includes('Unit')) return 'Unit';
  if (report.includes('ServiceCategory') || report.includes('Category')) return 'Category';
  return 'Name';
}

function formatMetricValue(v: unknown): string {
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v ?? '—');
}

export const Reports: React.FC<{
  apiBase: string;
  accessToken: string;
  role: Role;
  unitOptions?: { code: string; name?: string }[];
  departmentOptions?: { name: string }[];
}> = ({ apiBase, accessToken, role, unitOptions, departmentOptions }) => {
  const [report, setReport] = useState<ReportId>('kpiCounts');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [unit, setUnit] = useState('all');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');

  const [skip, setSkip] = useState(0);
  const [rows, setRows] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);

  useEffect(() => {
    if (!reportMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [reportMenuOpen]);

  const visibleReports = useMemo(() => {
    return REPORTS.filter((r) => !r.allow || r.allow.includes(role));
  }, [role]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReportItem[]>();
    for (const r of visibleReports) {
      if (!map.has(r.section)) map.set(r.section, []);
      map.get(r.section)!.push(r);
    }
    return [...map.entries()];
  }, [visibleReports]);

  const currentMeta = useMemo(() => REPORTS.find((r) => r.id === report), [report]);

  const authHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    return h;
  }, [accessToken]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set('report', report);
    p.set('skip', String(skip));
    p.set('take', String(PAGE_SIZE));
    if (q.trim()) p.set('q', q.trim());
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (unit && unit !== 'all') p.set('unit', unit);
    if (department && department !== 'all') p.set('department', department);
    if (status && status !== 'all') p.set('status', status);
    if (category && category !== 'all') p.set('category', category);
    return p;
  }, [report, skip, q, from, to, unit, department, status, category]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${apiBase}/reports?${queryParams.toString()}`, {
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setTotal(typeof data?.total === 'number' ? data.total : 0);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load report');
        setRows(null);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, apiBase, authHeaders, queryParams]);

  const download = useCallback(async () => {
    const url = `${apiBase}/reports/export?${queryParams.toString()}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const nameMatch = cd.match(/filename="([^"]+)"/i);
    const filename = nameMatch?.[1] || `report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }, [apiBase, authHeaders, queryParams]);

  const isTable = useMemo(
    () => Array.isArray(rows?.items) && typeof rows?.total === 'number',
    [rows],
  );
  const isBreakdown = useMemo(() => Array.isArray(rows?.items) && !isTable, [rows, isTable]);

  const isImplementationOverall =
    rows &&
    typeof rows.overall === 'number' &&
    Array.isArray(rows.byUnit);

  const statusOptions = useMemo(() => ['all', ...Object.values(Status)], []);
  const unitOpts = useMemo(() => {
    const codes = (unitOptions ?? []).map((u) => u.code).filter(Boolean);
    return ['all', ...Array.from(new Set(codes)).sort()];
  }, [unitOptions]);
  const deptOpts = useMemo(() => {
    const names = (departmentOptions ?? []).map((d) => d.name).filter(Boolean);
    return ['all', ...Array.from(new Set(names)).sort()];
  }, [departmentOptions]);

  /** Scalar KPI fields only (skip nested arrays/objects shown elsewhere) */
  const kpiScalars = useMemo(() => {
    if (!rows || typeof rows !== 'object') return [];
    const out: { key: string; label: string; value: string }[] = [];
    for (const [k, v] of Object.entries(rows as Record<string, unknown>)) {
      if (k === 'items' || k === 'byUnit') continue;
      if (v === null || v === undefined) continue;
      if (typeof v === 'object') continue;
      out.push({
        key: k,
        label: KPI_LABELS[k] || humanizeKey(k),
        value: formatMetricValue(v),
      });
    }
    return out;
  }, [rows]);

  const reportList = (
    <>
      {grouped.map(([section, items]) => (
        <div key={section}>
          <div className="text-[11px] font-black text-kauvery-purple uppercase tracking-wider px-2 mb-2">
            {section}
          </div>
          <div className="space-y-1.5">
            {items.map((it) => {
              const active = report === it.id;
              return (
                <button
                  type="button"
                  key={it.id}
                  onClick={() => {
                    setReport(it.id);
                    setSkip(0);
                    setReportMenuOpen(false);
                  }}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all ${
                    active
                      ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-200'
                      : 'border-transparent hover:border-purple-200 hover:bg-gray-50'
                  }`}
                >
                  <div
                    className={`text-sm font-extrabold leading-tight ${
                      active ? 'text-kauvery-purple' : 'text-gray-900'
                    }`}
                  >
                    {it.title}
                  </div>
                  <div className="text-[11px] text-gray-600 font-semibold mt-1 leading-snug">
                    {it.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <div className="animate-fade-in w-full max-w-[100vw] mx-auto flex flex-col min-h-[calc(100vh-5rem)] px-2 sm:px-4 pb-6">
      {/* Top bar: report types + title + download */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 shrink-0">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setReportMenuOpen(true)}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-kauvery-purple/35 bg-white text-kauvery-purple font-black text-sm shadow-sm hover:bg-purple-50 hover:border-kauvery-purple/60 transition-colors"
            aria-expanded={reportMenuOpen}
            aria-controls="report-types-panel"
          >
            <span className="material-icons-round text-[22px]" aria-hidden>
              menu_book
            </span>
            Report types
          </button>
          <div className="min-w-0 pt-0.5">
            <div className="text-xs uppercase tracking-wide text-kauvery-purple font-extrabold">
              Kaizen reports
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 mt-0.5 leading-tight">
              {role === Role.UNIT_COORDINATOR
                ? 'Reports for your unit(s)'
                : 'Reports for the whole organization'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 font-semibold mt-1 max-w-3xl">
              Open <span className="font-black text-gray-800">Report types</span> to switch views. Use
              filters when you need to narrow dates or units. Tables use the full width below.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            download().catch((e) => setError(e instanceof Error ? e.message : 'Download failed'))
          }
          className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-kauvery-purple to-kauvery-violet text-white font-black text-sm shadow-md shadow-purple-200/60 hover:opacity-95 transition-opacity"
        >
          <span className="material-icons-round text-[20px]">download</span>
          Download Excel
        </button>
      </div>

      {/* Slide-over: report types */}
      {reportMenuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[100] bg-slate-900/45 backdrop-blur-[2px] cursor-default border-0 p-0 m-0 w-full h-full"
            aria-label="Close report menu"
            onClick={() => setReportMenuOpen(false)}
          />
          <div
            id="report-types-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-types-heading"
            className="fixed inset-y-0 left-0 z-[110] flex w-full max-w-md flex-col bg-white shadow-2xl ring-1 ring-black/5"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gradient-to-r from-purple-50/90 to-white px-4 py-4 shrink-0">
              <div>
                <div id="report-types-heading" className="text-lg font-black text-gray-900">
                  Report types
                </div>
                <div className="text-xs text-gray-600 font-semibold mt-0.5">
                  Tap a report — the panel closes automatically.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReportMenuOpen(false)}
                className="shrink-0 rounded-xl p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                aria-label="Close"
              >
                <span className="material-icons-round text-[26px]">close</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 space-y-5">
              {reportList}
            </div>
          </div>
        </>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {/* Filters — collapsed by default so the table gets maximum space */}
        <details className="group shrink-0 rounded-2xl border border-gray-200 bg-white shadow-sm open:shadow-kauvery-card [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-black text-gray-900 hover:bg-gray-50/80 rounded-2xl">
            <span className="inline-flex items-center gap-2">
              <span className="material-icons-round text-kauvery-purple text-[22px]">tune</span>
              Filters <span className="text-gray-500 font-semibold">(optional)</span>
            </span>
            <span className="material-icons-round text-gray-400 transition-transform group-open:rotate-180">
              expand_more
            </span>
          </summary>
          <div className="border-t border-gray-100 px-4 pb-4 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <label className="block">
                <span className="text-xs font-extrabold text-gray-700">Search</span>
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setSkip(0);
                  }}
                  placeholder="Code, title, employee name…"
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 font-semibold text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold text-gray-700">From date</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setSkip(0);
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 font-semibold text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold text-gray-700">To date</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setSkip(0);
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 font-semibold text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold text-gray-700">Unit</span>
                <select
                  value={unit}
                  onChange={(e) => {
                    setUnit(e.target.value);
                    setSkip(0);
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 font-semibold text-sm bg-white"
                >
                  {unitOpts.map((u) => (
                    <option key={u} value={u}>
                      {u === 'all' ? 'All units' : u}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-extrabold text-gray-700">Department</span>
                <select
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    setSkip(0);
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 font-semibold text-sm bg-white"
                >
                  {deptOpts.map((d) => (
                    <option key={d} value={d}>
                      {d === 'all' ? 'All departments' : d}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 items-end">
              <label className="block">
                <span className="text-xs font-extrabold text-gray-700">Idea status</span>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setSkip(0);
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 font-semibold text-sm bg-white"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s === 'all' ? 'Any status' : s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-extrabold text-gray-700">Clinical / Supportive</span>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setSkip(0);
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 font-semibold text-sm bg-white"
                >
                  {['all', 'Clinical', 'Supportive'].map((c) => (
                    <option key={c} value={c}>
                      {c === 'all' ? 'Both / not set' : c}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2 flex flex-wrap gap-2 justify-start sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setQ('');
                    setFrom('');
                    setTo('');
                    setUnit('all');
                    setDepartment('all');
                    setStatus('all');
                    setCategory('all');
                    setSkip(0);
                  }}
                  className="px-4 py-2 rounded-xl border border-gray-300 bg-white font-black text-sm text-gray-800 hover:bg-gray-50"
                >
                  Clear filters
                </button>
                <span className="text-xs text-gray-500 font-semibold self-center">
                  {loading ? 'Updating…' : '\u00a0'}
                </span>
              </div>
            </div>
          </div>
        </details>

        {error && (
          <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {/* Results — flex-1 fills remaining height; body scrolls inside */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-kauvery-card">
            <div className="shrink-0 border-b border-gray-100 bg-gradient-to-r from-white via-white to-purple-50/60 px-4 py-3 sm:py-4">
              <div className="text-lg font-black text-gray-900">{currentMeta?.title ?? 'Report'}</div>
              <p className="text-sm text-gray-600 font-semibold mt-1">{currentMeta?.description}</p>
              {isTable && (
                <div className="text-xs text-gray-500 font-bold mt-2">
                  {total
                    ? `Rows ${(skip + 1).toLocaleString()}–${Math.min(skip + PAGE_SIZE, total).toLocaleString()} of ${total.toLocaleString()}`
                    : 'No rows match these filters'}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 max-h-[calc(100vh-11rem)]">
              {!rows && !loading && (
                <div className="text-sm text-gray-600 font-semibold py-8 text-center">
                  No data loaded.
                </div>
              )}

              {/* KPI cards */}
              {rows && !isTable && !isBreakdown && !isImplementationOverall && kpiScalars.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {kpiScalars.map(({ key, label, value }) => (
                    <div
                      key={key}
                      className="border border-gray-200 rounded-2xl p-4 bg-gradient-to-br from-white to-purple-50/40"
                    >
                      <div className="text-xs font-extrabold text-gray-600 leading-snug">{label}</div>
                      <div className="text-2xl font-black text-gray-900 mt-1 tabular-nums">{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Implementation: overall + by unit */}
              {isImplementationOverall && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-purple-200 bg-purple-50/50 px-4 py-3">
                    <div className="text-xs font-extrabold text-gray-600">Total in implementation stages</div>
                    <div className="text-3xl font-black text-kauvery-purple tabular-nums">
                      {(rows as { overall: number }).overall.toLocaleString()}
                    </div>
                  </div>
                  <div className="overflow-auto rounded-xl border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-gray-700">
                          <th className="py-2.5 px-3 font-black">Unit</th>
                          <th className="py-2.5 px-3 font-black">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {((rows as { byUnit: BreakdownRow[] }).byUnit || []).map((r, idx) => (
                          <tr key={`${r.key}-${idx}`} className="border-t border-gray-100">
                            <td className="py-2 px-3 font-semibold text-gray-900">{r.key}</td>
                            <td className="py-2 px-3 font-black tabular-nums">{r.count ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Assignment bundle: show KPI chips above table */}
              {isTable &&
                typeof (rows as any)?.waitingForAssignment === 'number' &&
                report === 'assignmentStatus' && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-black text-amber-900">
                      Waiting: {(rows as any).waitingForAssignment.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-black text-emerald-900">
                      Assigned: {(rows as any).assignedForImplementation.toLocaleString()}
                    </span>
                  </div>
                )}

              {/* Breakdown tables */}
              {isBreakdown && (
                <div className="overflow-auto rounded-xl border border-gray-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-gray-700">
                        <th className="py-2.5 px-3 font-black">{breakdownLabel(report)}</th>
                        <th className="py-2.5 px-3 font-black">Count</th>
                        {'approved' in (rows.items?.[0] || {}) && (
                          <>
                            <th className="py-2.5 px-3 font-black">Approved</th>
                            <th className="py-2.5 px-3 font-black">Pending</th>
                            <th className="py-2.5 px-3 font-black">Total</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {(rows.items as BreakdownRow[]).map((r, idx) => (
                        <tr key={`${r.key}-${idx}`} className="border-t border-gray-100">
                          <td className="py-2 px-3 font-semibold text-gray-900">{r.key}</td>
                          <td className="py-2 px-3 font-black tabular-nums">{r.count ?? '—'}</td>
                          {'approved' in r && (
                            <>
                              <td className="py-2 px-3 font-black tabular-nums">{r.approved ?? '—'}</td>
                              <td className="py-2 px-3 font-black tabular-nums">{r.pending ?? '—'}</td>
                              <td className="py-2 px-3 font-black tabular-nums">{r.total ?? '—'}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(rows.items as BreakdownRow[]).length === 0 && (
                    <div className="px-3 py-8 text-center text-sm text-gray-600 font-semibold">
                      Nothing in this breakdown — try widening your filters.
                    </div>
                  )}
                </div>
              )}

              {/* Data tables */}
              {isTable && (
                <>
                  <div className="-mx-1 overflow-x-auto rounded-xl border border-gray-200 sm:mx-0">
                    <table className="w-full min-w-[920px] text-sm">
                      <thead className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgb(229_231_235)]">
                        <tr className="text-left text-gray-700">
                          <th className="whitespace-nowrap px-3 py-2.5 font-black">Idea code</th>
                          <th className="whitespace-nowrap px-3 py-2.5 font-black">Submitted</th>
                          <th className="whitespace-nowrap px-3 py-2.5 font-black">Unit</th>
                          <th className="whitespace-nowrap px-3 py-2.5 font-black">Department</th>
                          <th className="whitespace-nowrap px-3 py-2.5 font-black">Clinical / supportive</th>
                          <th className="whitespace-nowrap px-3 py-2.5 font-black">Status</th>
                          <th className="min-w-[min(24rem,40vw)] px-3 py-2.5 font-black">Title</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rows.items as Suggestion[]).map((s) => (
                          <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50/80">
                            <td className="py-2.5 px-3 font-bold text-gray-900 whitespace-nowrap">
                              {s.code || s.id}
                            </td>
                            <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{s.dateSubmitted}</td>
                            <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{s.unit}</td>
                            <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{s.department}</td>
                            <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{s.category || '—'}</td>
                            <td className="py-2.5 px-3 font-semibold text-gray-800 whitespace-nowrap">{s.status}</td>
                            <td className="max-w-[min(28rem,45vw)] py-2.5 px-3 align-top text-gray-900 leading-snug">
                              {s.theme}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {(rows.items as Suggestion[]).length === 0 && (
                    <div className="py-10 text-center text-sm text-gray-600 font-semibold">
                      No ideas match these filters. Try clearing dates or search.
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                    <button
                      type="button"
                      disabled={skip === 0}
                      onClick={() => setSkip((v) => Math.max(0, v - PAGE_SIZE))}
                      className={`inline-flex items-center gap-1 px-4 py-2 rounded-xl font-black text-sm border ${
                        skip === 0
                          ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                          : 'border-gray-300 text-gray-800 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span className="material-icons-round text-lg">chevron_left</span>
                      Previous page
                    </button>
                    <button
                      type="button"
                      disabled={total !== 0 && skip + PAGE_SIZE >= total}
                      onClick={() => setSkip((v) => v + PAGE_SIZE)}
                      className={`inline-flex items-center gap-1 px-4 py-2 rounded-xl font-black text-sm border ${
                        total !== 0 && skip + PAGE_SIZE >= total
                          ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                          : 'border-gray-300 text-gray-800 bg-white hover:bg-gray-50'
                      }`}
                    >
                      Next page
                      <span className="material-icons-round text-lg">chevron_right</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
  );
};

function humanizeKey(k: string): string {
  return k
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
