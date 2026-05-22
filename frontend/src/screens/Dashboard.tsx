import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Suggestion, Status, Role } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LineChart,
  Line,
  ComposedChart,
  LabelList,
} from 'recharts';
import { employeeStatusStep } from '../utils/kaizenStatusHelp';
import { effectiveImplementationProgressDisplay } from '../utils/implementerTemplateProgress';
import { DateRangePicker } from '../components/DateRangePicker';
import { SearchableSelect } from '../components/SearchableSelect';
import { KAUVERY_MODAL_SURFACE, KAUVERY_PANEL_BG, KAUVERY_TABLE_HEAD_BG } from '../theme/kauverySurfaces';

interface DashboardProps {
  suggestions: Suggestion[];
  role: Role;
  userName?: string;
  /** Unit codes assigned to the active role (UC / SC); used for multi-unit scope filter. */
  assignedUnitCodes?: string[];
  /** Opens the Kaizen Reports screen (sidebar-aligned workflow). */
  onNavigateToReports?: () => void;
  /** Employee dashboard: primary CTA to open submit flow */
  onNewIdea?: () => void;
}

function normalizeText(v?: string | null): string {
  return String(v ?? '').trim();
}

function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    const t = normalizeText(v == null ? '' : String(v));
    if (t) return t;
  }
  return '';
}

/** Trailing `(CODE)` / `[CODE]` on synced display names. */
function embeddedCodeFromEmployeeName(name: string): string {
  const n = normalizeText(name);
  if (!n) return '';
  const paren = n.match(/\(([A-Za-z0-9._-]{2,40})\)\s*$/);
  if (paren?.[1]) return normalizeText(paren[1]);
  const bracket = n.match(/\[([A-Za-z0-9._-]{2,40})\]\s*$/);
  if (bracket?.[1]) return normalizeText(bracket[1]);
  return '';
}

/**
 * Originators are stored by name on the suggestion row; `employeeCode` is often absent in list payloads.
 * When attachments use `kaizen/{employeeCode}/…`, or the template has `empNo`, surface that as Employee_id.
 */
