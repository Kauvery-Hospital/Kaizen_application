import React, { useMemo, useState } from 'react';
import { Suggestion, Status, Role } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';

interface DashboardProps {
  suggestions: Suggestion[];
  role: Role;
  userName?: string;
}

function normalizeText(v?: string | null): string {
  return String(v ?? '').trim();
}

function statusPillClass(status: Status): string {
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

export const Dashboard: React.FC<DashboardProps> = ({ suggestions: allSuggestions, role, userName }) => {
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'date' | 'unit' | 'department'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');

  const unitOptions = useMemo(
    () => Array.from(new Set(allSuggestions.map(s => s.unit).filter(Boolean))).sort(),
    [allSuggestions]
  );
  const departmentOptions = useMemo(
    () => Array.from(new Set(allSuggestions.map(s => s.department).filter(Boolean))).sort(),
    [allSuggestions]
  );

  const filteredSuggestions = useMemo(() => {
    return allSuggestions.filter(s => {
      if (filterMode === 'all') return true;

      if (filterMode === 'unit') {
        if (!selectedUnit) return true;
        return s.unit === selectedUnit;
      }

      if (filterMode === 'department') {
        if (!selectedDepartment) return true;
        return s.department === selectedDepartment;
      }

      const sourceDate = s.dateSubmitted;
      if (!sourceDate) return false;
      if (fromDate && sourceDate < fromDate) return false;
      if (toDate && sourceDate > toDate) return false;
      return true;
    });
  }, [allSuggestions, filterMode, fromDate, toDate, selectedUnit, selectedDepartment]);

  const suggestions = filteredSuggestions;
  
  const stats = useMemo(() => {
    const implementedStatuses = [
      Status.IMPLEMENTATION_DONE,
      Status.VERIFIED_PENDING_APPROVAL,
      Status.BE_EVALUATION_PENDING,
      Status.REWARD_PENDING,
      Status.REWARDED
    ];

    return {
      total: suggestions.length,
      implemented: suggestions.filter(s => implementedStatuses.includes(s.status)).length,
      inProgress: suggestions.filter(s => !implementedStatuses.includes(s.status) && !s.status.includes('Rejected')).length,
    };
  }, [suggestions]);

  const categoryData = useMemo(() => {
      const counts = suggestions.reduce((acc, curr) => {
          const cat = curr.aiCategory || 'Process';
          acc[cat] = (acc[cat] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [suggestions]);

  const departmentData = useMemo(() => {
    const data = suggestions.reduce((acc, curr) => {
        acc[curr.department] = (acc[curr.department] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => (b.value as number) - (a.value as number));
  }, [suggestions]);

  const COLORS = ['#962067', '#F26522', '#FDB913', '#EE2D67', '#A23293'];
  const implementationRate = stats.total > 0 ? Math.round((stats.implemented / stats.total) * 100) : 0;
  const approvedLikeStatuses = [
    Status.APPROVED_FOR_ASSIGNMENT,
    Status.ASSIGNED_FOR_IMPLEMENTATION,
    Status.IMPLEMENTATION_DONE,
    Status.VERIFIED_PENDING_APPROVAL,
    Status.BE_EVALUATION_PENDING,
    Status.REWARD_PENDING,
    Status.REWARDED,
  ];

  const pendingLikeStatuses = [
    Status.IDEA_SUBMITTED,
    Status.APPROVED_FOR_ASSIGNMENT,
    Status.ASSIGNED_FOR_IMPLEMENTATION,
    Status.IMPLEMENTATION_DONE,
    Status.VERIFIED_PENDING_APPROVAL,
    Status.BE_EVALUATION_PENDING,
    Status.REWARD_PENDING,
  ];

  const roleHeader = useMemo(() => {
    if (role === Role.EMPLOYEE) return 'Employee Dashboard';
    if (role === Role.UNIT_COORDINATOR) return 'Unit Coordinator Dashboard';
    if (role === Role.SELECTION_COMMITTEE) return 'Selection Committee Dashboard';
    if (role === Role.IMPLEMENTER) return 'Implementer Dashboard';
    if (role === Role.BUSINESS_EXCELLENCE) return 'Business Excellence Member Dashboard';
    if (role === Role.BUSINESS_EXCELLENCE_HEAD) return 'Business Excellence Head Dashboard';
    if (role === Role.HR_HEAD || role === Role.QUALITY_HOD || role === Role.FINANCE_HOD) return 'Functional Head Dashboard';
    if (role === Role.ADMIN) return 'Admin Dashboard';
    return 'Role Dashboard';
  }, [role]);

  const roleKpis = useMemo(() => {
    const submitted = suggestions.length;
    const approved = suggestions.filter(s => approvedLikeStatuses.includes(s.status)).length;
    const pending = suggestions.filter(s => pendingLikeStatuses.includes(s.status)).length;
    const rewarded = suggestions.filter(s => s.status === Status.REWARDED).length;
    const rejected = suggestions.filter(s => s.status === Status.IDEA_REJECTED).length;
    const inReview = suggestions.filter(s => s.status === Status.VERIFIED_PENDING_APPROVAL).length;

    if (role === Role.EMPLOYEE) {
      return [
        { label: 'Ideas Submitted', value: submitted, color: 'text-gray-900' },
        { label: 'Approved', value: approved, color: 'text-blue-800' },
        { label: 'Pending', value: pending, color: 'text-orange-700' },
        { label: 'Rewards', value: rewarded, color: 'text-green-800' },
      ];
    }

    if (role === Role.UNIT_COORDINATOR) {
      return [
        { label: 'Ideas Received', value: submitted, color: 'text-gray-900' },
        { label: 'Approved by Coordinator', value: approved, color: 'text-blue-800' },
        { label: 'Pending Coordinator Action', value: suggestions.filter(s => [Status.IDEA_SUBMITTED, Status.IMPLEMENTATION_DONE].includes(s.status)).length, color: 'text-orange-700' },
        { label: 'Rewarded / Closed', value: rewarded, color: 'text-green-800' },
      ];
    }

    if (role === Role.SELECTION_COMMITTEE) {
      return [
        { label: 'Ideas to Assign', value: suggestions.filter(s => s.status === Status.APPROVED_FOR_ASSIGNMENT).length, color: 'text-orange-700' },
        { label: 'Assigned', value: suggestions.filter(s => s.status === Status.ASSIGNED_FOR_IMPLEMENTATION).length, color: 'text-blue-800' },
        { label: 'In Progress', value: suggestions.filter(s => s.status === Status.ASSIGNED_FOR_IMPLEMENTATION || s.status === Status.IMPLEMENTATION_DONE).length, color: 'text-gray-900' },
        { label: 'Closed', value: rewarded, color: 'text-green-800' },
      ];
    }

    if (role === Role.IMPLEMENTER) {
      return [
        { label: 'Assigned Ideas', value: suggestions.filter(s => s.status === Status.ASSIGNED_FOR_IMPLEMENTATION).length, color: 'text-gray-900' },
        { label: 'In Progress', value: suggestions.filter(s => s.implementationStage === 'In Progress').length, color: 'text-blue-800' },
        { label: 'Started', value: suggestions.filter(s => s.implementationStage === 'Started').length, color: 'text-slate-800' },
        { label: 'Submitted for Review', value: suggestions.filter(s => s.status === Status.IMPLEMENTATION_DONE).length, color: 'text-green-800' },
      ];
    }

    if (role === Role.BUSINESS_EXCELLENCE) {
      return [
        { label: 'Pending Template Review', value: suggestions.filter(s => s.status === Status.IMPLEMENTATION_DONE).length, color: 'text-orange-700' },
        { label: 'Reviewed & Routed', value: suggestions.filter(s => s.status === Status.BE_REVIEW_DONE).length, color: 'text-blue-800' },
        { label: 'Total in BE Member Scope', value: submitted, color: 'text-gray-900' },
        { label: 'Rewarded / Closed', value: rewarded, color: 'text-green-800' },
      ];
    }

    if (role === Role.BUSINESS_EXCELLENCE_HEAD) {
      return [
        { label: 'Pending BE Evaluation', value: suggestions.filter(s => s.status === Status.BE_EVALUATION_PENDING).length, color: 'text-orange-700' },
        { label: 'Reward Processing', value: suggestions.filter(s => s.status === Status.REWARD_PENDING).length, color: 'text-blue-800' },
        { label: 'Rewarded', value: rewarded, color: 'text-green-800' },
        { label: 'Total in BE Head Scope', value: submitted, color: 'text-gray-900' },
      ];
    }

    if (role === Role.HR_HEAD || role === Role.QUALITY_HOD || role === Role.FINANCE_HOD) {
      return [
        { label: 'Pending Functional Review', value: inReview, color: 'text-orange-700' },
        { label: 'Approved Flow', value: approved, color: 'text-blue-800' },
        { label: 'Pending Reward', value: suggestions.filter(s => s.status === Status.REWARD_PENDING).length, color: 'text-gray-900' },
        { label: 'Closed', value: rewarded, color: 'text-green-800' },
      ];
    }

    return [
      { label: 'Total Ideas', value: submitted, color: 'text-gray-900' },
      { label: 'Approved', value: approved, color: 'text-blue-800' },
      { label: 'Pending', value: pending, color: 'text-orange-700' },
      { label: 'Rejected', value: rejected, color: 'text-red-700' },
    ];
  }, [suggestions, role]);

  const statusBreakdown = useMemo(
    () =>
      Object.values(Status).map(st => ({
        status: st,
        count: suggestions.filter(s => s.status === st).length,
      })),
    [suggestions]
  );

  const participantLeaderboard = useMemo(() => {
    const participantMap = suggestions.reduce((acc, curr) => {
      const name = curr.employeeName || 'Unknown';
      const dept = curr.department || 'General';
      const basePoints = curr.rewardEvaluation?.totalScore || 0;
      const rewardBonus = curr.rewardEvaluation?.voucherValue
        ? Math.round(curr.rewardEvaluation.voucherValue / 10)
        : 0;
      const points = basePoints + rewardBonus + 100;

      if (!acc[name]) {
        acc[name] = { name, dept, points: 0, contributions: 0 };
      }
      acc[name].points += points;
      acc[name].contributions += 1;
      return acc;
    }, {} as Record<string, { name: string; dept: string; points: number; contributions: number }>);

    return (Object.values(participantMap) as Array<{ name: string; dept: string; points: number; contributions: number }>)
      .sort((a, b) => b.points - a.points)
      .map((p, index) => ({ ...p, rank: index + 1 }));
  }, [suggestions]);

  const actionQueue = useMemo(() => {
    const byNewest = [...suggestions].sort((a, b) => {
      const da = new Date(a.implementationUpdateDate || a.dateSubmitted || '').getTime();
      const db = new Date(b.implementationUpdateDate || b.dateSubmitted || '').getTime();
      return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da);
    });

    const take = (items: Suggestion[], n = 6) => items.slice(0, n);

    if (role === Role.EMPLOYEE) {
      return {
        title: 'My ideas (tracking)',
        hint: 'Recent updates across your submissions.',
        items: take(byNewest),
      };
    }

    if (role === Role.SELECTION_COMMITTEE) {
      return {
        title: 'Ideas to assign implementer',
        hint: 'Approve → assign implementer to move work forward.',
        items: take(byNewest.filter((s) => s.status === Status.APPROVED_FOR_ASSIGNMENT)),
      };
    }

    if (role === Role.IMPLEMENTER) {
      return {
        title: 'My implementation queue',
        hint: 'Track assigned work and submitted templates.',
        items: take(
          byNewest.filter((s) =>
            [
              Status.ASSIGNED_FOR_IMPLEMENTATION,
              Status.IMPLEMENTATION_DONE,
              Status.BE_REVIEW_DONE,
              Status.BE_EVALUATION_PENDING,
              Status.VERIFIED_PENDING_APPROVAL,
              Status.REWARD_PENDING,
              Status.REWARDED,
            ].includes(s.status),
          ),
        ),
      };
    }

    if (role === Role.UNIT_COORDINATOR) {
      return {
        title: 'Coordinator actions',
        hint: 'Approve new ideas and verify implemented templates.',
        items: take(
          byNewest.filter((s) =>
            [Status.IDEA_SUBMITTED, Status.BE_REVIEW_DONE, Status.IMPLEMENTATION_DONE].includes(
              s.status,
            ),
          ),
        ),
      };
    }

    if (role === Role.BUSINESS_EXCELLENCE) {
      return {
        title: 'BE member review queue',
        hint: 'Review implementation templates and route forward.',
        items: take(byNewest.filter((s) => s.status === Status.IMPLEMENTATION_DONE)),
      };
    }

    if (role === Role.BUSINESS_EXCELLENCE_HEAD) {
      return {
        title: 'BE Head evaluation queue',
        hint: 'Score and recommend reward split.',
        items: take(byNewest.filter((s) => s.status === Status.BE_EVALUATION_PENDING)),
      };
    }

    if (role === Role.HR_HEAD || role === Role.QUALITY_HOD || role === Role.FINANCE_HOD) {
      return {
        title: 'Pending approvals',
        hint: 'Approve verified ideas assigned to your function.',
        items: take(byNewest.filter((s) => s.status === Status.VERIFIED_PENDING_APPROVAL)),
      };
    }

    return {
      title: 'Recent ideas',
      hint: 'Latest ideas across the system.',
      items: take(byNewest),
    };
  }, [suggestions, role]);

  const showInsightsCharts = useMemo(() => {
    // Charts are most useful for Admin / Coordinator / BE roles; keep employee/implementer dashboards focused.
    if (role === Role.EMPLOYEE) return false;
    if (role === Role.IMPLEMENTER) return false;
    return true;
  }, [role]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4">
          <div>
              <h2 className="text-2xl font-extrabold text-gray-900">
                {userName ? `Welcome, ${userName}` : roleHeader}
              </h2>
              <p className="text-gray-700 font-semibold">
                Signed in as <span className="font-extrabold text-gray-900">{role}</span>.
              </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilterMenu(v => !v)}
              className="inline-flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 bg-white hover:bg-gray-50"
            >
              <span className="material-icons-round text-base">filter_alt</span>
              Filter
            </button>

            {showFilterMenu && (
              <div className="absolute z-20 mt-2 w-[320px] bg-white border border-gray-200 rounded-xl shadow-xl p-3 space-y-3">
                <div className="text-[11px] font-extrabold text-gray-600 uppercase tracking-wide">Filter Mode</div>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'date', label: 'Date' },
                    { id: 'unit', label: 'Unit' },
                    { id: 'department', label: 'Department' },
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFilterMode(item.id as typeof filterMode)}
                      className={`px-2 py-2 rounded-lg border ${
                        filterMode === item.id
                          ? 'bg-kauvery-purple text-white border-purple-800'
                          : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {filterMode === 'date' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-extrabold text-gray-600 uppercase mb-1 block">From</label>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={e => setFromDate(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-extrabold text-gray-600 uppercase mb-1 block">To</label>
                      <input
                        type="date"
                        value={toDate}
                        onChange={e => setToDate(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white"
                      />
                    </div>
                  </div>
                )}

                {filterMode === 'unit' && (
                  <div>
                    <label className="text-[10px] font-extrabold text-gray-600 uppercase mb-1 block">Unit</label>
                    <select
                      value={selectedUnit}
                      onChange={e => setSelectedUnit(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white"
                    >
                      <option value="">All Units</option>
                      {unitOptions.map(u => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {filterMode === 'department' && (
                  <div>
                    <label className="text-[10px] font-extrabold text-gray-600 uppercase mb-1 block">Department</label>
                    <select
                      value={selectedDepartment}
                      onChange={e => setSelectedDepartment(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white"
                    >
                      <option value="">All Departments</option>
                      {departmentOptions.map(d => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('all');
                      setFromDate('');
                      setToDate('');
                      setSelectedUnit('');
                      setSelectedDepartment('');
                    }}
                    className="px-2.5 py-1.5 rounded-md border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFilterMenu(false)}
                    className="px-2.5 py-1.5 rounded-md border border-purple-800 bg-kauvery-purple text-white text-xs font-bold"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="text-xs text-gray-600 font-bold">
            Mode: <span className="text-gray-900 capitalize">{filterMode}</span> · Showing{' '}
            <span className="text-gray-900">{filteredSuggestions.length}</span> ideas
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {roleKpis.map((kpi, idx) => (
          <div key={kpi.label} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
              <div>
                  <p className="text-sm text-gray-700 font-bold mb-1">{kpi.label}</p>
                  <h3 className={`text-3xl font-extrabold ${kpi.color}`}>{kpi.value}</h3>
              </div>
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-700 border border-gray-200">
                 <span className="material-icons-round">
                  {idx === 0 ? 'insights' : idx === 1 ? 'check_circle' : idx === 2 ? 'hourglass_top' : 'workspace_premium'}
                 </span>
              </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Action Queue */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-gray-900">{actionQueue.title}</h3>
              <p className="text-xs text-gray-600 font-semibold mt-1">{actionQueue.hint}</p>
            </div>
            <div className="text-[11px] font-black text-gray-500 uppercase tracking-wide">
              Showing {Math.min(actionQueue.items.length, 6)} / {actionQueue.items.length}
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {actionQueue.items.slice(0, 6).map((s) => (
              <div key={s.id} className="px-6 py-4 flex items-start justify-between gap-4 hover:bg-gray-50/60">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-extrabold ${statusPillClass(s.status)}`}>
                      {s.status}
                    </span>
                    <span className="text-[11px] font-mono text-gray-500">{s.code || s.id}</span>
                  </div>
                  <div className="mt-1 font-extrabold text-gray-900 line-clamp-1">{s.theme}</div>
                  <div className="mt-1 text-xs text-gray-600 font-semibold line-clamp-1">
                    {normalizeText(s.department)} • {normalizeText(s.unit)} • Originator: {normalizeText(s.employeeName)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-black text-gray-900">
                    {normalizeText(s.implementationDeadline) || normalizeText(s.dateSubmitted) || '—'}
                  </div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">
                    {s.implementationDeadline ? 'Deadline' : 'Submitted'}
                  </div>
                  <div className="mt-2 w-28">
                    <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold uppercase mb-1">
                      <span>Progress</span>
                      <span>{s.implementationProgress || 0}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded overflow-hidden">
                      <div className="h-full bg-kauvery-purple" style={{ width: `${s.implementationProgress || 0}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {actionQueue.items.length === 0 && (
              <div className="px-6 py-14 text-center text-sm text-gray-600 font-semibold">
                No items for this role right now.
              </div>
            )}
          </div>
        </div>

        {/* Quick insights (optional) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-black text-gray-900">Quick insights</h3>
            <div className="text-[11px] text-gray-500 font-bold uppercase">{role}</div>
          </div>
          <div className="p-6 space-y-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-[11px] font-extrabold uppercase text-gray-600">Implementation rate</div>
              <div className="mt-1 text-3xl font-black text-kauvery-purple">{implementationRate}%</div>
              <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full bg-kauvery-purple" style={{ width: `${implementationRate}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-[11px] font-extrabold uppercase text-gray-600">Total</div>
                <div className="mt-1 text-xl font-black text-gray-900">{stats.total}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-[11px] font-extrabold uppercase text-gray-600">In progress</div>
                <div className="mt-1 text-xl font-black text-gray-900">{stats.inProgress}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showInsightsCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chart */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-6">Department Participation</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#1e293b', fontSize: 12, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#1e293b', fontSize: 12, fontWeight: 700 }} />
                  <Tooltip
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', color: '#0f172a', fontWeight: 'bold' }}
                    itemStyle={{ color: '#0f172a' }}
                  />
                  <Bar dataKey="value" fill="#962067" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pie Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-6">Impact Categories</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', color: '#0f172a', fontWeight: 'bold' }} />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: '#0f172a', fontWeight: '600' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900">Ideas by Status</h3>
                <div className="text-xs text-gray-500 font-bold uppercase">{role}</div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                {statusBreakdown.map(row => (
                  <div key={row.status} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between">
                    <span className="text-xs text-gray-700 font-bold">{row.status}</span>
                    <span className="text-sm font-extrabold text-gray-900">{row.count}</span>
                  </div>
                ))}
            </div>
        </div>

        {/* Points Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900">Top Innovators</h3>
                <button
                  onClick={() => setShowAllParticipants(true)}
                  className="text-sm text-kauvery-purple font-extrabold hover:underline"
                >
                  View All
                </button>
            </div>
            <div className="p-6 space-y-4">
              {participantLeaderboard.slice(0, 5).map((p) => (
                <div key={p.name} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-500 font-medium">{p.dept}</div>
                  </div>
                  <div className="text-sm font-extrabold text-kauvery-orange">{p.points} pts</div>
                </div>
              ))}
              {participantLeaderboard.length === 0 && (
                <div className="text-sm text-gray-500 font-medium">No participant points available yet.</div>
              )}
            </div>
          </div>
      </div>

      {showAllParticipants && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => setShowAllParticipants(false)}
          />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900">All Participants by Score</h3>
              <button
                onClick={() => setShowAllParticipants(false)}
                className="text-gray-500 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto p-4">
              <div className="space-y-2">
                {participantLeaderboard.map((p) => (
                  <div key={`${p.rank}-${p.name}`} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-white border border-gray-300 text-xs font-black text-gray-700 flex items-center justify-center">
                        {p.rank}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">{p.name}</div>
                        <div className="text-xs text-gray-500">{p.dept} • {p.contributions} ideas</div>
                      </div>
                    </div>
                    <div className="text-sm font-extrabold text-kauvery-orange">{p.points} pts</div>
                  </div>
                ))}
                {participantLeaderboard.length === 0 && (
                  <div className="text-sm text-gray-500 font-medium px-2 py-4">No participants found.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};