import React, { useEffect, useMemo, useState } from 'react';
import { Suggestion, Role, Status } from '../types';
import { STATUS_COLORS } from '../constants';
import { effectiveImplementationProgressDisplay } from '../utils/implementerTemplateProgress';
import { SearchableSelect } from '../components/SearchableSelect';

function normSearch(v?: string | null): string {
  return String(v ?? '').trim().toLowerCase();
}

const MIN_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

type SortKey = 'newest' | 'oldest' | 'status' | 'progress';

function statusLeftAccent(status: Status): string {
  switch (status) {
    case Status.IDEA_SUBMITTED:
      return 'border-l-kauvery-purple';
    case Status.IDEA_REJECTED:
      return 'border-l-kauvery-red';
    case Status.APPROVED_FOR_ASSIGNMENT:
      return 'border-l-kauvery-orange';
    case Status.ASSIGNED_FOR_IMPLEMENTATION:
      return 'border-l-kauvery-yellowOrange';
    case Status.IMPLEMENTATION_DONE:
      return 'border-l-kauvery-violet';
    case Status.BE_REVIEW_DONE:
      return 'border-l-kauvery-pink';
    case Status.VERIFIED_PENDING_APPROVAL:
      return 'border-l-kauvery-peach';
    case Status.BE_EVALUATION_PENDING:
      return 'border-l-kauvery-violet';
    case Status.REWARD_PENDING:
      return 'border-l-kauvery-orange';
    case Status.REWARDED:
      return 'border-l-kauvery-pink';
    default:
      return 'border-l-kauvery-lightGrey';
  }
}

