import React, { useMemo, useState } from 'react';
import { Suggestion, Status, Role } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { employeeStatusStep } from '../utils/kaizenStatusHelp';

interface DashboardProps {
  suggestions: Suggestion[];
  role: Role;
  userName?: string;
<<<<<<< HEAD
  /** Opens the Kaizen Reports screen (sidebar-aligned workflow). */
  onNavigateToReports?: () => void;
=======
  /** Employee dashboard: primary CTA to open submit flow */
  onNewIdea?: () => void;
>>>>>>> origin/main
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

<<<<<<< HEAD
export const Dashboard: React.FC<DashboardProps> = ({
  suggestions: allSuggestions,
  role,
  userName,
  onNavigateToReports,
}) => {
=======
export const Dashboard: React.FC<DashboardProps> = ({ suggestions: allSuggestions, role, userName, onNewIdea }) => {
>>>>>>> origin/main
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'date' | 'unit' | 'department'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [coordinatorQueueTab, setCoordinatorQueueTab] = useState<'pending' | 'approved'>('pending');
  const [beWorkbenchTab, setBeWorkbenchTab] = useState<
    | 'templateReview'
    | 'routedToCoordinator'
    | 'pendingEvaluation'
    | 'rewardProcessing'
    | 'rewarded'
  >('templateReview');
  const [trendFrom, setTrendFrom] = useState('');
  const [trendTo, setTrendTo] = useState('');

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

  const beWorkbench = useMemo(() => {
    if (role !== Role.BUSINESS_EXCELLENCE && role !== Role.BUSINESS_EXCELLENCE_HEAD) return null;
    const byNewest = [...suggestions].sort((a, b) => {
      const da = new Date(a.implementationUpdateDate || a.dateSubmitted || '').getTime();
      const db = new Date(b.implementationUpdateDate || b.dateSubmitted || '').getTime();
      return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da);
    });

    const templateReview = byNewest.filter((s) => s.status === Status.IMPLEMENTATION_DONE);
    const routedToCoordinator = byNewest.filter((s) => s.status === Status.BE_REVIEW_DONE);
    const pendingEvaluation = byNewest.filter((s) => s.status === Status.BE_EVALUATION_PENDING);
    const rewardProcessing = byNewest.filter((s) => s.status === Status.REWARD_PENDING);
    const rewarded = byNewest.filter((s) => s.status === Status.REWARDED);

    const voucherTotal = suggestions.reduce((acc, s) => acc + (Number(s.rewardEvaluation?.voucherValue) || 0), 0);
    const scoredCount = suggestions.filter((s) => typeof s.rewardEvaluation?.totalScore === 'number').length;
    const avgScore =
      scoredCount > 0
        ? Math.round(
            (suggestions.reduce((acc, s) => acc + (Number(s.rewardEvaluation?.totalScore) || 0), 0) / scoredCount) * 10,
          ) / 10
        : 0;

    return {
      queues: { templateReview, routedToCoordinator, pendingEvaluation, rewardProcessing, rewarded },
      kpis: {
        voucherTotal,
        avgScore,
        scoredCount,
      },
    };
  }, [role, suggestions]);

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

  const activityTrend = useMemo(() => {
    // Two trends for a selectable range:
    // 1) Ideas submitted (dateSubmitted)
    // 2) Ideas implemented (implementationUpdateDate when status is in implemented statuses)
    // If no range is selected, default to last 14 days.
    const toYmd = (d: Date) => d.toISOString().slice(0, 10);
    const parseYmd = (s: string) => {
      const v = String(s || '').slice(0, 10);
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const clampStartOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const today = clampStartOfDay(new Date());
    const pickedFrom = parseYmd(trendFrom);
    const pickedTo = parseYmd(trendTo);

    const end = pickedTo ? clampStartOfDay(pickedTo) : today;
    const start =
      pickedFrom
        ? clampStartOfDay(pickedFrom)
        : (() => {
            const d = new Date(end);
            d.setDate(end.getDate() - 13);
            return d;
          })();

    const startMs = start.getTime();
    const endMs = end.getTime();
    const safeStart = startMs <= endMs ? start : end;
    const safeEnd = startMs <= endMs ? end : start;

    const dayCount =
      Math.max(
        1,
        Math.round((safeEnd.getTime() - safeStart.getTime()) / (24 * 60 * 60 * 1000)) + 1,
      );

    const submittedCounts = new Map<string, number>();
    const implementedCounts = new Map<string, number>();

    const implementedStatuses = new Set<Status>([
      Status.IMPLEMENTATION_DONE,
      Status.VERIFIED_PENDING_APPROVAL,
      Status.BE_EVALUATION_PENDING,
      Status.REWARD_PENDING,
      Status.REWARDED,
    ]);

    for (const s of suggestions) {
      const submittedKey = String(s.dateSubmitted || '').slice(0, 10);
      if (submittedKey) {
        submittedCounts.set(submittedKey, (submittedCounts.get(submittedKey) || 0) + 1);
      }

      if (implementedStatuses.has(s.status)) {
        const implementedKey = String(s.implementationUpdateDate || '').slice(0, 10);
        if (implementedKey) {
          implementedCounts.set(implementedKey, (implementedCounts.get(implementedKey) || 0) + 1);
        }
      }
    }

    const series: Array<{ day: string; submitted: number; implemented: number }> = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(safeStart);
      d.setDate(safeStart.getDate() + i);
      const key = toYmd(d);
      series.push({
        day: key.slice(5),
        submitted: submittedCounts.get(key) || 0,
        implemented: implementedCounts.get(key) || 0,
      });
    }

    const submittedSelectedTotal = series.reduce((a, r) => a + r.submitted, 0);
    const implementedSelectedTotal = series.reduce((a, r) => a + r.implemented, 0);

    // Compare with the previous equal-length period immediately before safeStart
    const prevEnd = new Date(safeStart);
    prevEnd.setDate(safeStart.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - (dayCount - 1));

    let submittedPreviousTotal = 0;
    let implementedPreviousTotal = 0;
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(prevStart);
      d.setDate(prevStart.getDate() + i);
      const key = toYmd(d);
      submittedPreviousTotal += submittedCounts.get(key) || 0;
      implementedPreviousTotal += implementedCounts.get(key) || 0;
    }

    const submittedDelta = submittedSelectedTotal - submittedPreviousTotal;
    const submittedDeltaPct =
      submittedPreviousTotal > 0
        ? Math.round((submittedDelta / submittedPreviousTotal) * 100)
        : submittedSelectedTotal > 0
          ? 100
          : 0;

    const implementedDelta = implementedSelectedTotal - implementedPreviousTotal;
    const implementedDeltaPct =
      implementedPreviousTotal > 0
        ? Math.round((implementedDelta / implementedPreviousTotal) * 100)
        : implementedSelectedTotal > 0
          ? 100
          : 0;

    return {
      series,
      submitted: {
        selectedTotal: submittedSelectedTotal,
        previousTotal: submittedPreviousTotal,
        delta: submittedDelta,
        deltaPct: submittedDeltaPct,
      },
      implemented: {
        selectedTotal: implementedSelectedTotal,
        previousTotal: implementedPreviousTotal,
        delta: implementedDelta,
        deltaPct: implementedDeltaPct,
      },
      rangeLabel: `${toYmd(safeStart)} → ${toYmd(safeEnd)}`,
      days: dayCount,
    };
  }, [suggestions, trendFrom, trendTo]);

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
      const ideasReceived = submitted;
      const approvedCount = suggestions.filter((s) =>
        [
          Status.APPROVED_FOR_ASSIGNMENT,
          Status.ASSIGNED_FOR_IMPLEMENTATION,
          Status.IMPLEMENTATION_DONE,
          Status.BE_REVIEW_DONE,
          Status.VERIFIED_PENDING_APPROVAL,
          Status.BE_EVALUATION_PENDING,
          Status.REWARD_PENDING,
          Status.REWARDED,
        ].includes(s.status),
      ).length;
      const balanceApproval = suggestions.filter((s) =>
        [Status.IDEA_SUBMITTED, Status.BE_REVIEW_DONE, Status.IMPLEMENTATION_DONE].includes(
          s.status,
        ),
      ).length;
      return [
        { label: 'Ideas in your unit scope', value: ideasReceived, color: 'text-gray-900' },
        { label: 'Approved (moving forward)', value: approvedCount, color: 'text-blue-800' },
        { label: 'Needs your approval / check', value: balanceApproval, color: 'text-orange-700' },
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
        {
          label: 'Templates awaiting review',
          value: suggestions.filter((s) => s.status === Status.IMPLEMENTATION_DONE).length,
          color: 'text-orange-700',
        },
        {
          label: 'Routed after BE review',
          value: suggestions.filter((s) => s.status === Status.BE_REVIEW_DONE).length,
          color: 'text-blue-800',
        },
        { label: 'Ideas in your scope (filtered)', value: submitted, color: 'text-gray-900' },
        { label: 'Rewarded / closed', value: rewarded, color: 'text-green-800' },
      ];
    }

    if (role === Role.BUSINESS_EXCELLENCE_HEAD) {
      return [
        {
          label: 'Pending BE evaluation',
          value: suggestions.filter((s) => s.status === Status.BE_EVALUATION_PENDING).length,
          color: 'text-orange-700',
        },
        {
          label: 'Reward processing',
          value: suggestions.filter((s) => s.status === Status.REWARD_PENDING).length,
          color: 'text-blue-800',
        },
        { label: 'Rewarded', value: rewarded, color: 'text-green-800' },
        { label: 'All ideas visible', value: submitted, color: 'text-gray-900' },
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

  const statusBreakdownVisible = useMemo(
    () =>
      role === Role.EMPLOYEE
        ? statusBreakdown.filter((row) => row.count > 0)
        : statusBreakdown,
    [statusBreakdown, role],
  );

  const employeeAttentionNotes = useMemo(() => {
    if (role !== Role.EMPLOYEE) return [];
    const notes: { tone: 'amber' | 'rose' | 'slate'; text: string }[] = [];
    const rejected = suggestions.filter((s) => s.status === Status.IDEA_REJECTED).length;
    const waiting = suggestions.filter((s) => s.status === Status.IDEA_SUBMITTED).length;
    if (rejected > 0) {
      notes.push({
        tone: 'rose',
        text:
          rejected === 1
            ? 'One idea was not approved — open it to read the coordinator remarks.'
            : `${rejected} ideas were not approved — open each one to read remarks.`,
      });
    }
    if (waiting > 0) {
      notes.push({
        tone: 'amber',
        text:
          waiting === 1
            ? 'One idea is waiting for unit coordinator review.'
            : `${waiting} ideas are waiting for unit coordinator review.`,
      });
    }
    return notes;
  }, [role, suggestions]);

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
      const pending = byNewest.filter((s) =>
        [Status.IDEA_SUBMITTED, Status.BE_REVIEW_DONE, Status.IMPLEMENTATION_DONE].includes(
          s.status,
        ),
      );
      const approved = byNewest.filter((s) => s.status === Status.APPROVED_FOR_ASSIGNMENT);
      return {
        title:
          coordinatorQueueTab === 'approved'
            ? 'Approved ideas'
            : 'Coordinator actions',
        hint:
          coordinatorQueueTab === 'approved'
            ? 'Ideas approved by you (waiting for Selection Committee assignment).'
            : 'Approve new ideas and verify implemented templates.',
        items: take(coordinatorQueueTab === 'approved' ? approved : pending),
        meta: {
          pendingCount: pending.length,
          approvedCount: approved.length,
        },
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
        title: 'Recent Kaizen activity',
        hint: 'Full pipeline visibility; complete scoring when status is pending BE evaluation.',
        items: take(byNewest),
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
  }, [suggestions, role, coordinatorQueueTab]);

  const showInsightsCharts = useMemo(() => {
    // Charts are most useful for Admin / Coordinator / BE roles; keep employee/implementer dashboards focused.
    if (role === Role.EMPLOYEE) return false;
    if (role === Role.IMPLEMENTER) return false;
    return true;
  }, [role]);

<<<<<<< HEAD
  const isBeTeam =
    role === Role.BUSINESS_EXCELLENCE || role === Role.BUSINESS_EXCELLENCE_HEAD;
  const isUnitCoordinator = role === Role.UNIT_COORDINATOR;
  const spotlightDashboard = isBeTeam || isUnitCoordinator;

  const dashboardFilterControls = (
    <>
      <div className="text-[11px] font-extrabold text-gray-600 uppercase tracking-wide">Filter mode</div>
      <div className="grid grid-cols-2 gap-2 text-xs font-bold">
        {[
          { id: 'all', label: 'All' },
          { id: 'date', label: 'Date' },
          { id: 'unit', label: 'Unit' },
          { id: 'department', label: 'Department' },
        ].map((item) => (
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
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-extrabold text-gray-600 uppercase mb-1 block">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white"
            />
=======
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/50 bg-gradient-to-br from-white via-purple-50/35 to-pink-50/25 p-6 sm:p-7 shadow-kauvery-soft">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-kauvery-pink/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-44 w-44 rounded-full bg-kauvery-violet/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4">
          <div className="min-w-0 flex-1">
              <h2 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-kauvery-purple via-kauvery-violet to-kauvery-pink bg-clip-text text-transparent">
                {userName ? `Welcome, ${userName}` : roleHeader}
              </h2>
              {role === Role.EMPLOYEE ? (
                <p className="text-gray-700 font-semibold mt-1.5 max-w-xl">
                  Submit Kaizen ideas and follow them from unit review through implementation to reward.
                </p>
              ) : (
                <p className="text-gray-700 font-semibold mt-1">
                  Signed in as{' '}
                  <span className="font-extrabold text-kauvery-purple">{role}</span>.
                </p>
              )}
>>>>>>> origin/main
          </div>
          {role === Role.EMPLOYEE && onNewIdea && (
            <button
              type="button"
              onClick={onNewIdea}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-kauvery-purple px-5 py-2.5 text-sm font-black text-white shadow-md shadow-purple-200 ring-1 ring-purple-900/10 transition hover:bg-kauvery-violet"
            >
              <span className="material-icons-round text-base">add_circle</span>
              Submit an idea
            </button>
          )}
        </div>
      )}

<<<<<<< HEAD
      {filterMode === 'unit' && (
        <div>
          <label className="text-[10px] font-extrabold text-gray-600 uppercase mb-1 block">Unit</label>
          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white"
          >
            <option value="">All Units</option>
            {unitOptions.map((u) => (
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
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white"
          >
            <option value="">All Departments</option>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );

  return (
    <div
      className={`space-y-6 animate-fade-in w-full max-w-[100vw] mx-auto ${
        spotlightDashboard ? 'px-1 sm:px-2' : ''
      }`}
    >
      <div
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-purple-50/35 to-pink-50/25 p-6 sm:p-7 ${
          spotlightDashboard
            ? 'border border-kauvery-purple/20 shadow-kauvery-card'
            : 'border border-purple-200/50 shadow-kauvery-soft'
        }`}
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-kauvery-pink/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-44 w-44 rounded-full bg-kauvery-violet/10 blur-3xl" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            {spotlightDashboard && (
              <div className="text-xs font-extrabold uppercase tracking-wide text-kauvery-purple">Kaizen dashboard</div>
            )}
            <h2
              className={`mt-0.5 text-2xl sm:text-3xl font-black ${
                spotlightDashboard
                  ? 'text-gray-900'
                  : 'bg-gradient-to-r from-kauvery-purple via-kauvery-violet to-kauvery-pink bg-clip-text text-transparent'
              }`}
            >
              {userName ? `Welcome, ${userName}` : roleHeader}
            </h2>
            {spotlightDashboard && (
              <p className="mt-2 max-w-3xl text-sm font-semibold text-gray-600">
                {isBeTeam &&
                  'Templates, evaluations, and rewards in one workspace — consistent with the Kaizen Reports experience.'}
                {isUnitCoordinator &&
                  'Approve ideas and verify implementation for your unit(s). Collapse filters when you want more vertical space for charts and queues.'}
              </p>
            )}
            <p className={`font-semibold text-gray-700 ${spotlightDashboard ? 'mt-2 text-xs' : 'mt-1'}`}>
              Signed in as <span className="font-extrabold text-kauvery-purple">{role}</span>.
            </p>
          </div>
          {spotlightDashboard && onNavigateToReports && (
=======
        {role === Role.EMPLOYEE ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-gray-600">
          <span>
            Showing <span className="text-gray-900">{filteredSuggestions.length}</span> of your ideas
          </span>
        </div>
        ) : (
        <div className="mt-4 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div className="relative">
>>>>>>> origin/main
            <button
              type="button"
              onClick={onNavigateToReports}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-kauvery-purple to-kauvery-violet px-5 py-2.5 text-sm font-black text-white shadow-md shadow-purple-200/60 transition-opacity hover:opacity-95"
            >
              <span className="material-icons-round text-[20px]">insert_chart_outlined</span>
              Kaizen reports
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          {spotlightDashboard ? (
            <details className="group relative z-10 w-full rounded-2xl border border-gray-200 bg-white/90 shadow-sm open:shadow-md md:max-w-xl [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-sm font-black text-gray-900 hover:bg-gray-50/80">
                <span className="inline-flex items-center gap-2">
                  <span className="material-icons-round text-[22px] text-kauvery-purple">tune</span>
                  Filters <span className="font-semibold text-gray-500">(optional)</span>
                </span>
                <span className="material-icons-round text-gray-400 transition-transform group-open:rotate-180">
                  expand_more
                </span>
              </summary>
              <div className="space-y-3 border-t border-gray-100 px-4 pb-4 pt-3">
                {dashboardFilterControls}
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('all');
                      setFromDate('');
                      setToDate('');
                      setSelectedUnit('');
                      setSelectedDepartment('');
                    }}
                    className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            </details>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFilterMenu((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-white/80 px-3 py-2 text-sm font-black text-kauvery-purple shadow-sm transition-colors hover:bg-purple-50"
              >
                <span className="material-icons-round text-base">filter_alt</span>
                Filter
              </button>

              {showFilterMenu && (
                <div className="absolute z-20 mt-2 w-[320px] space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                  {dashboardFilterControls}
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
                      className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFilterMenu(false)}
                      className="rounded-md border border-purple-800 bg-kauvery-purple px-2.5 py-1.5 text-xs font-bold text-white"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="text-xs font-bold text-gray-600 md:text-right">
            Mode: <span className="capitalize text-gray-900">{filterMode}</span> · Showing{' '}
            <span className="text-gray-900">{filteredSuggestions.length}</span> ideas
          </div>
        </div>
        )}
      </div>

      {employeeAttentionNotes.length > 0 && (
        <div className="space-y-2">
          {employeeAttentionNotes.map((n, i) => (
            <div
              key={i}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                n.tone === 'rose'
                  ? 'border-rose-200 bg-rose-50 text-rose-950'
                  : n.tone === 'amber'
                    ? 'border-amber-200 bg-amber-50 text-amber-950'
                    : 'border-slate-200 bg-slate-50 text-slate-900'
              }`}
            >
              {n.text}
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div
        className={`grid grid-cols-1 gap-6 ${
          roleKpis.length === 3
            ? 'md:grid-cols-3'
            : roleKpis.length === 2
              ? 'md:grid-cols-2'
              : 'md:grid-cols-4'
        }`}
      >
        {roleKpis.map((kpi, idx) => (
          <div
            key={kpi.label}
            className={`flex items-center justify-between rounded-2xl border p-6 ${
              spotlightDashboard
                ? 'border-gray-200 bg-gradient-to-br from-white to-purple-50/40 shadow-kauvery-card'
                : 'border-gray-200 bg-white shadow-sm'
            }`}
          >
              <div>
                  <p className="text-sm text-gray-700 font-bold mb-1">{kpi.label}</p>
                  <h3 className={`text-3xl font-extrabold ${kpi.color}`}>{kpi.value}</h3>
              </div>
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full border ${
                  spotlightDashboard
                    ? 'border-purple-200/60 bg-white text-kauvery-purple'
                    : 'border-gray-200 bg-gray-50 text-gray-700'
                }`}
              >
                 <span className="material-icons-round">
                  {idx === 0 ? 'insights' : idx === 1 ? 'check_circle' : idx === 2 ? 'hourglass_top' : 'workspace_premium'}
                 </span>
              </div>
          </div>
        ))}
      </div>

      <div
        className={spotlightDashboard ? 'flex min-w-0 flex-col gap-6' : 'contents'}
      >
      <div
        className={
          spotlightDashboard
            ? isUnitCoordinator
              ? 'order-2 min-w-0 w-full'
              : isBeTeam
                ? 'order-2 min-w-0 w-full'
                : 'order-1 min-w-0 w-full'
            : 'contents'
        }
      >
      <div
        className={`rounded-2xl border overflow-hidden ${
          spotlightDashboard
            ? 'border-gray-200 bg-white shadow-kauvery-card'
            : 'border-gray-200 bg-white shadow-sm'
        }`}
      >
        <div className="p-6 border-b border-gray-200 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-gray-900">Activity trend</h3>
            <p className="text-xs text-gray-600 font-semibold mt-1">
              {spotlightDashboard
                ? 'Submitted vs implemented in the range below — same filtered scope as the rest of the dashboard.'
                : 'Choose a date range to see submitted vs implemented.'}
            </p>
            <div className="mt-2 text-[11px] text-gray-500 font-bold uppercase tracking-wide">
              {activityTrend.rangeLabel} · {activityTrend.days} days
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                <div className="text-[10px] font-black uppercase tracking-wide text-gray-600">From</div>
                <input
                  type="date"
                  value={trendFrom}
                  onChange={(e) => setTrendFrom(e.target.value)}
                  className="mt-1 w-[140px] text-sm font-extrabold text-gray-900 outline-none"
                />
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                <div className="text-[10px] font-black uppercase tracking-wide text-gray-600">To</div>
                <input
                  type="date"
                  value={trendTo}
                  onChange={(e) => setTrendTo(e.target.value)}
                  className="mt-1 w-[140px] text-sm font-extrabold text-gray-900 outline-none"
                />
              </div>
              {(trendFrom || trendTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setTrendFrom('');
                    setTrendTo('');
                  }}
                  className="h-[54px] px-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-900 font-extrabold text-xs"
                  title="Reset to last 14 days"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wide text-gray-600">Submitted</div>
              <div className="text-lg font-black text-gray-900 tabular-nums">
                {activityTrend.submitted.selectedTotal}
              </div>
              <div className="text-[11px] font-black tabular-nums text-gray-600">
                {activityTrend.submitted.delta > 0 ? '+' : ''}
                {activityTrend.submitted.delta} ({activityTrend.submitted.deltaPct > 0 ? '+' : ''}
                {activityTrend.submitted.deltaPct}%)
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wide text-gray-600">Implemented</div>
              <div className="text-lg font-black text-gray-900 tabular-nums">
                {activityTrend.implemented.selectedTotal}
              </div>
              <div
                className={`text-[11px] font-black tabular-nums ${
                  activityTrend.implemented.delta > 0
                    ? 'text-emerald-700'
                    : activityTrend.implemented.delta < 0
                      ? 'text-rose-700'
                      : 'text-gray-600'
                }`}
                title="Selected range vs previous equal-length range"
              >
                {activityTrend.implemented.delta > 0 ? '+' : ''}
                {activityTrend.implemented.delta} ({activityTrend.implemented.deltaPct > 0 ? '+' : ''}
                {activityTrend.implemented.deltaPct}%)
              </div>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityTrend.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#962067" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#962067" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="implFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F26522" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#F26522" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }} />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 10px 25px -10px rgba(15,23,42,0.25)',
                    color: '#0f172a',
                    fontWeight: 'bold',
                  }}
                />
                <Legend verticalAlign="top" height={20} wrapperStyle={{ fontWeight: 800, color: '#0f172a' }} />
                <Area
                  type="monotone"
                  dataKey="submitted"
                  name="Submitted"
                  stroke="#962067"
                  strokeWidth={2}
                  fill="url(#trendFill)"
                />
                <Area
                  type="monotone"
                  dataKey="implemented"
                  name="Implemented"
                  stroke="#F26522"
                  strokeWidth={2}
                  fill="url(#implFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      </div>

      <div
        className={
          spotlightDashboard
            ? isBeTeam
              ? 'order-1 min-w-0 w-full'
              : 'hidden'
            : 'contents'
        }
      >
      {beWorkbench && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-gray-900">
                    {role === Role.BUSINESS_EXCELLENCE_HEAD ? 'BE Head workbench' : 'BE member workbench'}
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-[11px] font-black text-gray-700">
                    {suggestions.length} in scope
                  </span>
                </div>
                <p className="text-xs text-gray-600 font-semibold mt-1">
                  Focused queues by workflow stage for faster reviews.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setBeWorkbenchTab('templateReview')}
                    className={`px-3 py-2 text-xs font-extrabold ${
                      beWorkbenchTab === 'templateReview'
                        ? 'bg-kauvery-purple text-white'
                        : 'text-gray-900 hover:bg-gray-50'
                    }`}
                    title="Implementation templates pending BE member review"
                  >
                    Template review
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-white/20 border border-white/20 text-[10px] font-black">
                      {beWorkbench.queues.templateReview.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBeWorkbenchTab('routedToCoordinator')}
                    className={`px-3 py-2 text-xs font-extrabold border-l border-gray-200 ${
                      beWorkbenchTab === 'routedToCoordinator'
                        ? 'bg-kauvery-purple text-white'
                        : 'text-gray-900 hover:bg-gray-50'
                    }`}
                    title="Ideas already reviewed by BE and routed forward"
                  >
                    Routed
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-white/20 border border-white/20 text-[10px] font-black">
                      {beWorkbench.queues.routedToCoordinator.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBeWorkbenchTab('pendingEvaluation')}
                    className={`px-3 py-2 text-xs font-extrabold border-l border-gray-200 ${
                      beWorkbenchTab === 'pendingEvaluation'
                        ? 'bg-kauvery-purple text-white'
                        : 'text-gray-900 hover:bg-gray-50'
                    }`}
                    title="Pending BE Head evaluation"
                  >
                    Evaluation
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-white/20 border border-white/20 text-[10px] font-black">
                      {beWorkbench.queues.pendingEvaluation.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBeWorkbenchTab('rewardProcessing')}
                    className={`px-3 py-2 text-xs font-extrabold border-l border-gray-200 ${
                      beWorkbenchTab === 'rewardProcessing'
                        ? 'bg-kauvery-purple text-white'
                        : 'text-gray-900 hover:bg-gray-50'
                    }`}
                    title="Reward processing"
                  >
                    Reward
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-white/20 border border-white/20 text-[10px] font-black">
                      {beWorkbench.queues.rewardProcessing.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBeWorkbenchTab('rewarded')}
                    className={`px-3 py-2 text-xs font-extrabold border-l border-gray-200 ${
                      beWorkbenchTab === 'rewarded'
                        ? 'bg-kauvery-purple text-white'
                        : 'text-gray-900 hover:bg-gray-50'
                    }`}
                    title="Closed / rewarded"
                  >
                    Closed
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-white/20 border border-white/20 text-[10px] font-black">
                      {beWorkbench.queues.rewarded.length}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {(() => {
                const items =
                  beWorkbenchTab === 'templateReview'
                    ? beWorkbench.queues.templateReview
                    : beWorkbenchTab === 'routedToCoordinator'
                      ? beWorkbench.queues.routedToCoordinator
                      : beWorkbenchTab === 'pendingEvaluation'
                        ? beWorkbench.queues.pendingEvaluation
                        : beWorkbenchTab === 'rewardProcessing'
                          ? beWorkbench.queues.rewardProcessing
                          : beWorkbench.queues.rewarded;
                return items.slice(0, 6).map((s) => (
                  <div key={s.id} className="px-6 py-4 flex items-start justify-between gap-4 hover:bg-gray-50/60">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-extrabold ${statusPillClass(
                            s.status,
                          )}`}
                        >
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
                ));
              })()}

              {(() => {
                const count =
                  beWorkbenchTab === 'templateReview'
                    ? beWorkbench.queues.templateReview.length
                    : beWorkbenchTab === 'routedToCoordinator'
                      ? beWorkbench.queues.routedToCoordinator.length
                      : beWorkbenchTab === 'pendingEvaluation'
                        ? beWorkbench.queues.pendingEvaluation.length
                        : beWorkbenchTab === 'rewardProcessing'
                          ? beWorkbench.queues.rewardProcessing.length
                          : beWorkbench.queues.rewarded.length;
                if (count > 0) return null;
                return (
                  <div className="px-6 py-14 text-center text-sm text-gray-600 font-semibold">
                    No items in this queue right now.
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900">BE highlights</h3>
              <div className="text-[11px] text-gray-500 font-bold uppercase">summary</div>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-[11px] font-extrabold uppercase text-gray-600">Avg score</div>
                  <div className="mt-1 text-2xl font-black text-gray-900">{beWorkbench.kpis.avgScore || '—'}</div>
                  <div className="mt-0.5 text-[11px] text-gray-500 font-bold">
                    {beWorkbench.kpis.scoredCount} scored
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-[11px] font-extrabold uppercase text-gray-600">Voucher total</div>
                  <div className="mt-1 text-2xl font-black text-gray-900">
                    {beWorkbench.kpis.voucherTotal ? beWorkbench.kpis.voucherTotal.toLocaleString() : '—'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500 font-bold">Across filtered scope</div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-[11px] font-extrabold uppercase text-gray-600">Next steps</div>
                <div className="mt-2 space-y-1 text-sm text-gray-800 font-semibold">
                  {role === Role.BUSINESS_EXCELLENCE ? (
                    <>
                      <div>1) Open “Template review” and verify the implementation template.</div>
                      <div>2) Approve to route to coordinator for verification.</div>
                    </>
                  ) : (
                    <>
                      <div>1) Open “Evaluation” and score ideas pending BE Head evaluation.</div>
                      <div>2) Confirm reward split and move to reward processing.</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      <div
        className={
          spotlightDashboard
            ? isUnitCoordinator
              ? 'order-1 min-w-0 w-full'
              : 'order-3 min-w-0 w-full'
            : 'contents'
        }
      >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Action Queue */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-lg font-black text-gray-900">{actionQueue.title}</h3>
                {role === Role.UNIT_COORDINATOR && (
                  <div className="inline-flex rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCoordinatorQueueTab('pending')}
                      className={`px-3 py-1.5 text-xs font-extrabold ${
                        coordinatorQueueTab === 'pending'
                          ? 'bg-kauvery-purple text-white'
                          : 'text-gray-900 hover:bg-gray-50'
                      }`}
                      title="Ideas needing coordinator action"
                    >
                      Pending
                      {typeof (actionQueue as any)?.meta?.pendingCount === 'number' && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-white/20 border border-white/20 text-[10px] font-black">
                          {(actionQueue as any).meta.pendingCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCoordinatorQueueTab('approved')}
                      className={`px-3 py-1.5 text-xs font-extrabold border-l border-gray-200 ${
                        coordinatorQueueTab === 'approved'
                          ? 'bg-kauvery-purple text-white'
                          : 'text-gray-900 hover:bg-gray-50'
                      }`}
                      title="Ideas approved by coordinator"
                    >
                      Approved
                      {typeof (actionQueue as any)?.meta?.approvedCount === 'number' && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-white/20 border border-white/20 text-[10px] font-black">
                          {(actionQueue as any).meta.approvedCount}
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>
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
                  {role === Role.EMPLOYEE && (
                    <div className="mt-0.5 text-[11px] text-gray-500 font-medium line-clamp-2">
                      {employeeStatusStep(s.status)}
                    </div>
                  )}
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
                {role === Role.EMPLOYEE ? (
                  <div className="max-w-md mx-auto">
                    <p className="text-gray-900 font-extrabold text-base mb-1">No ideas in your list yet</p>
                    <p className="text-sm text-gray-600 font-medium mb-5">
                      When you submit a Kaizen idea, it will show up here with status and progress.
                    </p>
                    {onNewIdea && (
                      <button
                        type="button"
                        onClick={onNewIdea}
                        className="inline-flex items-center gap-2 rounded-xl bg-kauvery-purple px-5 py-2.5 text-sm font-black text-white shadow-md hover:bg-kauvery-violet"
                      >
                        <span className="material-icons-round text-base">add</span>
                        Submit your first idea
                      </button>
                    )}
                  </div>
                ) : (
                  'No items for this role right now.'
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick insights (optional) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-black text-gray-900">
              {role === Role.EMPLOYEE ? 'Your snapshot' : 'Quick insights'}
            </h3>
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
                <h3 className="text-lg font-bold text-gray-900">
                  {role === Role.EMPLOYEE ? 'Your ideas by status' : 'Ideas by Status'}
                </h3>
                <div className="text-xs text-gray-500 font-bold uppercase">{role}</div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                {statusBreakdownVisible.map(row => (
                  <div key={row.status} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between">
                    <span className="text-xs text-gray-700 font-bold">{row.status}</span>
                    <span className="text-sm font-extrabold text-gray-900">{row.count}</span>
                  </div>
                ))}
            </div>
            {role === Role.EMPLOYEE && statusBreakdownVisible.length === 0 && (
              <div className="px-6 pb-6 text-sm text-gray-500 font-medium">
                Status counts will appear after you submit an idea.
              </div>
            )}
        </div>

        {role === Role.EMPLOYEE ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900">Your activity</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 font-medium">
                Summary of your Kaizen participation.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-[11px] font-extrabold uppercase text-gray-600">Ideas submitted</div>
                  <div className="mt-1 text-xl font-black text-gray-900">{stats.total}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-[11px] font-extrabold uppercase text-gray-600">In progress</div>
                  <div className="mt-1 text-xl font-black text-gray-900">{stats.inProgress}</div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 col-span-2">
                  <div className="text-[11px] font-extrabold uppercase text-emerald-900">Rewarded &amp; closed</div>
                  <div className="mt-1 text-xl font-black text-emerald-950">
                    {suggestions.filter((s) => s.status === Status.REWARDED).length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
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
        )}
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