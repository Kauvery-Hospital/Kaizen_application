import React, { useEffect, useMemo, useState } from 'react';
import { Suggestion, Role, Status } from '../types';
import { STATUS_COLORS } from '../constants';

function normSearch(v?: string | null): string {
  return String(v ?? '').trim().toLowerCase();
}

const MIN_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

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
  currentUserName: _currentUserName,
  onQuickUpdate,
}) => {
  const [originatorSearch, setOriginatorSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(MIN_PAGE_SIZE);

  const filteredSuggestions = useMemo(() => {
    const q = normSearch(originatorSearch);
    if (!q) return suggestions;
    return suggestions.filter((s) => {
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
  }, [suggestions, originatorSearch]);

  const totalFiltered = filteredSuggestions.length;
  const safePageSize = Math.max(MIN_PAGE_SIZE, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalFiltered / safePageSize));

  useEffect(() => {
    setPage(0);
  }, [originatorSearch, pageSize]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  const pagedSuggestions = useMemo(() => {
    const start = page * safePageSize;
    return filteredSuggestions.slice(start, start + safePageSize);
  }, [filteredSuggestions, page, safePageSize]);

  const rangeFrom = totalFiltered === 0 ? 0 : page * safePageSize + 1;
  const rangeTo = Math.min((page + 1) * safePageSize, totalFiltered);

  const showPagination = totalFiltered > 0 && totalPages > 1;
  const paginationControls = showPagination ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-extrabold text-gray-600">
        Page <span className="tabular-nums text-gray-900">{page + 1}</span> of{' '}
        <span className="tabular-nums text-gray-900">{totalPages}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-extrabold text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-extrabold text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  ) : null;

  const statusOptions = Object.values(Status);
  /** Inline status/implementer/deadline edits are for workflow roles only — Admin is view-only on All Suggestions. */
  const canInlineEdit =
    role === Role.UNIT_COORDINATOR || role === Role.SELECTION_COMMITTEE;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="relative w-full max-w-xl flex-1">
          <span className="material-icons-round pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
            search
          </span>
          <input
            type="search"
            value={originatorSearch}
            onChange={(e) => setOriginatorSearch(e.target.value)}
            placeholder="Search by employee name or ID…"
            className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-10 text-sm font-semibold text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200"
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <label className="flex items-center gap-2 text-xs font-extrabold text-gray-700">
            <span className="whitespace-nowrap uppercase tracking-wide text-gray-500">Per page</span>
            <select
              value={safePageSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                setPageSize(
                  Number.isFinite(n) && n >= MIN_PAGE_SIZE ? n : MIN_PAGE_SIZE,
                );
              }}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-extrabold text-gray-900 shadow-sm focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200"
              aria-label="Records per page"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="text-xs font-extrabold text-gray-500 tabular-nums sm:text-right">
            {totalFiltered === 0 ? (
              <>0 results · {suggestions.length} total</>
            ) : (
              <>
                {rangeFrom}–{rangeTo} of {totalFiltered}
                {originatorSearch.trim() ? ` matched` : ''} · {suggestions.length} total
              </>
            )}
          </div>
        </div>
      </div>

      {paginationControls}

      {pagedSuggestions.map((s) => (
        <div
          key={s.id}
          className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_28px_rgba(15,23,42,0.06)] overflow-hidden"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-9 p-5 lg:p-6 border-r border-gray-100">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[10px] font-mono text-gray-700 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-md font-bold">
                  {s.code || s.id}
                </span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATUS_COLORS[s.status]}`}>
                  {s.status}
                </span>
              </div>

              <h3 className="text-[23px] leading-tight font-black text-gray-900 mb-1">{s.theme}</h3>
              <p className="text-sm text-gray-600 mb-4 font-medium leading-relaxed">{s.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="bg-white border border-gray-200 rounded-xl p-3.5">
                  <div className="text-[10px] text-gray-500 uppercase font-extrabold tracking-wide mb-1">Unit</div>
                  <div className="font-extrabold text-gray-900">{s.unit}</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3.5">
                  <div className="text-[10px] text-gray-500 uppercase font-extrabold tracking-wide mb-1">Department / Area</div>
                  <div className="font-extrabold text-gray-900">{s.department} • {s.area}</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3.5">
                  <div className="text-[10px] text-gray-500 uppercase font-extrabold tracking-wide mb-1">Originator</div>
                  <div className="font-extrabold text-gray-900">{s.employeeName}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-3.5">
                  <div className="text-[10px] text-violet-700 uppercase font-extrabold tracking-wide mb-1">Working Status</div>
                  <div className="font-extrabold text-violet-900">{s.implementationStage || 'Started'}</div>
                </div>
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-3.5">
                  <div className="text-[10px] text-violet-700 uppercase font-extrabold tracking-wide mb-1">Progress</div>
                  <div className="font-extrabold text-violet-900">{s.implementationProgress || 0}%</div>
                </div>
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-3.5">
                  <div className="text-[10px] text-violet-700 uppercase font-extrabold tracking-wide mb-1">Updated On</div>
                  <div className="font-extrabold text-violet-900">{s.implementationUpdateDate || 'NA'}</div>
                </div>
              </div>

              {s.implementationUpdate && (
                <div className="mt-3 text-xs text-gray-700 bg-violet-50 border border-violet-200 rounded-xl p-3.5">
                  <span className="font-extrabold text-violet-900">Implementer Update:</span> {s.implementationUpdate}
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => onSelect(s)}
                  className="bg-kauvery-purple text-white text-xs font-bold px-4 py-2 rounded-lg border border-purple-900 hover:bg-kauvery-violet shadow-sm"
                >
                  Open Full View
                </button>
              </div>
            </div>

            <div className="lg:col-span-3 p-5 lg:p-6 bg-gradient-to-b from-gray-50 to-white space-y-3">
              {canInlineEdit && onQuickUpdate ? (
                <>
                  <div>
                    <div className="text-[10px] text-gray-500 font-extrabold tracking-wide uppercase mb-1">Status</div>
                    <select
                      value={s.status}
                      onChange={(e) => onQuickUpdate(s.id, e.target.value as Status)}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-900 font-semibold bg-white"
                    >
                      {statusOptions.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-[10px] text-gray-500 font-extrabold tracking-wide uppercase mb-1">Assigned To</div>
                    <input
                      type="text"
                      value={s.assignedImplementer || ''}
                      onChange={(e) =>
                        onQuickUpdate(s.id, s.status, { assignedImplementer: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-900 font-semibold bg-white"
                      placeholder="Assign implementer"
                    />
                  </div>

                  <div>
                    <div className="text-[10px] text-gray-500 font-extrabold tracking-wide uppercase mb-1">Deadline</div>
                    <input
                      type="date"
                      value={s.implementationDeadline || ''}
                      onChange={(e) =>
                        onQuickUpdate(s.id, s.status, { implementationDeadline: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-900 font-semibold bg-white"
                    />
                  </div>

                  <div>
                    <div className="text-[10px] text-gray-500 font-extrabold tracking-wide uppercase mb-1">Progress</div>
                    <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-kauvery-purple to-kauvery-violet"
                        style={{ width: `${s.implementationProgress || 0}%` }}
                      />
                    </div>
                    <div className="text-right text-xs text-gray-700 font-extrabold mt-1">
                      {s.implementationProgress || 0}%
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-gray-200 bg-white p-3.5">
                    <div className="text-[10px] text-gray-500 font-extrabold tracking-wide uppercase mb-1">Status</div>
                    <div
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATUS_COLORS[s.status]}`}
                    >
                      {s.status}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-3.5">
                    <div className="text-[10px] text-gray-500 font-extrabold tracking-wide uppercase mb-1">
                      Assigned To
                    </div>
                    <div className="text-sm font-extrabold text-gray-900">
                      {s.assignedImplementer?.trim() ? s.assignedImplementer : '—'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-3.5">
                    <div className="text-[10px] text-gray-500 font-extrabold tracking-wide uppercase mb-1">Deadline</div>
                    <div className="text-sm font-extrabold text-gray-900">
                      {s.implementationDeadline?.trim() ? s.implementationDeadline : '—'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-3.5">
                    <div className="text-[10px] text-gray-500 font-extrabold tracking-wide uppercase mb-1">Progress</div>
                    <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-kauvery-purple to-kauvery-violet"
                        style={{ width: `${s.implementationProgress || 0}%` }}
                      />
                    </div>
                    <div className="text-right text-xs text-gray-700 font-extrabold mt-1">
                      {s.implementationProgress || 0}%
                    </div>
                  </div>
                </>
              )}

              <div className="text-[11px] text-gray-600 font-semibold pt-2 border-t border-gray-200">
                Submitted: {s.dateSubmitted}
              </div>
            </div>
          </div>
        </div>
      ))}

      {paginationControls}

      {filteredSuggestions.length === 0 && suggestions.length > 0 && (
        <div className="px-6 py-10 text-center text-gray-700 font-semibold bg-white border border-gray-200 rounded-2xl">
          No suggestions match “{originatorSearch.trim()}”. Try another name or employee ID.
        </div>
      )}

      {filteredSuggestions.length === 0 && suggestions.length === 0 && (
        <div className="px-6 py-12 text-center text-gray-600 font-medium italic bg-white border border-gray-300 rounded-xl">
          No suggestions found matching the criteria.
        </div>
      )}
    </div>
  );
};