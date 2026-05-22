import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatYmdDisplay(ymd: string): string {
  const v = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  const [y, m, d] = v.split('-');
  return `${d}/${m}/${y}`;
}

function parseYmd(ymd: string): Date | null {
  const v = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function compareYmd(a: string, b: string): number {
  return a.localeCompare(b);
}

function normalizeRange(from: string, to: string): { from: string; to: string } {
  if (!from || !to) return { from, to };
  return compareYmd(from, to) <= 0 ? { from, to } : { from: to, to: from };
}

type CalendarCell = {
  ymd: string;
  day: number;
  inCurrentMonth: boolean;
};

function buildCalendarGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startPad - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const d = new Date(year, month - 1, day);
    cells.push({ ymd: formatYmdLocal(d), day, inCurrentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    cells.push({ ymd: formatYmdLocal(d), day, inCurrentMonth: true });
  }

  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const d = new Date(year, month + 1, nextDay);
    cells.push({ ymd: formatYmdLocal(d), day: nextDay, inCurrentMonth: false });
    nextDay += 1;
  }

  return cells;
}

export type DateRangePickerProps = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** Shown on the trigger when no range is selected yet. */
  emptyLabel?: string;
  className?: string;
  align?: 'left' | 'right';
};

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  from,
  to,
  onChange,
  emptyLabel = 'Select date range',
  className = '',
  align = 'right',
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);

  const range = useMemo(() => normalizeRange(from, to), [from, to]);
  const hasRange = Boolean(range.from && range.to);

  const initialView = useMemo(() => {
    const anchor = parseYmd(range.to) || parseYmd(range.from) || new Date();
    return { year: anchor.getFullYear(), month: anchor.getMonth() };
  }, [range.from, range.to]);

  const [viewYear, setViewYear] = useState(initialView.year);
  const [viewMonth, setViewMonth] = useState(initialView.month);

  useEffect(() => {
    if (!open) return;
    setViewYear(initialView.year);
    setViewMonth(initialView.month);
    setPendingFrom(null);
  }, [open, initialView.year, initialView.month]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, i) => y - 5 + i);
  }, []);

  const grid = useMemo(() => buildCalendarGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const selectionFrom = pendingFrom ?? range.from;
  const selectionTo = pendingFrom ? '' : range.to;
  const hasSelectionSpan = Boolean(selectionFrom && selectionTo);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDayClick = useCallback(
    (ymd: string) => {
      if (!pendingFrom) {
        setPendingFrom(ymd);
        return;
      }
      const next = normalizeRange(pendingFrom, ymd);
      onChange(next.from, next.to);
      setPendingFrom(null);
      setOpen(false);
    },
    [pendingFrom, onChange],
  );

  const triggerLabel = hasRange
    ? `${formatYmdDisplay(range.from)} – ${formatYmdDisplay(range.to)}`
    : pendingFrom
      ? `${formatYmdDisplay(pendingFrom)} – …`
      : emptyLabel;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2 rounded-2xl border border-kauvery-purple/20 bg-white px-2.5 py-2 shadow-inner">
        <span
          className={`min-w-0 flex-1 truncate text-sm font-extrabold tabular-nums ${
            hasRange ? 'text-slate-800' : 'text-slate-500'
          }`}
          title={triggerLabel}
        >
          {triggerLabel}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close calendar' : 'Open calendar'}
          aria-expanded={open}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
            open
              ? 'border-kauvery-purple/40 bg-kauvery-purple text-white shadow-md shadow-purple-900/25'
              : 'border-kauvery-purple/20 bg-kauvery-purple/8 text-kauvery-purple hover:border-kauvery-purple/35 hover:bg-kauvery-purple/12'
          }`}
        >
          <span className="material-icons-round text-[18px]" aria-hidden>
            calendar_month
          </span>
        </button>
      </div>

      {open && (
        <div
          className={`absolute z-50 mt-2 w-[min(100vw-2rem,20.5rem)] rounded-2xl border border-kauvery-purple/15 bg-white p-4 shadow-2xl shadow-kauvery-soft ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          role="dialog"
          aria-label="Choose date range"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                aria-label="Month"
                className="cursor-pointer rounded-lg border-0 bg-transparent py-1 pr-6 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-kauvery-purple/25"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
              <span className="text-slate-400">/</span>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                aria-label="Year"
                className="cursor-pointer rounded-lg border-0 bg-transparent py-1 pr-1 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-kauvery-purple/25"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrevMonth}
                aria-label="Previous month"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-kauvery-purple/30 hover:text-kauvery-purple"
              >
                <span className="material-icons-round text-lg">chevron_left</span>
              </button>
              <button
                type="button"
                onClick={goNextMonth}
                aria-label="Next month"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-kauvery-purple/30 hover:text-kauvery-purple"
              >
                <span className="material-icons-round text-lg">chevron_right</span>
              </button>
            </div>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={`${label}-${i}`}
                className="py-1 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {grid.map((cell) => {
              const inSpan =
                hasSelectionSpan &&
                compareYmd(cell.ymd, selectionFrom) >= 0 &&
                compareYmd(cell.ymd, selectionTo) <= 0;
              const isStart =
                cell.ymd === selectionFrom || (pendingFrom === cell.ymd && !selectionTo);
              const isEnd = cell.ymd === selectionTo;
              const isPendingOnly = pendingFrom === cell.ymd && !selectionTo;

              return (
                <button
                  key={cell.ymd}
                  type="button"
                  onClick={() => handleDayClick(cell.ymd)}
                  className={`relative flex h-9 items-center justify-center p-0 text-sm font-semibold transition ${
                    inSpan && !isStart && !isEnd ? 'bg-[#fce4ec]' : ''
                  } ${isStart && inSpan && !isEnd ? 'bg-[#fce4ec] rounded-l-full' : ''} ${
                    isEnd && inSpan && !isStart ? 'bg-[#fce4ec] rounded-r-full' : ''
                  } ${isStart && isEnd ? '' : ''}`}
                >
                  <span
                    className={`relative z-[1] flex h-8 w-8 items-center justify-center rounded-full ${
                      isStart || isEnd || isPendingOnly
                        ? 'bg-kauvery-pink text-white shadow-md shadow-kauvery-pink/35'
                        : inSpan
                          ? 'text-kauvery-pink'
                          : cell.inCurrentMonth
                            ? 'text-slate-800'
                            : 'text-slate-300'
                    }`}
                  >
                    {cell.day}
                  </span>
                </button>
              );
            })}
          </div>

          {pendingFrom && (
            <p className="mt-3 text-center text-[11px] font-semibold text-slate-500">
              Select end date
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                onChange('', '');
                setPendingFrom(null);
              }}
              className="text-[11px] font-black uppercase tracking-wide text-slate-500 transition hover:text-kauvery-purple"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-kauvery-purple px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-kauvery-violet"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