function formatDisplayDate(v?: string | null): string {
  const raw = String(v ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '—';
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function visiblePageIndices(current: number, total: number): number[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i);
  const indices = new Set<number>();
  indices.add(0);
  indices.add(total - 1);
  for (let d = -2; d <= 2; d++) indices.add(Math.min(total - 1, Math.max(0, current + d)));
  return [...indices].sort((a, b) => a - b);
}

interface SuggestionListProps {
  suggestions: Suggestion[];
  role: Role;
  onSelect: (suggestion: Suggestion) => void;
  currentUserName?: string;
  onQuickUpdate?: (id: string, status: Status, extraData?: Partial<Suggestion>) => void;
}

export const SuggestionList: React.FC<SuggestionListProps> = ({
  suggestions,
  role,
  onSelect,
  currentUserName,
  onQuickUpdate,
}) => {
  const [originatorSearch, setOriginatorSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(MIN_PAGE_SIZE);
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all');
  const [filterUnit, setFilterUnit] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('newest');

  const units = useMemo(
    () =>
      Array.from(new Set(suggestions.map((s) => s.unit).filter(Boolean))).sort() as string[],
    [suggestions],
  );

  const departments = useMemo(() => {
    const pool =
      filterUnit === 'all'
        ? suggestions
        : suggestions.filter((s) => s.unit === filterUnit);
    return Array.from(
      new Set(pool.map((s) => s.department).filter(Boolean)),
    ).sort() as string[];
  }, [suggestions, filterUnit]);

  useEffect(() => {
    if (filterDepartment !== 'all' && !departments.includes(filterDepartment)) {
      setFilterDepartment('all');
    }
  }, [filterUnit, departments, filterDepartment]);

  const stats = useMemo(() => {
    const total = suggestions.length;
    const ideaSubmitted = suggestions.filter((s) => s.status === Status.IDEA_SUBMITTED).length;
    const inProgress = suggestions.filter((s) =>
      [Status.APPROVED_FOR_ASSIGNMENT, Status.ASSIGNED_FOR_IMPLEMENTATION].includes(s.status),
    ).length;
    const implemented = suggestions.filter((s) =>
      [
        Status.IMPLEMENTATION_DONE,
        Status.BE_REVIEW_DONE,
        Status.VERIFIED_PENDING_APPROVAL,
        Status.BE_EVALUATION_PENDING,
        Status.REWARD_PENDING,
      ].includes(s.status),
    ).length;
    const closed = suggestions.filter((s) =>
      [Status.REWARDED, Status.IDEA_REJECTED].includes(s.status),
    ).length;
    return { total, ideaSubmitted, inProgress, implemented, closed };
  }, [suggestions]);

  const filteredSuggestions = useMemo(() => {
    let list =
      filterStatus === 'all' ? [...suggestions] : suggestions.filter((s) => s.status === filterStatus);

    if (filterUnit !== 'all') {
      list = list.filter((s) => s.unit === filterUnit);
    }
    if (filterDepartment !== 'all') {
      list = list.filter((s) => s.department === filterDepartment);
    }

    const q = normSearch(originatorSearch);
    if (q) {
      list = list.filter((s) => {
        const name = normSearch(s.employeeName);
        const originatorCode = normSearch(s.employeeCode);
        const implementerCode = normSearch(s.assignedImplementerCode);
        const empNo = normSearch(s.empNo);
        return (
          name.includes(q) ||
          originatorCode.includes(q) ||
          implementerCode.includes(q) ||
          empNo.includes(q)
        );
      });
    }

    list.sort((a, b) => {
      if (sortKey === 'status') return String(a.status).localeCompare(String(b.status));
      if (sortKey === 'progress') {
        return (
          effectiveImplementationProgressDisplay(b) - effectiveImplementationProgressDisplay(a)
        );
      }
      const ta = new Date(a.dateSubmitted || '').getTime();
      const tb = new Date(b.dateSubmitted || '').getTime();
      const na = Number.isNaN(ta) ? 0 : ta;
      const nb = Number.isNaN(tb) ? 0 : tb;
      if (sortKey === 'oldest') return na - nb;
      return nb - na;
    });

    return list;
  }, [suggestions, originatorSearch, filterStatus, filterUnit, filterDepartment, sortKey]);

  const totalFiltered = filteredSuggestions.length;
  const safePageSize = Math.max(MIN_PAGE_SIZE, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalFiltered / safePageSize));

  useEffect(() => {
    setPage(0);
  }, [originatorSearch, pageSize, filterStatus, filterUnit, filterDepartment, sortKey, suggestions.length]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  const pagedSuggestions = useMemo(() => {
    const start = page * safePageSize;
    return filteredSuggestions.slice(start, start + safePageSize);
  }, [filteredSuggestions, page, safePageSize]);

  const rangeFrom = totalFiltered === 0 ? 0 : page * safePageSize + 1;
  const rangeTo = Math.min((page + 1) * safePageSize, totalFiltered);

  const statusOptions = Object.values(Status);
  /** List is browse-only; status / assignment changes happen in the idea detail view. */
  const canInlineEdit = false;

  const filterStatusSelectOptions = useMemo(
    () => [{ value: 'all', label: 'All statuses' }, ...statusOptions.map((st) => ({ value: st, label: st }))],
    [statusOptions],
  );

  const sortKeySelectOptions = useMemo(
    () => [
      { value: 'newest', label: 'Newest submitted' },
      { value: 'oldest', label: 'Oldest submitted' },
      { value: 'status', label: 'Status (A–Z)' },
      { value: 'progress', label: 'Progress (high → low)' },
    ],
    [],
  );

  const pageSizeSelectOptions = useMemo(
    () => PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: `${n} per page` })),
    [],
  );

  const unitSelectOptions = useMemo(
    () => [{ value: 'all', label: 'All units' }, ...units.map((u) => ({ value: u, label: u }))],
    [units],
  );

  const departmentSelectOptions = useMemo(
    () => [
      { value: 'all', label: 'All departments' },
      ...departments.map((d) => ({ value: d, label: d })),
    ],
    [departments],
  );

  const pageIndices = visiblePageIndices(page, totalPages);

  const selectShell =
    'rounded-xl border border-kauvery-purple/35 bg-white/95 px-3 py-2 text-sm font-extrabold text-gray-900 shadow-sm focus:border-kauvery-violet focus:outline-none focus:ring-2 focus:ring-kauvery-purple/25';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Total suggestions', value: stats.total, accent: 'from-kauvery-purple/20 to-kauvery-violet/10' },
          { label: 'Idea submitted', value: stats.ideaSubmitted, accent: 'from-kauvery-purple/15 to-transparent' },
          { label: 'In progress', value: stats.inProgress, accent: 'from-kauvery-orange/20 to-kauvery-yellowOrange/10' },
          { label: 'Implemented', value: stats.implemented, accent: 'from-kauvery-violet/20 to-kauvery-pink/10' },
          { label: 'Closed', value: stats.closed, accent: 'from-kauvery-pink/15 to-kauvery-purple/10' },
        ].map((card) => (
          <div
            key={card.label}
            className={`relative overflow-hidden rounded-2xl border border-kauvery-purple/25 bg-gradient-to-br ${card.accent} p-4 shadow-kauvery-soft backdrop-blur-sm`}
          >
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end xl:gap-4">
        <div className="relative min-w-0 flex-1 xl:min-w-[240px]">
          <span className="material-icons-round pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-kauvery-purple/70 text-lg">
            search
          </span>
          <input
            type="search"
            value={originatorSearch}
            onChange={(e) => setOriginatorSearch(e.target.value)}
            placeholder="Search by employee name or ID…"
            className="w-full rounded-xl border border-kauvery-purple/35 bg-white/95 py-2.5 pl-10 pr-10 text-sm font-semibold text-gray-900 shadow-sm placeholder:text-gray-500 focus:border-kauvery-violet focus:outline-none focus:ring-2 focus:ring-kauvery-purple/25"
            aria-label="Search suggestions by originator name or employee ID"
          />
          {originatorSearch.trim() ? (
            <button
              type="button"
              onClick={() => setOriginatorSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              title="Clear search"
              aria-label="Clear search"
            >
              <span className="material-icons-round text-lg">close</span>
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          {units.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Unit</span>
              <SearchableSelect
                aria-label="Filter by unit"
                value={filterUnit}
                onChange={setFilterUnit}
                options={unitSelectOptions}
                placeholder="Search units…"
                inputClassName={selectShell}
                className="min-w-[10rem]"
              />
            </label>
          )}

          {departments.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Department</span>
              <SearchableSelect
                aria-label="Filter by department"
                value={filterDepartment}
                onChange={setFilterDepartment}
                options={departmentSelectOptions}
                placeholder="Search departments…"
                inputClassName={selectShell}
                className="min-w-[11rem]"
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Status</span>
            <SearchableSelect
              aria-label="Filter by status"
              value={filterStatus}
              onChange={(v) => setFilterStatus((v as Status | 'all') || 'all')}
              options={filterStatusSelectOptions}
              placeholder="Search statuses…"
              inputClassName={selectShell}
              className="min-w-[10rem]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Sort</span>
            <SearchableSelect
              aria-label="Sort suggestions"
              value={sortKey}
              onChange={(v) => setSortKey((v as SortKey) || 'newest')}
              options={sortKeySelectOptions}
              placeholder="Search sort options…"
              inputClassName={selectShell}
              className="min-w-[12rem]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Per page</span>
            <SearchableSelect
              aria-label="Records per page"
              value={String(safePageSize)}
              onChange={(v) => {
                const n = Number(v);
                setPageSize(Number.isFinite(n) && n >= MIN_PAGE_SIZE ? n : MIN_PAGE_SIZE);
              }}
              options={pageSizeSelectOptions}
              placeholder="Search…"
              inputClassName={selectShell}
              className="min-w-[8rem]"
            />
          </label>
        </div>
      </div>

      <div className="space-y-3">
        {pagedSuggestions.map((s) => {
          const prog = effectiveImplementationProgressDisplay(s);
          const updated = s.implementationUpdateDate || s.dateSubmitted;
          const borderAccent = statusLeftAccent(s.status);

          return (
            <div
              key={s.id}
              className={`relative overflow-hidden rounded-2xl border border-kauvery-purple/20 bg-white/95 shadow-[0_8px_28px_rgba(15,23,42,0.08)] border-l-4 ${borderAccent}`}
            >
              <div
                className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-12 lg:items-center lg:gap-4 lg:p-5 cursor-pointer rounded-t-2xl transition-colors hover:bg-purple-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kauvery-purple/40 focus-visible:ring-inset"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('[data-suggestion-stop]')) return;
                  onSelect(s);
                }}
                title="Open idea details"
              >
                <div className="lg:col-span-4 min-w-0">
                  <h3
                    className="text-base font-black leading-snug text-gray-900 line-clamp-3"
                    title={String(s.theme || '').trim()}
                  >
                    {s.theme}
                  </h3>
                  <p
                    className="mt-1 text-sm text-gray-600 font-medium leading-relaxed line-clamp-3"
                    title={String(s.description || '').trim()}
                  >
                    {s.description}
                  </p>
                </div>

                <div className="lg:col-span-3 text-sm space-y-1.5 border-t border-gray-100 pt-3 lg:border-t-0 lg:pt-0">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">ID</span>
                    <div className="font-mono text-xs font-bold text-gray-900">{s.code || s.id}</div>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">Department</span>
                    <div className="font-semibold text-gray-900">{s.department}</div>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">Submitted by</span>
                    <div className="font-semibold text-gray-900">{s.employeeName}</div>
                  </div>
                </div>

                <div
                  data-suggestion-stop
                  className="lg:col-span-2 flex flex-col gap-2 border-t border-gray-100 pt-3 lg:border-t-0 lg:pt-0"
                >
                  <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">Status</span>
                  {canInlineEdit && onQuickUpdate ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="w-full max-w-[220px]"
                    >
                      <SearchableSelect
                        aria-label={`Change status for ${s.code || s.id}`}
                        value={s.status}
                        onChange={(v) => onQuickUpdate(s.id, v as Status)}
                        options={statusOptions.map((st) => ({ value: st, label: st }))}
                        placeholder="Search status…"
                        inputClassName="w-full max-w-[220px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 pr-8 text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-kauvery-purple/30"
                      />
                    </div>
                  ) : (
                    <span
                      className={`inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${STATUS_COLORS[s.status]}`}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" aria-hidden />
                      <span className="truncate">{s.status}</span>
                    </span>
                  )}
                </div>

                <div className="lg:col-span-2 border-t border-gray-100 pt-3 lg:border-t-0 lg:pt-0">
                  <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">Progress</span>
                  <div className="mt-1 flex items-center justify-between text-sm font-black text-gray-900 tabular-nums">
                    <span>{prog}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-kauvery-purple to-kauvery-violet"
                      style={{ width: `${prog}%` }}
                    />
                  </div>
                </div>

                <div className="lg:col-span-1 flex flex-col justify-center border-t border-gray-100 pt-3 text-sm lg:border-t-0 lg:pt-0">
                  <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">Updated on</span>
                  <span className="mt-1 font-bold text-gray-900 tabular-nums">{formatDisplayDate(updated)}</span>
                </div>

              </div>

              {canInlineEdit && onQuickUpdate && (
                <div className="border-t border-gray-100 bg-gradient-to-r from-purple-50/50 to-white px-4 py-3 sm:px-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-500">Assigned to</label>
                      <input
                        type="text"
                        value={s.assignedImplementer || ''}
                        onChange={(e) =>
                          onQuickUpdate(s.id, s.status, { assignedImplementer: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold text-gray-900"
                        placeholder="Implementer"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-500">Deadline</label>
                      <input
                        type="date"
                        value={s.implementationDeadline || ''}
                        onChange={(e) =>
                          onQuickUpdate(s.id, s.status, { implementationDeadline: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-500">Progress %</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={s.implementationProgress ?? 0}
                        onChange={(e) =>
                          onQuickUpdate(s.id, s.status, {
                            implementationProgress: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold text-gray-900"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalFiltered > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-kauvery-purple/25 bg-white/95 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-bold text-gray-600">
            Showing <span className="tabular-nums text-gray-900">{rangeFrom}</span> to{' '}
            <span className="tabular-nums text-gray-900">{rangeTo}</span> of{' '}
            <span className="tabular-nums text-gray-900">{totalFiltered}</span> entries
            {originatorSearch.trim() ||
            filterStatus !== 'all' ||
            filterUnit !== 'all' ||
            filterDepartment !== 'all' ? (
              <span className="text-gray-500"> · {suggestions.length} loaded</span>
            ) : null}
          </div>
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg border border-gray-300 bg-white px-2 text-sm font-black text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous page"
              >
                <span className="material-icons-round text-lg">chevron_left</span>
              </button>
              {pageIndices.map((idx, i) => {
                const prev = pageIndices[i - 1];
                const showEllipsis = i > 0 && prev !== undefined && idx - prev > 1;
                return (
                  <React.Fragment key={idx}>
                    {showEllipsis ? (
                      <span className="px-1 text-sm font-black text-gray-400" aria-hidden>
                        …
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setPage(idx)}
                      className={`inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg border text-sm font-black transition ${
                        page === idx
                          ? 'border-kauvery-purple bg-kauvery-purple text-white shadow-md'
                          : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  </React.Fragment>
                );
              })}
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg border border-gray-300 bg-white px-2 text-sm font-black text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next page"
              >
                <span className="material-icons-round text-lg">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      )}

      {filteredSuggestions.length === 0 && suggestions.length > 0 && (
        <div className="rounded-2xl border border-kauvery-purple/25 bg-white/95 px-6 py-10 text-center text-gray-700 font-semibold shadow-sm">
          No suggestions match your search or filter. Try adjusting criteria.
        </div>
      )}

      {filteredSuggestions.length === 0 && suggestions.length === 0 && (
        <div className="rounded-2xl border border-kauvery-purple/25 bg-white/95 px-6 py-12 text-center text-gray-600 font-medium italic shadow-sm">
          No suggestions found matching the criteria.
        </div>
      )}
    </div>
  );
};
