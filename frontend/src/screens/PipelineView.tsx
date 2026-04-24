import React, { useMemo, useState } from 'react';
import { Role, Status, Suggestion } from '../types';
import { STATUS_COLORS } from '../constants';

interface PipelineViewProps {
  suggestions: Suggestion[];
  role: Role;
  currentUserName?: string;
  currentUserEmployeeCode?: string;
  onSelect: (s: Suggestion) => void;
}

const filterByRole = (
  role: Role,
  s: Suggestion,
  ctx?: { currentUserName?: string; currentUserEmployeeCode?: string },
) => {
  const currentUserName = ctx?.currentUserName;
  const currentUserEmployeeCode = ctx?.currentUserEmployeeCode;
  if (role === Role.ADMIN) return true;

  if (role === Role.EMPLOYEE) {
    if (!currentUserName) return false;
    return s.employeeName.trim().toLowerCase() === currentUserName.trim().toLowerCase();
  }

  if (role === Role.UNIT_COORDINATOR) {
    return [
      Status.IDEA_SUBMITTED,
      Status.IMPLEMENTATION_DONE,
      Status.REWARD_PENDING,
      Status.REWARDED,
    ].includes(s.status);
  }

  if (role === Role.SELECTION_COMMITTEE) {
    return s.status === Status.APPROVED_FOR_ASSIGNMENT;
  }

  if (role === Role.IMPLEMENTER) {
    // Implementer should be able to track their ideas even after submission/review/reward.
    const myCode = (currentUserEmployeeCode || '').trim().toLowerCase();
    const assignedCode = String(s.assignedImplementerCode || '').trim().toLowerCase();
    const isAssignedToMe =
      myCode && assignedCode
        ? assignedCode === myCode
        : currentUserName
          ? s.assignedImplementer === currentUserName
          : true;
    return (
      isAssignedToMe &&
      [
        Status.ASSIGNED_FOR_IMPLEMENTATION,
        Status.IMPLEMENTATION_DONE,
        Status.BE_REVIEW_DONE,
        Status.BE_EVALUATION_PENDING,
        Status.VERIFIED_PENDING_APPROVAL,
        Status.REWARD_PENDING,
        Status.REWARDED,
      ].includes(s.status)
    );
  }

  if (role === Role.BUSINESS_EXCELLENCE) {
    return [Status.IMPLEMENTATION_DONE, Status.BE_REVIEW_DONE].includes(s.status);
  }

  if (role === Role.BUSINESS_EXCELLENCE_HEAD) {
    return [Status.BE_EVALUATION_PENDING, Status.REWARD_PENDING, Status.REWARDED].includes(
      s.status
    );
  }

  if (role === Role.HR_HEAD) {
    if ([Status.REWARD_PENDING, Status.REWARDED].includes(s.status)) return true;
    return (
      s.status === Status.VERIFIED_PENDING_APPROVAL &&
      s.requiredApprovals?.includes(role) &&
      !s.approvals?.[role]
    );
  }

  if (role === Role.QUALITY_HOD || role === Role.FINANCE_HOD) {
    return (
      s.status === Status.VERIFIED_PENDING_APPROVAL &&
      s.requiredApprovals?.includes(role) &&
      !s.approvals?.[role]
    );
  }

  return true;
};

