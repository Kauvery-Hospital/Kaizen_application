import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

export type SearchableSelectOption = { value: string; label: string };

function matchRank(label: string, value: string, q: string): number {
  const l = label.toLowerCase();
  const v = value.toLowerCase();
  if (l.startsWith(q)) return 0;
  if (v.startsWith(q)) return 1;
  if (l.includes(q)) return 2;
  if (v.includes(q)) return 3;
  return 999;
}

function filterAndSort(options: SearchableSelectOption[], query: string): SearchableSelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  const filtered = options.filter((o) => matchRank(o.label, o.value, q) < 999);
  return [...filtered].sort((a, b) => {
    const ra = matchRank(a.label, a.value, q);
    const rb = matchRank(b.label, b.value, q);
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label);
  });
}

export interface SearchableSelectProps {
  id?: string;
  'aria-label'?: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Prepends value "" with this label (e.g. "All units") */
  emptyOptionLabel?: string;
  disabled?: boolean;
  className?: string;
  /** Merged onto outer wrapper; default input styling still applies unless `inputClassName` is set. */
  listClassName?: string;
  maxListHeightClass?: string;
  variant?: 'light' | 'dark';
  /** When set, replaces default light input classes (use for app-specific shells). */
  inputClassName?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  id: idProp,
  'aria-label': ariaLabel,
  options,
  value,
  onChange,
  placeholder = 'Type to filter…',
  emptyOptionLabel,
  disabled = false,
  className = '',
  listClassName = '',
  maxListHeightClass = 'max-h-56',
  variant = 'light',
  inputClassName,
}) => {
  const uid = useId();
  const listboxId = idProp ? `${idProp}-listbox` : `${uid}-listbox`;
  const inputId = idProp ?? `${uid}-input`;

  const fullOptions = useMemo(() => {
    const rest = options.map((o) => ({ ...o, value: String(o.value) }));
    if (emptyOptionLabel !== undefined) {
      return [{ value: '', label: emptyOptionLabel }, ...rest];
    }
    return rest;
  }, [options, emptyOptionLabel]);

  const selected = useMemo(() => fullOptions.find((o) => o.value === value), [fullOptions, value]);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => filterAndSort(fullOptions, open ? q : ''), [fullOptions, open, q]);

  useEffect(() => {
    if (!open) return;
    if (visible.length === 0) {
      setHighlight(0);
      return;
    }
    const idx = visible.findIndex((o) => o.value === value);
    setHighlight(idx >= 0 ? idx : 0);
  }, [open, visible, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const displayValue = open ? q : (selected?.label ?? '');

  const pick = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
      setQ('');
      inputRef.current?.blur();
    },
    [onChange],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQ('');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => (visible.length === 0 ? 0 : (h + 1) % visible.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => (visible.length === 0 ? 0 : (h - 1 + visible.length) % visible.length));
      return;
    }
    if (e.key === 'Enter') {
      if (open && visible[highlight]) {
        e.preventDefault();
        pick(visible[highlight].value);
      }
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
      setQ('');
    }
  };

  const inputLight =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-gray-900 outline-none focus:border-kauvery-violet focus:ring-2 focus:ring-kauvery-purple/25 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500';
  const inputDark =
    'w-full rounded-xl border border-kauvery-purple/40 bg-kauvery-purple/15 px-2.5 py-2 pr-9 text-sm font-bold text-white outline-none focus:border-kauvery-pink/60 focus:ring-2 focus:ring-kauvery-violet/40 disabled:cursor-not-allowed disabled:opacity-50';

  const inputClasses =
    inputClassName ?? (variant === 'dark' ? inputDark : inputLight);

  const listLight =
    'absolute z-[200] mt-1 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg';
  const listDark =
    'absolute z-[200] mt-1 w-full overflow-auto rounded-xl border border-kauvery-purple/20 bg-white py-1 shadow-xl shadow-kauvery-soft';

  const rowLight = (active: boolean) =>
    `cursor-pointer px-3 py-2 text-sm font-semibold ${active ? 'bg-purple-50 text-kauvery-purple' : 'text-gray-900 hover:bg-gray-50'}`;
  const rowDark = (active: boolean) =>
    `cursor-pointer px-3 py-2 text-sm font-bold ${active ? 'bg-kauvery-purple/15 text-kauvery-purple' : 'text-slate-700 hover:bg-kauvery-purple/8'}`;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={displayValue}
        placeholder={open ? 'Type to filter…' : !selected ? placeholder : undefined}
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setQ('');
        }}
        onKeyDown={onKeyDown}
        className={inputClasses}
      />
      <span
        className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-lg ${
          variant === 'dark' ? 'text-slate-300' : 'text-gray-500'
        }`}
        aria-hidden
      >
        <span className="material-icons-round text-[20px]">expand_more</span>
      </span>

      {open && !disabled && (
        <ul
          id={listboxId}
          role="listbox"
          className={`${variant === 'dark' ? listDark : listLight} ${maxListHeightClass} ${listClassName}`}
        >
          {visible.length === 0 ? (
            <li className="px-3 py-2 text-sm font-semibold text-gray-500">No matches</li>
          ) : (
            visible.map((opt, i) => (
              <li
                key={`${i}-${opt.value}-${opt.label}`}
                role="option"
                aria-selected={i === highlight}
                className={variant === 'dark' ? rowDark(i === highlight) : rowLight(i === highlight)}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(opt.value);
                }}
              >
                {opt.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
