
import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  useImperativeHandle,
} from 'react';
import { flushSync } from 'react-dom';
import { Role, Suggestion } from '../types';
import { appRoleToHodRoleCode } from '../constants/hodDirectory';
import { toPng } from 'html-to-image';
import { SearchableSelect } from './SearchableSelect';

function formatSignatureDisplay(name: string, employeeId: string): string {
  const n = String(name ?? '').trim();
  const id = String(employeeId ?? '').trim();
  if (n && id) return `${n} - ${id}`;
  if (n) return n;
  return id;
}

/** @deprecated use formatSignatureDisplay */
const formatPreparedByDisplay = formatSignatureDisplay;

function namesLooselyMatch(a: string, b: string): boolean {
  const x = String(a ?? '')
    .trim()
    .toLowerCase();
  const y = String(b ?? '')
    .trim()
    .toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}

/** Tries common filenames / folder layouts under `frontend/public/images/` */
const KAUVERY_LOGO_SRC_CANDIDATES = [
  '/images/kauvery_logo.png',
  '/images/kauvery_logo.svg',
  '/images/kauvery_logo.jpg',
  '/images/kauvery_logo.jpeg',
  '/images/kauvery_logo.webp',
  '/images/kauvery_logo/kauvery_logo.png',
  '/images/kauvery_logo/logo.png',
] as const;

const KauveryHeaderLogo: React.FC<{ variant?: 'cell' | 'hero'; className?: string }> = ({
  variant = 'cell',
  className = '',
}) => {
  const [idx, setIdx] = useState(0);
  const wrap =
    variant === 'hero'
      ? 'flex h-full w-full items-center justify-center p-1'
      : 'flex h-full w-full items-center justify-center p-0.5';

  if (idx >= KAUVERY_LOGO_SRC_CANDIDATES.length) {
    return (
      <div
        className={`${wrap} text-[8px] font-black leading-tight text-kauvery-purple text-center ${className}`}
        title="Place logo at public/images/kauvery_logo.png (or .svg / folder kauvery_logo/)"
      >
        Kauvery
      </div>
    );
  }
  return (
    <div className={`${wrap} ${className}`}>
      <img
        src={KAUVERY_LOGO_SRC_CANDIDATES[idx]}
        alt=""
        className="max-h-full max-w-full object-contain select-none"
        onError={() => setIdx((n) => n + 1)}
        draggable={false}
      />
    </div>
  );
};

const HTML_TO_IMAGE_OPTS = {
  cacheBust: true,
  pixelRatio: 2,
  backgroundColor: '#ffffff',
  useCORS: true,
  // html-to-image tries to inline remote fonts/CSS; Google Fonts stylesheets are cross-origin and can throw SecurityError.
  skipFonts: true,
  // Avoid SecurityError when html-to-image tries to read rules from cross-origin stylesheets (e.g. Google Fonts CSS)
  filter: (node: HTMLElement) => {
    // Media elements (especially <video>) can taint the canvas and break exports (toDataURL).
    if (node.tagName === 'VIDEO') return false;
    if (node.tagName === 'LINK') {
      const rel = (node as HTMLLinkElement).rel?.toLowerCase?.() || '';
      const href = ((node as HTMLLinkElement).href || '').toLowerCase();
      if (rel === 'stylesheet' && href.includes('fonts.googleapis.com')) return false;
    }
    return true;
  },
} as const;

const EXPORT_FRAME = { width: 1920, height: 1080 } as const; // 16:9 landscape (sharper in PPT)

/** Slide 1 team photo grid + member rows (aligned with PPTX export). */
const MAX_SLIDE1_TEAM_MEMBERS = 3;

/** Sum of horizontal deployment costs above this (₹) requires Finance signature on Slide 2 */
const FINANCE_APPROVAL_COST_THRESHOLD_INR = 500_000;
/** Finance column (Unit – Head of Finance) is omitted from the slide when total is at or below this */
const SHOW_FINANCE_COLUMN_THRESHOLD_INR = 50_000;

/** Fixed horizontal-deployment cost categories (Slide 2). */
const HORIZONTAL_DEPLOYMENT_COST_LABELS = ['One time', 'Avoidance', 'Recurrence'] as const;

type HorizontalDeploymentCostRow = { item: string; cost: string };

function defaultHorizontalDeploymentCostRows(): HorizontalDeploymentCostRow[] {
  return HORIZONTAL_DEPLOYMENT_COST_LABELS.map((item) => ({ item, cost: '' }));
}

function normalizeHorizontalDeploymentCostRows(input: unknown): HorizontalDeploymentCostRow[] {
  const defaults = defaultHorizontalDeploymentCostRows();
  if (!Array.isArray(input) || input.length === 0) return defaults;

  const incoming = input.map((r) => ({
    item: String((r as { item?: string })?.item ?? '').trim(),
    cost: String((r as { cost?: string })?.cost ?? '').trim(),
  }));

  return HORIZONTAL_DEPLOYMENT_COST_LABELS.map((label, idx) => {
    const key = label.toLowerCase();
    const match =
      incoming.find((r) => r.item.toLowerCase() === key) ??
      incoming.find((r) => {
        const n = r.item.toLowerCase();
        if (label === 'One time') return n.includes('one') && (n.includes('time') || n === 'onetime');
        if (label === 'Avoidance') return n.includes('avoid');
        if (label === 'Recurrence') return n.includes('recur');
        return false;
      }) ??
      incoming[idx];
    return { item: label, cost: match?.cost ?? '' };
  });
}

function sumHorizontalDeploymentCostRowsInr(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  let sum = 0;
  for (const r of rows) {
    const n = Number(String((r as { cost?: string })?.cost ?? '').replace(/,/g, ''));
    if (!Number.isNaN(n) && n >= 0) sum += n;
  }
  return sum;
}

/**
 * Textareas keep a fixed height in the UI (scroll for overflow). html-to-image rasterizes
 * that box only — long text is clipped like a scrollbar view. Before capture, expand each
 * textarea to its full scrollHeight so PPT/PDF shows every line; then restore inline styles.
 */
function expandTextareasForExportCapture(root: HTMLElement): () => void {
  const textareas = Array.from(root.querySelectorAll<HTMLTextAreaElement>('textarea'));
  const backup = textareas.map((el) => ({
    el,
    height: el.style.height,
    minHeight: el.style.minHeight,
    maxHeight: el.style.maxHeight,
    overflow: el.style.overflow,
    overflowY: el.style.overflowY,
  }));

  for (const el of textareas) {
    el.style.minHeight = '0';
    el.style.maxHeight = 'none';
    el.style.overflow = 'hidden';
    el.style.overflowY = 'hidden';
    el.style.height = '0px';
    const full = el.scrollHeight;
    el.style.height = `${Math.max(full, 24)}px`;
  }

  return () => {
    for (const b of backup) {
      b.el.style.height = b.height;
      b.el.style.minHeight = b.minHeight;
      b.el.style.maxHeight = b.maxHeight;
      b.el.style.overflow = b.overflow;
      b.el.style.overflowY = b.overflowY;
    }
  };
}

/** Live UI: stretch each textarea to its content so users do not rely on inner scrollbars. */
function autosizeTextareasInElement(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll('textarea').forEach((node) => {
    const el = node as HTMLTextAreaElement;
    el.style.overflow = 'hidden';
    el.style.overflowY = 'hidden';
    el.style.height = '0px';
    const full = el.scrollHeight;
    el.style.height = `${Math.max(full, 28)}px`;
  });
}

/** Fields inside capture sheets: print-style slate borders, subtle focus, autosize-friendly (resize-none). */
const KTZ_TEXTAREA =
  'w-full border border-slate-400 bg-white text-[11px] text-slate-900 leading-normal resize-none outline-none rounded-sm px-2 py-1.5 box-border focus:border-kauvery-purple focus:ring-1 focus:ring-kauvery-purple/30';
const KTZ_SELECT =
  'w-full border border-slate-400 bg-white rounded-sm px-2 py-1.5 text-xs text-slate-900 font-medium min-h-[2.5rem] box-border focus:border-kauvery-purple focus:ring-1 focus:ring-kauvery-purple/30';
const KTZ_DATE =
  'w-full border border-slate-400 bg-white rounded-sm px-2 py-1.5 text-xs text-slate-900 font-medium min-h-[2.5rem] box-border focus:border-kauvery-purple focus:ring-1 focus:ring-kauvery-purple/30';

/** Per-field character limits on Slide 2 (implementation template). */
const SLIDE2_TEXT_LIMITS = {
  unit: 80,
  area: 100,
  problem: 120,
  howMuch: 150,
  whyWhy: 80,
  rootCause: 250,
  ideaToEliminate: 250,
  counterMeasure: 400,
  standardizationOthers: 150,
  quantitativeResults: 400,
  horizontalDeployment: 400,
  hdItem: 80,
  hdCost: 14,
  signatureEmployeeId: 20,
  signatureName: 60,
} as const;

function clampSlide2Text(value: string, max: number): string {
  return String(value ?? '').slice(0, max);
}

function parseSignatureDisplayInput(raw: string): { name: string; employeeId: string } {
  const s = String(raw ?? '').trim();
  if (!s) return { name: '', employeeId: '' };
  const sep = s.lastIndexOf(' - ');
  if (sep >= 0) {
    return {
      name: clampSlide2Text(s.slice(0, sep).trim(), SLIDE2_TEXT_LIMITS.signatureName),
      employeeId: clampSlide2Text(
        s.slice(sep + 3).trim(),
        SLIDE2_TEXT_LIMITS.signatureEmployeeId,
      ),
    };
  }
  return {
    name: clampSlide2Text(s, SLIDE2_TEXT_LIMITS.signatureName),
    employeeId: '',
  };
}

function employeeIdFromPreparedByInput(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const sep = s.lastIndexOf(' - ');
  if (sep >= 0) {
    return clampSlide2Text(
      s.slice(sep + 3).trim(),
      SLIDE2_TEXT_LIMITS.signatureEmployeeId,
    );
  }
  return clampSlide2Text(s, SLIDE2_TEXT_LIMITS.signatureEmployeeId);
}

const SLIDE2_SIGNATURE_DISPLAY_MAX_LEN =
  SLIDE2_TEXT_LIMITS.signatureName + 3 + SLIDE2_TEXT_LIMITS.signatureEmployeeId;

function Slide2CharCount({ length, max }: { length: number; max: number }) {
  return (
    <div
      className={`text-[9px] text-right tabular-nums leading-none mt-0.5 ${
        length >= max
          ? 'font-bold text-amber-700'
          : length >= Math.floor(max * 0.85)
            ? 'text-slate-500'
            : 'text-slate-400'
      }`}
      aria-live="polite"
    >
      {length}/{max}
    </div>
  );
}

type Slide2TextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> & {
  limit: number;
  value: string;
  onValueChange: (value: string) => void;
};

function Slide2Textarea({ limit, value, onValueChange, className, ...rest }: Slide2TextareaProps) {
  const text = String(value ?? '');
  return (
    <div className="flex flex-col min-h-0 w-full">
      <textarea
        {...rest}
        maxLength={limit}
        className={className}
        value={text}
        onChange={(e) => onValueChange(clampSlide2Text(e.target.value, limit))}
      />
      <Slide2CharCount length={text.length} max={limit} />
    </div>
  );
}

type Slide2InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  limit: number;
  value: string;
  onValueChange: (value: string) => void;
  showCount?: boolean;
};

function Slide2Input({
  limit,
  value,
  onValueChange,
  className,
  showCount = true,
  ...rest
}: Slide2InputProps) {
  const text = String(value ?? '');
  return (
    <div className="w-full">
      <input
        {...rest}
        maxLength={limit}
        className={className}
        value={text}
        onChange={(e) => onValueChange(clampSlide2Text(e.target.value, limit))}
      />
      {showCount ? <Slide2CharCount length={text.length} max={limit} /> : null}
    </div>
  );
}

type Slide2PreparedByFieldProps = {
  employeeId: string;
  name: string;
  disabled?: boolean;
  onDraftChange: (employeeId: string) => void;
  onLookup: (employeeId: string) => void | Promise<void>;
};

/** Single Prepared By field: type Emp. No → Enter → shows "Name - Emp. No". */
function Slide2PreparedByField({
  employeeId,
  name,
  disabled,
  onDraftChange,
  onLookup,
}: Slide2PreparedByFieldProps) {
  const resolved = Boolean(String(name ?? '').trim() && String(employeeId ?? '').trim());
  const fieldValue = resolved
    ? formatPreparedByDisplay(name, employeeId)
    : String(employeeId ?? '');
  const maxLen = resolved
    ? SLIDE2_TEXT_LIMITS.signatureName +
      3 +
      SLIDE2_TEXT_LIMITS.signatureEmployeeId
    : SLIDE2_TEXT_LIMITS.signatureEmployeeId;

  return (
    <input
      type="text"
      disabled={disabled}
      maxLength={maxLen}
      className="w-full border border-slate-400 bg-white rounded-sm px-2 py-1.5 text-[11px] text-slate-900 font-semibold min-h-[2rem] box-border focus:border-kauvery-purple focus:ring-1 focus:ring-kauvery-purple/30"
      placeholder="Emp. No (press Enter)"
      data-prepared-by-lookup="true"
      value={fieldValue}
      onChange={(e) => {
        const id = employeeIdFromPreparedByInput(e.target.value);
        onDraftChange(id);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const id = employeeIdFromPreparedByInput(e.currentTarget.value);
        void onLookup(id);
      }}
    />
  );
}

type Slide2SignatureDisplayFieldProps = {
  name: string;
  employeeId: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onChange: (name: string, employeeId: string) => void;
};

/** Auto-filled or editable signature: "Name - Emp. No" when both are known. */
function Slide2SignatureDisplayField({
  name,
  employeeId,
  placeholder = 'Name - Emp. No',
  disabled,
  className = '',
  onChange,
}: Slide2SignatureDisplayFieldProps) {
  return (
    <input
      type="text"
      disabled={disabled}
      maxLength={SLIDE2_SIGNATURE_DISPLAY_MAX_LEN}
      className={`w-full border border-slate-400 bg-slate-50 rounded-sm px-2 py-1.5 text-[11px] text-slate-900 font-semibold min-h-[2rem] box-border focus:border-kauvery-purple focus:ring-1 focus:ring-kauvery-purple/30 ${className}`}
      placeholder={placeholder}
      value={formatSignatureDisplay(name, employeeId)}
      onChange={(e) => {
        const parsed = parseSignatureDisplayInput(e.target.value);
        onChange(parsed.name, parsed.employeeId);
      }}
    />
  );
}

function appendSlide2TextLimitErrors(fd: any, errs: string[], whyWhyVisibleCount: number): void {
  const L = SLIDE2_TEXT_LIMITS;
  const over = (label: string, val: unknown, max: number) => {
    if (String(val ?? '').length > max) {
      errs.push(`Slide 2 — ${label} must be at most ${max} characters.`);
    }
  };
  over('Unit', fd.unit, L.unit);
  over('Area / location', fd.area, L.area);
  const pr = fd.problem || {};
  over('Problem — What', pr.what, L.problem);
  over('Problem — Where', pr.where, L.problem);
  over('Problem — When', pr.when, L.problem);
  over('Problem — How', pr.how, L.problem);
  over('Present status — How Much', fd.howMuch, L.howMuch);
  const analysis = fd.analysis || {};
  for (let n = 1; n <= whyWhyVisibleCount; n++) {
    over(`Why-Why #${n}`, (analysis as any)[`why${n}`], L.whyWhy);
  }
  over('Root cause', analysis.rootCause, L.rootCause);
  over('Idea to eliminate', fd.ideaToEliminate, L.ideaToEliminate);
  over('Counter measure', fd.counterMeasure, L.counterMeasure);
  const std = fd.standardization || {};
  if (std.others) over('Standardization — Others', std.othersDescription, L.standardizationOthers);
  over('Quantitative results', fd.quantitativeResults, L.quantitativeResults);
  over('Horizontal deployment', fd.horizontalDeployment, L.horizontalDeployment);
  const hdRows = Array.isArray(fd.horizontalDeploymentCostRows)
    ? (fd.horizontalDeploymentCostRows as { item?: string; cost?: string }[])
    : [];
  normalizeHorizontalDeploymentCostRows(hdRows).forEach((r) => {
    over(`Horizontal deployment — ${r.item} cost`, r.cost, L.hdCost);
  });
  over('Prepared By — Emp. No', fd.templateSigPreparedByEmployeeId, L.signatureEmployeeId);
  over('Prepared By name', fd.templateSigPreparedBy, L.signatureName);
  over('Validated By (Dept / HOD) — Emp. No', fd.templateSigValidatedDeptHodEmployeeId, L.signatureEmployeeId);
  over('Validated By (Dept / HOD) name', fd.templateSigValidatedDeptHod, L.signatureName);
  over('Validated By (Finance) — Emp. No', fd.templateSigValidatedFinanceEmployeeId, L.signatureEmployeeId);
  over('Validated By (Finance) name', fd.templateSigValidatedFinance, L.signatureName);
  over('Approved By — Emp. No', fd.templateSigApprovedOpsHeadEmployeeId, L.signatureEmployeeId);
  over('Approved By name', fd.templateSigApprovedOpsHead, L.signatureName);
}

/** Sheet 2 PQCDSEM row: green = primary, yellow = secondary (stored in expectedBenefits JSON). */
type PqcdsemLevel = 'none' | 'primary' | 'secondary';

function readPqcdsemLevel(raw: unknown): PqcdsemLevel {
  if (raw === 'primary' || raw === 'secondary') return raw;
  if (raw === true) return 'primary';
  return 'none';
}

function nextPqcdsemLevel(current: PqcdsemLevel): PqcdsemLevel {
  if (current === 'none') return 'primary';
  if (current === 'primary') return 'secondary';
  return 'none';
}

function serializePqcdsemLevel(level: PqcdsemLevel): boolean | 'primary' | 'secondary' {
  if (level === 'none') return false;
  if (level === 'primary') return 'primary';
  return 'secondary';
}

/** Idea submission chips (same dimensions as template). */
const IDEA_SUBMISSION_PQCDSEM_KEYS = [
  'productivity',
  'quality',
  'cost',
  'delivery',
  'safety',
  'morale',
  'environment',
] as const;

const PQCDSEM_TEMPLATE_KEYS = [
  'productivity',
  'quality',
  'cost',
  'delivery',
  'safety',
  'morale',
  'environment',
] as const;

function countPqcdsemTemplateActiveDims(
  benefits: Record<string, unknown> | undefined | null,
): number {
  let n = 0;
  for (const k of PQCDSEM_TEMPLATE_KEYS) {
    if (readPqcdsemLevel(benefits?.[k]) !== 'none') n++;
  }
  return n;
}

async function captureNodeAsLandscapePng(node: HTMLElement): Promise<string | null> {
  // Capture the template page into a fixed 16:9 landscape frame.
  // We scale the DOM to FIT the frame (contain) so all content is visible and zoom is consistent across sheets.
  const restoreTextareas = expandTextareasForExportCapture(node);
  try {
    void node.offsetHeight;
    const w = Math.max(1, node.scrollWidth || node.clientWidth || 1);
    const h = Math.max(1, node.scrollHeight || node.clientHeight || 1);
    const scale = Math.min(EXPORT_FRAME.width / w, EXPORT_FRAME.height / h);
    const dx = (EXPORT_FRAME.width - w * scale) / 2;
    const dy = (EXPORT_FRAME.height - h * scale) / 2;

    const png = await toPng(node, {
      ...(HTML_TO_IMAGE_OPTS as any),
      width: EXPORT_FRAME.width,
      height: EXPORT_FRAME.height,
      style: {
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        transformOrigin: 'top left',
        width: `${w}px`,
        height: `${h}px`,
        backgroundColor: '#ffffff',
      },
    } as any);
    return png || null;
  } finally {
    restoreTextareas();
  }
}

/** Image fills the frame (object-cover). Optional native corner resize for team photo etc. */
const ResizableImageFrame: React.FC<{
  src: string;
  alt?: string;
  className?: string;
  onImageClick?: () => void;
  /** Before/After template slides use fixed frames (no resize) */
  resizable?: boolean;
}> = ({ src, alt = '', className = '', onImageClick, resizable = true }) => (
  <div
    className={`relative inline-block max-w-full align-middle rounded border border-gray-300 bg-gray-200 shadow-sm w-64 min-w-[96px] h-52 min-h-[100px] max-h-[85vh] ${resizable ? 'overflow-auto resize' : 'overflow-hidden'} ${onImageClick ? 'cursor-pointer' : ''} ${className}`}
    title={
      onImageClick
        ? resizable
          ? 'Drag corner to resize · Click to replace'
          : 'Click to replace'
        : resizable
          ? 'Drag corner to resize'
          : undefined
    }
    role={onImageClick ? 'button' : undefined}
    tabIndex={onImageClick ? 0 : undefined}
    aria-label={onImageClick ? 'Choose another image' : undefined}
    onClick={onImageClick}
    onKeyDown={
      onImageClick
        ? e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onImageClick();
            }
          }
        : undefined
    }
  >
    <img
      src={src}
      alt={alt}
      className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover select-none"
      draggable={false}
    />
  </div>
);