export const PipelineView: React.FC<PipelineViewProps> = ({
  suggestions,
  role,
  currentUserName,
  currentUserEmployeeCode,
  onSelect,
}) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  // For implementers, default to showing all ideas they were assigned to implement (including completed/approved).
  const [includeImplemented, setIncludeImplemented] = useState(true);
  const [implementerStageFilter, setImplementerStageFilter] = useState<
    'all' | 'started' | 'in_progress' | 'completed'
  >('all');

  const isImplementer = role === Role.IMPLEMENTER;
  const implementerNameNorm = (currentUserName || '').trim().toLowerCase();
  const implementerCodeNorm = (currentUserEmployeeCode || '').trim().toLowerCase();
  const isInvolvedAsImplementer = (s: Suggestion) => {
    if (implementerCodeNorm) {
      return (
        String(s.assignedImplementerCode || '').trim().toLowerCase() ===
        implementerCodeNorm
      );
    }
    if (!implementerNameNorm) return false;
    return (
      String(s.assignedImplementer || '').trim().toLowerCase() === implementerNameNorm
    );
  };

  const passesImplementerStage = (s: Suggestion) => {
    if (role !== Role.IMPLEMENTER) return true;
    if (implementerStageFilter === 'all') return true;
    const stage = String((s as any).implementationStage || '').trim().toLowerCase();
    if (implementerStageFilter === 'started') return stage === 'started';
    if (implementerStageFilter === 'in_progress') return stage === 'in progress';
    return stage === 'completed';
  };

  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          suggestions
            .filter(s => !!s.department)
            .map(s => s.department)
        )
      ),
    [suggestions]
  );

  const filtered = useMemo(
    () =>
      suggestions
        .filter((s) => {
          // Implementer: default view is all ideas assigned to them.
          // Toggle can restrict to only those currently pending implementation action.
          if (role === Role.IMPLEMENTER && includeImplemented) {
            return isInvolvedAsImplementer(s);
          }
          return filterByRole(role, s, {
            currentUserName,
            currentUserEmployeeCode,
          });
        })
        .filter((s) => passesImplementerStage(s))
        .filter(s =>
          deptFilter === 'all' ? true : s.department === deptFilter
        )
        .filter(s => {
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          return (
            s.theme.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            s.employeeName.toLowerCase().includes(q)
          );
        }),
    [
      suggestions,
      role,
      currentUserName,
      currentUserEmployeeCode,
      deptFilter,
      search,
      includeImplemented,
      implementerNameNorm,
      implementerCodeNorm,
      implementerStageFilter,
    ]
  );

  const pipelineStats = useMemo(() => {
    return {
      total: filtered.length,
      active: filtered.filter(s => ![Status.REWARDED, Status.IDEA_REJECTED].includes(s.status)).length,
      avgProgress:
        filtered.length === 0
          ? 0
          : Math.round(
              filtered.reduce((acc, item) => acc + (item.implementationProgress || 0), 0) / filtered.length
            ),
    };
  }, [filtered]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            Improvement Pipeline
          </h1>
          <p className="text-sm text-gray-600 font-semibold">
            Track all Kaizen ideas in a unified pipeline view.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-3 text-xs text-gray-600 font-semibold">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 border border-gray-300">
            <span className="w-2 h-2 rounded-full bg-kauvery-purple" />
            {role}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-extrabold uppercase text-gray-500">Total Requests</div>
          <div className="text-2xl font-black text-gray-900 mt-1">{pipelineStats.total}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-extrabold uppercase text-gray-500">Active</div>
          <div className="text-2xl font-black text-blue-700 mt-1">{pipelineStats.active}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-extrabold uppercase text-gray-500">Avg Progress</div>
          <div className="text-2xl font-black text-kauvery-purple mt-1">{pipelineStats.avgProgress}%</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div className="flex-1 flex gap-3">
          <div className="relative flex-1">
            <span className="material-icons-round absolute left-3 top-2.5 text-gray-400 text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="Search by idea, description, or originator..."
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 font-medium bg-white focus:ring-2 focus:ring-kauvery-purple outline-none"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="w-44">
            <select
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 font-medium bg-white focus:ring-2 focus:ring-kauvery-purple outline-none"
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
            >
              <option value="all">All Depts</option>
              {departments.map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Implementer filter */}
        {isImplementer && (
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border border-gray-300 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setImplementerStageFilter('all')}
                className={`px-3 py-2 text-xs font-extrabold ${
                  implementerStageFilter === 'all'
                    ? 'bg-kauvery-purple text-white'
                    : 'text-gray-900 hover:bg-gray-50'
                }`}
                title="Show all stages"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setImplementerStageFilter('in_progress')}
                className={`px-3 py-2 text-xs font-extrabold border-l border-gray-200 ${
                  implementerStageFilter === 'in_progress'
                    ? 'bg-kauvery-purple text-white'
                    : 'text-gray-900 hover:bg-gray-50'
                }`}
                title="Show ideas in progress"
              >
                In Progress
              </button>
              <button
                type="button"
                onClick={() => setImplementerStageFilter('completed')}
                className={`px-3 py-2 text-xs font-extrabold border-l border-gray-200 ${
                  implementerStageFilter === 'completed'
                    ? 'bg-kauvery-purple text-white'
                    : 'text-gray-900 hover:bg-gray-50'
                }`}
                title="Show completed ideas"
              >
                Completed
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIncludeImplemented((v) => !v)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-extrabold transition-colors ${
                includeImplemented
                  ? 'bg-kauvery-purple text-white border-purple-900 hover:bg-kauvery-violet'
                  : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-50'
              }`}
              title="Toggle between all assigned ideas and only pending implementation"
            >
              <span className="material-icons-round text-base">
                {includeImplemented ? 'filter_alt' : 'filter_alt_off'}
              </span>
              {includeImplemented ? 'Showing: All assigned' : 'Showing: Pending only'}
            </button>
          </div>
        )}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="text-left bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-kauvery-purple"
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLORS[s.status]}`}
              >
                {s.status}
              </span>
              <span className="text-[11px] font-mono text-gray-500">
                {s.code || s.id}
              </span>
            </div>

            <h3 className="text-sm font-extrabold text-gray-900 mb-1 line-clamp-2">
              {s.theme}
            </h3>
            <p className="text-xs text-gray-600 mb-3 line-clamp-2 font-medium">
              {s.description}
            </p>

            <div className="mb-3">
              <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold uppercase mb-1">
                <span>Progress</span>
                <span>{s.implementationProgress || 0}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 rounded overflow-hidden">
                <div className="h-full bg-kauvery-purple" style={{ width: `${s.implementationProgress || 0}%` }} />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-pink-100 flex items-center justify-center text-[11px] font-bold text-pink-900">
                  {s.employeeName.charAt(0)}
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-gray-900">
                    {s.employeeName}
                  </span>
                  <span className="text-[10px]">
                    {s.department} • {s.unit}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-gray-900">
                  {s.implementationDeadline || s.dateSubmitted}
                </div>
                <div className="text-[10px] text-gray-500">{s.implementationDeadline ? 'Deadline' : 'Submitted'}</div>
              </div>
            </div>
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full py-16 text-center text-gray-500 text-sm font-medium border border-dashed border-gray-300 rounded-2xl bg-gray-50">
            No ideas found for the current filters.
          </div>
        )}
      </div>
    </div>
  );
};

