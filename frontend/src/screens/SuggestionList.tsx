import React from 'react';
import { Suggestion, Role, Status } from '../types';
import { STATUS_COLORS } from '../constants';

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
  const filteredSuggestions = suggestions;
  const statusOptions = Object.values(Status);
  const canInlineEdit =
    role === Role.UNIT_COORDINATOR || role === Role.SELECTION_COMMITTEE || role === Role.ADMIN;

  return (
    <div className="space-y-4">
      {filteredSuggestions.map((s) => (
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
              <div>
                <div className="text-[10px] text-gray-500 font-extrabold tracking-wide uppercase mb-1">Status</div>
                <select
                  value={s.status}
                  disabled={!canInlineEdit || !onQuickUpdate}
                  onChange={e => onQuickUpdate?.(s.id, e.target.value as Status)}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-900 font-semibold bg-white disabled:bg-gray-100"
                >
                  {statusOptions.map(st => (
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
                  disabled={!canInlineEdit || !onQuickUpdate}
                  onChange={e => onQuickUpdate?.(s.id, s.status, { assignedImplementer: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-900 font-semibold bg-white disabled:bg-gray-100"
                  placeholder="Assign implementer"
                />
              </div>

              <div>
                <div className="text-[10px] text-gray-500 font-extrabold tracking-wide uppercase mb-1">Deadline</div>
                <input
                  type="date"
                  value={s.implementationDeadline || ''}
                  disabled={!canInlineEdit || !onQuickUpdate}
                  onChange={e => onQuickUpdate?.(s.id, s.status, { implementationDeadline: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-900 font-semibold bg-white disabled:bg-gray-100"
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
                <div className="text-right text-xs text-gray-700 font-extrabold mt-1">{s.implementationProgress || 0}%</div>
              </div>

              <div className="text-[11px] text-gray-600 font-semibold pt-2 border-t border-gray-200">
                Submitted: {s.dateSubmitted}
              </div>
            </div>
          </div>
        </div>
      ))}

      {filteredSuggestions.length === 0 && (
        <div className="px-6 py-12 text-center text-gray-600 font-medium italic bg-white border border-gray-300 rounded-xl">
          No suggestions found matching the criteria.
        </div>
      )}
    </div>
  );
};