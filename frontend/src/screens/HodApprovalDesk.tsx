import React, { useMemo, useState } from 'react';
import { Role, Suggestion, Status } from '../types';
import { STATUS_COLORS } from '../constants';
import { isL2ApprovalPhase } from '../utils/phasedApproval';
import { SearchableSelect } from '../components/SearchableSelect';

export interface HodApprovalDeskProps {
  suggestions: Suggestion[];
  role: Role;
  onSelectIdea: (s: Suggestion) => void;
}

const needsHeadApproval = (s: Suggestion, r: Role) =>
  s.status === Status.VERIFIED_PENDING_APPROVAL &&
  isL2ApprovalPhase(s) &&
  Boolean(s.requiredApprovals?.includes(r)) &&
  !s.approvals?.[r];

const headAlreadyApproved = (s: Suggestion, r: Role) =>
  Boolean(s.requiredApprovals?.includes(r)) && Boolean(s.approvals?.[r]);

const sortByDate = (a: Suggestion, b: Suggestion) => {
  const da = String(a.dateSubmitted || '').trim();
  const db = String(b.dateSubmitted || '').trim();
  if (da && db) return db.localeCompare(da);
  return (b.code || b.id).localeCompare(a.code || a.id);
};

const matchesSearch = (s: Suggestion, q: string) => {
  if (!q.trim()) return true;
  const t = q.trim().toLowerCase();
  return (
    (s.theme || '').toLowerCase().includes(t) ||
    (s.code || s.id).toLowerCase().includes(t) ||
    (s.employeeName || '').toLowerCase().includes(t) ||
    (s.department || '').toLowerCase().includes(t) ||
    (s.unit || '').toLowerCase().includes(t)
  );
};

/**
 * Queue for functional heads: ideas awaiting this role’s sign-off, and (for HR) reward processing.
 * Uses the same scoping as {@link getRoleScopedSuggestions} on the parent.
 */