interface SuggestionFormProps {
  initialData?: Partial<Suggestion>;
  mode: 'create' | 'implement';
  unitOptions?: { id: string; code: string; name: string }[];
  departmentOptions?: { id: string; name: string }[];
  apiBase?: string;
  accessToken?: string;
  lockUnitDepartment?: boolean;
  onSubmit: (
    data: Partial<Suggestion>,
    meta?: { ideaFiles?: File[] },
  ) => void;
  onCancel: () => void;
  onSaveDraft?: (data: Partial<Suggestion>) => Promise<void> | void;
  isTemplatePreview?: boolean;
  editedFieldKeys?: string[];
}

export type SuggestionFormHandle = {
  renderTemplatePngSlides: () => Promise<string[]>;
};

export const SuggestionForm = React.forwardRef<SuggestionFormHandle, SuggestionFormProps>(({
  initialData,
  mode,
  unitOptions = [],
  departmentOptions = [],
  apiBase,
  accessToken,
  lockUnitDepartment = false,
  onSubmit,
  onCancel,
  onSaveDraft,
  isTemplatePreview = false,
  editedFieldKeys = [],
}, ref) => {
  type TeamMemberRow = {
    employeeId: string;
    name: string;
    unit: string;
    department: string;
  };
  type ResultKpi = {
    id: string;
    title: string;
    metricLabel: string;
    before: string | number;
    after: string | number;
    resultNote: string;
    higherIsBetter?: boolean;
  };

  const [formData, setFormData] = useState<any>({
    theme: '',
    unit: '',
    area: '',
    department: '',
    description: '',
    expectedBenefits: {
      productivity: false, quality: false, cost: false, delivery: false,
      safety: false, environment: false, morale: false
    },
    employeeName: '',
    // Implementation Fields (Full Kaizen)
    problem: { what: '', where: '', when: '', who: '', how: '' },
    analysis: { why1: '', why2: '', why3: '', why4: '', why5: '', rootCause: '' },
    counterMeasure: '',
    ideaToEliminate: '',
    beforeDescription: '',
    afterDescription: '',
    standardization: { opl: false, sop: false, manual: false, others: false, othersDescription: '' },
    horizontalDeployment: '',
    horizontalDeploymentCostRows: defaultHorizontalDeploymentCostRows(),
    quantitativeResults: '',
    howMuch: '',
    teamMembers: '',
    teamMemberRows: [{ employeeId: '', name: '', unit: '', department: '' }],
    kaizenNumber: '',
    empNo: '',
    category: 'Clinical',
    startDate: '',
    completionDate: '',
    preparedBy: '',
    validatedBy: '',
    approvedBy: '',
    templateSigPreparedByEmployeeId: '',
    templateSigPreparedBy: '',
    templateSigReportingTo: '',
    templateSigValidatedDeptHodEmployeeId: '',
    templateSigValidatedDeptHod: '',
    templateSigValidatedFinanceEmployeeId: '',
    templateSigValidatedFinance: '',
    templateSigApprovedOpsHeadEmployeeId: '',
    templateSigApprovedOpsHead: '',
    result1: '',
    result2: '',
    result3: '',
    result1Before: '',
    result1After: '',
    result2Before: '',
    result2After: '',
    result3Before: '',
    result3After: '',
    templateUploads: {
      images: [],
      documents: [],
      beforeImages: [] as string[],
      afterImages: [] as string[],
      processBeforeFiles: [] as string[],
      processAfterFiles: [] as string[],
    },
    teamPhoto: '',
    teamPhotoPath: '',
    teamMemberPhotoPaths: {} as Record<string, string>,
    processBeforeVideoPath: '',
    processAfterVideoPath: '',
    processBeforeVideoCaption: '',
    processAfterVideoCaption: '',
    slide3BeforeImagePath: '',
    slide3AfterImagePath: '',
    beforeAfterSlides: [{ beforeImagePath: '', afterImagePath: '', beforeCaption: '', afterCaption: '' }] as Array<{
      beforeImagePath: string;
      afterImagePath: string;
      beforeCaption: string;
      afterCaption: string;
    }>,
    processVideoSlides: [
      {
        processBeforeVideoPath: '',
        processAfterVideoPath: '',
        processBeforeVideoCaption: '',
        processAfterVideoCaption: '',
      },
    ] as Array<{
      processBeforeVideoPath: string;
      processAfterVideoPath: string;
      processBeforeVideoCaption: string;
      processAfterVideoCaption: string;
    }>,
    resultKpis: [
      {
        id: `KPI-${Date.now()}`,
        title: '',
        metricLabel: '',
        before: '',
        after: '',
        resultNote: '',
        higherIsBetter: false,
      },
    ] as ResultKpi[],
    /** Results slide: how many KPI graphs show side-by-side (1–3). Persisted with draft. */
    resultsGraphDisplayCount: 1 as 1 | 2 | 3,
  });

  /** Sheet 2 Why–Why: ≥3 rows; + adds up to 5 (declared before effects that sync from draft) */
  const [whyWhyVisibleCount, setWhyWhyVisibleCount] = useState<3 | 4 | 5>(3);

  const [draftToast, setDraftToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isDraftSaving, setIsDraftSaving] = useState(false);

  /** Legacy single-team-photo preview (kept for older records) */
  const [teamPhotoPreviewUrl, setTeamPhotoPreviewUrl] = useState<string | null>(null);
  const [beforeImagePreviewUrls, setBeforeImagePreviewUrls] = useState<string[]>([]);
  const [afterImagePreviewUrls, setAfterImagePreviewUrls] = useState<string[]>([]);
  type ProcessPreviewItem = { name: string; isImage: boolean; url?: string };
  const [processBeforePreviews, setProcessBeforePreviews] = useState<ProcessPreviewItem[]>([]);
  const [processAfterPreviews, setProcessAfterPreviews] = useState<ProcessPreviewItem[]>([]);

  const previewUrlRegistry = useRef<Set<string>>(new Set());
  const formDataRef = useRef(formData);
  formDataRef.current = formData;
  const preparedByBootstrappedRef = useRef(false);
  const preparedByLookupSeqRef = useRef(0);
  const teamPhotoInputRef = useRef<HTMLInputElement>(null);
  const beforeImageInputRef = useRef<HTMLInputElement>(null);
  const afterImageInputRef = useRef<HTMLInputElement>(null);
  const processBeforeVideoInputRef = useRef<HTMLInputElement>(null);
  const processAfterVideoInputRef = useRef<HTMLInputElement>(null);
  const ideaAttachmentInputRef = useRef<HTMLInputElement>(null);
  const [ideaSubmissionFiles, setIdeaSubmissionFiles] = useState<File[]>([]);

  const registerPreviewUrl = useCallback((url: string) => {
    previewUrlRegistry.current.add(url);
  }, []);

  const revokePreviewUrl = useCallback((url: string) => {
    if (previewUrlRegistry.current.has(url)) {
      URL.revokeObjectURL(url);
      previewUrlRegistry.current.delete(url);
    }
  }, []);

  const revokeAllPreviewUrls = useCallback(() => {
    previewUrlRegistry.current.forEach(u => URL.revokeObjectURL(u));
    previewUrlRegistry.current.clear();
  }, []);

  useEffect(() => () => revokeAllPreviewUrls(), [revokeAllPreviewUrls]);

  const isImageFile = (file: File) => file.type.startsWith('image/');

  useEffect(() => {
    if (initialData) {
      const draft =
        mode === 'implement' && (initialData as any)?.implementationDraft
          ? (initialData as any).implementationDraft
          : null;
      setFormData((prev: any) => {
        const merged = { ...prev, ...initialData, ...(draft || {}) };
        const basIsArray = Array.isArray((merged as any).beforeAfterSlides);
        const bas = basIsArray ? ((merged as any).beforeAfterSlides as any[]) : [];
        if (!basIsArray) {
          (merged as any).beforeAfterSlides = [
            {
              beforeImagePath: String((merged as any).slide3BeforeImagePath || '').trim(),
              afterImagePath: String((merged as any).slide3AfterImagePath || '').trim(),
              beforeCaption: '',
              afterCaption: '',
            },
          ];
        } else {
          (merged as any).beforeAfterSlides = bas.map((row: any) => ({
            beforeImagePath: String(row?.beforeImagePath ?? '').trim(),
            afterImagePath: String(row?.afterImagePath ?? '').trim(),
            beforeCaption: String(row?.beforeCaption ?? '').trim(),
            afterCaption: String(row?.afterCaption ?? '').trim(),
          }));
        }

        const pvsIsArray = Array.isArray((merged as any).processVideoSlides);
        const pvsIn = pvsIsArray ? ((merged as any).processVideoSlides as any[]) : [];
        if (!pvsIsArray) {
          (merged as any).processVideoSlides = [
            {
              processBeforeVideoPath: String((merged as any).processBeforeVideoPath || '').trim(),
              processAfterVideoPath: String((merged as any).processAfterVideoPath || '').trim(),
              processBeforeVideoCaption: String((merged as any).processBeforeVideoCaption || '').trim(),
              processAfterVideoCaption: String((merged as any).processAfterVideoCaption || '').trim(),
            },
          ];
        } else {
          (merged as any).processVideoSlides = pvsIn.map((row: any) => ({
            processBeforeVideoPath: String(row?.processBeforeVideoPath ?? (merged as any).processBeforeVideoPath ?? '').trim(),
            processAfterVideoPath: String(row?.processAfterVideoPath ?? (merged as any).processAfterVideoPath ?? '').trim(),
            processBeforeVideoCaption: String(row?.processBeforeVideoCaption ?? '').trim(),
            processAfterVideoCaption: String(row?.processAfterVideoCaption ?? '').trim(),
          }));
        }
        const p0 = ((merged as any).processVideoSlides as any[])?.[0];
        (merged as any).processBeforeVideoPath = String(p0?.processBeforeVideoPath || '');
        (merged as any).processAfterVideoPath = String(p0?.processAfterVideoPath || '');

        const listRaw: ResultKpi[] = Array.isArray(merged.resultKpis) ? merged.resultKpis : [];
        const fromLegacy: ResultKpi[] = [
          {
            id: 'KPI-1',
            title: listRaw[0]?.title ?? 'Hand injury reduced',
            metricLabel: listRaw[0]?.metricLabel ?? 'No. of Hand Injury',
            before: listRaw[0]?.before ?? merged.result1Before ?? '',
            after: listRaw[0]?.after ?? merged.result1After ?? '',
            resultNote: listRaw[0]?.resultNote ?? merged.result1 ?? '',
            higherIsBetter: Boolean(listRaw[0]?.higherIsBetter) ?? false,
          },
          {
            id: 'KPI-2',
            title: listRaw[1]?.title ?? 'Patient shifting time reduced',
            metricLabel: listRaw[1]?.metricLabel ?? 'Time in Minutes',
            before: listRaw[1]?.before ?? merged.result2Before ?? '',
            after: listRaw[1]?.after ?? merged.result2After ?? '',
            resultNote: listRaw[1]?.resultNote ?? merged.result2 ?? '',
            higherIsBetter: Boolean(listRaw[1]?.higherIsBetter) ?? false,
          },
          {
            id: 'KPI-3',
            title: listRaw[2]?.title ?? 'Cost reduced',
            metricLabel: listRaw[2]?.metricLabel ?? 'In ₹',
            before: listRaw[2]?.before ?? merged.result3Before ?? '',
            after: listRaw[2]?.after ?? merged.result3After ?? '',
            resultNote: listRaw[2]?.resultNote ?? merged.result3 ?? '',
            higherIsBetter: Boolean(listRaw[2]?.higherIsBetter) ?? false,
          },
        ];
        if (listRaw.length > 3) {
          let extended = listRaw.map((k, idx) => ({
            id: (k.id || `KPI-${idx + 1}`).toString(),
            title: (k.title ?? '').toString(),
            metricLabel: (k.metricLabel ?? '').toString(),
            before: k.before ?? '',
            after: k.after ?? '',
            resultNote: (k.resultNote ?? '').toString(),
            higherIsBetter: Boolean(k.higherIsBetter),
          }));
          while (extended.length % 3 !== 0) {
            extended.push({
              id: `KPI-${Date.now()}-${extended.length}`,
              title: '',
              metricLabel: '',
              before: '',
              after: '',
              resultNote: '',
              higherIsBetter: false,
            });
          }
          merged.resultKpis = extended;
        } else {
          merged.resultKpis = fromLegacy;
        }

        const rgdRaw = Number((merged as any).resultsGraphDisplayCount);
        (merged as any).resultsGraphDisplayCount =
          rgdRaw === 2 || rgdRaw === 3 ? rgdRaw : 1;

        (merged as any).horizontalDeploymentCostRows = normalizeHorizontalDeploymentCostRows(
          (merged as any).horizontalDeploymentCostRows,
        );

        return merged;
      });

      const draftTeamPhotoPath = (draft as any)?.teamPhotoPath;
      const directTeamPhotoPath = (initialData as any)?.teamPhotoPath;
      const rel = (draftTeamPhotoPath || directTeamPhotoPath || '').toString().trim();
      if (rel && apiBase) {
        setTeamPhotoPreviewUrl(`${apiBase}/kaizen-files/${rel}`);
      }

      // Restore slide-3 Before/After images if saved in draft / suggestion.
      const ba0 =
        (draft as any)?.beforeAfterSlides?.[0] ||
        (initialData as any)?.beforeAfterSlides?.[0] ||
        null;
      const b3 = String(
        ba0?.beforeImagePath ||
          (draft as any)?.slide3BeforeImagePath ||
          (initialData as any)?.slide3BeforeImagePath ||
          '',
      ).trim();
      const a3 = String(
        ba0?.afterImagePath ||
          (draft as any)?.slide3AfterImagePath ||
          (initialData as any)?.slide3AfterImagePath ||
          '',
      ).trim();
      if (apiBase) {
        if (b3) setBeforeImagePreviewUrls([`${apiBase}/kaizen-files/${b3}`]);
        if (a3) setAfterImagePreviewUrls([`${apiBase}/kaizen-files/${a3}`]);
      }
    }
  }, [initialData, mode, apiBase]);

  useEffect(() => {
    if (!initialData || mode === 'create') return;
    const draft =
      mode === 'implement' && (initialData as any)?.implementationDraft
        ? (initialData as any).implementationDraft
        : null;
    const a = draft?.analysis ?? (initialData as any)?.analysis;
    if (!a) {
      setWhyWhyVisibleCount(3);
      return;
    }
    const w4 = String(a.why4 ?? '').trim();
    const w5 = String(a.why5 ?? '').trim();
    if (w5) setWhyWhyVisibleCount(5);
    else if (w4) setWhyWhyVisibleCount(4);
    else setWhyWhyVisibleCount(3);
  }, [initialData, mode]);

  const uploadBeforeAfterImage = async (
    slideIdx: number,
    side: 'before' | 'after',
    files: FileList | null,
  ) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!apiBase || !accessToken) return;
    if (!file.type.startsWith('image/')) return;

    const implCode =
      String(
        formData.assignedImplementerCode ||
          (initialData as any)?.assignedImplementerCode ||
          (initialData as any)?.empNo ||
          'IMG',
      ).trim();
    const prefix = `${implCode}_${side}_before_after_${slideIdx + 1}`;

    // delete previous if exists
    const bas = Array.isArray((formData as any).beforeAfterSlides)
      ? ((formData as any).beforeAfterSlides as any[])
      : [];
    const prevPath = String(
      side === 'before' ? bas?.[slideIdx]?.beforeImagePath || '' : bas?.[slideIdx]?.afterImagePath || '',
    ).trim();
    if (prevPath) {
      try {
        await fetch(
          `${apiBase}/attachments/kaizen-file?path=${encodeURIComponent(prevPath)}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
        );
      } catch {}
    }

    const fd = new FormData();
    fd.append('files', file);
    const res = await fetch(
      `${apiBase}/attachments/kaizen-template?prefix=${encodeURIComponent(prefix)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: fd },
    );
    if (!res.ok) return;
    const out = (await res.json()) as { filePaths?: string[] };
    const rel = out?.filePaths?.[0];
    if (!rel) return;

    setFormData((prev: any) => {
      const list = Array.isArray(prev.beforeAfterSlides) ? [...prev.beforeAfterSlides] : [];
      while (list.length <= slideIdx)
        list.push({ beforeImagePath: '', afterImagePath: '', beforeCaption: '', afterCaption: '' });
      const row = list[slideIdx] || { beforeImagePath: '', afterImagePath: '', beforeCaption: '', afterCaption: '' };
      list[slideIdx] = side === 'before' ? { ...row, beforeImagePath: rel } : { ...row, afterImagePath: rel };

      const legacyPatch =
        slideIdx === 0
          ? side === 'before'
            ? { slide3BeforeImagePath: rel }
            : { slide3AfterImagePath: rel }
          : {};

      return { ...prev, beforeAfterSlides: list, ...legacyPatch };
    });
    // Preview URLs refresh via effect when active BA slide / paths change.
  };

  // (Removed) "Additional slides" concept.

  useEffect(() => {
    // If draft had empty/undefined rows, normalize to 1 empty row for UX
    setFormData((prev: any) => {
      const rows = Array.isArray(prev?.teamMemberRows) ? prev.teamMemberRows : [];
      if (rows.length) return prev;
      return { ...prev, teamMemberRows: [{ employeeId: '', name: '', unit: '', department: '' }] };
    });
  }, []);

  const handleNestedChange = (section: string, field: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  /** Idea phase: exactly one PQCDSEM dimension (boolean true), or none unchecked. */
  const handleIdeaPqcdsemExclusiveChange = useCallback(
    (key: (typeof IDEA_SUBMISSION_PQCDSEM_KEYS)[number], checked: boolean) => {
      setFormData((prev: any) => {
        const nextEb = { ...(prev.expectedBenefits || {}) } as Record<string, boolean | string>;
        if (checked) {
          for (const k of IDEA_SUBMISSION_PQCDSEM_KEYS) {
            nextEb[k] = k === key;
          }
        } else {
          nextEb[key] = false;
        }
        return { ...prev, expectedBenefits: nextEb };
      });
    },
    [],
  );

  /** Kaizen template sheet: at most two dimensions highlighted (green/yellow); cycle within each cell. */
  const handlePqcdsemTemplateCellClick = useCallback((mapKey: (typeof PQCDSEM_TEMPLATE_KEYS)[number]) => {
    setFormData((prev: any) => {
      const eb = { ...(prev.expectedBenefits || {}) } as Record<string, boolean | string>;
      const current = readPqcdsemLevel(eb[mapKey]);
      const next = nextPqcdsemLevel(current);
      if (current === 'none' && next === 'primary') {
        let others = 0;
        for (const k of PQCDSEM_TEMPLATE_KEYS) {
          if (k === mapKey) continue;
          if (readPqcdsemLevel(eb[k]) !== 'none') others++;
        }
        if (others >= 2) return prev;
      }
      return {
        ...prev,
        expectedBenefits: {
          ...eb,
          [mapKey]: serializePqcdsemLevel(next),
        },
      };
    });
  }, []);

  const addWhyWhyRow = () => {
    setWhyWhyVisibleCount((c) => (c < 5 ? ((c + 1) as 3 | 4 | 5) : c));
  };

  const removeLastWhyWhyRow = () => {
    setWhyWhyVisibleCount((c) => {
      if (c <= 3) return c;
      const next = (c - 1) as 3 | 4 | 5;
      setFormData((prev: any) => ({
        ...prev,
        analysis: {
          ...prev.analysis,
          ...(c === 5 ? { why5: '' } : { why4: '' }),
        },
      }));
      return next;
    });
  };

  const handleTeamMemberPhotoUpload = async (
    employeeIdRaw: string,
    files: FileList | null,
  ) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!apiBase || !accessToken) return;

    const employeeId = employeeIdRaw.trim();
    if (!employeeId) return;

    // Delete previous uploaded file for this member if any (idempotent)
    const prevPath = (
      (formData.teamMemberPhotoPaths?.[employeeId] as string | undefined) || ''
    )
      .toString()
      .trim();
    if (prevPath) {
      try {
        await fetch(
          `${apiBase}/attachments/kaizen-file?path=${encodeURIComponent(prevPath)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
      } catch {
        // ignore
      }
    }

    const fd = new FormData();
    fd.append('files', file);
    const res = await fetch(
      `${apiBase}/attachments/kaizen-template?prefix=${encodeURIComponent(employeeId)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      },
    );
    if (!res.ok) return;
    const out = (await res.json()) as { filePaths?: string[] };
    const rel = out?.filePaths?.[0];
    if (!rel) return;

    setFormData((prev: any) => ({
      ...prev,
      teamMemberPhotoPaths: {
        ...(prev.teamMemberPhotoPaths || {}),
        [employeeId]: rel,
      },
    }));
  };

  // (removed) group photo upload

  const handleProcessVideoUpload = async (
    slideIdx: number,
    side: 'before' | 'after',
    files: FileList | null,
  ) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!apiBase || !accessToken) return;

    const bas = Array.isArray((formData as any).processVideoSlides)
      ? ((formData as any).processVideoSlides as any[])
      : [];
    const row = bas[slideIdx] || {};
    const prevPath = String(
      side === 'before'
        ? row.processBeforeVideoPath || ''
        : row.processAfterVideoPath || '',
    ).trim();
    if (prevPath) {
      try {
        await fetch(
          `${apiBase}/attachments/kaizen-file?path=${encodeURIComponent(prevPath)}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
        );
      } catch {}
    }

    const prefixBase =
      (formData.assignedImplementerCode ||
        (initialData as any)?.assignedImplementerCode ||
        (initialData as any)?.empNo ||
        'VIDEO') as string;
    const prefix = `${String(prefixBase).trim()}_${side}_video_${slideIdx + 1}`;

    const fd = new FormData();
    fd.append('files', file);
    const res = await fetch(
      `${apiBase}/attachments/kaizen-template?prefix=${encodeURIComponent(prefix)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: fd },
    );
    if (!res.ok) return;
    const out = (await res.json()) as { filePaths?: string[] };
    const rel = out?.filePaths?.[0];
    if (!rel) return;

    setFormData((prev: any) => {
      const list = Array.isArray(prev.processVideoSlides) ? [...prev.processVideoSlides] : [];
      while (list.length <= slideIdx) {
        list.push({
          processBeforeVideoPath: '',
          processAfterVideoPath: '',
          processBeforeVideoCaption: '',
          processAfterVideoCaption: '',
        });
      }
      const r = list[slideIdx] || {
        processBeforeVideoPath: '',
        processAfterVideoPath: '',
        processBeforeVideoCaption: '',
        processAfterVideoCaption: '',
      };
      list[slideIdx] =
        side === 'before'
          ? { ...r, processBeforeVideoPath: rel }
          : { ...r, processAfterVideoPath: rel };
      const next: any = { ...prev, processVideoSlides: list };
      if (slideIdx === 0) {
        next.processBeforeVideoPath = list[0].processBeforeVideoPath;
        next.processAfterVideoPath = list[0].processAfterVideoPath;
      }
      return next;
    });
  };

  const handleBeforeImagesUpload = (files: FileList | null) => {
    const idx = Math.max(0, currentSheet - 3);
    void uploadBeforeAfterImage(idx, 'before', files);
  };

  const handleAfterImagesUpload = (files: FileList | null) => {
    const idx = Math.max(0, currentSheet - 3);
    void uploadBeforeAfterImage(idx, 'after', files);
  };

  const handleProcessFilesUpload = (side: 'before' | 'after', files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const items: ProcessPreviewItem[] = list.map(file => {
      if (isImageFile(file)) {
        const url = URL.createObjectURL(file);
        registerPreviewUrl(url);
        return { name: file.name, isImage: true, url };
      }
      return { name: file.name, isImage: false };
    });
    if (side === 'before') {
      processBeforePreviews.forEach(p => {
        if (p.url) revokePreviewUrl(p.url);
      });
      setProcessBeforePreviews(items);
      setFormData((prev: any) => ({
        ...prev,
        templateUploads: {
          ...(prev.templateUploads || { images: [], documents: [] }),
          processBeforeFiles: list.map(f => f.name),
        },
      }));
    } else {
      processAfterPreviews.forEach(p => {
        if (p.url) revokePreviewUrl(p.url);
      });
      setProcessAfterPreviews(items);
      setFormData((prev: any) => ({
        ...prev,
        templateUploads: {
          ...(prev.templateUploads || { images: [], documents: [] }),
          processAfterFiles: list.map(f => f.name),
        },
      }));
    }
  };

  const isCreateMode = mode === 'create';
  const [currentSheet, setCurrentSheet] = useState(1);
  const resultsGraphCount = useMemo((): 1 | 2 | 3 => {
    const n = Number(formData.resultsGraphDisplayCount);
    if (n === 2) return 2;
    if (n === 3) return 3;
    return 1;
  }, [formData.resultsGraphDisplayCount]);
  const beforeAfterCount = Array.isArray((formData as any).beforeAfterSlides)
    ? ((formData as any).beforeAfterSlides as any[]).length
    : 0;
  const processVideoSlidesList = Array.isArray((formData as any).processVideoSlides)
    ? ((formData as any).processVideoSlides as {
        processBeforeVideoPath: string;
        processAfterVideoPath: string;
        processBeforeVideoCaption: string;
        processAfterVideoCaption: string;
      }[])
    : [];
  const processVideoCount = processVideoSlidesList.length;
  /** Sheet indices: 1–2 fixed; 3…(2+N) Before/After; Np process video; Nr result pages (×3 KPIs). */
  const lastBaSheet = 2 + beforeAfterCount;
  const firstProcessSheet = lastBaSheet + 1;
  const lastProcessSheet = firstProcessSheet + processVideoCount - 1;
  const resultKpisFlat = Array.isArray((formData as any).resultKpis)
    ? ((formData as any).resultKpis as ResultKpi[])
    : [];
  const resultPagesCount = resultKpisFlat.length ? Math.ceil(resultKpisFlat.length / 3) : 0;
  const firstKpiSheet = lastProcessSheet + 1;
  const lastKpiSheet = firstKpiSheet + resultPagesCount - 1;
  const totalSheets = 2 + beforeAfterCount + processVideoCount + resultPagesCount;
  const kpiPageIdx =
    currentSheet >= firstKpiSheet && currentSheet <= lastKpiSheet
      ? currentSheet - firstKpiSheet
      : 0;
  /** Which template the Add-slide modal should offer (matches current slide section). */
  const addSlideModalKind: 'beforeAfter' | 'processVideo' | 'results' =
    currentSheet >= 3 && currentSheet <= lastBaSheet
      ? 'beforeAfter'
      : currentSheet >= firstProcessSheet && currentSheet <= lastProcessSheet
        ? 'processVideo'
        : currentSheet >= firstKpiSheet && currentSheet <= lastKpiSheet
          ? 'results'
          : 'beforeAfter';
  const [isAddSlideModalOpen, setIsAddSlideModalOpen] = useState(false);
  const editedFieldSet = useMemo(() => new Set(editedFieldKeys), [editedFieldKeys]);
  const templateSheetCaptureRef = useRef<HTMLDivElement | null>(null);
  const [isExportCaptureMode, setIsExportCaptureMode] = useState(false);

  useEffect(() => {
    setCurrentSheet((s) => Math.min(s, totalSheets));
  }, [totalSheets]);

  useEffect(() => {
    if (isCreateMode || !apiBase) return;
    if (currentSheet < 3 || currentSheet > lastBaSheet) return;
    const idx = currentSheet - 3;
    const bas = Array.isArray((formData as any).beforeAfterSlides)
      ? ((formData as any).beforeAfterSlides as {
          beforeImagePath?: string;
          afterImagePath?: string;
          beforeCaption?: string;
          afterCaption?: string;
        }[])
      : [];
    const row = bas[idx];
    const b = String(row?.beforeImagePath || '').trim();
    const a = String(row?.afterImagePath || '').trim();
    setBeforeImagePreviewUrls((prev) => {
      prev.forEach(revokePreviewUrl);
      return b ? [`${apiBase}/kaizen-files/${b}`] : [];
    });
    setAfterImagePreviewUrls((prev) => {
      prev.forEach(revokePreviewUrl);
      return a ? [`${apiBase}/kaizen-files/${a}`] : [];
    });
  }, [
    isCreateMode,
    apiBase,
    currentSheet,
    lastBaSheet,
    formData.beforeAfterSlides,
    revokePreviewUrl,
  ]);

  const handleInsertBeforeAfterSlide = useCallback(() => {
    let insertAt = 0;
    flushSync(() => {
      setFormData((prev: any) => {
        const list = Array.isArray(prev.beforeAfterSlides) ? [...prev.beforeAfterSlides] : [];
        const lba = 2 + list.length;
        insertAt = list.length;
        if (currentSheet >= 3 && currentSheet <= lba) insertAt = currentSheet - 3 + 1;
        list.splice(insertAt, 0, { beforeImagePath: '', afterImagePath: '', beforeCaption: '', afterCaption: '' });
        return { ...prev, beforeAfterSlides: list };
      });
    });
    setCurrentSheet(3 + insertAt);
    setIsAddSlideModalOpen(false);
  }, [currentSheet]);

  const handleDeleteCurrentBeforeAfterSlide = useCallback(async () => {
    if (currentSheet < 3 || currentSheet > lastBaSheet) return;
    if (currentSheet < 3 || currentSheet > lastBaSheet) return;
    if (!apiBase || !accessToken) return;
    const baIdx = currentSheet - 3;
    const snap = formDataRef.current;
    const bas = Array.isArray(snap?.beforeAfterSlides) ? snap.beforeAfterSlides : [];
    const row = bas[baIdx];
    const pathsToDelete = [
      String(row?.beforeImagePath || '').trim(),
      String(row?.afterImagePath || '').trim(),
    ].filter(Boolean);
    for (const p of pathsToDelete) {
      try {
        await fetch(
          `${apiBase}/attachments/kaizen-file?path=${encodeURIComponent(p)}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
        );
      } catch {
        // ignore
      }
    }
    setFormData((prev: any) => {
      const list = Array.isArray(prev.beforeAfterSlides) ? [...prev.beforeAfterSlides] : [];
      if (baIdx < 0 || baIdx >= list.length) return prev;
      list.splice(baIdx, 1);
      const next: any = {
        ...prev,
        beforeAfterSlides: list,
      };
      const first = next.beforeAfterSlides?.[0];
      next.slide3BeforeImagePath = String(first?.beforeImagePath || '');
      next.slide3AfterImagePath = String(first?.afterImagePath || '');
      return next;
    });
  }, [apiBase, accessToken, currentSheet, lastBaSheet]);

  const newEmptyResultKpi = (): ResultKpi => ({
    id: `KPI-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: '',
    metricLabel: '',
    before: '',
    after: '',
    resultNote: '',
    higherIsBetter: false,
  });

  const handleInsertProcessVideoSlide = useCallback(() => {
    let insertAt = 0;
    let targetSheet = 0;
    flushSync(() => {
      setFormData((prev: any) => {
        const baN = Math.max(1, Array.isArray(prev.beforeAfterSlides) ? prev.beforeAfterSlides.length : 1);
        const lba = 2 + baN;
        const fp = lba + 1;
        const list = Array.isArray(prev.processVideoSlides) ? [...prev.processVideoSlides] : [];
        const lp = fp + list.length - 1;
        insertAt = list.length;
        if (currentSheet >= fp && currentSheet <= lp) insertAt = currentSheet - fp + 1;
        list.splice(insertAt, 0, {
          processBeforeVideoPath: '',
          processAfterVideoPath: '',
          processBeforeVideoCaption: '',
          processAfterVideoCaption: '',
        });
        targetSheet = fp + insertAt;
        const next: any = { ...prev, processVideoSlides: list };
        const z = list[0];
        next.processBeforeVideoPath = String(z?.processBeforeVideoPath || '');
        next.processAfterVideoPath = String(z?.processAfterVideoPath || '');
        return next;
      });
    });
    setCurrentSheet(targetSheet);
    setIsAddSlideModalOpen(false);
  }, [currentSheet]);

  const handleDeleteCurrentProcessVideoSlide = useCallback(async () => {
    if (currentSheet < firstProcessSheet || currentSheet > lastProcessSheet) return;
    if (!apiBase || !accessToken) return;
    const pvIdx = currentSheet - firstProcessSheet;
    const snap = formDataRef.current;
    const rows = Array.isArray(snap?.processVideoSlides) ? snap.processVideoSlides : [];
    const row = rows[pvIdx] as { processBeforeVideoPath?: string; processAfterVideoPath?: string } | undefined;
    const pathsToDelete = [
      String(row?.processBeforeVideoPath || '').trim(),
      String(row?.processAfterVideoPath || '').trim(),
    ].filter(Boolean);
    for (const p of pathsToDelete) {
      try {
        await fetch(
          `${apiBase}/attachments/kaizen-file?path=${encodeURIComponent(p)}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
        );
      } catch {
        // ignore
      }
    }
    setFormData((prev: any) => {
      const list = Array.isArray(prev.processVideoSlides) ? [...prev.processVideoSlides] : [];
      if (pvIdx < 0 || pvIdx >= list.length) return prev;
      list.splice(pvIdx, 1);
      const next: any = {
        ...prev,
        processVideoSlides: list,
      };
      const z = next.processVideoSlides?.[0];
      next.processBeforeVideoPath = String(z?.processBeforeVideoPath || '');
      next.processAfterVideoPath = String(z?.processAfterVideoPath || '');
      return next;
    });
  }, [
    apiBase,
    accessToken,
    currentSheet,
    firstProcessSheet,
    lastProcessSheet,
  ]);

  const handleInsertResultsSlide = useCallback(() => {
    let targetSheet = 0;
    flushSync(() => {
      setFormData((prev: any) => {
        const baN = Math.max(1, Array.isArray(prev.beforeAfterSlides) ? prev.beforeAfterSlides.length : 1);
        const lba = 2 + baN;
        const procN = Math.max(1, Array.isArray(prev.processVideoSlides) ? prev.processVideoSlides.length : 1);
        const fk = lba + procN + 1;
        const kpis = Array.isArray(prev.resultKpis) ? [...prev.resultKpis] : [];
        while (kpis.length % 3 !== 0) kpis.push(newEmptyResultKpi());
        const pages = kpis.length / 3;
        const lk = fk + pages - 1;
        let pageInsert = pages;
        if (currentSheet >= fk && currentSheet <= lk) pageInsert = currentSheet - fk + 1;
        const at = pageInsert * 3;
        kpis.splice(at, 0, newEmptyResultKpi(), newEmptyResultKpi(), newEmptyResultKpi());
        targetSheet = fk + pageInsert;
        return { ...prev, resultKpis: kpis };
      });
    });
    setCurrentSheet(targetSheet);
    setIsAddSlideModalOpen(false);
  }, [currentSheet]);

  const handleDeleteCurrentResultsSlide = useCallback(() => {
    if (currentSheet < firstKpiSheet || currentSheet > lastKpiSheet) return;
    const pageIdx = currentSheet - firstKpiSheet;
    setFormData((prev: any) => {
      let kpis = Array.isArray(prev.resultKpis) ? [...prev.resultKpis] : [];
      while (kpis.length % 3 !== 0) kpis.push(newEmptyResultKpi());
      const pages = kpis.length / 3;
      if (pageIdx < 0 || pageIdx >= pages) return prev;
      kpis.splice(pageIdx * 3, 3);
      return { ...prev, resultKpis: kpis };
    });
  }, [currentSheet, firstKpiSheet, lastKpiSheet]);

  const renderDynamicSlideChrome = (opts: {
    zone: 'beforeAfter' | 'processVideo' | 'results';
    deleteEnabled: boolean;
  }) => {
    if (isCreateMode || isTemplatePreview || currentSheet < 3 || isExportCaptureMode)
      return null;
    const delTitle =
      opts.zone === 'beforeAfter'
        ? 'Delete this Before/After slide'
        : opts.zone === 'processVideo'
          ? 'Delete this Process video slide'
          : 'Delete this Results slide';
    const disabledTitle =
      opts.zone === 'beforeAfter'
        ? 'At least one Before/After slide is required'
        : opts.zone === 'processVideo'
          ? 'At least one Process video slide is required'
          : 'At least one Results slide is required';
    const addTitle =
      opts.zone === 'beforeAfter'
        ? 'Add Before/After slide after this one'
        : opts.zone === 'processVideo'
          ? 'Add Process video slide after this one'
          : 'Add Results slide after this one';
    return (
      <div className="absolute right-2 top-2 z-30 flex gap-1">
        <button
          type="button"
          title={opts.deleteEnabled ? delTitle : disabledTitle}
          disabled={!opts.deleteEnabled}
          onClick={() => {
            if (!opts.deleteEnabled) return;
            if (opts.zone === 'beforeAfter') void handleDeleteCurrentBeforeAfterSlide();
            else if (opts.zone === 'processVideo') void handleDeleteCurrentProcessVideoSlide();
            else handleDeleteCurrentResultsSlide();
          }}
          className={`inline-flex size-9 items-center justify-center rounded-lg border shadow-sm ${
            opts.deleteEnabled
              ? 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
              : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
          aria-label="Delete slide"
        >
          <span className="material-icons-round text-xl">delete</span>
        </button>
        <button
          type="button"
          title={addTitle}
          onClick={() => setIsAddSlideModalOpen(true)}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-purple-200 bg-white text-kauvery-purple shadow-sm hover:bg-purple-50"
          aria-label="Add slide"
        >
          <span className="material-icons-round text-xl">add</span>
        </button>
      </div>
    );
  };

  useLayoutEffect(() => {
    if (isCreateMode) return;
    let alive = true;
    const run = () => {
      if (alive) autosizeTextareasInElement(templateSheetCaptureRef.current);
    };
    run();
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    return () => {
      alive = false;
    };
  }, [isCreateMode, currentSheet, formData, isExportCaptureMode]);

  useImperativeHandle(
    ref,
    () => ({
      renderTemplatePngSlides: async () => {
        if (isCreateMode) return [];
        setIsExportCaptureMode(true);
        try {
          const out: string[] = [];
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          await new Promise((r) => setTimeout(r, 80));
          for (let page = 1; page <= totalSheets; page++) {
            flushSync(() => setCurrentSheet(page));
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
            await new Promise((r) => setTimeout(r, 120));
            const node = templateSheetCaptureRef.current;
            if (!node) continue;
            const png = await captureNodeAsLandscapePng(node);
            if (png) out.push(png);
          }
          return out;
        } finally {
          setIsExportCaptureMode(false);
        }
      },
    }),
    [isCreateMode, totalSheets],
  );

  const finalizeTemplateFiles = useCallback(
    async (): Promise<{ pptPath: string; pdfPath: string } | null> => {
      if (!apiBase || !accessToken) return null;
      const suggestionId = (initialData as any)?.id ? String((initialData as any).id) : '';
      if (!suggestionId) return null;

      const slides = await (async () => {
        const out: string[] = [];
        setIsExportCaptureMode(true);
        try {
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          await new Promise((r) => setTimeout(r, 80));
          for (let page = 1; page <= totalSheets; page++) {
            flushSync(() => setCurrentSheet(page));
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
            await new Promise((r) => setTimeout(r, 120));
            const node = templateSheetCaptureRef.current;
            if (!node) continue;
            const png = await captureNodeAsLandscapePng(node);
            if (png) out.push(png);
          }
          return out;
        } finally {
          setIsExportCaptureMode(false);
        }
      })();

      if (!slides.length) return null;

      const res = await fetch(
        `${apiBase}/suggestions/${encodeURIComponent(suggestionId)}/template/finalize`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            slides,
            fileNameBase: (initialData as any)?.code || (initialData as any)?.id,
          }),
        },
      );
      if (!res.ok) return null;
      const out = (await res.json()) as { pptPath: string; pdfPath: string };
      if (!out?.pptPath || !out?.pdfPath) return null;
      return out;
    },
    [apiBase, accessToken, initialData, totalSheets],
  );

  const fetchHrmsEmployee = useCallback(
    async (employeeIdRaw: string) => {
      const id = employeeIdRaw?.trim();
      if (!id) return null;
      if (!apiBase || !accessToken) return null;
      const res = await fetch(`${apiBase}/users/hrms/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      try {
        const text = await res.text();
        if (!text) return null;
        return JSON.parse(text) as
          | {
              employeeId: string;
              name: string;
              unit: string | null;
              department: string | null;
              hod?: string | null;
              manager?: string | null;
            }
          | null;
      } catch {
        return null;
      }
    },
    [apiBase, accessToken],
  );

  const fetchUnitDepartmentMembers = useCallback(
    async (unitCode: string, department: string) => {
      const unit = unitCode.trim();
      const dept = department.trim();
      if (!unit || !dept || !apiBase || !accessToken) return [];
      const res = await fetch(
        `${apiBase}/users/unit-department-members?unitCode=${encodeURIComponent(unit)}&department=${encodeURIComponent(dept)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return [];
      try {
        const data = (await res.json()) as { employeeCode: string; name: string }[];
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    [apiBase, accessToken],
  );

  const resolveUnitScopedHead = useCallback(
    async (role: Role, preferredName: string | undefined, unitCode: string) => {
      const roleCode = appRoleToHodRoleCode(role);
      const unit = unitCode.trim();
      if (!roleCode || !unit || !apiBase || !accessToken) return null;
      const res = await fetch(
        `${apiBase}/users/unit-scoped-hods?unitCode=${encodeURIComponent(unit)}&roleCode=${encodeURIComponent(roleCode)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return null;
      try {
        const list = (await res.json()) as { employeeCode: string; name: string }[];
        if (!Array.isArray(list) || list.length === 0) return null;
        const want = String(preferredName ?? '').trim();
        if (want) {
          const hit = list.find((u) => namesLooselyMatch(u.name, want));
          if (hit) return hit;
        }
        // Unit may have one primary head; if several are scoped, use first (sorted by name).
        return list[0] ?? null;
      } catch {
        return null;
      }
    },
    [apiBase, accessToken],
  );

  const getSuggestionApprovalContext = useCallback(() => {
    const sug = (initialData || {}) as Suggestion;
    const fd = (formDataRef.current || {}) as Partial<Suggestion>;
    return {
      unit: String(
        sug.assignedUnit || sug.unit || fd.unit || '',
      ).trim(),
      department: String(
        sug.assignedDepartment || sug.department || fd.department || '',
      ).trim(),
      departmentApprovals: Array.isArray(sug.departmentApprovals)
        ? sug.departmentApprovals
        : Array.isArray(fd.departmentApprovals)
          ? fd.departmentApprovals
          : [],
      requiredApprovals: Array.isArray(sug.requiredApprovals)
        ? sug.requiredApprovals
        : Array.isArray(fd.requiredApprovals)
          ? fd.requiredApprovals
          : [],
      hodApproverNames: {
        ...(sug.hodApproverNames || {}),
        ...(fd.hodApproverNames || {}),
      } as Partial<Record<Role, string>>,
    };
  }, [initialData]);

  /** Prepared By Emp. No → implementer name + assigned dept HOD / finance / ops heads on this idea. */
  const applyPreparedByEmployeeLookup = useCallback(
    async (employeeIdRaw: string) => {
      const lookupSeq = ++preparedByLookupSeqRef.current;
      const isStale = () => lookupSeq !== preparedByLookupSeqRef.current;

      const employeeId = clampSlide2Text(
        employeeIdRaw,
        SLIDE2_TEXT_LIMITS.signatureEmployeeId,
      );
      const ctx = getSuggestionApprovalContext();

      if (!employeeId.trim()) {
        if (isStale()) return;
        setFormData((prev: any) => ({
          ...prev,
          templateSigPreparedByEmployeeId: '',
          templateSigPreparedBy: '',
          templateSigValidatedDeptHodEmployeeId: '',
          templateSigValidatedDeptHod: '',
          templateSigValidatedFinanceEmployeeId: '',
          templateSigValidatedFinance: '',
          templateSigApprovedOpsHeadEmployeeId: '',
          templateSigApprovedOpsHead: '',
        }));
        return;
      }

      const profile = await fetchHrmsEmployee(employeeId);
      if (isStale()) return;
      const unitForLookup =
        ctx.unit || String(profile?.unit || '').trim();
      const ideaDept =
        ctx.department || String(profile?.department || '').trim();

      const patch: Record<string, string> = {
        templateSigPreparedByEmployeeId: employeeId,
        templateSigPreparedBy: profile?.name
          ? clampSlide2Text(profile.name, SLIDE2_TEXT_LIMITS.signatureName)
          : '',
        templateSigValidatedDeptHodEmployeeId: '',
        templateSigValidatedDeptHod: '',
        templateSigValidatedFinanceEmployeeId: '',
        templateSigValidatedFinance: '',
        templateSigApprovedOpsHeadEmployeeId: '',
        templateSigApprovedOpsHead: '',
      };

      const deptApprovals = ctx.departmentApprovals;
      const deptSlot =
        deptApprovals.find((row) =>
          namesLooselyMatch(String(row?.department ?? ''), ideaDept),
        ) ?? deptApprovals[0];

      if (deptSlot) {
        let deptCode = String(deptSlot.approverEmployeeCode ?? '').trim();
        const deptName = String(deptSlot.approverName ?? '').trim();
        if (!deptCode && deptName && unitForLookup && ideaDept) {
          const members = await fetchUnitDepartmentMembers(unitForLookup, ideaDept);
          if (isStale()) return;
          const hit =
            members.find((m) => namesLooselyMatch(m.name, deptName)) ??
            (members.length === 1 ? members[0] : null);
          if (hit) deptCode = String(hit.employeeCode || '').trim();
        }
        if (deptCode) {
          patch.templateSigValidatedDeptHodEmployeeId = clampSlide2Text(
            deptCode,
            SLIDE2_TEXT_LIMITS.signatureEmployeeId,
          );
        }
        if (deptName) {
          patch.templateSigValidatedDeptHod = clampSlide2Text(
            deptName,
            SLIDE2_TEXT_LIMITS.signatureName,
          );
        }
      } else if (unitForLookup && ideaDept) {
        const members = await fetchUnitDepartmentMembers(unitForLookup, ideaDept);
        if (isStale()) return;
        const assigned = members[0];
        if (assigned?.name) {
          patch.templateSigValidatedDeptHod = clampSlide2Text(
            assigned.name,
            SLIDE2_TEXT_LIMITS.signatureName,
          );
          if (assigned.employeeCode) {
            patch.templateSigValidatedDeptHodEmployeeId = clampSlide2Text(
              assigned.employeeCode,
              SLIDE2_TEXT_LIMITS.signatureEmployeeId,
            );
          }
        }
      }

      if (!patch.templateSigValidatedDeptHod) {
        const hrmsHod = String(profile?.hod ?? '').trim();
        if (hrmsHod) {
          const hodLooksLikeId = /^\d{4,}$/.test(hrmsHod);
          if (hodLooksLikeId) {
            const hodProfile = await fetchHrmsEmployee(hrmsHod);
            if (isStale()) return;
            patch.templateSigValidatedDeptHod = hodProfile?.name
              ? clampSlide2Text(hodProfile.name, SLIDE2_TEXT_LIMITS.signatureName)
              : clampSlide2Text(hrmsHod, SLIDE2_TEXT_LIMITS.signatureName);
            if (hodProfile?.employeeId) {
              patch.templateSigValidatedDeptHodEmployeeId = clampSlide2Text(
                hodProfile.employeeId,
                SLIDE2_TEXT_LIMITS.signatureEmployeeId,
              );
            }
          } else {
            patch.templateSigValidatedDeptHod = clampSlide2Text(
              hrmsHod,
              SLIDE2_TEXT_LIMITS.signatureName,
            );
          }
        }
      }

      const required = ctx.requiredApprovals;
      const hodNames = ctx.hodApproverNames;
      const hdCostTotal = sumHorizontalDeploymentCostRowsInr(
        formData.horizontalDeploymentCostRows,
      );
      const showFinance =
        hdCostTotal > FINANCE_APPROVAL_COST_THRESHOLD_INR ||
        required.includes(Role.FINANCE_HOD);

      if (showFinance) {
        const preferred = String(hodNames[Role.FINANCE_HOD] ?? '').trim();
        if (preferred) {
          patch.templateSigValidatedFinance = clampSlide2Text(
            preferred,
            SLIDE2_TEXT_LIMITS.signatureName,
          );
        }
        if (unitForLookup && !patch.templateSigValidatedFinance) {
          const fin = await resolveUnitScopedHead(
            Role.FINANCE_HOD,
            preferred || undefined,
            unitForLookup,
          );
          if (isStale()) return;
          if (fin) {
            patch.templateSigValidatedFinanceEmployeeId = clampSlide2Text(
              fin.employeeCode,
              SLIDE2_TEXT_LIMITS.signatureEmployeeId,
            );
            patch.templateSigValidatedFinance = clampSlide2Text(
              fin.name,
              SLIDE2_TEXT_LIMITS.signatureName,
            );
          }
        }
        if (unitForLookup && !patch.templateSigValidatedFinance) {
          for (const deptTry of ['Finance and Accounts', 'Finance', 'Accounts']) {
            const members = await fetchUnitDepartmentMembers(unitForLookup, deptTry);
            if (isStale()) return;
            const hit = members[0];
            if (hit?.name) {
              patch.templateSigValidatedFinance = clampSlide2Text(
                hit.name,
                SLIDE2_TEXT_LIMITS.signatureName,
              );
              if (hit.employeeCode) {
                patch.templateSigValidatedFinanceEmployeeId = clampSlide2Text(
                  hit.employeeCode,
                  SLIDE2_TEXT_LIMITS.signatureEmployeeId,
                );
              }
              break;
            }
          }
        }
      }

      {
        const preferred = String(hodNames[Role.OPS_HEAD] ?? '').trim();
        if (preferred) {
          patch.templateSigApprovedOpsHead = clampSlide2Text(
            preferred,
            SLIDE2_TEXT_LIMITS.signatureName,
          );
        }
        if (unitForLookup && !patch.templateSigApprovedOpsHead) {
          const ops = await resolveUnitScopedHead(
            Role.OPS_HEAD,
            preferred || undefined,
            unitForLookup,
          );
          if (isStale()) return;
          if (ops) {
            patch.templateSigApprovedOpsHeadEmployeeId = clampSlide2Text(
              ops.employeeCode,
              SLIDE2_TEXT_LIMITS.signatureEmployeeId,
            );
            patch.templateSigApprovedOpsHead = clampSlide2Text(
              ops.name,
              SLIDE2_TEXT_LIMITS.signatureName,
            );
          }
        }
        if (unitForLookup && !patch.templateSigApprovedOpsHead) {
          for (const deptTry of [
            'Operations',
            'Medical Admin',
            'Medical Administration',
          ]) {
            const members = await fetchUnitDepartmentMembers(unitForLookup, deptTry);
            if (isStale()) return;
            const hit = members[0];
            if (hit?.name) {
              patch.templateSigApprovedOpsHead = clampSlide2Text(
                hit.name,
                SLIDE2_TEXT_LIMITS.signatureName,
              );
              if (hit.employeeCode) {
                patch.templateSigApprovedOpsHeadEmployeeId = clampSlide2Text(
                  hit.employeeCode,
                  SLIDE2_TEXT_LIMITS.signatureEmployeeId,
                );
              }
              break;
            }
          }
        }
      }

      if (isStale()) return;
      setFormData((prev: any) => ({ ...prev, ...patch }));
    },
    [
      getSuggestionApprovalContext,
      formData.horizontalDeploymentCostRows,
      fetchHrmsEmployee,
      fetchUnitDepartmentMembers,
      resolveUnitScopedHead,
    ],
  );

  const updateTeamMemberRow = useCallback(
    (idx: number, patch: Partial<TeamMemberRow>) => {
      setFormData((prev: any) => {
        const rows = Array.isArray(prev.teamMemberRows)
          ? ([...prev.teamMemberRows] as TeamMemberRow[])
          : ([] as TeamMemberRow[]);
        while (rows.length <= idx) {
          rows.push({ employeeId: '', name: '', unit: '', department: '' });
        }
        rows[idx] = { ...rows[idx], ...patch };
        const teamMembers = rows
          .map((r) => r.name.trim())
          .filter(Boolean)
          .join(', ');
        return { ...prev, teamMemberRows: rows, teamMembers };
      });
    },
    [],
  );

  const handleAddTeamMember = useCallback(() => {
    setFormData((prev: any) => {
      const rows: TeamMemberRow[] = Array.isArray(prev.teamMemberRows)
        ? [...prev.teamMemberRows]
        : [];
      if (rows.length >= MAX_SLIDE1_TEAM_MEMBERS) return prev;
      rows.push({ employeeId: '', name: '', unit: '', department: '' });
      return { ...prev, teamMemberRows: rows };
    });
  }, []);

  const handleDeleteTeamMember = useCallback((idx: number) => {
    setFormData((prev: any) => {
      const rows: TeamMemberRow[] = Array.isArray(prev.teamMemberRows)
        ? [...prev.teamMemberRows]
        : [];
      if (idx < 0 || idx >= rows.length) return prev;

      const removedId = String(rows[idx]?.employeeId || '').trim();
      rows.splice(idx, 1);
      if (rows.length === 0) rows.push({ employeeId: '', name: '', unit: '', department: '' });

      const nextPhotoPaths: Record<string, string> = { ...(prev.teamMemberPhotoPaths || {}) };
      if (removedId && nextPhotoPaths[removedId]) {
        delete nextPhotoPaths[removedId];
      }

      const teamMembers = rows
        .map((r) => String(r.name || '').trim())
        .filter(Boolean)
        .join(', ');

      return {
        ...prev,
        teamMemberRows: rows,
        teamMemberPhotoPaths: nextPhotoPaths,
        teamMembers,
      };
    });
  }, []);

  // Default first team member as the assigned implementer (implement mode)
  useEffect(() => {
    if (mode !== 'implement') return;
    const implCode = String((initialData as any)?.assignedImplementerCode || '').trim();
    if (!implCode) return;

    const implName = String((initialData as any)?.assignedImplementer || '').trim();
    const implUnit = String(
      (initialData as any)?.assignedUnit || (initialData as any)?.unit || '',
    ).trim();
    const implDept = String(
      (initialData as any)?.assignedDepartment || (initialData as any)?.department || '',
    ).trim();

    let cancelled = false;
    (async () => {
      let hrms: any = null;
      // Only fetch if we are missing key fields.
      if ((!implName || !implUnit || !implDept) && fetchHrmsEmployee) {
        hrms = await fetchHrmsEmployee(implCode);
      }
      if (cancelled) return;

      setFormData((prev: any) => {
        const rows: TeamMemberRow[] = Array.isArray(prev.teamMemberRows)
          ? [...prev.teamMemberRows]
          : [];
        const row0 = rows[0] || { employeeId: '', name: '', unit: '', department: '' };
        // Don't overwrite if user already typed something
        if (String(row0.employeeId || '').trim()) return prev;

        const next0: TeamMemberRow = {
          employeeId: implCode,
          name: implName || hrms?.name || '',
          unit: implUnit || hrms?.unit || '',
          department: implDept || hrms?.department || '',
        };
        rows[0] = next0;
        if (rows.length === 0) rows.push(next0);

        const teamMembers = rows
          .map((r) => r.name.trim())
          .filter(Boolean)
          .join(', ');

        return { ...prev, teamMemberRows: rows, teamMembers };
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, initialData, fetchHrmsEmployee]);

  // Default Prepared By + assigned approvers when opening implement template
  useEffect(() => {
    if (mode !== 'implement') return;
    if (preparedByBootstrappedRef.current) return;
    const implCode = String((initialData as any)?.assignedImplementerCode || '').trim();
    if (!implCode) return;

    const already = String(formDataRef.current?.templateSigPreparedByEmployeeId || '').trim();
    if (already) {
      preparedByBootstrappedRef.current = true;
      return;
    }

    preparedByBootstrappedRef.current = true;
    void applyPreparedByEmployeeLookup(implCode);
  }, [mode, initialData, applyPreparedByEmployeeLookup]);

  const visibleResultKpis = useMemo(() => {
    const all: ResultKpi[] = Array.isArray(formData.resultKpis) ? formData.resultKpis : [];
    const start = kpiPageIdx * 3;
    const fixed = [0, 1, 2].map((i) => {
      const k = all[start + i] || {
        id: `KPI-${start + i + 1}`,
        title: '',
        metricLabel: '',
        before: '',
        after: '',
        resultNote: '',
        higherIsBetter: false,
      };
      const beforeNum = Number(k.before || 0);
      const afterNum = Number(k.after || 0);
      const rawMax = Math.max(beforeNum, afterNum, 0);
      // Absolute scale 0 → axisMax (reference-style chart); headroom above max value
      const axisMax = rawMax <= 0 ? 1 : Math.max(1, Math.ceil(rawMax * 1.12));
      const beforePct = axisMax > 0 ? (beforeNum / axisMax) * 100 : 0;
      const afterPct = axisMax > 0 ? (afterNum / axisMax) * 100 : 0;
      const hi = Math.ceil(axisMax);
      const axisTicks =
        hi <= 10
          ? Array.from({ length: hi + 1 }, (_, j) => hi - j)
          : [hi, Math.round(hi / 2), 0];
      const improved = afterNum >= beforeNum;
      return {
        ...k,
        beforeNum,
        afterNum,
        beforePct,
        afterPct,
        axisMax,
        axisTicks,
        improved,
        safePage: kpiPageIdx + 1,
      };
    });
    return fixed;
  }, [formData.resultKpis, kpiPageIdx]);

  const getDynamicFlowFields = () => {
    const dynamicTeamMembers =
      formData.teamMembers ||
      [formData.assignedImplementer, formData.employeeName].filter(Boolean).join(', ') ||
      '';
    const dynamicPreparedBy =
      formData.preparedBy || formData.assignedImplementer || formData.employeeName || '';
    const dynamicValidatedBy = formData.validatedBy || 'Unit Coordinator';
    const dynamicApprovedBy =
      formData.approvedBy ||
      (Array.isArray(formData.requiredApprovals) && formData.requiredApprovals.length > 0
        ? formData.requiredApprovals.join(', ')
        : 'As per approval matrix');

    return {
      teamMembers: dynamicTeamMembers,
      preparedBy: dynamicPreparedBy,
      validatedBy: dynamicValidatedBy,
      approvedBy: dynamicApprovedBy,
    };
  };

  const getDynamicHeaderFields = () => {
    const dynamicTitle = formData.theme || initialData?.theme || '';
    const explicitNo = String(formData.kaizenNumber || initialData?.kaizenNumber || '').trim();
    const seriesCode = String(formData.code || (initialData as any)?.code || '').trim();
    const dynamicKaizenNo = explicitNo || seriesCode;
    return {
      title: dynamicTitle,
      kaizenNo: dynamicKaizenNo,
    };
  };

  const renderTemplateHeader = () => (
    <div className="grid grid-cols-12 border-b-2 border-gray-800 items-stretch">
      <div className="col-span-6 bg-kauvery-purple text-white font-black px-3 py-2.5 border-r border-white/25 flex items-center min-h-[2.5rem]">
        <span className="text-white/90">Title/Theme:</span>{' '}
        <textarea
          value={getDynamicHeaderFields().title || ''}
          readOnly={isTemplatePreview}
          rows={1}
          placeholder="—"
          onChange={(e) => setFormData((prev: any) => ({ ...prev, theme: e.target.value }))}
          className="ml-1 flex-1 min-w-0 bg-transparent text-white font-semibold leading-snug resize-none outline-none border border-transparent focus:border-white/30 focus:ring-0 placeholder:text-white/70 overflow-hidden"
          style={{ overflowWrap: 'anywhere' }}
        />
      </div>
      <div className="col-span-5 bg-kauvery-purple text-white font-black px-3 py-2.5 border-r border-white/25 flex items-center min-h-[2.5rem]">
        <span className="text-white/90">Kaizen No:</span>{' '}
        <span className="font-semibold">{getDynamicHeaderFields().kaizenNo || '—'}</span>
      </div>
      <div className="col-span-1 bg-white flex min-h-[2.5rem] items-center justify-center border-l border-gray-200 p-1">
        <KauveryHeaderLogo />
      </div>
    </div>
  );

  const sanitizeTeamRows = useCallback((input: any) => {
    const rows: TeamMemberRow[] = Array.isArray(input?.teamMemberRows)
      ? (input.teamMemberRows as TeamMemberRow[])
      : [];
    const cleanedRows = rows
      .map((r) => ({
        employeeId: (r.employeeId || '').toString().trim(),
        name: (r.name || '').toString().trim(),
        unit: (r.unit || '').toString().trim(),
        department: (r.department || '').toString().trim(),
      }))
      // keep only meaningful rows
      .filter((r) => Boolean(r.employeeId || r.name));

    const unique: TeamMemberRow[] = [];
    const seen = new Set<string>();
    for (const r of cleanedRows) {
      const key = r.employeeId || `name:${r.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(r);
    }

    const capped = unique.slice(0, MAX_SLIDE1_TEAM_MEMBERS);

    const teamMembers = capped
      .map((r) => r.name)
      .filter(Boolean)
      .join(', ');

    const photoPaths: Record<string, string> = { ...(input?.teamMemberPhotoPaths || {}) };
    const keepIds = new Set(capped.map((r) => r.employeeId).filter(Boolean));
    for (const k of Object.keys(photoPaths)) {
      if (!keepIds.has(k)) delete photoPaths[k];
    }

    const rawKpis: ResultKpi[] = Array.isArray(input?.resultKpis) ? input.resultKpis : [];
    let resultKpisOut: ResultKpi[] = rawKpis.map((k, idx) => ({
      id: (k.id || `KPI-${idx + 1}`).toString(),
      title: (k.title || '').toString().trim(),
      metricLabel: (k.metricLabel || '').toString().trim(),
      before: (k.before ?? '').toString(),
      after: (k.after ?? '').toString(),
      resultNote: (k.resultNote || '').toString().trim(),
      higherIsBetter: Boolean(k.higherIsBetter),
    }));
    if (resultKpisOut.length > 0) {
      while (resultKpisOut.length % 3 !== 0) {
        const j = resultKpisOut.length;
        resultKpisOut.push({
          id: `KPI-pad-${j}`,
          title: '',
          metricLabel: '',
          before: '',
          after: '',
          resultNote: '',
          higherIsBetter: false,
        });
      }
    }

    const pvsIn = Array.isArray((input as any)?.processVideoSlides)
      ? ((input as any).processVideoSlides as any[])
      : [];
    let processVideoSlidesOut = pvsIn.map((row: any) => ({
      processBeforeVideoPath: String(row?.processBeforeVideoPath ?? '').trim(),
      processAfterVideoPath: String(row?.processAfterVideoPath ?? '').trim(),
      processBeforeVideoCaption: String(row?.processBeforeVideoCaption ?? '').trim(),
      processAfterVideoCaption: String(row?.processAfterVideoCaption ?? '').trim(),
    }));
    // Allow empty (user can delete all process slides)
    const pv0 = processVideoSlidesOut?.[0];

    const rgcIn = Number((input as any)?.resultsGraphDisplayCount);
    const resultsGraphDisplayCount = rgcIn === 2 || rgcIn === 3 ? rgcIn : 1;

    const hdCostSumInr = sumHorizontalDeploymentCostRowsInr(
      (input as any)?.horizontalDeploymentCostRows,
    );
    const templateSigValidatedFinanceOut =
      hdCostSumInr > FINANCE_APPROVAL_COST_THRESHOLD_INR
        ? String((input as any)?.templateSigValidatedFinance ?? '').trim()
        : '';

    return {
      ...input,
      teamMemberRows: capped.length ? capped : [{ employeeId: '', name: '', unit: '', department: '' }],
      teamMembers,
      teamMemberPhotoPaths: photoPaths,
      resultKpis: resultKpisOut,
      resultsGraphDisplayCount,
      processVideoSlides: processVideoSlidesOut,
      processBeforeVideoPath: String(pv0?.processBeforeVideoPath || ''),
      processAfterVideoPath: String(pv0?.processAfterVideoPath || ''),
      templateSigValidatedFinance: templateSigValidatedFinanceOut,
    };
  }, []);

  /** New-idea submission: all fields required except attachments. */
  const collectCreateModeErrors = useCallback((fd: any): string[] => {
    const errs: string[] = [];
    if (!String(fd.unit ?? '').trim()) errs.push('Unit is required.');
    if (!String(fd.department ?? '').trim()) errs.push('Department is required.');
    if (!String(fd.area ?? '').trim()) errs.push('Area / Location is required.');
    if (!String(fd.theme ?? '').trim()) {
      errs.push('Idea Title / Short Description is required.');
    }
    if (!String(fd.description ?? '').trim()) {
      errs.push('Detailed Description is required.');
    }
    const benefits = (fd.expectedBenefits || {}) as Record<string, boolean | string>;
    const pqcdsemSelected = IDEA_SUBMISSION_PQCDSEM_KEYS.filter((k) => benefits[k] === true);
    if (pqcdsemSelected.length !== 1) {
      errs.push('Expected Benefits (PQCDSEM) — select exactly one option.');
    }
    return errs;
  }, []);

  /** Full-template validation (implement mode). Each slide mounts alone, so HTML `required` is insufficient. */
  const collectImplementationTemplateErrors = useCallback(
    (fd: any): string[] => {
      const errs: string[] = [];

      if (!String(fd.theme ?? '').trim()) errs.push('Slide 1 — Title / theme is required.');

      const rows: TeamMemberRow[] = Array.isArray(fd.teamMemberRows)
        ? (fd.teamMemberRows as TeamMemberRow[])
        : [];
      const filledRows = rows
        .slice(0, MAX_SLIDE1_TEAM_MEMBERS)
        .filter((r) => String(r?.employeeId || '').trim() || String(r?.name || '').trim());
      if (filledRows.length === 0) {
        errs.push('Slide 1 — Add at least one team member (employee number and name).');
      }
      const photoPaths = (fd.teamMemberPhotoPaths || {}) as Record<string, string>;
      for (const r of filledRows) {
        const id = String(r.employeeId || '').trim();
        const name = String(r.name || '').trim();
        if (!id || !name) errs.push('Slide 1 — Each team member needs both employee number and name.');
      }
      for (const r of filledRows) {
        const id = String(r.employeeId || '').trim();
        if (!id) continue;
        if (!String(photoPaths[id] || '').trim()) {
          errs.push(`Slide 1 — Upload a photo for team member ${id}.`);
        }
      }

      if (!String(fd.category ?? '').trim()) errs.push('Slide 2 — Category is required.');
      if (!String(fd.unit ?? '').trim()) errs.push('Slide 2 — Unit is required.');
      if (!String(fd.area ?? '').trim()) errs.push('Slide 2 — Area / location is required.');
      if (!String(fd.startDate ?? '').trim()) errs.push('Slide 2 — Start date is required.');
      if (!String(fd.completionDate ?? '').trim()) errs.push('Slide 2 — Completion date is required.');

      const pr = fd.problem || {};
      if (!String(pr.what ?? '').trim()) errs.push('Slide 2 — Problem: What is required.');
      if (!String(pr.where ?? '').trim()) errs.push('Slide 2 — Problem: Where is required.');
      if (!String(pr.when ?? '').trim()) errs.push('Slide 2 — Problem: When is required.');
      if (!String(pr.how ?? '').trim()) errs.push('Slide 2 — Problem: How is required.');
      if (!String(fd.howMuch ?? '').trim()) errs.push('Slide 2 — Present status: How Much is required.');

      const analysis = fd.analysis || {};
      for (let n = 1; n <= whyWhyVisibleCount; n++) {
        const key = `why${n}` as keyof typeof analysis;
        if (!String((analysis as any)[key] ?? '').trim()) {
          errs.push(`Slide 2 — Why-Why #${n} is required.`);
        }
      }
      if (!String(analysis.rootCause ?? '').trim()) errs.push('Slide 2 — Root cause is required.');
      if (!String(fd.ideaToEliminate ?? '').trim()) errs.push('Slide 2 — Idea to eliminate is required.');
      if (!String(fd.counterMeasure ?? '').trim()) errs.push('Slide 2 — Counter measure is required.');

      if (countPqcdsemTemplateActiveDims(fd.expectedBenefits) < 1) {
        errs.push('Slide 2 — Select at least one PQCDSEM dimension (green or yellow).');
      }

      const std = fd.standardization || {};
      const stdAny =
        Boolean(std.opl) || Boolean(std.sop) || Boolean(std.manual) || Boolean(std.others);
      if (!stdAny) errs.push('Slide 2 — Standardization: choose at least one option (OPL / SOP / Manual / Others).');
      if (Boolean(std.others) && !String(std.othersDescription ?? '').trim()) {
        errs.push('Slide 2 — Describe “Others” under Standardization.');
      }

      if (!String(fd.quantitativeResults ?? '').trim()) errs.push('Slide 2 — Quantitative results is required.');
      if (!String(fd.horizontalDeployment ?? '').trim()) errs.push('Slide 2 — Horizontal deployment is required.');

      const hdCostRows = normalizeHorizontalDeploymentCostRows(fd.horizontalDeploymentCostRows);
      hdCostRows.forEach((r) => {
        const costStr = String(r.cost ?? '').trim();
        if (!costStr) return;
        const val = Number(costStr.replace(/,/g, ''));
        if (Number.isNaN(val) || val < 0) {
          errs.push(`Slide 2 — Horizontal deployment (${r.item}): enter a valid cost (₹).`);
        }
      });

      const hdCostTotal = sumHorizontalDeploymentCostRowsInr(hdCostRows);
      if (hdCostTotal > FINANCE_APPROVAL_COST_THRESHOLD_INR) {
        if (!String(fd.templateSigValidatedFinance ?? '').trim()) {
          errs.push(
            `Slide 2 — Total horizontal deployment cost (₹${hdCostTotal.toLocaleString('en-IN')}) exceeds ₹5 Lakhs: Unit – Head of Finance signature is required.`,
          );
        }
      }

      if (!String(fd.templateSigPreparedBy ?? '').trim()) errs.push('Slide 2 — Prepared By name is required.');
      if (!String(fd.templateSigValidatedDeptHod ?? '').trim()) {
        errs.push('Slide 2 — Validated By (Dept / HOD) name is required.');
      }
      if (!String(fd.templateSigApprovedOpsHead ?? '').trim()) {
        errs.push('Slide 2 — Approved By (Ops Head / Medical Admin) name is required.');
      }

      appendSlide2TextLimitErrors(fd, errs, whyWhyVisibleCount);

      const bas = Array.isArray(fd.beforeAfterSlides) ? fd.beforeAfterSlides : [];
      bas.forEach((row: any, i: number) => {
        const sn = i + 1;
        if (!String(row?.beforeImagePath ?? '').trim()) {
          errs.push(`Before/After slide ${sn} — Before image is required.`);
        }
        if (!String(row?.afterImagePath ?? '').trim()) {
          errs.push(`Before/After slide ${sn} — After image is required.`);
        }
        if (!String(row?.beforeCaption ?? '').trim()) {
          errs.push(`Before/After slide ${sn} — Before caption is required.`);
        }
        if (!String(row?.afterCaption ?? '').trim()) {
          errs.push(`Before/After slide ${sn} — After caption is required.`);
        }
      });

      const pvs = Array.isArray(fd.processVideoSlides) ? fd.processVideoSlides : [];
      pvs.forEach((row: any, i: number) => {
        const sn = i + 1;
        if (!String(row?.processBeforeVideoPath ?? '').trim()) {
          errs.push(`Process video slide ${sn} — Before video is required.`);
        }
        if (!String(row?.processAfterVideoPath ?? '').trim()) {
          errs.push(`Process video slide ${sn} — After video is required.`);
        }
      });

      const kpis: ResultKpi[] = Array.isArray(fd.resultKpis) ? fd.resultKpis : [];
      const rgcRaw = Number(fd.resultsGraphDisplayCount);
      const rgc = rgcRaw === 2 ? 2 : rgcRaw === 3 ? 3 : 1;
      if (kpis.length === 0) {
        errs.push('Results — At least one KPI is required.');
      } else {
        const pages = Math.ceil(kpis.length / 3);
        for (let page = 0; page < pages; page++) {
          for (let c = 0; c < rgc; c++) {
            const idx = page * 3 + c;
            const k = kpis[idx];
            if (!k) continue;
            const label = `Results slide ${page + 1} — Column ${c + 1}`;
            if (!String(k.title ?? '').trim()) errs.push(`${label}: KPI title is required.`);
            if (!String(k.metricLabel ?? '').trim()) errs.push(`${label}: Metric label is required.`);
            const bStr = String(k.before ?? '').trim();
            const aStr = String(k.after ?? '').trim();
            if (bStr === '') errs.push(`${label}: Before value is required.`);
            else if (Number.isNaN(Number(bStr))) errs.push(`${label}: Before value must be a number.`);
            if (aStr === '') errs.push(`${label}: After value is required.`);
            else if (Number.isNaN(Number(aStr))) errs.push(`${label}: After value must be a number.`);
            if (!String(k.resultNote ?? '').trim()) errs.push(`${label}: Result note is required.`);
          }
        }
      }

      return errs;
    },
    [whyWhyVisibleCount],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dynamicFlowFields = getDynamicFlowFields();
    const mergedForSubmit = { ...formData, ...dynamicFlowFields };

    if (isCreateMode) {
      const createErrors = collectCreateModeErrors(mergedForSubmit);
      if (createErrors.length) {
        window.alert(
          `Please complete all required fields before submitting:\n\n${createErrors
            .map((line) => `• ${line}`)
            .join('\n')}`,
        );
        return;
      }
    }

    if (!isCreateMode && !isTemplatePreview) {
      const validationErrors = collectImplementationTemplateErrors(mergedForSubmit);
      if (validationErrors.length) {
        const max = 30;
        const extra =
          validationErrors.length > max
            ? `\n\n…and ${validationErrors.length - max} more.`
            : '';
        window.alert(
          `Cannot submit — please complete all template fields:\n\n${validationErrors
            .slice(0, max)
            .map((line) => `• ${line}`)
            .join('\n')}${extra}`,
        );
        return;
      }
    }

    const basePayload = sanitizeTeamRows(mergedForSubmit);

    // Implement mode: auto-generate FINAL PPT/PDF from the exact UI template and store paths.
    if (!isCreateMode && !isTemplatePreview) {
      try {
        const finalized = await finalizeTemplateFiles();
        if (finalized) {
          const existing: string[] = Array.isArray((basePayload as any).templateAttachmentPaths)
            ? ((basePayload as any).templateAttachmentPaths as any)
            : [];
          // Replace any previous FINAL exports (do not append indefinitely).
          const nonFinal = existing.filter(
            (p) => !String(p || '').replace(/\\/g, '/').includes('/kaizen_template/final/'),
          );
          (basePayload as any).templateAttachmentPaths = [
            ...nonFinal,
            finalized.pptPath,
            finalized.pdfPath,
          ];
        }
      } catch {
        // If generation fails, still allow submission of template data
      }
    }

    onSubmit(
      basePayload,
      isCreateMode && ideaSubmissionFiles.length
        ? { ideaFiles: ideaSubmissionFiles }
        : undefined,
    );
  };

  useEffect(() => {
    if (!isCreateMode) setCurrentSheet(1);
  }, [isCreateMode, initialData]);

  const handleIdeaAttachmentsChange = (files: FileList | null) => {
    if (!files?.length) return;
    setIdeaSubmissionFiles(Array.from(files));
  };

  const handleSaveDraft = async () => {
    if (!onSaveDraft) return;
    const dynamicFlowFields = getDynamicFlowFields();
    try {
      setIsDraftSaving(true);
      const payload: any = sanitizeTeamRows({ ...formData, ...dynamicFlowFields });
      await onSaveDraft(payload);
      setDraftToast({ type: 'success', message: 'Draft saved' });
      window.setTimeout(() => setDraftToast(null), 2000);
    } catch {
      setDraftToast({ type: 'error', message: 'Failed to save draft' });
      window.setTimeout(() => setDraftToast(null), 2200);
    } finally {
      setIsDraftSaving(false);
    }
  };

  const pqcdsemTemplateDimCount = countPqcdsemTemplateActiveDims(formData.expectedBenefits);
  const horizontalDeploymentCostTotalInr = useMemo(
    () =>
      sumHorizontalDeploymentCostRowsInr(
        Array.isArray(formData.horizontalDeploymentCostRows)
          ? formData.horizontalDeploymentCostRows
          : [],
      ),
    [formData.horizontalDeploymentCostRows],
  );

  /** Same threshold as note “If cost saving is > ₹ 5 Lakhs” — finance signature column shown only above this */
  const financeSignatureEnabled =
    horizontalDeploymentCostTotalInr > FINANCE_APPROVAL_COST_THRESHOLD_INR;

  useEffect(() => {
    if (financeSignatureEnabled) return;
    setFormData((prev: any) => {
      const cur = String(prev.templateSigValidatedFinance ?? '').trim();
      const curId = String(prev.templateSigValidatedFinanceEmployeeId ?? '').trim();
      if (!cur && !curId) return prev;
      return {
        ...prev,
        templateSigValidatedFinance: '',
        templateSigValidatedFinanceEmployeeId: '',
      };
    });
  }, [financeSignatureEnabled]);

  // When finance column appears (cost > ₹5L), fill finance head if still empty
  useEffect(() => {
    if (!financeSignatureEnabled) return;
    const prepId = String(formDataRef.current?.templateSigPreparedByEmployeeId || '').trim();
    if (!prepId) return;
    const finName = String(formDataRef.current?.templateSigValidatedFinance || '').trim();
    if (finName) return;
    void applyPreparedByEmployeeLookup(prepId);
  }, [financeSignatureEnabled, applyPreparedByEmployeeLookup]);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-300 overflow-hidden w-full min-w-0 max-w-full">
      
      <form
        onSubmit={handleSubmit}
        onKeyDownCapture={(e) => {
          // Prevent accidental submits when user presses Enter inside single-line fields.
          // Textareas should still accept newlines.
          if (e.key !== 'Enter') return;
          if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
          const el = e.target as HTMLElement | null;
          if (!el) return;
          const tag = el.tagName?.toLowerCase?.() || '';
          if (tag === 'textarea') return;
          if (tag === 'input') {
            const input = el as HTMLInputElement;
            const type = (input.type || '').toLowerCase();
            // allow Enter for explicit "action" inputs if any exist
            if (type === 'submit' || type === 'button' || type === 'checkbox' || type === 'radio') return;
            if (input.dataset.preparedByLookup === 'true') return;
            e.preventDefault();
          }
        }}
      >
        {/* Section 1: Header / Basic Idea Details */}
        {!isTemplatePreview && (
        <div className={`${isCreateMode ? 'bg-white p-0 border-b-0' : 'bg-gray-50 p-8 border-b border-gray-300'}`}>
            {isCreateMode ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-kauvery-purple to-kauvery-violet px-5 py-4">
                  <h2 className="text-xl font-black text-white">Submit New Kaizen Idea</h2>
                  <p className="text-xs text-purple-100 font-semibold mt-1">
                    Share your improvement idea. Keep it simple - we will ask for more details later.
                  </p>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wide mb-1">
                        Unit <span className="text-red-600">*</span>
                      </label>
                      <SearchableSelect
                        aria-label="Unit"
                        disabled={!isCreateMode || lockUnitDepartment}
                        value={formData.unit}
                        onChange={(v) => setFormData({ ...formData, unit: v })}
                        emptyOptionLabel="Select Unit..."
                        options={unitOptions.map((u) => ({ value: u.code, label: u.name }))}
                        placeholder="Search units…"
                        inputClassName="w-full bg-white border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-kauvery-purple outline-none text-gray-900 font-medium disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wide mb-1">
                        Department <span className="text-red-600">*</span>
                      </label>
                      <SearchableSelect
                        aria-label="Department"
                        disabled={!isCreateMode || lockUnitDepartment}
                        value={formData.department}
                        onChange={(v) => setFormData({ ...formData, department: v })}
                        emptyOptionLabel="Select..."
                        options={departmentOptions.map((d) => ({ value: d.name, label: d.name }))}
                        placeholder="Search departments…"
                        inputClassName="w-full bg-white border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-kauvery-purple outline-none text-gray-900 font-medium disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wide mb-1">
                      Area / Location <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      required
                      rows={2}
                      disabled={!isCreateMode}
                      className="w-full bg-white border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-kauvery-purple outline-none text-gray-900 font-medium resize-y min-h-[3rem] leading-relaxed"
                      value={formData.area}
                      onChange={e => setFormData({...formData, area: e.target.value})}
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wide mb-1">
                      Idea Title / Short Description <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      required
                      rows={2}
                      disabled={!isCreateMode}
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm outline-none transition-all bg-white focus:ring-2 focus:ring-kauvery-purple text-gray-900 font-medium resize-y min-h-[3rem] leading-relaxed"
                      placeholder="E.g., Reduce patient wait time by optimizing queue..."
                      value={formData.theme}
                      onChange={e => setFormData({...formData, theme: e.target.value})}
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wide mb-1">
                      Detailed Description <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-kauvery-purple outline-none text-gray-900 font-medium"
                      rows={3}
                      placeholder="Describe the current problem and your proposed solution..."
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      required
                    />
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-[11px] font-extrabold text-gray-700 uppercase">
                        Expected Benefits (PQCDSEM) <span className="text-red-600">*</span>
                      </h3>
                      <span className="text-[10px] text-gray-500 font-semibold">Required — select one</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {IDEA_SUBMISSION_PQCDSEM_KEYS.map((key) => {
                        const selected = formData.expectedBenefits?.[key] === true;
                        return (
                          <label
                            key={key}
                            className={`cursor-pointer px-3 py-2 rounded-md border transition-all select-none text-center font-bold ${selected ? 'bg-kauvery-purple text-white border-purple-800' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'}`}
                          >
                            <input
                              type="checkbox"
                              disabled={!isCreateMode}
                              checked={selected}
                              onChange={(e) =>
                                handleIdeaPqcdsemExclusiveChange(key, e.target.checked)
                              }
                              className="hidden"
                            />
                            <span className="text-[11px] uppercase">{key}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mb-5">
                    <input
                      ref={ideaAttachmentInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                      className="hidden"
                      id="idea-attachments-input"
                      onChange={e => {
                        handleIdeaAttachmentsChange(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => ideaAttachmentInputRef.current?.click()}
                      className="w-full border border-dashed border-gray-300 rounded-md p-4 text-center text-xs text-gray-500 font-medium hover:bg-gray-50 hover:border-kauvery-purple transition-colors"
                    >
                      <span className="material-icons-round text-sm align-middle mr-1">attach_file</span>
                      Click to attach image or document (Optional)
                    </button>
                    {ideaSubmissionFiles.length > 0 && (
                      <ul className="mt-2 text-[11px] text-gray-700 font-semibold space-y-1">
                        {ideaSubmissionFiles.map((f, idx) => (
                          <li key={`${f.name}-${f.size}-${idx}`} className="flex justify-between gap-2">
                            <span className="truncate">{f.name}</span>
                            <button
                              type="button"
                              className="text-red-600 shrink-0"
                              onClick={() =>
                                setIdeaSubmissionFiles(prev =>
                                  prev.filter((_, i) => i !== idx),
                                )
                              }
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="hidden">
                    <input
                      type="text"
                      value={formData.employeeName}
                      onChange={e => setFormData({...formData, employeeName: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            ) : null}
        </div>
        )}

        {/* Section 2: Full Implementation Details (Only for Implement Mode) */}
        {!isCreateMode && (
        <div className="p-8 [@media(orientation:landscape)]:p-4 space-y-8 [@media(orientation:landscape)]:space-y-5 animate-fade-in w-full min-w-0">
            {editedFieldSet.size > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900 font-semibold">
                BE edited fields: {Array.from(editedFieldSet).join(', ')}
              </div>
            )}
            <div className="bg-white border border-gray-300 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 font-extrabold uppercase">Kaizen Template</div>
                <div className="text-sm font-black text-gray-900">Page {currentSheet} of {totalSheets}</div>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalSheets }).map((_, idx) => {
                  const page = idx + 1;
                  return (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentSheet(page)}
                    className={`w-8 h-8 rounded-full text-xs font-black border ${
                      currentSheet === page
                        ? 'bg-kauvery-purple text-white border-kauvery-purple'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    {page}
                  </button>
                );
                })}
              </div>
            </div>

            {/* Lock ONLY form fields during preview, keep page navigation clickable */}
            <fieldset disabled={isTemplatePreview} className={isTemplatePreview ? 'select-text' : undefined}>
            {currentSheet === 1 && (
            <div
              ref={templateSheetCaptureRef}
              className="kaizen-template-capture-root bg-white border-2 border-slate-600 rounded-lg shadow-sm overflow-hidden"
            >
              {renderTemplateHeader()}

              <div className="relative min-h-[290px] border-t border-gray-500 bg-gray-100 overflow-visible py-4 px-2">
                {(() => {
                  const rows: TeamMemberRow[] = Array.isArray(formData.teamMemberRows)
                    ? (formData.teamMemberRows as TeamMemberRow[])
                    : [];
                  const memberIds = rows
                    .map((r) => (r.employeeId || '').trim())
                    .filter(Boolean)
                    .slice(0, MAX_SLIDE1_TEAM_MEMBERS);

                  const count = memberIds.length;
                  const gridClass =
                    count <= 1 ? 'grid grid-cols-1' : count === 2 ? 'grid grid-cols-2' : 'grid grid-cols-3';

                  const cellHeight =
                    count <= 1 ? 'h-[260px]' : count === 2 ? 'h-[240px]' : 'h-[200px]';

                  const renderSlot = (employeeId: string, idx: number) => {
                    const rel = (formData.teamMemberPhotoPaths?.[employeeId] || '').toString().trim();
                    const url = rel && apiBase ? `${apiBase}/kaizen-files/${rel}` : null;
                    return (
                      <div
                        key={`${employeeId || 'EMPTY'}-${idx}`}
                        className={`relative bg-white border border-gray-400 rounded-md overflow-hidden ${cellHeight}`}
                      >
                        <div className="absolute left-2 top-2 z-20 px-2 py-0.5 rounded bg-black/70 text-white text-[11px] font-black">
                          {employeeId}
                        </div>
                        {url ? (
                          <button
                            type="button"
                            className="absolute inset-0 z-10"
                            onClick={() => document.getElementById(`team-photo-${employeeId}`)?.click()}
                            aria-label={`Replace photo for ${employeeId}`}
                          >
                            <img
                              src={url}
                              alt={employeeId}
                              className="h-full w-full object-contain bg-gray-100"
                              draggable={false}
                            />
                          </button>
                        ) : (
                          <label
                            htmlFor={`team-photo-${employeeId}`}
                            className="w-full h-full flex items-center justify-center cursor-pointer"
                          >
                            <div className="text-center">
                              <div className="text-xs font-black text-gray-800">Upload Photo</div>
                              <div className="text-[11px] text-gray-500 font-semibold mt-1">
                                {employeeId}
                              </div>
                            </div>
                          </label>
                        )}
                        <input
                          id={`team-photo-${employeeId}`}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleTeamMemberPhotoUpload(employeeId, e.target.files)}
                        />
                      </div>
                    );
                  };

                  if (memberIds.length === 0) {
                    return (
                      <div className="h-[260px] flex items-center justify-center">
                        <div className="text-center text-sm text-gray-700 font-bold">
                          Enter team member employee numbers below to enable photo upload slots.
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className={`${gridClass} gap-3 items-stretch`}>
                      {memberIds.map((employeeId, idx) => renderSlot(employeeId, idx))}
                    </div>
                  );
                })()}

                {!isExportCaptureMode && (
                  <div className="absolute bottom-0 right-0 bg-yellow-300 text-black font-black px-3 py-0.5 z-20 pointer-events-none">
                    1
                  </div>
                )}
              </div>

              {/* Team members (default 1 row, max 3 on slide 1) */}
              <div className="grid grid-cols-12 border-t border-gray-500 text-sm">
                <div className="col-span-12 p-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-black text-gray-800">
                      Team members (max {MAX_SLIDE1_TEAM_MEMBERS})
                    </div>
                    {!isExportCaptureMode && (
                      <button
                        type="button"
                        onClick={handleAddTeamMember}
                        disabled={
                          Array.isArray(formData.teamMemberRows) &&
                          formData.teamMemberRows.length >= MAX_SLIDE1_TEAM_MEMBERS
                        }
                        className="w-7 h-7 rounded-full bg-kauvery-purple text-white font-black flex items-center justify-center disabled:opacity-40"
                        title="Add team member"
                        aria-label="Add team member"
                      >
                        +
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-gray-700 mb-1">
                    <div className="col-span-3">Emp. No</div>
                    <div className="col-span-3">Name</div>
                    <div className="col-span-3">Unit</div>
                    <div className="col-span-3">Dept</div>
                  </div>

                  {(Array.isArray(formData.teamMemberRows)
                    ? (formData.teamMemberRows as TeamMemberRow[])
                    : ([] as TeamMemberRow[])
                  ).slice(0, MAX_SLIDE1_TEAM_MEMBERS).map((row, idx) => (
                    <div
                      key={idx}
                      className={`relative grid grid-cols-12 gap-2 mb-2 items-center ${isExportCaptureMode ? '' : 'pr-5'}`}
                    >
                      <div className="col-span-3">
                        <input
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 font-medium"
                          value={row.employeeId}
                          onChange={async (e) => {
                            const nextId = e.target.value;
                            updateTeamMemberRow(idx, { employeeId: nextId });
                            const profile = await fetchHrmsEmployee(nextId);
                            if (profile) {
                              updateTeamMemberRow(idx, {
                                name: profile.name || '',
                                unit: profile.unit || '',
                                department: profile.department || '',
                              });
                            }
                          }}
                          placeholder="EMP. No"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 font-medium"
                          value={row.name}
                          onChange={(e) => updateTeamMemberRow(idx, { name: e.target.value })}
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 font-medium bg-gray-50"
                          value={row.unit}
                          readOnly
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 font-medium bg-gray-50"
                          value={row.department}
                          readOnly
                        />
                      </div>
                      {!isExportCaptureMode && (
                        <button
                          type="button"
                          onClick={() => handleDeleteTeamMember(idx)}
                          className="absolute top-0 right-0 w-4 h-4 rounded border border-gray-300 bg-white text-red-600 hover:bg-red-50 flex items-center justify-center"
                          title="Remove team member"
                          aria-label="Remove team member"
                        >
                          <span className="material-icons-round text-[12px] leading-none">close</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            )}

            {currentSheet === 2 && (
            <>
            <div
              ref={templateSheetCaptureRef}
              className="kaizen-template-capture-root bg-white border-2 border-slate-600 rounded-lg shadow-sm overflow-hidden"
            >
              {renderTemplateHeader()}
              <div className="grid grid-cols-12 border-b border-slate-500 text-[11px] font-bold text-slate-800 items-stretch bg-slate-50/50">
                <div className="col-span-2 border-r border-slate-400 p-2 flex flex-col gap-1.5 min-h-[5.25rem] bg-white">
                  <span className="shrink-0 leading-tight text-slate-700 font-bold text-[11px]">Category:</span>
                  <SearchableSelect
                    className="mt-auto w-full"
                    aria-label="Kaizen category"
                    value={formData.category || 'Clinical'}
                    onChange={(v) => setFormData({ ...formData, category: v })}
                    options={[
                      { value: 'Clinical', label: 'Clinical' },
                      { value: 'Supportive', label: 'Supportive' },
                    ]}
                    placeholder="Search…"
                    inputClassName={`${KTZ_SELECT} pr-8`}
                    maxListHeightClass="max-h-40"
                  />
                </div>
                <div className="col-span-2 border-r border-slate-400 p-2 flex flex-col gap-1.5 min-h-[5.25rem] bg-white">
                  <span className="shrink-0 leading-tight text-slate-700 font-bold text-[11px]">Unit:</span>
                  <Slide2Textarea
                    spellCheck={false}
                    rows={2}
                    limit={SLIDE2_TEXT_LIMITS.unit}
                    className={`${KTZ_TEXTAREA} flex-1 min-h-[2.5rem]`}
                    value={formData.unit || ''}
                    onValueChange={(unit) => setFormData({ ...formData, unit })}
                  />
                </div>
                <div className="col-span-2 border-r border-slate-400 p-2 flex flex-col gap-1.5 min-h-[5.25rem] bg-white">
                  <span className="shrink-0 leading-tight text-slate-700 font-bold text-[11px]">Area / Location:</span>
                  <Slide2Textarea
                    spellCheck={false}
                    rows={2}
                    limit={SLIDE2_TEXT_LIMITS.area}
                    className={`${KTZ_TEXTAREA} flex-1 min-h-[2.5rem]`}
                    value={formData.area || ''}
                    onValueChange={(area) => setFormData({ ...formData, area })}
                  />
                </div>
                <div className="col-span-2 border-r border-slate-400 p-2 flex flex-col gap-1.5 min-h-[5.25rem] bg-white">
                  <span className="shrink-0 leading-tight text-slate-700 font-bold text-[11px]">Start Date:</span>
                  <input
                    type="date"
                    className={`${KTZ_DATE} mt-auto`}
                    value={formData.startDate || ''}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>
                <div className="col-span-2 border-r border-slate-400 p-2 flex flex-col gap-1.5 min-h-[5.25rem] bg-white">
                  <span className="shrink-0 leading-tight text-slate-700 font-bold text-[11px]">Completion Date:</span>
                  <input
                    type="date"
                    className={`${KTZ_DATE} mt-auto`}
                    value={formData.completionDate || ''}
                    onChange={e => setFormData({ ...formData, completionDate: e.target.value })}
                  />
                </div>
                <div className="col-span-2 p-2 flex flex-col gap-1.5 min-h-[5.25rem] justify-between">
                  <span className="shrink-0 leading-tight">Kaizen No:</span>
                  <div className="text-sm font-semibold text-gray-900 leading-tight min-h-[2.5rem] flex items-center border border-transparent px-0.5">
                    {getDynamicHeaderFields().kaizenNo || '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-12 border-b border-slate-500 items-stretch">
                {/* Left: Problem / Present / Why-Why / Counter Measure */}
                <div className="col-span-6 border-r border-slate-400 flex flex-col min-w-0 bg-white">
                  <div className="text-xs font-black text-center border-b border-slate-500 py-2 bg-slate-700 text-white tracking-wide">
                    Problem / Present Status
                  </div>

                  <div className="flex border-b border-slate-300">
                    <div
                      className="w-11 shrink-0 border-r border-slate-400 bg-slate-100 flex items-stretch justify-center py-3 text-slate-700"
                      style={{ writingMode: 'vertical-rl' }}
                    >
                      <span className="text-[11px] font-black tracking-[0.2em] my-auto uppercase">Problem</span>
                    </div>
                    <div className="flex-1 flex flex-col min-w-0 divide-y divide-slate-200">
                      {(['What', 'Where', 'When'] as const).map((label, idx) => (
                        <div
                          key={label}
                          className="grid grid-cols-[5.25rem_minmax(0,1fr)] text-xs items-stretch min-h-0"
                        >
                          <div className="border-r border-slate-300 bg-slate-50 px-2 py-2 font-bold text-slate-700 flex items-center justify-end text-right text-[11px] leading-snug">
                            {label}:
                          </div>
                          <div className="p-1 flex min-h-0 bg-white">
                            <Slide2Textarea
                              spellCheck={false}
                              rows={2}
                              limit={SLIDE2_TEXT_LIMITS.problem}
                              className={`${KTZ_TEXTAREA} min-h-[2.75rem]`}
                              value={
                                idx === 0
                                  ? formData.problem?.what || ''
                                  : idx === 1
                                    ? formData.problem?.where || ''
                                    : formData.problem?.when || ''
                              }
                              onValueChange={(v) => {
                                const key = idx === 0 ? 'what' : idx === 1 ? 'where' : 'when';
                                handleNestedChange('problem', key, v);
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex border-b border-slate-300">
                    <div
                      className="w-11 shrink-0 border-r border-slate-400 bg-slate-100 flex items-stretch justify-center py-3 text-slate-700"
                      style={{ writingMode: 'vertical-rl' }}
                    >
                      <span className="text-[10px] font-black tracking-wide my-auto text-center leading-tight">
                        Present Status
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col min-w-0 divide-y divide-slate-200">
                      {(['How', 'How Much'] as const).map((label, idx) => (
                        <div
                          key={label}
                          className="grid grid-cols-[5.25rem_minmax(0,1fr)] text-xs items-stretch min-h-0"
                        >
                          <div className="border-r border-slate-300 bg-slate-50 px-2 py-2 font-bold text-slate-700 flex items-center justify-end text-right text-[11px] leading-snug">
                            {label}:
                          </div>
                          <div className="p-1 flex min-h-0 bg-white">
                            <Slide2Textarea
                              spellCheck={false}
                              rows={2}
                              limit={idx === 0 ? SLIDE2_TEXT_LIMITS.problem : SLIDE2_TEXT_LIMITS.howMuch}
                              className={`${KTZ_TEXTAREA} min-h-[2.75rem]`}
                              value={idx === 0 ? formData.problem?.how || '' : formData.howMuch || ''}
                              onValueChange={(v) =>
                                idx === 0
                                  ? handleNestedChange('problem', 'how', v)
                                  : setFormData({ ...formData, howMuch: v })
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-b border-slate-500 flex flex-col flex-1">
                    <div className="relative bg-kauvery-purple text-white font-black text-[11px] text-center py-2 tracking-wide pr-8">
                      Why-Why Analysis
                      {whyWhyVisibleCount < 5 && (
                        <button
                          type="button"
                          title="Add Why (max 5 total)"
                          aria-label="Add another Why row"
                          className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-fuchsia-800 text-sm font-black leading-none text-white shadow-md ring-1 ring-white/90 hover:bg-fuchsia-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-kauvery-purple"
                          onClick={addWhyWhyRow}
                        >
                          +
                        </button>
                      )}
                    </div>
                    {Array.from({ length: whyWhyVisibleCount }, (_, i) => i + 1).map((n) => (
                      <div
                        key={n}
                        className="grid grid-cols-[5.25rem_minmax(0,1fr)] text-xs border-b border-slate-200 items-stretch bg-white"
                      >
                        <div className="px-2 py-2 text-kauvery-purple font-black flex items-center justify-end text-right border-r border-slate-300 bg-slate-50 text-[11px]">
                          Why?
                        </div>
                        <div className="p-1 flex min-h-0">
                          <Slide2Textarea
                            spellCheck={false}
                            rows={2}
                            limit={SLIDE2_TEXT_LIMITS.whyWhy}
                            className={`${KTZ_TEXTAREA} min-h-[2.75rem]`}
                            value={formData.analysis?.[`why${n}`] || ''}
                            onValueChange={(v) => handleNestedChange('analysis', `why${n}`, v)}
                          />
                        </div>
                      </div>
                    ))}
                    {whyWhyVisibleCount > 3 && (
                      <div className="flex justify-end border-b border-slate-200 bg-white px-2 py-1.5">
                        <button
                          type="button"
                          className="text-[10px] font-bold text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-kauvery-purple"
                          onClick={removeLastWhyWhyRow}
                        >
                          Remove last Why
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-2 text-xs border-b border-slate-300 items-stretch min-h-[8rem] bg-white">
                      <div className="p-2 border-r border-slate-300 flex flex-col gap-1.5 min-h-0">
                        <span className="text-kauvery-purple font-black shrink-0 text-[11px]">Root Cause:</span>
                        <Slide2Textarea
                          spellCheck={false}
                          rows={3}
                          limit={SLIDE2_TEXT_LIMITS.rootCause}
                          className={`${KTZ_TEXTAREA} flex-1 min-h-[4rem]`}
                          value={formData.analysis?.rootCause || ''}
                          onValueChange={(v) => handleNestedChange('analysis', 'rootCause', v)}
                        />
                      </div>
                      <div className="p-2 flex flex-col gap-1.5 min-h-0">
                        <span className="text-kauvery-purple font-black shrink-0 text-[11px]">Idea to Eliminate:</span>
                        <Slide2Textarea
                          spellCheck={false}
                          rows={3}
                          limit={SLIDE2_TEXT_LIMITS.ideaToEliminate}
                          className={`${KTZ_TEXTAREA} flex-1 min-h-[4rem]`}
                          value={formData.ideaToEliminate || ''}
                          onValueChange={(ideaToEliminate) =>
                            setFormData({ ...formData, ideaToEliminate })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-2 flex-1 min-h-[88px] bg-emerald-50/50 border-t border-slate-300">
                    <div className="text-emerald-800 font-black text-[11px] mb-1.5 uppercase tracking-wide">
                      Counter Measure
                    </div>
                    <Slide2Textarea
                      spellCheck={false}
                      limit={SLIDE2_TEXT_LIMITS.counterMeasure}
                      className={`${KTZ_TEXTAREA} min-h-[5rem] ${editedFieldSet.has('counterMeasure') ? 'border-amber-400 bg-amber-50/80 ring-1 ring-amber-200' : ''}`}
                      value={formData.counterMeasure || ''}
                      onValueChange={(counterMeasure) => setFormData({ ...formData, counterMeasure })}
                    />
                  </div>
                </div>

                {/* Right: PQCDSEM, Standardization, Quantitative Results, Horizontal Deployment */}
                <div className="col-span-6 flex flex-col min-w-0 bg-white">
                  <div className="text-xs font-black text-center border-b border-slate-500 py-2 bg-slate-700 text-white tracking-wide">
                    PQCDSEM
                  </div>
                  <div className="text-[9px] leading-snug px-2 py-2 text-slate-600 border-b border-slate-200 bg-slate-50">
                    <span className="font-bold text-kauvery-purple">P</span> Productivity ·{' '}
                    <span className="font-bold text-kauvery-purple">Q</span> Quality ·{' '}
                    <span className="font-bold text-kauvery-purple">C</span> Cost ·{' '}
                    <span className="font-bold text-kauvery-purple">D</span> Delivery ·{' '}
                    <span className="font-bold text-kauvery-purple">S</span> Safety ·{' '}
                    <span className="font-bold text-kauvery-purple">M</span> Morale ·{' '}
                    <span className="font-bold text-kauvery-purple">E</span> Environment
                  </div>
                  <div className="grid grid-cols-7 text-[11px] font-black border-b border-black bg-white">
                    {(
                      [
                        ['P', 'productivity'],
                        ['Q', 'quality'],
                        ['C', 'cost'],
                        ['D', 'delivery'],
                        ['S', 'safety'],
                        ['M', 'morale'],
                        ['E', 'environment'],
                      ] as const
                    ).map(([letter, mapKey]) => {
                      const level = readPqcdsemLevel(formData.expectedBenefits?.[mapKey]);
                      const blockNewDim = pqcdsemTemplateDimCount >= 2 && level === 'none';
                      const cellCls =
                        level === 'primary'
                          ? 'bg-emerald-600 text-white'
                          : level === 'secondary'
                            ? 'bg-amber-300 text-slate-900'
                            : 'bg-white text-kauvery-purple';
                      return (
                        <button
                          key={mapKey}
                          type="button"
                          title={
                            blockNewDim
                              ? 'At most two dimensions — turn off another letter first'
                              : 'Click: off → primary (green) → secondary (yellow) → off'
                          }
                          className={`flex flex-col items-center justify-center py-2.5 border-r border-black last:border-r-0 min-h-[2.75rem] outline-none focus-visible:ring-2 focus-visible:ring-kauvery-purple focus-visible:ring-inset ${cellCls} ${blockNewDim ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'}`}
                          onClick={() => handlePqcdsemTemplateCellClick(mapKey)}
                        >
                          <span className="text-sm font-black">{letter}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[9px] leading-snug px-2 py-1 text-slate-600 border-b border-slate-200 bg-white">
                    Up to <span className="font-bold text-slate-800">two dimensions</span>. Click each letter:{' '}
                    <span className="font-bold text-emerald-700">green = primary</span>
                    {' · '}
                    <span className="font-bold text-amber-700">yellow = secondary</span>
                    {' · white = off'}
                  </div>

                  <div className="text-xs font-black text-center border-b border-slate-300 py-2 bg-slate-100 text-slate-800 tracking-wide">
                    Standardization
                  </div>
                  <div className="px-2 py-2 border-b border-slate-200 text-xs bg-white">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['opl', 'sop', 'manual', 'others'] as const).map(s => (
                        <label key={s} className="flex items-center gap-2 font-bold text-slate-800">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-400 text-kauvery-purple focus:ring-kauvery-purple"
                            checked={!!formData.standardization?.[s]}
                            onChange={e => handleNestedChange('standardization', s, e.target.checked)}
                          />
                          {s === 'opl' ? 'OPL' : s === 'sop' ? 'SOP' : s === 'manual' ? 'Manual' : 'Others'}
                        </label>
                      ))}
                    </div>
                    {formData.standardization?.others && (
                      <Slide2Textarea
                        spellCheck={false}
                        rows={2}
                        limit={SLIDE2_TEXT_LIMITS.standardizationOthers}
                        placeholder="Others (specify)"
                        className={`${KTZ_TEXTAREA} mt-2 min-h-[2.75rem]`}
                        value={formData.standardization?.othersDescription || ''}
                        onValueChange={(v) =>
                          handleNestedChange('standardization', 'othersDescription', v)
                        }
                      />
                    )}
                  </div>

                  <div className="text-xs font-black text-center border-b border-slate-300 py-2 bg-slate-100 text-slate-800 tracking-wide">
                    Quantitative Results
                  </div>
                  <div className="p-3 border-b border-slate-200 bg-white">
                    <Slide2Textarea
                      spellCheck={false}
                      limit={SLIDE2_TEXT_LIMITS.quantitativeResults}
                      placeholder="Enter measurable outcomes..."
                      className={`${KTZ_TEXTAREA} min-h-[5.5rem] ${editedFieldSet.has('quantitativeResults') ? 'border-amber-400 bg-amber-50/80 ring-1 ring-amber-200' : ''}`}
                      value={formData.quantitativeResults || ''}
                      onValueChange={(quantitativeResults) =>
                        setFormData({ ...formData, quantitativeResults })
                      }
                    />
                  </div>

                  <div className="text-xs font-black text-center border-b border-slate-300 py-2 bg-slate-100 text-slate-800 tracking-wide">
                    Horizontal Deployment
                  </div>
                  <div className="p-3 pb-3 border-b border-slate-200 bg-white">
                    <p className="text-[10px] text-slate-600 leading-snug mb-2 font-medium">
                      Yes / No — If yes, describe where this Kaizen was replicated or extended.
                    </p>
                    <Slide2Textarea
                      spellCheck={false}
                      limit={SLIDE2_TEXT_LIMITS.horizontalDeployment}
                      placeholder="e.g., rolled out to sister units, other departments…"
                      className={`${KTZ_TEXTAREA} min-h-[4.25rem] ${editedFieldSet.has('horizontalDeployment') ? 'border-amber-400 bg-amber-50/80 ring-1 ring-amber-200' : ''}`}
                      value={formData.horizontalDeployment || ''}
                      onValueChange={(horizontalDeployment) =>
                        setFormData({ ...formData, horizontalDeployment })
                      }
                    />

                    <div className="mt-3 border border-slate-300 rounded-sm overflow-hidden bg-slate-50/80">
                      <div
                        className="grid grid-cols-[1fr_7rem] gap-1 items-center px-2 py-1.5 bg-slate-200/90 border-b border-slate-300 text-[10px] font-black text-slate-800 uppercase tracking-wide"
                      >
                        <span>Category</span>
                        <span className="text-center">Cost (₹)</span>
                      </div>
                      {normalizeHorizontalDeploymentCostRows(formData.horizontalDeploymentCostRows).map(
                        (row, idx) => (
                          <div
                            key={row.item}
                            className="grid grid-cols-[1fr_7rem] gap-1 items-center px-2 py-1 border-b border-slate-200 last:border-b-0 bg-white"
                          >
                            <div className="px-2 py-1 text-[11px] font-semibold text-slate-800">
                              {row.item}
                            </div>
                            <Slide2Input
                              type="text"
                              inputMode="decimal"
                              limit={SLIDE2_TEXT_LIMITS.hdCost}
                              placeholder="0"
                              className="w-full border border-slate-400 rounded-sm px-2 py-1 text-[11px] text-slate-900 tabular-nums text-right"
                              value={row.cost}
                              showCount={false}
                              onValueChange={(v) => {
                                setFormData((prev: any) => {
                                  const rows = normalizeHorizontalDeploymentCostRows(
                                    prev.horizontalDeploymentCostRows,
                                  );
                                  rows[idx] = { ...rows[idx], cost: v };
                                  return { ...prev, horizontalDeploymentCostRows: rows };
                                });
                              }}
                            />
                          </div>
                        ),
                      )}
                      <div className="flex items-center justify-end gap-2 px-2 py-2 bg-slate-100 border-t border-slate-300">
                        <div className="text-right">
                          <div className="text-[9px] font-bold text-slate-600 uppercase tracking-wide">Total (₹)</div>
                          <div className="text-sm font-black text-slate-900 tabular-nums">
                            {horizontalDeploymentCostTotalInr.toLocaleString('en-IN')}
                          </div>
                          {horizontalDeploymentCostTotalInr > FINANCE_APPROVAL_COST_THRESHOLD_INR && (
                            <div className="mt-1 text-[9px] font-bold text-amber-800">
                              Above ₹5 Lakhs — Finance validation signature required.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Signature / approval — reference layout; all values typed by user (saved in draft / submit) */}
              <div className="border-t border-slate-500">
                <div className="grid grid-cols-12 border-b border-slate-500 text-[10px] sm:text-[11px] items-stretch">
                  <div className="col-span-3 bg-kauvery-purple text-white font-black text-center py-2.5 px-1 border-r border-white/25 flex items-center justify-center">
                    Prepared By
                  </div>
                  <div className="col-span-6 bg-kauvery-purple text-white font-black text-center py-2.5 px-2 border-r border-white/25 flex items-center justify-center">
                    Validated By
                  </div>
                  <div className="col-span-3 bg-kauvery-purple text-white font-black text-center py-2.5 px-1 flex items-center justify-center leading-tight">
                    Approved By
                  </div>
                </div>
                <div className="grid grid-cols-12 border-b border-slate-400 text-[9px] sm:text-[10px] bg-white">
                  <div className="col-span-3 border-r border-slate-300 px-1 py-2 text-slate-700 font-bold text-center flex items-center justify-center">
                    (Idea initiated by)
                  </div>
                  <div
                    className={`border-r border-slate-300 px-1 py-2 text-slate-700 font-bold text-center flex items-center justify-center leading-snug ${
                      financeSignatureEnabled ? 'col-span-3' : 'col-span-6'
                    }`}
                  >
                    Department In-charger / HOD
                  </div>
                  {financeSignatureEnabled && (
                    <div className="col-span-3 border-r border-slate-300 px-1 py-2 text-slate-700 font-bold text-center flex flex-col items-center justify-center leading-snug">
                      <span>Unit – Head of Finance</span>
                      <span className="text-[8px] font-semibold text-slate-500 normal-case mt-0.5">
                        (Note: If cost saving is {'>'} ₹ 5 Lakhs)
                      </span>
                    </div>
                  )}
                  <div className="col-span-3 px-1 py-2 text-slate-700 font-bold text-center flex items-center justify-center">
                    Ops. Head / Medical Admin
                  </div>
                </div>
                <div className="grid grid-cols-12 border-b border-slate-500 text-xs items-stretch bg-white">
                  <div className="col-span-3 border-r border-slate-400 p-2">
                    <Slide2PreparedByField
                      employeeId={formData.templateSigPreparedByEmployeeId ?? ''}
                      name={formData.templateSigPreparedBy ?? ''}
                      onDraftChange={(raw) =>
                        setFormData((prev: any) => ({
                          ...prev,
                          templateSigPreparedByEmployeeId: raw,
                          templateSigPreparedBy: '',
                        }))
                      }
                      onLookup={(raw) => void applyPreparedByEmployeeLookup(raw)}
                    />
                  </div>
                  <div
                    className={`border-r border-slate-400 p-2 flex flex-col ${
                      financeSignatureEnabled ? 'col-span-3' : 'col-span-6'
                    }`}
                  >
                    <Slide2SignatureDisplayField
                      name={formData.templateSigValidatedDeptHod ?? ''}
                      employeeId={formData.templateSigValidatedDeptHodEmployeeId ?? ''}
                      placeholder="Name - Emp. No"
                      onChange={(templateSigValidatedDeptHod, templateSigValidatedDeptHodEmployeeId) =>
                        setFormData({
                          ...formData,
                          templateSigValidatedDeptHod,
                          templateSigValidatedDeptHodEmployeeId,
                        })
                      }
                    />
                  </div>
                  {financeSignatureEnabled && (
                    <div className="col-span-3 border-r border-slate-400 p-2">
                      <Slide2SignatureDisplayField
                        name={formData.templateSigValidatedFinance ?? ''}
                        employeeId={formData.templateSigValidatedFinanceEmployeeId ?? ''}
                        disabled={isTemplatePreview}
                        placeholder="Name - Emp. No"
                        onChange={(templateSigValidatedFinance, templateSigValidatedFinanceEmployeeId) =>
                          setFormData({
                            ...formData,
                            templateSigValidatedFinance,
                            templateSigValidatedFinanceEmployeeId,
                          })
                        }
                      />
                    </div>
                  )}
                  <div className="col-span-3 p-2">
                    <Slide2SignatureDisplayField
                      name={formData.templateSigApprovedOpsHead ?? ''}
                      employeeId={formData.templateSigApprovedOpsHeadEmployeeId ?? ''}
                      placeholder="Name - Emp. No"
                      onChange={(templateSigApprovedOpsHead, templateSigApprovedOpsHeadEmployeeId) =>
                        setFormData({
                          ...formData,
                          templateSigApprovedOpsHead,
                          templateSigApprovedOpsHeadEmployeeId,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {!isExportCaptureMode && (
                <div className="flex justify-end border-t border-gray-400">
                  <div className="bg-yellow-300 text-black font-black px-3 py-0.5">2</div>
                </div>
              )}
            </div>
            </>
            )}

            {currentSheet >= 3 && currentSheet <= lastBaSheet && (
            <div className="relative">
              {renderDynamicSlideChrome({ zone: 'beforeAfter', deleteEnabled: true })}
            <div
              ref={templateSheetCaptureRef}
              className="kaizen-template-capture-root bg-white border-2 border-slate-600 rounded-lg shadow-sm overflow-hidden"
            >
              {(() => {
                const baIdx = Math.max(0, currentSheet - 3);
                const total = beforeAfterCount;
                return (
                  <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 text-[11px] font-black text-slate-700 flex items-center justify-between">
                    <div>Before/After slide</div>
                    <div className="text-slate-600">
                      {baIdx + 1} / {total}
                    </div>
                  </div>
                );
              })()}
              {renderTemplateHeader()}

              <div className="grid grid-cols-2 border-b-2 border-gray-800">
                <div className="bg-kauvery-purple text-white text-center font-black py-2.5 text-sm border-r border-white/25 tracking-wide">
                  Before
                </div>
                <div className="bg-kauvery-purple text-white text-center font-black py-2.5 text-sm tracking-wide">
                  After
                </div>
              </div>

              <div className="grid grid-cols-2 min-h-[520px] divide-x divide-gray-900 bg-white items-stretch">
                {/* Before — image field matches Sheet 1 team photo: full-area cover, click to replace */}
                <div className="flex flex-col min-h-[480px] p-2 h-full">
                  <div className="relative flex-1 min-h-[400px] border border-gray-400 bg-gray-100 flex flex-col items-center justify-center overflow-visible py-3 px-2">
                    <input
                      id="before-slide3-file"
                      ref={beforeImageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      aria-label="Before photo"
                      onChange={e => handleBeforeImagesUpload(e.target.files)}
                    />
                    {beforeImagePreviewUrls.length > 0 ? (
                      <button
                        type="button"
                        className="w-full h-full"
                        onClick={() => beforeImageInputRef.current?.click()}
                        aria-label="Replace before photo"
                      >
                        <img
                          src={beforeImagePreviewUrls[0]}
                          alt="Before"
                          className="h-full w-full object-contain bg-gray-100"
                          draggable={false}
                        />
                      </button>
                    ) : (
                      <label
                        htmlFor="before-slide3-file"
                        className="inline-flex items-center gap-2 px-5 py-2 bg-kauvery-purple text-white rounded-md border border-purple-900 text-base font-black rotate-[-28deg] cursor-pointer hover:bg-kauvery-violet"
                      >
                        <span className="material-icons-round text-base">photo_camera</span>
                        Before
                      </label>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="underline italic text-sm mb-1.5 shrink-0">Caption:</div>
                    <textarea
                      rows={3}
                      value={String(
                        (Array.isArray((formData as any).beforeAfterSlides)
                          ? (formData as any).beforeAfterSlides?.[Math.max(0, currentSheet - 3)]?.beforeCaption
                          : '') || '',
                      )}
                      onChange={(e) => {
                        const idx = Math.max(0, currentSheet - 3);
                        const v = e.target.value;
                        setFormData((prev: any) => {
                          const list = Array.isArray(prev.beforeAfterSlides) ? [...prev.beforeAfterSlides] : [];
                          while (list.length <= idx) {
                            list.push({ beforeImagePath: '', afterImagePath: '', beforeCaption: '', afterCaption: '' });
                          }
                          const row = list[idx] || {
                            beforeImagePath: '',
                            afterImagePath: '',
                            beforeCaption: '',
                            afterCaption: '',
                          };
                          list[idx] = { ...row, beforeCaption: v };
                          return { ...prev, beforeAfterSlides: list };
                        });
                      }}
                      placeholder="Write caption here..."
                      className="w-full border border-fuchsia-700 rounded px-2 py-1.5 text-[11px] font-bold text-gray-900 placeholder:text-gray-400 resize-none h-[5rem] overflow-y-auto leading-relaxed"
                      style={{ overflowWrap: 'anywhere' }}
                    />
                  </div>
                </div>
                {/* After — same pattern as Sheet 1 */}
                <div className="flex flex-col min-h-[480px] p-2 h-full">
                  <div className="relative flex-1 min-h-[400px] border border-gray-400 bg-gray-100 flex flex-col items-center justify-center overflow-visible py-3 px-2">
                    <input
                      id="after-slide3-file"
                      ref={afterImageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      aria-label="After photo"
                      onChange={e => handleAfterImagesUpload(e.target.files)}
                    />
                    {afterImagePreviewUrls.length > 0 ? (
                      <button
                        type="button"
                        className="w-full h-full"
                        onClick={() => afterImageInputRef.current?.click()}
                        aria-label="Replace after photo"
                      >
                        <img
                          src={afterImagePreviewUrls[0]}
                          alt="After"
                          className="h-full w-full object-contain bg-gray-100"
                          draggable={false}
                        />
                      </button>
                    ) : (
                      <label
                        htmlFor="after-slide3-file"
                        className="inline-flex items-center gap-2 px-5 py-2 bg-kauvery-purple text-white rounded-md border border-purple-900 text-base font-black rotate-[-28deg] cursor-pointer hover:bg-kauvery-violet"
                      >
                        <span className="material-icons-round text-base">photo_camera</span>
                        After
                      </label>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="underline italic text-sm mb-1.5 shrink-0">Caption:</div>
                    <textarea
                      rows={3}
                      value={String(
                        (Array.isArray((formData as any).beforeAfterSlides)
                          ? (formData as any).beforeAfterSlides?.[Math.max(0, currentSheet - 3)]?.afterCaption
                          : '') || '',
                      )}
                      onChange={(e) => {
                        const idx = Math.max(0, currentSheet - 3);
                        const v = e.target.value;
                        setFormData((prev: any) => {
                          const list = Array.isArray(prev.beforeAfterSlides) ? [...prev.beforeAfterSlides] : [];
                          while (list.length <= idx) {
                            list.push({ beforeImagePath: '', afterImagePath: '', beforeCaption: '', afterCaption: '' });
                          }
                          const row = list[idx] || {
                            beforeImagePath: '',
                            afterImagePath: '',
                            beforeCaption: '',
                            afterCaption: '',
                          };
                          list[idx] = { ...row, afterCaption: v };
                          return { ...prev, beforeAfterSlides: list };
                        });
                      }}
                      placeholder="Write caption here..."
                      className="w-full border border-fuchsia-700 rounded px-2 py-1.5 text-[11px] font-bold text-gray-900 placeholder:text-gray-400 resize-none h-[5rem] overflow-y-auto leading-relaxed"
                      style={{ overflowWrap: 'anywhere' }}
                    />
                  </div>
                </div>
              </div>

              {!isExportCaptureMode && (
                <div className="flex justify-end border-t border-gray-200 bg-white">
                  <div className="bg-yellow-300 text-black font-black px-3 py-1 shadow-sm">{currentSheet}</div>
                </div>
              )}
            </div>
            </div>
            )}

            {currentSheet >= firstProcessSheet && currentSheet <= lastProcessSheet && (
            <div className="relative">
              {renderDynamicSlideChrome({ zone: 'processVideo', deleteEnabled: true })}
            <div
              ref={templateSheetCaptureRef}
              className="kaizen-template-capture-root bg-white border-2 border-slate-600 rounded-lg shadow-sm overflow-hidden"
            >
              {(() => {
                const pvIdx = currentSheet - firstProcessSheet;
                const row = processVideoSlidesList[pvIdx] || {
                  processBeforeVideoPath: '',
                  processAfterVideoPath: '',
                  processBeforeVideoCaption: '',
                  processAfterVideoCaption: '',
                };
                const beforePath = String(row.processBeforeVideoPath || '').trim();
                const afterPath = String(row.processAfterVideoPath || '').trim();
                const beforeId = `before-video-file-${pvIdx}`;
                const afterId = `after-video-file-${pvIdx}`;
                return (
                  <>
              {renderTemplateHeader()}

              <div className="bg-blue-600 text-white text-sm font-semibold px-3 py-2 border-b border-blue-800 text-center">
                Note: If any process flow or video demonstration is required, Kindly use this slide.
              </div>

              <div className="grid grid-cols-2 border-b border-gray-500">
                <div className="bg-kauvery-purple text-white text-center font-black py-1 border-r border-gray-700">Before</div>
                <div className="bg-kauvery-purple text-white text-center font-black py-1">After</div>
              </div>

              <div className="grid grid-cols-2 min-h-[520px] items-stretch">
                {/* BEFORE */}
                <div className="border-r border-gray-500 bg-gray-100 p-2 flex flex-col h-full min-h-0 min-w-0">
                  <div className="relative flex-1 min-h-[380px] border border-gray-400 bg-white rounded overflow-hidden">
                    {beforePath ? (
                      <button
                        type="button"
                        className="absolute inset-0"
                        onClick={() => processBeforeVideoInputRef.current?.click()}
                        aria-label="Replace before video"
                      >
                        {isExportCaptureMode ? (
                          <div className="h-full w-full bg-gray-50 flex items-center justify-center p-6">
                            <div className="text-center">
                              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-900 text-xs font-black shadow-sm">
                                <span className="material-icons-round text-base text-kauvery-purple">movie</span>
                                Video attached
                              </div>
                              <div className="mt-2 text-[11px] text-gray-600 font-semibold break-all">
                                {beforePath}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <video
                            className="h-full w-full object-contain bg-gray-100"
                            controls
                            src={`${apiBase}/kaizen-files/${beforePath}`}
                          />
                        )}
                      </button>
                    ) : (
                      <label
                        className="h-full w-full flex items-center justify-center cursor-pointer"
                        htmlFor={beforeId}
                      >
                        <div className="text-center">
                          <div className="text-xs font-black text-gray-800">Upload Before Video</div>
                          <div className="text-[10px] text-gray-500 font-semibold mt-1">MP4 recommended</div>
                        </div>
                      </label>
                    )}
                    <input
                      id={beforeId}
                      ref={processBeforeVideoInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => handleProcessVideoUpload(pvIdx, 'before', e.target.files)}
                    />
                  </div>
                </div>

                {/* AFTER */}
                <div className="bg-gray-100 p-2 flex flex-col h-full min-h-0 min-w-0">
                  <div className="relative flex-1 min-h-[380px] border border-gray-400 bg-white rounded overflow-hidden">
                    {afterPath ? (
                      <button
                        type="button"
                        className="absolute inset-0"
                        onClick={() => processAfterVideoInputRef.current?.click()}
                        aria-label="Replace after video"
                      >
                        {isExportCaptureMode ? (
                          <div className="h-full w-full bg-gray-50 flex items-center justify-center p-6">
                            <div className="text-center">
                              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-900 text-xs font-black shadow-sm">
                                <span className="material-icons-round text-base text-kauvery-purple">movie</span>
                                Video attached
                              </div>
                              <div className="mt-2 text-[11px] text-gray-600 font-semibold break-all">
                                {afterPath}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <video
                            className="h-full w-full object-contain bg-gray-100"
                            controls
                            src={`${apiBase}/kaizen-files/${afterPath}`}
                          />
                        )}
                      </button>
                    ) : (
                      <label
                        className="h-full w-full flex items-center justify-center cursor-pointer"
                        htmlFor={afterId}
                      >
                        <div className="text-center">
                          <div className="text-xs font-black text-gray-800">Upload After Video</div>
                          <div className="text-[10px] text-gray-500 font-semibold mt-1">MP4 recommended</div>
                        </div>
                      </label>
                    )}
                    <input
                      id={afterId}
                      ref={processAfterVideoInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => handleProcessVideoUpload(pvIdx, 'after', e.target.files)}
                    />
                  </div>
                </div>
              </div>

              {!isExportCaptureMode && (
                <div className="flex justify-end">
                  <div className="bg-yellow-300 text-black font-black px-3 py-0.5">{currentSheet}</div>
                </div>
              )}
                  </>
                );
              })()}
            </div>
            </div>
            )}

            {currentSheet >= firstKpiSheet && currentSheet <= lastKpiSheet && (
            <div className="relative">
              {renderDynamicSlideChrome({ zone: 'results', deleteEnabled: true })}
            <div
              ref={templateSheetCaptureRef}
              className="kaizen-template-capture-root bg-white border-2 border-slate-600 rounded-lg shadow-sm overflow-hidden"
            >
              {renderTemplateHeader()}

              <div className="grid grid-cols-12 border-b border-gray-500">
                <div className="col-span-9 bg-kauvery-purple text-white text-center font-black py-1 border-r border-gray-700 text-2xl">
                  Results
                </div>
                <div className="col-span-3 bg-kauvery-purple text-white text-center font-black py-1" />
              </div>

              {!isExportCaptureMode && (
                <div className="relative flex justify-end px-3 py-1.5 border-b border-gray-300 bg-white">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev: any) => {
                          const c = Number(prev.resultsGraphDisplayCount) || 1;
                          if (c >= 3) return prev;
                          return { ...prev, resultsGraphDisplayCount: (c + 1) as 1 | 2 | 3 };
                        })
                      }
                      disabled={resultsGraphCount >= 3}
                      className="w-5 h-5 rounded border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center"
                      title="Add graph"
                      aria-label="Add graph"
                    >
                      <span className="material-icons-round text-[14px] leading-none">add</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev: any) => {
                          const c = Number(prev.resultsGraphDisplayCount) || 1;
                          if (c <= 1) return prev;
                          return { ...prev, resultsGraphDisplayCount: (c - 1) as 1 | 2 | 3 };
                        })
                      }
                      disabled={resultsGraphCount <= 1}
                      className="w-5 h-5 rounded border border-gray-300 bg-white text-red-600 hover:bg-red-50 disabled:opacity-40 flex items-center justify-center"
                      title="Remove graph"
                      aria-label="Remove graph"
                    >
                      <span className="material-icons-round text-[14px] leading-none">delete</span>
                    </button>
                  </div>
                </div>
              )}

              {(() => {
                const shown = visibleResultKpis.slice(0, resultsGraphCount);
                const colsCls =
                  resultsGraphCount === 1
                    ? 'grid-cols-1'
                    : resultsGraphCount === 2
                      ? 'grid-cols-2'
                      : 'grid-cols-3';
                return (
                  <>
              <div className={`grid ${colsCls} min-h-[500px] border-b border-gray-500 items-stretch`}>
                {shown.map((row: any, idx: number) => (
                  <div
                    key={row.id}
                    className={`${idx < shown.length - 1 ? 'border-r border-gray-500' : ''} bg-gray-100 p-2 flex flex-col min-h-0 min-w-0`}
                  >
                    <div className="mb-2 grid grid-cols-[minmax(0,1fr)_5.25rem] gap-x-2 gap-y-1 items-start">
                      <div className="min-w-0 space-y-1.5">
                        <textarea
                          spellCheck={false}
                          rows={2}
                          className={`${KTZ_TEXTAREA} min-h-[2.5rem] font-black text-slate-900`}
                          placeholder={`KPI title`}
                          value={row.title || ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setFormData((prev: any) => {
                              const list: ResultKpi[] = Array.isArray(prev.resultKpis) ? [...prev.resultKpis] : [];
                              const pageSize = 3;
                              const start = (((row.safePage || 1) - 1) * pageSize) + idx;
                              if (!list[start]) return prev;
                              list[start] = { ...list[start], title: v };
                              return { ...prev, resultKpis: list };
                            });
                          }}
                        />
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                          <textarea
                            spellCheck={false}
                            rows={2}
                            className={`min-w-0 flex-1 ${KTZ_TEXTAREA} text-[10px] font-bold min-h-[2.5rem]`}
                            placeholder="Metric label (e.g., ₹ / minutes / % / count)"
                            value={row.metricLabel || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              setFormData((prev: any) => {
                                const list: ResultKpi[] = Array.isArray(prev.resultKpis) ? [...prev.resultKpis] : [];
                                const pageSize = 3;
                                const start = (((row.safePage || 1) - 1) * pageSize) + idx;
                                if (!list[start]) return prev;
                                list[start] = { ...list[start], metricLabel: v };
                                return { ...prev, resultKpis: list };
                              });
                            }}
                          />
                          <div className="shrink-0 sm:pt-1" />
                        </div>
                      </div>
                      <div className="text-center leading-none flex flex-col items-center justify-start pt-0.5 w-full">
                        {(() => {
                          const same = Number(row.beforeNum || 0) === Number(row.afterNum || 0);
                          const wentUp = Number(row.afterNum || 0) > Number(row.beforeNum || 0);
                          const icon = same ? 'remove' : wentUp ? 'arrow_upward' : 'arrow_downward';
                          const iconClass = 'text-green-600';
                          const textClass = 'text-green-700';
                          return (
                            <>
                              <span className={`material-icons-round text-3xl ${iconClass}`}>
                                {icon}
                              </span>
                              <div className={`text-lg sm:text-[22px] font-black ${textClass} leading-tight mt-0.5`}>
                                Good
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="relative flex flex-1 min-h-[260px] min-w-0 border border-gray-300 bg-white rounded-sm overflow-hidden">
                      <div
                        className="w-6 shrink-0 flex items-center justify-center border-r border-gray-200 bg-slate-50 py-2"
                        aria-hidden
                      >
                        <span
                          className="block text-[9px] font-black text-gray-700 whitespace-nowrap"
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                        >
                          {row.metricLabel || '—'}
                        </span>
                      </div>
                      <div className="w-7 shrink-0 flex flex-col justify-between border-r border-gray-300 bg-white py-2 pl-0.5 pr-1 text-[9px] font-bold text-gray-800 tabular-nums">
                        {(Array.isArray(row.axisTicks) ? row.axisTicks : [0]).map((t: number) => (
                          <span key={t} className="leading-none text-right">
                            {Number.isInteger(t) ? t : t.toFixed(1)}
                          </span>
                        ))}
                      </div>
                      <div className="relative flex-1 min-w-0 flex flex-col pb-7 pt-2 px-2">
                        <div className="relative flex-1 min-h-[180px]">
                          <svg
                            className="absolute inset-0 size-full pointer-events-none text-gray-200"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                          >
                            {(() => {
                              const hi = Math.ceil(Number(row.axisMax) || 1);
                              const step = hi <= 14 ? 1 : Math.max(1, Math.ceil(hi / 8));
                              const lines: React.ReactNode[] = [];
                              for (let v = step; v < hi; v += step) {
                                const y = 100 - (v / hi) * 100;
                                lines.push(
                                  <line key={v} x1="0" y1={y} x2="100" y2={y} stroke="currentColor" strokeWidth="0.55" />,
                                );
                              }
                              return lines;
                            })()}
                          </svg>
                          <div className="absolute inset-0 grid grid-cols-2 items-end">
                            <div className="relative z-[1] flex h-full flex-col justify-end items-center">
                              <div className="text-[10px] font-black text-gray-900 mb-0.5 tabular-nums">
                                {String(row.before ?? '').trim() !== ''
                                  ? row.before
                                  : row.beforeNum ?? 0}
                              </div>
                              <div
                                className="w-[72%] max-w-[4rem] rounded-sm bg-red-600 shadow-sm ring-1 ring-red-800/30"
                                style={{ height: `${Math.min(100, Math.max(0, row.beforePct))}%` }}
                              />
                            </div>
                            <div className="relative z-[1] flex h-full flex-col justify-end items-center">
                              <div className="text-[10px] font-black text-gray-900 mb-0.5 tabular-nums">
                                {String(row.after ?? '').trim() !== ''
                                  ? row.after
                                  : row.afterNum ?? 0}
                              </div>
                              <div
                                className="w-[72%] max-w-[4rem] rounded-sm bg-emerald-800 shadow-sm ring-1 ring-emerald-950/30"
                                style={{ height: `${Math.min(100, Math.max(0, row.afterPct))}%` }}
                              />
                            </div>
                          </div>
                          <svg
                            className="absolute inset-0 z-[2] size-full pointer-events-none overflow-visible"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                          >
                            <line
                              x1="25"
                              y1={100 - Math.min(100, Math.max(0, row.beforePct))}
                              x2="75"
                              y2={100 - Math.min(100, Math.max(0, row.afterPct))}
                              stroke="#2563eb"
                              strokeWidth="0.7"
                              strokeDasharray="3 2.5"
                              strokeLinecap="round"
                            />
                            <path
                              d={(() => {
                                const bp = Math.min(100, Math.max(0, row.beforePct));
                                const ap = Math.min(100, Math.max(0, row.afterPct));
                                const x2 = 75;
                                const y2 = 100 - ap;
                                const x1 = 25;
                                const y1 = 100 - bp;
                                const dx = x2 - x1;
                                const dy = y2 - y1;
                                const len = Math.hypot(dx, dy) || 1;
                                const ux = dx / len;
                                const uy = dy / len;
                                const nx = -uy;
                                const ny = ux;
                                const s = 1.35;
                                const ax = x2 - ux * 2.8;
                                const ay = y2 - uy * 2.8;
                                return `M ${x2} ${y2} L ${ax + nx * s} ${ay + ny * s} L ${ax - nx * s} ${ay - ny * s} Z`;
                              })()}
                              fill="#2563eb"
                            />
                          </svg>
                        </div>
                        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-gray-400 pt-1.5 text-[11px] font-black text-gray-800">
                          <span className="text-center">Before</span>
                          <span className="text-center">After</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1 mt-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="Before"
                        className="w-full border rounded px-1 py-1 text-[10px] font-semibold border-gray-300 bg-white"
                        value={row.before ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFormData((prev: any) => {
                            const list: ResultKpi[] = Array.isArray(prev.resultKpis) ? [...prev.resultKpis] : [];
                            const pageSize = 3;
                            const start = (((row.safePage || 1) - 1) * pageSize) + idx;
                            if (!list[start]) return prev;
                            list[start] = { ...list[start], before: v };
                            return { ...prev, resultKpis: list };
                          });
                        }}
                      />
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="After"
                        className="w-full border rounded px-1 py-1 text-[10px] font-semibold border-gray-300 bg-white"
                        value={row.after ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFormData((prev: any) => {
                            const list: ResultKpi[] = Array.isArray(prev.resultKpis) ? [...prev.resultKpis] : [];
                            const pageSize = 3;
                            const start = (((row.safePage || 1) - 1) * pageSize) + idx;
                            if (!list[start]) return prev;
                            list[start] = { ...list[start], after: v };
                            return { ...prev, resultKpis: list };
                          });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className={`grid ${colsCls} text-xs font-bold border-b border-gray-500 items-stretch`}>
                {shown.map((row: any, idx: number) => (
                  <div
                    key={`${row.id}-result`}
                    className={`${idx < shown.length - 1 ? 'border-r border-gray-500' : ''} p-2 flex flex-col min-h-0 min-w-0`}
                  >
                    <div className="underline italic text-sm mb-1.5 shrink-0">Result:</div>
                    <textarea
                      spellCheck={false}
                      className={`${KTZ_TEXTAREA} min-h-[5rem] font-medium`}
                      value={row.resultNote || ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFormData((prev: any) => {
                          const list: ResultKpi[] = Array.isArray(prev.resultKpis) ? [...prev.resultKpis] : [];
                          const pageSize = 3;
                          const start = (((row.safePage || 1) - 1) * pageSize) + idx;
                          if (!list[start]) return prev;
                          list[start] = { ...list[start], resultNote: v };
                          return { ...prev, resultKpis: list };
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
                  </>
                );
              })()}

              {!isExportCaptureMode && (
                <div className="flex justify-end">
                  <div className="bg-yellow-300 text-black font-black px-3 py-0.5">{currentSheet}</div>
                </div>
              )}
            </div>
            </div>
            )}

            </fieldset>
        </div>
        )}

        {!isTemplatePreview && (
        <div className={`${isCreateMode ? 'bg-white px-5 pb-5' : 'bg-gray-50 p-6 flex justify-end gap-4 border-t border-gray-300'}`}>
          {draftToast && (
            <div className="mr-auto">
              <div
                className={`px-4 py-2 rounded-lg border text-sm font-bold ${
                  draftToast.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
                role="status"
              >
                {draftToast.message}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onCancel}
            className={`${isCreateMode ? 'hidden' : 'px-6 py-2 text-gray-800 hover:bg-gray-200 rounded-lg font-bold transition-colors border border-gray-400 bg-white'}`}
          >
            Cancel
          </button>
          {!isCreateMode && (
            <>
              <button
                type="button"
                onClick={() => setCurrentSheet(prev => Math.max(1, prev - 1))}
                disabled={currentSheet === 1}
                className="px-5 py-2 text-gray-800 rounded-lg font-bold transition-colors border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isDraftSaving}
                className="px-5 py-2 text-kauvery-purple rounded-lg font-bold transition-colors border border-purple-300 bg-white hover:bg-purple-50 disabled:opacity-60"
              >
                {isDraftSaving ? 'Saving...' : 'Save Draft'}
              </button>
              {currentSheet < totalSheets && (
                <button
                  type="button"
                  onClick={() => setCurrentSheet(prev => Math.min(totalSheets, prev + 1))}
                  className="px-5 py-2 bg-white text-gray-900 rounded-lg font-bold border border-gray-300 hover:bg-gray-100"
                >
                  Next
                </button>
              )}
            </>
          )}
          <button
            type="submit"
            className={`${isCreateMode ? 'w-full py-3 bg-kauvery-pink hover:bg-red-600 text-white rounded-lg font-bold shadow-md transition-all border border-red-700' : `px-8 py-2 bg-kauvery-purple hover:bg-kauvery-violet text-white rounded-lg font-bold shadow-lg shadow-purple-200 transition-all transform active:scale-95 border border-purple-900 ${currentSheet !== totalSheets ? 'opacity-50 pointer-events-none' : ''}`}`}
          >
            {isCreateMode ? 'Submit Idea' : 'Submit Implementation Report'}
          </button>
          {isCreateMode && (
            <p className="text-[10px] text-gray-400 text-center mt-2 font-medium">
              Fields marked <span className="text-red-600">*</span> are required. Attachments are optional.
              <br />
              By submitting, you agree that this idea is original and complies with hospital policy.
            </p>
          )}
        </div>
        )}

        {/* Add Slide modal */}
        {isAddSlideModalOpen && !isCreateMode && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 pt-10 pb-12">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setIsAddSlideModalOpen(false)}
            />
            <div className="relative w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black text-gray-500 uppercase tracking-wide">
                    Add slide
                  </div>
                  <div className="text-lg font-black text-gray-900 mt-0.5">
                    Choose a template design
                  </div>
                  <div className="text-[11px] text-gray-600 font-semibold mt-1">
                    This will insert the selected slide next in the template flow.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddSlideModalOpen(false)}
                  className="text-gray-500 hover:text-gray-900"
                  aria-label="Close"
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>

              <div className="p-5 space-y-3">
                <button
                  type="button"
                  onClick={handleInsertBeforeAfterSlide}
                  className={`w-full text-left rounded-2xl border p-4 transition ${
                    addSlideModalKind === 'beforeAfter'
                      ? 'border-kauvery-purple bg-purple-50/60'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${
                        addSlideModalKind === 'beforeAfter'
                          ? 'bg-purple-100 border-purple-300'
                          : 'bg-purple-50 border-purple-200'
                      }`}
                    >
                      <span className="material-icons-round text-purple-700">compare</span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-gray-900 flex items-center gap-2">
                        Before / After (images)
                        {addSlideModalKind === 'beforeAfter' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-kauvery-purple text-white font-black">
                            current
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 font-semibold mt-0.5">
                        Duplicate the same Before/After slide template.
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleInsertProcessVideoSlide}
                  className={`w-full text-left rounded-2xl border p-4 transition ${
                    addSlideModalKind === 'processVideo'
                      ? 'border-blue-600 bg-blue-50/60'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${
                        addSlideModalKind === 'processVideo'
                          ? 'bg-blue-100 border-blue-300'
                          : 'bg-blue-50 border-blue-200'
                      }`}
                    >
                      <span className="material-icons-round text-blue-700">movie</span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-gray-900 flex items-center gap-2">
                        Process (videos)
                        {addSlideModalKind === 'processVideo' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-black">
                            current
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 font-semibold mt-0.5">
                        Duplicate the same Process video slide template.
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleInsertResultsSlide}
                  className={`w-full text-left rounded-2xl border p-4 transition ${
                    addSlideModalKind === 'results'
                      ? 'border-emerald-600 bg-emerald-50/60'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${
                        addSlideModalKind === 'results'
                          ? 'bg-emerald-100 border-emerald-300'
                          : 'bg-emerald-50 border-emerald-200'
                      }`}
                    >
                      <span className="material-icons-round text-emerald-700">analytics</span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-gray-900 flex items-center gap-2">
                        Results (KPIs)
                        {addSlideModalKind === 'results' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-black">
                            current
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 font-semibold mt-0.5">
                        Duplicate the same Results slide template.
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
});

SuggestionForm.displayName = 'SuggestionForm';