function resolveOriginatorEmployeeCode(s: Suggestion): string {
  const raw = s as unknown as Record<string, unknown>;
  const direct = firstNonEmpty(
    s.employeeCode,
    s.originatorEmployeeCode,
    raw.employee_code,
    raw.originator_employee_code,
  );
  if (direct) return direct;

  const fromKaizenPath = (raw: string) => {
    const norm = raw.replace(/\\/g, '/').trim();
    const m = norm.match(/^kaizen\/([^/]+)\/(?:kaizen_idea|kaizen_template)(?:\/|$)/i);
    return m ? normalizeText(m[1]) : '';
  };

  const fromFolder =
    fromKaizenPath(String(s.ideaAttachmentsFolder || '')) ||
    fromKaizenPath(String(s.templateAttachmentsFolder || ''));
  if (fromFolder) return fromFolder;

  const paths = s.ideaAttachmentPaths;
  if (Array.isArray(paths) && paths.length > 0) {
    const first = String(paths[0] || '').replace(/\\/g, '/');
    const m = first.match(/^kaizen\/([^/]+)\//i);
    if (m) return normalizeText(m[1]);
  }

  const empNo = normalizeText(s.empNo);
  if (empNo) return empNo;

  const fromNameLabel = embeddedCodeFromEmployeeName(s.employeeName || '');
  if (fromNameLabel) return fromNameLabel;

  return '';
}

/** Closure series (KH-KZ-…) when rewarded; else template Kaizen number if present. */
function resolveKaizenSeriesNumber(s: Suggestion): string {
  return firstNonEmpty(
    s.implementedKaizen?.implementedCode,
    s.kaizenNumber,
  );
}

/** Keys used for admin PQCDSEM chart (idea submission + template). */
const ADMIN_PQCDSEM_DIM_KEYS = [
  'productivity',
  'quality',
  'cost',
  'delivery',
  'safety',
  'morale',
  'environment',
  'energy',
] as const;

/** True when a PQCDSEM cell is active (matches Kaizen form `readPqcdsemLevel` !== 'none'). */
function isPqcdsemBenefitSelected(v: unknown): boolean {
  return v === true || v === 'primary' || v === 'secondary';
}

/** API / DB may return JSON object or (rarely) a JSON string. */
function normalizeExpectedBenefits(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    try {
      const p = JSON.parse(t) as unknown;
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function readExpectedBenefitKey(eb: Record<string, unknown> | null, key: string): unknown {
  if (!eb) return undefined;
  if (Object.prototype.hasOwnProperty.call(eb, key)) return eb[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(eb)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

function suggestionHasAnyPqcdsemTag(s: Suggestion): boolean {
  const eb = normalizeExpectedBenefits(s.expectedBenefits);
  for (const key of ADMIN_PQCDSEM_DIM_KEYS) {
    if (isPqcdsemBenefitSelected(readExpectedBenefitKey(eb, key))) return true;
  }
  return false;
}

function statusPillClass(status: Status): string {
  if (status === Status.IDEA_REJECTED) return 'bg-rose-50 text-rose-900 border-rose-200';
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

/** Tooltip + glass chart shells aligned with Kaizen Admin Panel charts. */
const DASHBOARD_CHART_TOOLTIP = {
  borderRadius: 12,
  background: 'rgba(255, 255, 255, 0.98)',
  border: '1px solid rgba(150, 32, 103, 0.22)',
  color: '#1e293b',
  fontWeight: 700 as const,
  boxShadow: '0 8px 24px -8px rgba(150, 32, 103, 0.2)',
};

const DASHBOARD_GLASS_CHART_CARD =
  'rounded-2xl border border-kauvery-purple/15 bg-white/90 p-5 shadow-kauvery-card';

const ACTIVITY_TREND_RANGE_PRESETS = [
  { label: '7 days', shortLabel: '7d', days: 7 as const },
  { label: '14 days', shortLabel: '14d', days: 14 as const },
  { label: '30 days', shortLabel: '30d', days: 30 as const },
  { label: '90 days', shortLabel: '90d', days: 90 as const },
];

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getActivityTrendPresetRange(days: number): { from: string; to: string } {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));
  return { from: formatLocalYmd(start), to: formatLocalYmd(end) };
}

/** Statuses counted as “approved (flow)” on summary cards — keep in sync with `dashboardSummary`. */
const ADMIN_APPROVED_FLOW_STATUSES: Status[] = [
  Status.APPROVED_FOR_ASSIGNMENT,
  Status.ASSIGNED_FOR_IMPLEMENTATION,
  Status.IMPLEMENTATION_DONE,
  Status.VERIFIED_PENDING_APPROVAL,
  Status.BE_EVALUATION_PENDING,
  Status.REWARD_PENDING,
  Status.REWARDED,
];

export const Dashboard: React.FC<DashboardProps> = ({
  suggestions: allSuggestions,
  role,
  userName,
  assignedUnitCodes = [],
  onNavigateToReports,
  onNewIdea,
}) => {
  const [showAllParticipants, setShowAllParticipants] = useState(false);
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
  const [adminTrendDays, setAdminTrendDays] = useState<7 | 30 | 90 | 365>(30);
  const [summaryReportKind, setSummaryReportKind] = useState<
    'total' | 'approved' | 'inProcess' | 'completed' | 'rejected' | null
  >(null);

  const activityTrendActivePresetDays = useMemo(() => {
    if (!trendFrom && !trendTo) return 14;
    for (const { days } of ACTIVITY_TREND_RANGE_PRESETS) {
      const r = getActivityTrendPresetRange(days);
      if (trendFrom === r.from && trendTo === r.to) return days;
    }
    return null;
  }, [trendFrom, trendTo]);

  const setActivityTrendPreset = useCallback((days: 7 | 14 | 30 | 90) => {
    const r = getActivityTrendPresetRange(days);
    setTrendFrom(r.from);
    setTrendTo(r.to);
  }, []);

  const useAdminDashboardLayout =
    role === Role.ADMIN ||
    role === Role.BUSINESS_EXCELLENCE ||
    role === Role.BUSINESS_EXCELLENCE_HEAD;

  const showMultiUnitScopeFilter = useMemo(
    () =>
      (role === Role.UNIT_COORDINATOR || role === Role.SELECTION_COMMITTEE) &&
      assignedUnitCodes.length > 1,
    [role, assignedUnitCodes],
  );

  const showScopeFilters = useAdminDashboardLayout || showMultiUnitScopeFilter;

  const scopeFilterChipItems = useMemo(() => {
    if (useAdminDashboardLayout) {
      return [
        { id: 'all' as const, label: 'All' },
        { id: 'date' as const, label: 'Date' },
        { id: 'unit' as const, label: 'Unit' },
        { id: 'department' as const, label: 'Dept' },
      ];
    }
    if (showMultiUnitScopeFilter) {
      return [
        { id: 'all' as const, label: 'All' },
        { id: 'date' as const, label: 'Date' },
        { id: 'unit' as const, label: 'Unit' },
      ];
    }
    return [];
  }, [useAdminDashboardLayout, showMultiUnitScopeFilter]);

  const unitOptions = useMemo(() => {
    const fromData = Array.from(new Set(allSuggestions.map((s) => s.unit).filter(Boolean))).sort();
    if (!showMultiUnitScopeFilter || assignedUnitCodes.length === 0) return fromData;
    const allowed = new Set(assignedUnitCodes.map((c) => c.trim().toLowerCase()));
    return fromData.filter((u) => allowed.has(String(u).trim().toLowerCase()));
  }, [allSuggestions, showMultiUnitScopeFilter, assignedUnitCodes]);
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
  const summaryReportLabel = useMemo(() => {
    if (role === Role.ADMIN) return 'Admin report';
    if (role === Role.EMPLOYEE) return 'My ideas report';
    if (role === Role.UNIT_COORDINATOR) return 'Unit coordinator report';
    if (role === Role.SELECTION_COMMITTEE) return 'Selection committee report';
    if (role === Role.IMPLEMENTER) return 'Assigned ideas report';
    if (role === Role.BUSINESS_EXCELLENCE || role === Role.BUSINESS_EXCELLENCE_HEAD) {
      return 'Executive report';
    }
    return 'Dashboard report';
  }, [role]);

  const fyLabel = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const fyStart = m >= 3 ? y : y - 1;
    return `FY ${fyStart}–${String(fyStart + 1).slice(-2)}`;
  }, []);

  const adminSubmittedByDay = useMemo(() => {
    const toYmd = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const start = new Date(end);
    start.setDate(end.getDate() - (adminTrendDays - 1));
    const startStr = toYmd(start);
    const endStr = toYmd(end);
    const counts = new Map<string, number>();
    for (const s of suggestions) {
      const key = String(s.dateSubmitted || '').slice(0, 10);
      if (!key) continue;
      if (key >= startStr && key <= endStr) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const series: { day: string; count: number }[] = [];
    for (let i = 0; i < adminTrendDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = toYmd(d);
      series.push({ day: key.slice(5), count: counts.get(key) || 0 });
    }
    return series;
  }, [suggestions, adminTrendDays]);

  const dashboardSummary = useMemo(() => {
    const total = suggestions.length;
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonth = suggestions.filter((s) => String(s.dateSubmitted || '').startsWith(monthPrefix)).length;

    const approvedLike = ADMIN_APPROVED_FLOW_STATUSES;
    const approved = suggestions.filter((s) => approvedLike.includes(s.status)).length;
    const approvalPct = total > 0 ? Math.round((approved / total) * 1000) / 10 : 0;

    const rejected = suggestions.filter((s) => s.status === Status.IDEA_REJECTED).length;
    const rejectPct = total > 0 ? Math.round((rejected / total) * 1000) / 10 : 0;

    const inProcess = suggestions.filter(
      (s) => s.status !== Status.REWARDED && s.status !== Status.IDEA_REJECTED,
    ).length;
    const inProcessPct = total > 0 ? Math.round((inProcess / total) * 1000) / 10 : 0;

    const completed = suggestions.filter((s) => s.status === Status.REWARDED).length;
    const completedPct = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

    return {
      total,
      thisMonth,
      approved,
      approvalPct,
      rejected,
      rejectPct,
      inProcess,
      inProcessPct,
      completed,
      completedPct,
    };
  }, [suggestions]);

  const summaryReportModalRows = useMemo(() => {
    if (!summaryReportKind) return [];
    switch (summaryReportKind) {
      case 'total':
        return suggestions;
      case 'approved':
        return suggestions.filter((s) => ADMIN_APPROVED_FLOW_STATUSES.includes(s.status));
      case 'inProcess':
        return suggestions.filter(
          (s) => s.status !== Status.REWARDED && s.status !== Status.IDEA_REJECTED,
        );
      case 'completed':
        return suggestions.filter((s) => s.status === Status.REWARDED);
      case 'rejected':
        return suggestions.filter((s) => s.status === Status.IDEA_REJECTED);
      default:
        return [];
    }
  }, [summaryReportKind, suggestions]);

  useEffect(() => {
    if (!summaryReportKind) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSummaryReportKind(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [summaryReportKind]);

  const summaryStatusCards = (
    <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {(
        [
          {
            kind: 'total' as const,
            label: 'Total submitted',
            value: dashboardSummary.total,
            sub:
              dashboardSummary.thisMonth > 0
                ? `+${dashboardSummary.thisMonth} this month`
                : 'No submissions this month',
            subClass: 'text-emerald-600',
          },
          {
            kind: 'approved' as const,
            label: 'Approved (flow)',
            value: dashboardSummary.approved,
            sub: `${dashboardSummary.approvalPct}% of total`,
            subClass: 'text-violet-600',
          },
          {
            kind: 'inProcess' as const,
            label: 'In process',
            value: dashboardSummary.inProcess,
            sub: `${dashboardSummary.inProcessPct}% of total`,
            subClass: 'text-slate-400',
          },
          {
            kind: 'completed' as const,
            label: 'Completed',
            value: dashboardSummary.completed,
            sub: `${dashboardSummary.completedPct}% of total`,
            subClass: 'text-emerald-600',
          },
          {
            kind: 'rejected' as const,
            label: 'Rejected',
            value: dashboardSummary.rejected,
            sub: `${dashboardSummary.rejectPct}% reject rate`,
            subClass: 'text-rose-600',
          },
        ] as const
      ).map((card) => (
        <button
          key={card.kind}
          type="button"
          onClick={() => setSummaryReportKind(card.kind)}
          className="relative w-full overflow-hidden rounded-2xl border border-kauvery-purple/15 bg-white p-5 text-left shadow-kauvery-card transition hover:border-kauvery-purple/30 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-kauvery-purple/40"
          aria-label={`Open report: ${card.label}`}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-kauvery-orange/10 via-transparent to-kauvery-pink/10" />
          <div className="relative">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className="mt-2 text-3xl font-black tabular-nums text-slate-900">{card.value}</p>
            <p className={`mt-1 text-xs font-bold ${card.subClass}`}>{card.sub}</p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Click for table report
            </p>
          </div>
        </button>
      ))}
    </div>
  );

  const summaryReportModal =
    summaryReportKind &&
    createPortal(
      <div
        className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-y-auto overscroll-contain p-3 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-report-title"
      >
        <button
          type="button"
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
          aria-label="Close report"
          onClick={() => setSummaryReportKind(null)}
        />
        <div className="relative z-[1] my-auto flex max-h-[min(92vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-kauvery-purple/20 bg-white shadow-2xl shadow-kauvery-soft">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-kauvery-purple/15 bg-gradient-to-r from-kauvery-purple/8 via-kauvery-violet/5 to-transparent px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-kauvery-peach/90">
                {summaryReportLabel}
              </p>
              <h2 id="summary-report-title" className="mt-1 text-lg font-black text-slate-900 sm:text-xl">
                {summaryReportKind === 'total' && 'Total submitted'}
                {summaryReportKind === 'approved' && 'Approved (flow)'}
                {summaryReportKind === 'inProcess' && 'In process'}
                {summaryReportKind === 'completed' && 'Completed'}
                {summaryReportKind === 'rejected' && 'Rejected'}
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                {summaryReportModalRows.length} row{summaryReportModalRows.length === 1 ? '' : 's'} · ideas in
                your access scope
                {filterMode !== 'all' ? ' · dashboard filters apply' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSummaryReportKind(null)}
              className="shrink-0 rounded-xl border border-kauvery-purple/20 bg-slate-50 p-2 text-slate-600 transition hover:bg-kauvery-purple/10 hover:text-kauvery-purple"
              aria-label="Close"
            >
              <span className="material-icons-round text-[22px]">close</span>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
            <div className="overflow-x-auto rounded-xl border border-kauvery-purple/15 bg-slate-50/80">
              <table
                className={`w-full border-collapse text-left text-xs sm:text-sm ${
                  summaryReportKind === 'completed' ? 'min-w-[920px]' : 'min-w-[760px]'
                }`}
              >
                <thead className={`sticky top-0 z-[1] ${KAUVERY_TABLE_HEAD_BG} shadow-sm`}>
                  <tr className="border-b border-kauvery-purple/40">
                    <th className="whitespace-nowrap px-3 py-3 font-black uppercase tracking-wide text-kauvery-purple sm:px-4">
                      Employee_id
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-black uppercase tracking-wide text-kauvery-purple sm:px-4">
                      Name
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-black uppercase tracking-wide text-kauvery-purple sm:px-4">
                      unit
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-black uppercase tracking-wide text-kauvery-purple sm:px-4">
                      department
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-black uppercase tracking-wide text-kauvery-purple sm:px-4">
                      idea number
                    </th>
                    {summaryReportKind === 'completed' && (
                      <th
                        className="whitespace-nowrap px-3 py-3 font-black uppercase tracking-wide text-kauvery-purple sm:px-4"
                        title="Closure series assigned when the Kaizen is rewarded"
                      >
                        Kaizen series number
                      </th>
                    )}
                    <th className="min-w-[12rem] px-3 py-3 font-black uppercase tracking-wide text-kauvery-purple sm:px-4">
                      idea description
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-black uppercase tracking-wide text-kauvery-purple sm:px-4">
                      Submitted date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 text-slate-800">
                  {summaryReportModalRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={summaryReportKind === 'completed' ? 8 : 7}
                        className="px-4 py-10 text-center font-semibold text-slate-400"
                      >
                        No rows for this category in the current scope.
                      </td>
                    </tr>
                  ) : (
                    summaryReportModalRows.map((row) => (
                      <tr key={row.id} className="bg-white hover:bg-kauvery-purple/[0.04]">
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold tabular-nums text-slate-700 sm:px-4">
                          {resolveOriginatorEmployeeCode(row) || '—'}
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-2.5 font-semibold sm:max-w-[12rem] sm:px-4">
                          {normalizeText(row.employeeName) || '—'}
                        </td>
                        <td className="max-w-[8rem] truncate px-3 py-2.5 text-slate-700 sm:px-4">
                          {normalizeText(row.unit) || '—'}
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-2.5 text-slate-700 sm:px-4">
                          {normalizeText(row.department) || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold text-kauvery-peach/90 sm:px-4">
                          {normalizeText(row.code) || row.id}
                        </td>
                        {summaryReportKind === 'completed' && (
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold text-emerald-800 sm:px-4">
                            {resolveKaizenSeriesNumber(row) || '—'}
                          </td>
                        )}
                        <td
                          className="max-w-xs px-3 py-2.5 text-slate-700 sm:max-w-md sm:px-4"
                          title={normalizeText(row.description)}
                        >
                          <span className="line-clamp-2">{normalizeText(row.description) || '—'}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-slate-600 sm:px-4">
                          {normalizeText(row.dateSubmitted) || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );

  const unitDistribution = useMemo(() => {
    const acc = suggestions.reduce(
      (m, s) => {
        const u = normalizeText(s.unit) || 'Unknown';
        m[u] = (m[u] || 0) + 1;
        return m;
      },
      {} as Record<string, number>,
    );
    return Object.entries(acc)
      .map(([name, value]) => ({ name, value: value as number }))
      .sort((a, b) => b.value - a.value);
  }, [suggestions]);

  const adminStatusDonut = useMemo(() => {
    const rows = Object.values(Status)
      .map((st) => ({
        name: st === Status.REWARDED ? 'Rewarded' : String(st),
        value: suggestions.filter((s) => s.status === st).length,
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    const top = rows.slice(0, 10);
    const rest = rows.slice(10).reduce((sum, r) => sum + r.value, 0);
    if (rest > 0) top.push({ name: 'Other', value: rest });
    return top;
  }, [suggestions]);

  const adminPqcdsemDashboard = useMemo(() => {
    const dims = [
      { key: 'productivity' as const, label: 'Productivity' },
      { key: 'quality' as const, label: 'Quality' },
      { key: 'cost' as const, label: 'Cost' },
      { key: 'delivery' as const, label: 'Delivery' },
      { key: 'safety' as const, label: 'Safety' },
      { key: 'morale' as const, label: 'Morale' },
      { key: 'environment' as const, label: 'Environment' },
      { key: 'energy' as const, label: 'Energy' },
    ];
    const rows = dims.map(({ key, label }) => ({
      name: label,
      count: suggestions.filter((s) => {
        const eb = normalizeExpectedBenefits(s.expectedBenefits);
        return isPqcdsemBenefitSelected(readExpectedBenefitKey(eb, key));
      }).length,
    }));
    const total = suggestions.length;
    const ideasWithAnyTag = suggestions.filter(suggestionHasAnyPqcdsemTag).length;
    return { rows, total, ideasWithAnyTag };
  }, [suggestions]);

  const adminClinicalSupportivePie = useMemo(() => {
    let clinical = 0;
    let supportive = 0;
    let unspecified = 0;
    for (const s of suggestions) {
      const c = s.category;
      if (c === 'Clinical') clinical += 1;
      else if (c === 'Supportive') supportive += 1;
      else unspecified += 1;
    }
    return [
      { name: 'Clinical', value: clinical, fill: '#e879f9' },
      { name: 'Supportive (non-clinical)', value: supportive, fill: '#F26522' },
      { name: 'Not specified', value: unspecified, fill: '#64748b' },
    ].filter((r) => r.value > 0);
  }, [suggestions]);

  const adminDepartmentImplementedSeries = useMemo(() => {
    const implementedStatuses = [
      Status.IMPLEMENTATION_DONE,
      Status.VERIFIED_PENDING_APPROVAL,
      Status.BE_EVALUATION_PENDING,
      Status.REWARD_PENDING,
      Status.REWARDED,
    ];
    const map = new Map<string, { total: number; implemented: number }>();
    for (const s of suggestions) {
      const raw = normalizeText(s.department);
      const dept = raw || 'Unknown';
      const cur = map.get(dept) || { total: 0, implemented: 0 };
      cur.total += 1;
      if (implementedStatuses.includes(s.status)) cur.implemented += 1;
      map.set(dept, cur);
    }
    return [...map.entries()]
      .map(([fullName, { total, implemented }]) => ({
        fullName,
        name: fullName.length > 20 ? `${fullName.slice(0, 18)}…` : fullName,
        total,
        implemented,
        rate: total > 0 ? Math.round((implemented / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 14);
  }, [suggestions]);

  const roleHeader = useMemo(() => {
    if (role === Role.EMPLOYEE) return 'Employee Dashboard';
    if (role === Role.UNIT_COORDINATOR) return 'Unit Coordinator Dashboard';
    if (role === Role.SELECTION_COMMITTEE) return 'Selection Committee Dashboard';
    if (role === Role.IMPLEMENTER) return 'Implementer Dashboard';
    if (role === Role.BUSINESS_EXCELLENCE) return 'Business Excellence Member Dashboard';
    if (role === Role.BUSINESS_EXCELLENCE_HEAD) return 'Business Excellence Head Dashboard';
    if (
      role === Role.HR_HEAD ||
      role === Role.QUALITY_HOD ||
      role === Role.FINANCE_HOD ||
      role === Role.OPS_HEAD ||
      role === Role.NURSING_HEAD
    )
      return 'Functional Head Dashboard';
    if (role === Role.ADMIN) return 'Admin Dashboard';
    return 'Role Dashboard';
  }, [role]);

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

    if (
      role === Role.HR_HEAD ||
      role === Role.QUALITY_HOD ||
      role === Role.FINANCE_HOD ||
      role === Role.OPS_HEAD ||
      role === Role.NURSING_HEAD
    ) {
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

  const isBeTeam =
    role === Role.BUSINESS_EXCELLENCE || role === Role.BUSINESS_EXCELLENCE_HEAD;
  const isUnitCoordinator = role === Role.UNIT_COORDINATOR;

  const clearScopeFilters = useCallback(() => {
    setFilterMode('all');
    setFromDate('');
    setToDate('');
    setSelectedUnit('');
    setSelectedDepartment('');
  }, []);

  useEffect(() => {
    if (!showScopeFilters) {
      clearScopeFilters();
      return;
    }
    const allowedModes = new Set(scopeFilterChipItems.map((item) => item.id));
    if (!allowedModes.has(filterMode)) {
      clearScopeFilters();
    }
  }, [showScopeFilters, scopeFilterChipItems, filterMode, clearScopeFilters]);

  const dashboardUserInitials =
    (userName || 'Member')
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'ME';

  const dashboardWelcomeTitle = userName ? `Welcome, ${userName}` : roleHeader;

  const dashboardHeroSubtitle = isBeTeam
    ? 'Templates, evaluations, and rewards in one workspace — consistent with the Kaizen Reports experience.'
    : isUnitCoordinator
      ? showMultiUnitScopeFilter
        ? 'Approve ideas and verify implementation across your assigned units.'
        : 'Approve ideas and verify implementation for your unit.'
      : 'Track submissions, approvals, and progress for ideas in your scope.';

  const compactFilterSelectInput =
    'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 pr-7 text-[11px] font-semibold text-gray-900 outline-none focus:border-kauvery-violet focus:ring-1 focus:ring-kauvery-purple/25';

  const dashboardFilterControls = (
    <>
      <div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-gray-200/90 bg-gray-100/90 p-[3px] shadow-sm">
        {scopeFilterChipItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilterMode(item.id as typeof filterMode)}
            className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide transition ${
              filterMode === item.id
                ? 'bg-kauvery-purple text-white shadow-sm'
                : 'text-gray-600 hover:bg-white/90'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filterMode === 'date' && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-bold uppercase tracking-wide text-gray-500">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-[118px] rounded-md border border-gray-300 bg-white px-1.5 py-1 text-[11px] font-semibold text-gray-900"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-bold uppercase tracking-wide text-gray-500">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-[118px] rounded-md border border-gray-300 bg-white px-1.5 py-1 text-[11px] font-semibold text-gray-900"
            />
          </div>
        </div>
      )}

      {filterMode === 'unit' && (
        <div className="mt-2">
          <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-gray-500">Unit</label>
          <SearchableSelect
            aria-label="Filter by unit"
            value={selectedUnit}
            onChange={setSelectedUnit}
            emptyOptionLabel="All Units"
            options={unitOptions.map((u) => ({ value: u, label: u }))}
            placeholder="Search…"
            className="w-full"
            listClassName="text-xs"
            maxListHeightClass="max-h-44"
            inputClassName={compactFilterSelectInput}
          />
        </div>
      )}

      {filterMode === 'department' && (
        <div className="mt-2">
          <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-gray-500">Department</label>
          <SearchableSelect
            aria-label="Filter by department"
            value={selectedDepartment}
            onChange={setSelectedDepartment}
            emptyOptionLabel="All Departments"
            options={departmentOptions.map((d) => ({ value: d, label: d }))}
            placeholder="Search…"
            className="w-full"
            listClassName="text-xs"
            maxListHeightClass="max-h-44"
            inputClassName={compactFilterSelectInput}
          />
        </div>
      )}
    </>
  );

  const dashboardScopePanel = showScopeFilters ? (
    <div className="relative rounded-xl border border-kauvery-purple/15 bg-white/80 px-2.5 py-2 shadow-kauvery-soft sm:px-3 sm:py-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-center gap-1.5 text-slate-400">
          <span className="material-icons-round shrink-0 text-[15px] text-kauvery-peach/90">tune</span>
          <span className="text-[10px] font-black uppercase tracking-wide">Scope</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] font-bold tabular-nums text-slate-500">
            <span className="text-kauvery-purple">{filteredSuggestions.length}</span> ideas
          </span>
          <button
            type="button"
            onClick={clearScopeFilters}
            className="rounded-md border border-kauvery-purple/20 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600 transition hover:border-kauvery-purple/35 hover:text-kauvery-purple"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-purple-200/15 bg-white/[0.93] px-2 py-2 text-gray-900 shadow-inner">
        {dashboardFilterControls}
      </div>
    </div>
  ) : null;

  if (useAdminDashboardLayout) {
    const maxUnitVal = unitDistribution[0]?.value || 1;
    const userInitials =
      (userName || roleHeader)
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'EX';

    const trendPresets: Array<{ label: string; days: 7 | 30 | 90 | 365 }> = [
      { label: '7 days', days: 7 },
      { label: '30 days', days: 30 },
      { label: '90 days', days: 90 },
      { label: '1 year', days: 365 },
    ];

    return (
      <div
        className={`space-y-6 animate-fade-in relative w-full max-w-[100vw] mx-auto overflow-hidden rounded-3xl border border-kauvery-purple/30 px-3 py-5 text-slate-800 shadow-kauvery-card sm:px-6 sm:py-8 ${KAUVERY_PANEL_BG}`}
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-kauvery-pink/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-kauvery-violet/30 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-48 w-96 -translate-x-1/2 rounded-full bg-kauvery-purple/20 blur-3xl" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-kauvery-purple via-kauvery-violet to-fuchsia-500 text-white shadow-lg shadow-purple-900/50">
              <span className="material-icons-round text-[22px]">insights</span>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-kauvery-peach/90">Kaizen Flow</div>
              <h1 className="mt-0.5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{roleHeader}</h1>
              {isBeTeam && (
                <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-400">{dashboardHeroSubtitle}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            {onNavigateToReports && (
              <button
                type="button"
                onClick={onNavigateToReports}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-kauvery-purple to-kauvery-violet px-5 py-2.5 text-sm font-black text-white shadow-md shadow-purple-900/30 transition-opacity hover:opacity-95"
              >
                <span className="material-icons-round text-[20px]">insert_chart_outlined</span>
                Kaizen reports
              </button>
            )}
            <span className="rounded-full border border-kauvery-purple/25 bg-kauvery-purple/10 px-3 py-1.5 text-xs font-black text-kauvery-purple shadow-sm">
              {fyLabel}
            </span>
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-kauvery-purple to-kauvery-violet text-sm font-black text-white ring-2 ring-purple-400/30"
              title={userName || roleHeader}
            >
              {userInitials}
            </div>
          </div>
        </div>

        {dashboardScopePanel}

        {summaryStatusCards}

        <div className="relative grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className={DASHBOARD_GLASS_CHART_CARD}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">Ideas submitted over time</h3>
                <p className="text-xs font-semibold text-slate-500">By submission date in the selected window</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {trendPresets.map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => setAdminTrendDays(p.days)}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-black transition ${
                      adminTrendDays === p.days
                        ? 'bg-gradient-to-r from-kauvery-purple to-kauvery-violet text-white shadow-md'
                        : 'border border-kauvery-purple/20 bg-white text-slate-600 hover:border-kauvery-purple/35 hover:bg-kauvery-purple/5'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-52 sm:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={adminSubmittedByDay} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={DASHBOARD_CHART_TOOLTIP} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Submitted"
                    stroke="#e879f9"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#c084fc', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={DASHBOARD_GLASS_CHART_CARD}>
            <h3 className="text-base font-black text-slate-900">Unit-wise distribution</h3>
            <p className="mb-4 text-xs font-semibold text-slate-500">Top units by idea count</p>
            <div className="h-52 sm:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={unitDistribution.slice(0, 8)}
                  margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={108}
                    tick={{ fill: '#e2e8f0', fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={DASHBOARD_CHART_TOOLTIP} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={14}>
                    {unitDistribution.slice(0, 8).map((_, i) => (
                      <Cell key={`u-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={DASHBOARD_GLASS_CHART_CARD}>
            <h3 className="text-base font-black text-slate-900">Status breakdown</h3>
            <p className="mb-2 text-xs font-semibold text-slate-500">Share of ideas by workflow status</p>
            <div className="h-52 sm:h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={adminStatusDonut}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={76}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {adminStatusDonut.map((_, index) => (
                      <Cell key={`st-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={DASHBOARD_CHART_TOOLTIP} />
                  <Legend
                    verticalAlign="bottom"
                    height={28}
                    wrapperStyle={{ color: '#cbd5e1', fontSize: 11, fontWeight: 700 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={DASHBOARD_GLASS_CHART_CARD}>
            <h3 className="text-base font-black text-slate-900">Top units</h3>
            <p className="mb-4 text-xs font-semibold text-slate-500">Relative volume within filtered data</p>
            <div className="space-y-3.5">
              {unitDistribution.slice(0, 6).map((row) => (
                <div key={row.name}>
                  <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-300">
                    <span className="truncate pr-2">{row.name}</span>
                    <span className="tabular-nums text-slate-400">{row.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-kauvery-purple/25 ring-1 ring-kauvery-violet/20">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-kauvery-purple via-fuchsia-500 to-kauvery-violet"
                      style={{ width: `${Math.min(100, Math.round((row.value / maxUnitVal) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
              {unitDistribution.length === 0 && (
                <p className="text-sm font-semibold text-slate-500">No unit data in the current scope.</p>
              )}
            </div>
          </div>

          <div className={DASHBOARD_GLASS_CHART_CARD}>
            <h3 className="text-base font-black text-slate-900">PQCDSEM</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              <span className="text-slate-400">
                Ideas with any PQCDSEM selection:{' '}
                <span className="font-black text-kauvery-peach/95 tabular-nums">
                  {adminPqcdsemDashboard.ideasWithAnyTag}
                </span>
                <span className="text-slate-500"> / </span>
                <span className="font-black text-slate-900 tabular-nums">{adminPqcdsemDashboard.total}</span>
                {adminPqcdsemDashboard.total > 0 && adminPqcdsemDashboard.ideasWithAnyTag < adminPqcdsemDashboard.total && (
                  <span className="text-slate-500">
                    {' '}
                    — {adminPqcdsemDashboard.total - adminPqcdsemDashboard.ideasWithAnyTag} have no dimension stored
                    (often older or out-of-band imports).
                  </span>
                )}
              </span>
            </p>
            <p className="mb-4 text-xs font-semibold text-slate-500">
              Each bar counts ideas where that dimension is on (submit picks{' '}
              <span className="font-black text-slate-300">one</span> primary benefit; the Kaizen template can add more
              primary/secondary). So bars are usually <span className="font-black text-slate-300">well below</span> total
              ideas, and bar heights can sum to more than idea count once the template marks several dimensions.
            </p>
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={adminPqcdsemDashboard.rows} margin={{ top: 8, right: 6, left: -18, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-28}
                    textAnchor="end"
                    height={64}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={DASHBOARD_CHART_TOOLTIP} />
                  <Bar dataKey="count" name="Ideas" radius={[6, 6, 0, 0]} maxBarSize={36}>
                    {adminPqcdsemDashboard.rows.map((_, i) => (
                      <Cell key={`pq-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="top"
                      fill="#e2e8f0"
                      fontSize={11}
                      fontWeight={800}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={DASHBOARD_GLASS_CHART_CARD}>
            <h3 className="text-base font-black text-slate-900">Clinical vs supportive</h3>
            <p className="mb-2 text-xs font-semibold text-slate-500">
              Kaizen template category (clinical / supportive non-clinical), same filtered scope.
            </p>
            <div className="h-52 sm:h-60">
              {adminClinicalSupportivePie.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
                  No ideas in the current scope.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={adminClinicalSupportivePie}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {adminClinicalSupportivePie.map((entry, index) => (
                        <Cell key={`cs-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={DASHBOARD_CHART_TOOLTIP} />
                    <Legend
                      verticalAlign="bottom"
                      height={32}
                      wrapperStyle={{ color: '#cbd5e1', fontSize: 11, fontWeight: 700 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-kauvery-purple/25 bg-gradient-to-br from-white/[0.08] via-kauvery-purple/[0.12] to-kauvery-violet/[0.16] p-5 shadow-kauvery-card backdrop-blur-md">
          <div className="mb-4">
            <h3 className="text-lg font-black text-slate-900">Department-wise ideas & implementation rate</h3>
            <p className="mt-1 max-w-4xl text-xs font-semibold text-slate-500">
              Top departments by idea count in the filtered scope. Bars: total ideas vs ideas that reached implementation
              milestones (done, verified, evaluation, reward pending, or rewarded). Orange line: implementation rate (% of
              total in that department).
            </p>
          </div>
          {adminDepartmentImplementedSeries.length === 0 ? (
            <div className="py-14 text-center text-sm font-semibold text-slate-500">
              No department data in the current scope.
            </div>
          ) : (
            <div className="h-80 w-full sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={adminDepartmentImplementedSeries}
                  margin={{ top: 8, right: 8, left: -14, bottom: 4 }}
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-26}
                    textAnchor="end"
                    height={76}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fill: '#cbd5e1', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip contentStyle={DASHBOARD_CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 11, fontWeight: 700 }} />
                  <Bar
                    yAxisId="left"
                    dataKey="total"
                    name="Total ideas"
                    fill="#962067"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={44}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="implemented"
                    name="Implemented"
                    fill="#F26522"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={44}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="rate"
                    name="Impl. rate %"
                    stroke="#FAA85F"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#FAA85F', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {summaryReportModal}
      </div>
    );
  }

  return (
    <div
      className={`space-y-6 animate-fade-in relative w-full max-w-[100vw] mx-auto overflow-hidden rounded-3xl border border-kauvery-purple/30 px-3 py-5 text-slate-800 shadow-kauvery-card sm:px-6 sm:py-8 ${KAUVERY_PANEL_BG}`}
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-kauvery-pink/25 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-kauvery-violet/30 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-48 w-96 -translate-x-1/2 rounded-full bg-kauvery-purple/20 blur-3xl" />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-kauvery-purple via-kauvery-violet to-fuchsia-500 text-white shadow-lg shadow-purple-900/50">
            <span className="material-icons-round text-[22px]">dashboard</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-kauvery-peach/90">Kaizen Flow</div>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{dashboardWelcomeTitle}</h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-400">{dashboardHeroSubtitle}</p>
            <p className="mt-2 text-[11px] font-semibold text-slate-500">
              Signed in as <span className="font-extrabold text-kauvery-peach">{role}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:justify-end">
          {role === Role.EMPLOYEE && onNewIdea && (
            <button
              type="button"
              onClick={onNewIdea}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-kauvery-purple px-5 py-2.5 text-sm font-black text-white shadow-md shadow-purple-900/30 ring-1 ring-purple-400/20 transition hover:bg-kauvery-violet"
            >
              <span className="material-icons-round text-base">add_circle</span>
              Submit an idea
            </button>
          )}
          {onNavigateToReports && (
            <button
              type="button"
              onClick={onNavigateToReports}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-kauvery-purple to-kauvery-violet px-5 py-2.5 text-sm font-black text-white shadow-md shadow-purple-900/30 transition-opacity hover:opacity-95"
            >
              <span className="material-icons-round text-[20px]">insert_chart_outlined</span>
              Kaizen reports
            </button>
          )}
          <span className="rounded-full border border-kauvery-purple/25 bg-kauvery-purple/10 px-3 py-1.5 text-xs font-black text-kauvery-purple shadow-sm">
            {fyLabel}
          </span>
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-kauvery-purple to-kauvery-violet text-sm font-black text-white ring-2 ring-purple-400/30"
            title={userName || role}
          >
            {dashboardUserInitials}
          </div>
        </div>
      </div>

      {dashboardScopePanel}

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

      {summaryStatusCards}

      <div className="flex min-w-0 flex-col gap-6">
      <div
        className={
          isUnitCoordinator
            ? 'order-2 min-w-0 w-full'
            : isBeTeam
              ? 'order-2 min-w-0 w-full'
              : 'order-1 min-w-0 w-full'
        }
      >
      <div className={`${DASHBOARD_GLASS_CHART_CARD} overflow-hidden`}>
        <div className="border-b border-purple-500/15 p-5 sm:p-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900">Activity trend</h3>
            <p className="text-xs font-semibold text-slate-500 mt-1 max-w-xl">
              Submitted vs implemented in the range below — same filtered scope as the rest of the dashboard.
            </p>
            <div className="mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {activityTrend.rangeLabel} · {activityTrend.days} days
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 max-w-full flex-col items-stretch gap-2.5 sm:max-w-[min(100%,28rem)] sm:items-end">
              <div
                className="flex flex-wrap items-center justify-end gap-1 rounded-2xl border border-kauvery-purple/15 bg-slate-50 p-1 shadow-inner"
                role="group"
                aria-label="Quick range"
              >
                {ACTIVITY_TREND_RANGE_PRESETS.map(({ label, shortLabel, days }) => {
                  const active = activityTrendActivePresetDays === days;
                  return (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setActivityTrendPreset(days)}
                      title={label}
                      className={`rounded-xl px-2.5 py-2 text-[11px] font-black uppercase tracking-wide transition sm:px-3 ${
                        active
                          ? 'bg-gradient-to-r from-kauvery-purple to-kauvery-violet text-white shadow-md shadow-purple-900/40'
                          : 'text-slate-500 hover:bg-kauvery-purple/8 hover:text-kauvery-purple'
                      }`}
                    >
                      <span className="sm:hidden">{shortLabel}</span>
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setTrendFrom('');
                    setTrendTo('');
                  }}
                  className="rounded-xl px-2.5 py-2 text-[11px] font-black uppercase tracking-wide text-slate-500 transition hover:bg-kauvery-purple/8 hover:text-kauvery-purple sm:px-3"
                  title="Default window (last 14 days to today)"
                >
                  Auto
                </button>
              </div>
              <DateRangePicker
                from={trendFrom}
                to={trendTo}
                onChange={(from, to) => {
                  setTrendFrom(from);
                  setTrendTo(to);
                }}
                emptyLabel="Last 14 days (default)"
                align="right"
                className="w-full min-w-[14rem]"
              />
              {activityTrendActivePresetDays === null && (trendFrom || trendTo) && (
                <span className="text-right text-[10px] font-bold uppercase tracking-wide text-kauvery-peach/85">
                  Custom range
                </span>
              )}
            </div>
            <div className="rounded-xl border border-kauvery-purple/25 bg-white/[0.06] px-3 py-2 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Submitted</div>
              <div className="text-lg font-black tabular-nums text-slate-900">
                {activityTrend.submitted.selectedTotal}
              </div>
              <div className="text-[11px] font-black tabular-nums text-slate-400">
                {activityTrend.submitted.delta > 0 ? '+' : ''}
                {activityTrend.submitted.delta} ({activityTrend.submitted.deltaPct > 0 ? '+' : ''}
                {activityTrend.submitted.deltaPct}%)
              </div>
            </div>
            <div className="rounded-xl border border-kauvery-purple/25 bg-white/[0.06] px-3 py-2 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Implemented</div>
              <div className="text-lg font-black tabular-nums text-slate-900">
                {activityTrend.implemented.selectedTotal}
              </div>
              <div
                className={`text-[11px] font-black tabular-nums ${
                  activityTrend.implemented.delta > 0
                    ? 'text-emerald-400/90'
                    : activityTrend.implemented.delta < 0
                      ? 'text-rose-300/90'
                      : 'text-slate-400'
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
        <div className="px-4 pb-5 pt-2 sm:px-6 sm:pb-6">
          <div className="h-44 sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityTrend.series} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e879f9" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#962067" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="activityImplFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb923c" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#F26522" stopOpacity={0.06} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                />
                <Tooltip cursor={{ fill: 'rgba(248, 250, 252, 0.06)' }} contentStyle={DASHBOARD_CHART_TOOLTIP} />
                <Legend
                  verticalAlign="top"
                  height={22}
                  wrapperStyle={{ fontWeight: 800, color: '#cbd5e1', fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="submitted"
                  name="Submitted"
                  stroke="#e879f9"
                  strokeWidth={2.5}
                  fill="url(#activityTrendFill)"
                />
                <Area
                  type="monotone"
                  dataKey="implemented"
                  name="Implemented"
                  stroke="#F26522"
                  strokeWidth={2.5}
                  fill="url(#activityImplFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      </div>

      <div className={isBeTeam ? 'order-1 min-w-0 w-full' : 'hidden'}>
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
                return items.slice(0, 6).map((s) => {
                  const prog = effectiveImplementationProgressDisplay(s);
                  return (
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
                          <span>{prog}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded overflow-hidden">
                          <div className="h-full bg-kauvery-purple" style={{ width: `${prog}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                });
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
        className={isUnitCoordinator ? 'order-1 min-w-0 w-full' : 'order-3 min-w-0 w-full'}
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
            {actionQueue.items.slice(0, 6).map((s) => {
              const prog = effectiveImplementationProgressDisplay(s);
              return (
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
                      <span>{prog}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded overflow-hidden">
                      <div className="h-full bg-kauvery-purple" style={{ width: `${prog}%` }} />
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className={`lg:col-span-2 ${DASHBOARD_GLASS_CHART_CARD}`}>
            <h3 className="text-base font-black text-slate-900">Department participation</h3>
            <p className="mb-4 text-xs font-semibold text-slate-500">Idea count by department in your filtered scope</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentData} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                    angle={-22}
                    textAnchor="end"
                    height={68}
                    interval={0}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                    allowDecimals={false}
                  />
                  <Tooltip cursor={{ fill: 'rgba(248, 250, 252, 0.06)' }} contentStyle={DASHBOARD_CHART_TOOLTIP} />
                  <Bar dataKey="value" name="Ideas" radius={[4, 4, 0, 0]} barSize={38}>
                    {departmentData.map((_, index) => (
                      <Cell key={`dept-bar-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={DASHBOARD_GLASS_CHART_CARD}>
            <h3 className="text-base font-black text-slate-900">Impact categories</h3>
            <p className="mb-2 text-xs font-semibold text-slate-500">Share of ideas by AI / process category</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={76}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={`cat-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={DASHBOARD_CHART_TOOLTIP} />
                  <Legend
                    verticalAlign="bottom"
                    height={32}
                    wrapperStyle={{ color: '#cbd5e1', fontSize: 11, fontWeight: 700 }}
                  />
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

      {summaryReportModal}

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