export const HodApprovalDesk: React.FC<HodApprovalDeskProps> = ({
  suggestions,
  role,
  onSelectIdea,
}) => {
  const [listMode, setListMode] = useState<'pending' | 'approved'>('pending');
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  const { headPending, headApprovedList, paymentQueue } = useMemo(() => {
    if (role === Role.HR_HEAD) {
      const headP = suggestions
        .filter((s) => needsHeadApproval(s, role))
        .sort(sortByDate);
      const headA = suggestions
        .filter((s) => headAlreadyApproved(s, role))
        .sort(sortByDate);
      const pay = suggestions
        .filter((s) => s.status === Status.REWARD_PENDING)
        .sort(sortByDate);
      return {
        headPending: headP,
        headApprovedList: headA,
        paymentQueue: pay,
      };
    }
    const headP = suggestions
      .filter((s) => needsHeadApproval(s, role))
      .sort(sortByDate);
    const headA = suggestions
      .filter((s) => headAlreadyApproved(s, role))
      .sort(sortByDate);
    return {
      headPending: headP,
      headApprovedList: headA,
      paymentQueue: [] as Suggestion[],
    };
  }, [suggestions, role]);

  const headActiveList =
    listMode === 'pending' ? headPending : headApprovedList;

  const units = useMemo(() => {
    const set = new Set<string>();
    for (const s of [...headPending, ...headApprovedList, ...paymentQueue]) {
      const u = String(s.unit || s.assignedUnit || '').trim();
      if (u) set.add(u);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [headPending, headApprovedList, paymentQueue]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const s of [...headPending, ...headApprovedList, ...paymentQueue]) {
      const d = String(s.department || '').trim();
      if (d) set.add(d);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [headPending, headApprovedList, paymentQueue]);

  const applyFilters = (list: Suggestion[]) =>
    list.filter((s) => {
      if (unitFilter && String(s.unit || s.assignedUnit || '').trim() !== unitFilter)
        return false;
      if (deptFilter && String(s.department || '').trim() !== deptFilter) return false;
      return matchesSearch(s, search);
    });

  const filteredHead = useMemo(() => applyFilters(headActiveList), [
    headActiveList,
    search,
    unitFilter,
    deptFilter,
  ]);
  const filteredPay = useMemo(() => applyFilters(paymentQueue), [
    paymentQueue,
    search,
    unitFilter,
    deptFilter,
  ]);

  const renderCard = (
    s: Suggestion,
    variant: 'approval' | 'payment' | 'approved',
  ) => (
    <button
      key={`${variant}-${s.id}`}
      type="button"
      onClick={() => onSelectIdea(s)}
      className="group w-full text-left relative overflow-hidden rounded-2xl border border-purple-200/70 bg-gradient-to-br from-white via-white to-purple-50/50 p-5 shadow-kauvery-card transition-all hover:border-kauvery-purple/45 hover:shadow-kauvery-soft focus:outline-none focus:ring-2 focus:ring-kauvery-purple/35"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-kauvery-purple via-kauvery-violet to-kauvery-pink opacity-80 group-hover:opacity-100" />
      <div className="relative flex flex-wrap items-start justify-between gap-3 pt-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[11px] font-mono font-black text-kauvery-purple bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
              {s.code || s.id}
            </span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-black border ${
                STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-800 border-gray-200'
              }`}
            >
              {s.status}
            </span>
            {variant === 'approval' && (
              <span className="text-[10px] font-black uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                Your sign-off
              </span>
            )}
            {variant === 'approved' && (
              <span className="text-[10px] font-black uppercase tracking-wide text-emerald-900 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                You approved
              </span>
            )}
            {variant === 'payment' && (
              <span className="text-[10px] font-black uppercase tracking-wide text-emerald-900 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                Payment
              </span>
            )}
          </div>
          <h3 className="text-base font-black text-gray-900 leading-snug">{s.theme}</h3>
          <p className="text-sm text-gray-600 font-semibold mt-1">
            {s.employeeName}
            <span className="text-gray-400 mx-1">·</span>
            {s.department || '—'}
            <span className="text-gray-400 mx-1">·</span>
            {s.unit || s.assignedUnit || '—'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] font-extrabold text-gray-500 uppercase">Submitted</div>
          <div className="text-sm font-black text-gray-900">{s.dateSubmitted || '—'}</div>
        </div>
      </div>
      <div className="mt-3 text-xs font-black bg-gradient-to-r from-kauvery-purple to-kauvery-violet bg-clip-text text-transparent group-hover:from-kauvery-violet group-hover:to-kauvery-pink">
        Open details &amp; template →
      </div>
    </button>
  );

  const roleTitle =
    role === Role.HR_HEAD
      ? 'HR head'
      : role === Role.QUALITY_HOD
        ? 'Quality head'
        : role === Role.FINANCE_HOD
          ? 'Finance head'
          : role === Role.OPS_HEAD
            ? 'Operations head'
            : role === Role.NURSING_HEAD
              ? 'Nursing head'
              : 'Head';

  return (
    <div className="max-w-5xl mx-auto animate-fade-in space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/50 bg-gradient-to-br from-white via-purple-50/40 to-pink-50/35 p-6 sm:p-8 shadow-kauvery-soft">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-kauvery-pink/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-kauvery-violet/10 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-200/60 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-kauvery-violet">
            <span className="h-1.5 w-1.5 rounded-full bg-kauvery-pink shadow-[0_0_8px_#EE2D67]" />
            {roleTitle} workspace
          </div>
          <div
            className="mt-4 inline-flex rounded-2xl border border-purple-200/70 bg-white/70 p-1 shadow-inner backdrop-blur-sm"
            role="group"
            aria-label="Queue filter"
          >
            <button
              type="button"
              onClick={() => setListMode('pending')}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                listMode === 'pending'
                  ? 'bg-gradient-to-r from-kauvery-purple to-kauvery-violet text-white shadow-md shadow-purple-300/40'
                  : 'text-gray-600 hover:text-kauvery-purple'
              }`}
            >
              Awaiting my approval
              {headPending.length > 0 && (
                <span className="ml-1.5 tabular-nums opacity-90">({headPending.length})</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setListMode('approved')}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                listMode === 'approved'
                  ? 'bg-gradient-to-r from-kauvery-purple to-kauvery-violet text-white shadow-md shadow-purple-300/40'
                  : 'text-gray-600 hover:text-kauvery-purple'
              }`}
            >
              Approved by me
              {headApprovedList.length > 0 && (
                <span className="ml-1.5 tabular-nums opacity-90">({headApprovedList.length})</span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white/85 backdrop-blur-sm border border-purple-200/45 rounded-2xl p-4 sm:p-5 shadow-kauvery-card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="text-[11px] font-black text-kauvery-purple/90 uppercase tracking-wide block mb-1">
              Search
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Theme, code, employee…"
              className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm focus:ring-2 focus:ring-kauvery-purple/25 focus:border-kauvery-violet outline-none transition-shadow"
            />
          </div>
          <div>
            <label className="text-[11px] font-black text-kauvery-purple/90 uppercase tracking-wide block mb-1">
              Unit
            </label>
            <SearchableSelect
              aria-label="Filter by unit"
              value={unitFilter}
              onChange={setUnitFilter}
              emptyOptionLabel="All units"
              options={units.map((u) => ({ value: u, label: u }))}
              placeholder="Search units…"
              inputClassName="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-900 bg-white shadow-sm focus:ring-2 focus:ring-kauvery-purple/25 outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] font-black text-kauvery-purple/90 uppercase tracking-wide block mb-1">
              Department
            </label>
            <SearchableSelect
              aria-label="Filter by department"
              value={deptFilter}
              onChange={setDeptFilter}
              emptyOptionLabel="All departments"
              options={departments.map((d) => ({ value: d, label: d }))}
              placeholder="Search departments…"
              inputClassName="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-900 bg-white shadow-sm focus:ring-2 focus:ring-kauvery-purple/25 outline-none"
            />
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-black bg-gradient-to-r from-kauvery-purple to-kauvery-violet bg-clip-text text-transparent">
            {listMode === 'approved'
              ? 'Ideas you approved'
              : role === Role.HR_HEAD
                ? 'Functional approvals'
                : 'Awaiting your approval'}
          </h2>
          <span className="text-sm font-black text-kauvery-violet tabular-nums rounded-full border border-purple-200 bg-purple-50 px-3 py-1">
            {filteredHead.length} idea{filteredHead.length === 1 ? '' : 's'}
          </span>
        </div>
        {filteredHead.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-purple-300/60 bg-gradient-to-br from-purple-50/50 to-pink-50/30 p-10 text-center">
            <div className="text-kauvery-purple font-black">
              {listMode === 'approved'
                ? 'No matching approved ideas.'
                : 'Nothing in your queue right now.'}
            </div>
            <p className="text-sm text-gray-600 font-semibold mt-2">
              {listMode === 'approved'
                ? 'After you sign off on an idea, it appears here so you can reopen the summary or template anytime.'
                : 'When the unit coordinator sends an idea for head approval, it will show up here.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredHead.map((s) =>
              renderCard(s, listMode === 'approved' ? 'approved' : 'approval'),
            )}
          </div>
        )}
      </section>

      {role === Role.HR_HEAD && listMode === 'pending' && (
        <section className="space-y-4 pt-4 border-t border-purple-200/50">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-black bg-gradient-to-r from-kauvery-violet to-kauvery-pink bg-clip-text text-transparent">
              Reward &amp; payment
            </h2>
            <span className="text-sm font-black text-kauvery-violet tabular-nums rounded-full border border-pink-200 bg-pink-50 px-3 py-1">
              {filteredPay.length} case{filteredPay.length === 1 ? '' : 's'}
            </span>
          </div>
          {filteredPay.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-pink-300/50 bg-gradient-to-r from-pink-50/40 to-purple-50/30 p-8 text-center text-sm text-gray-700 font-semibold">
              No payment actions pending.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">{filteredPay.map((s) => renderCard(s, 'payment'))}</div>
          )}
        </section>
      )}
    </div>
  );
};
