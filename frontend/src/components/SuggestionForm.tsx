
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
import { Suggestion } from '../types';
import { toPng } from 'html-to-image';

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
      safety: false, energy: false, environment: false, morale: false
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
    templateSigPreparedBy: '',
    templateSigReportingTo: '',
    templateSigValidatedDeptHod: '',
    templateSigValidatedFinance: '',
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
        const list: ResultKpi[] = Array.isArray(merged.resultKpis) ? merged.resultKpis : [];
        const fromLegacy: ResultKpi[] = [
          {
            id: 'KPI-1',
            title: list[0]?.title ?? 'Hand injury reduced',
            metricLabel: list[0]?.metricLabel ?? 'No. of Hand Injury',
            before: list[0]?.before ?? merged.result1Before ?? '',
            after: list[0]?.after ?? merged.result1After ?? '',
            resultNote: list[0]?.resultNote ?? merged.result1 ?? '',
            higherIsBetter: Boolean(list[0]?.higherIsBetter) ?? false,
          },
          {
            id: 'KPI-2',
            title: list[1]?.title ?? 'Patient shifting time reduced',
            metricLabel: list[1]?.metricLabel ?? 'Time in Minutes',
            before: list[1]?.before ?? merged.result2Before ?? '',
            after: list[1]?.after ?? merged.result2After ?? '',
            resultNote: list[1]?.resultNote ?? merged.result2 ?? '',
            higherIsBetter: Boolean(list[1]?.higherIsBetter) ?? false,
          },
          {
            id: 'KPI-3',
            title: list[2]?.title ?? 'Cost reduced',
            metricLabel: list[2]?.metricLabel ?? 'In ₹',
            before: list[2]?.before ?? merged.result3Before ?? '',
            after: list[2]?.after ?? merged.result3After ?? '',
            resultNote: list[2]?.resultNote ?? merged.result3 ?? '',
            higherIsBetter: Boolean(list[2]?.higherIsBetter) ?? false,
          },
        ];
        merged.resultKpis = fromLegacy;
        return merged;
      });

      const draftTeamPhotoPath = (draft as any)?.teamPhotoPath;
      const directTeamPhotoPath = (initialData as any)?.teamPhotoPath;
      const rel = (draftTeamPhotoPath || directTeamPhotoPath || '').toString().trim();
      if (rel && apiBase) {
        setTeamPhotoPreviewUrl(`${apiBase}/kaizen-files/${rel}`);
      }

      // Restore slide-3 Before/After images if saved in draft / suggestion.
      const b3 = String((draft as any)?.slide3BeforeImagePath || (initialData as any)?.slide3BeforeImagePath || '').trim();
      const a3 = String((draft as any)?.slide3AfterImagePath || (initialData as any)?.slide3AfterImagePath || '').trim();
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

  const uploadSlide3Image = async (side: 'before' | 'after', files: FileList | null) => {
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
    const prefix = `${implCode}_${side}_slide3`;

    // delete previous if exists
    const prevPath =
      side === 'before'
        ? String(formData.slide3BeforeImagePath || '').trim()
        : String(formData.slide3AfterImagePath || '').trim();
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

    // Update saved path + preview URL
    if (side === 'before') {
      beforeImagePreviewUrls.forEach(revokePreviewUrl);
      setBeforeImagePreviewUrls([`${apiBase}/kaizen-files/${rel}`]);
      setFormData((prev: any) => ({ ...prev, slide3BeforeImagePath: rel }));
    } else {
      afterImagePreviewUrls.forEach(revokePreviewUrl);
      setAfterImagePreviewUrls([`${apiBase}/kaizen-files/${rel}`]);
      setFormData((prev: any) => ({ ...prev, slide3AfterImagePath: rel }));
    }
  };

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

  const finalizeTemplateFiles = useCallback(
    async (): Promise<{ pptPath: string; pdfPath: string } | null> => {
      if (!apiBase || !accessToken) return null;
      const suggestionId = (initialData as any)?.id ? String((initialData as any).id) : '';
      if (!suggestionId) return null;

      const slides = await (async () => {
        const out: string[] = [];
        const SHEETS = 5;
        setIsExportCaptureMode(true);
        try {
          // Let React paint export-safe placeholders (videos → static blocks).
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          await new Promise((r) => setTimeout(r, 80));
          for (let page = 1; page <= SHEETS; page++) {
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
    [apiBase, accessToken, initialData],
  );

  const handleProcessVideoUpload = async (
    side: 'before' | 'after',
    files: FileList | null,
  ) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!apiBase || !accessToken) return;

    const prevPath =
      side === 'before'
        ? (formData.processBeforeVideoPath || '').toString().trim()
        : (formData.processAfterVideoPath || '').toString().trim();
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
    const prefix = `${String(prefixBase).trim()}_${side}_video`;

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

    setFormData((prev: any) => ({
      ...prev,
      processBeforeVideoPath: side === 'before' ? rel : prev.processBeforeVideoPath,
      processAfterVideoPath: side === 'after' ? rel : prev.processAfterVideoPath,
    }));
  };

  const handleBeforeImagesUpload = (files: FileList | null) => {
    void uploadSlide3Image('before', files);
  };

  const handleAfterImagesUpload = (files: FileList | null) => {
    void uploadSlide3Image('after', files);
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
  const totalSheets = 5;
  const editedFieldSet = useMemo(() => new Set(editedFieldKeys), [editedFieldKeys]);
  const templateSheetCaptureRef = useRef<HTMLDivElement | null>(null);
  const [isExportCaptureMode, setIsExportCaptureMode] = useState(false);

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
            }
          | null;
      } catch {
        return null;
      }
    },
    [apiBase, accessToken],
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
      if (rows.length >= 5) return prev;
      rows.push({ employeeId: '', name: '', unit: '', department: '' });
      return { ...prev, teamMemberRows: rows };
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
  const visibleResultKpis = useMemo(() => {
    const all: ResultKpi[] = Array.isArray(formData.resultKpis) ? formData.resultKpis : [];
    const fixed = [0, 1, 2].map((i) => {
      const k = all[i] || {
        id: `KPI-${i + 1}`,
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
      const higher = Boolean(k.higherIsBetter);
      const improved = higher ? afterNum >= beforeNum : afterNum <= beforeNum;
      return {
        ...k,
        beforeNum,
        afterNum,
        beforePct,
        afterPct,
        axisMax,
        axisTicks,
        improved,
        safePage: 1,
      };
    });
    return fixed;
  }, [formData.resultKpis]);

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

    const teamMembers = unique
      .map((r) => r.name)
      .filter(Boolean)
      .join(', ');

    const photoPaths: Record<string, string> = { ...(input?.teamMemberPhotoPaths || {}) };
    const keepIds = new Set(unique.map((r) => r.employeeId).filter(Boolean));
    for (const k of Object.keys(photoPaths)) {
      if (!keepIds.has(k)) delete photoPaths[k];
    }

    const rawKpis: ResultKpi[] = Array.isArray(input?.resultKpis) ? input.resultKpis : [];
    const cleanedKpis = rawKpis
      .map((k) => ({
        id: (k.id || `KPI-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`).toString(),
        title: (k.title || '').toString().trim(),
        metricLabel: (k.metricLabel || '').toString().trim(),
        before: (k.before ?? '').toString(),
        after: (k.after ?? '').toString(),
        resultNote: (k.resultNote || '').toString().trim(),
        higherIsBetter: Boolean(k.higherIsBetter),
      }))
      // keep only meaningful KPI rows
      .filter((k) => Boolean(k.title || k.metricLabel || k.before || k.after || k.resultNote));

    const fixed3: ResultKpi[] = [0, 1, 2].map((i) => ({
      id: `KPI-${i + 1}`,
      title: cleanedKpis[i]?.title || '',
      metricLabel: cleanedKpis[i]?.metricLabel || '',
      before: cleanedKpis[i]?.before ?? '',
      after: cleanedKpis[i]?.after ?? '',
      resultNote: cleanedKpis[i]?.resultNote || '',
      higherIsBetter: Boolean(cleanedKpis[i]?.higherIsBetter),
    }));

    return {
      ...input,
      teamMemberRows: unique.length ? unique : [{ employeeId: '', name: '', unit: '', department: '' }],
      teamMembers,
      teamMemberPhotoPaths: photoPaths,
      resultKpis: fixed3,
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dynamicFlowFields = getDynamicFlowFields();
    const basePayload = sanitizeTeamRows({ ...formData, ...dynamicFlowFields });

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
      await onSaveDraft(sanitizeTeamRows({ ...formData, ...dynamicFlowFields }));
      setDraftToast({ type: 'success', message: 'Draft saved' });
      window.setTimeout(() => setDraftToast(null), 2000);
    } catch {
      setDraftToast({ type: 'error', message: 'Failed to save draft' });
      window.setTimeout(() => setDraftToast(null), 2200);
    } finally {
      setIsDraftSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-300 overflow-hidden w-full min-w-0 max-w-full">
      
      <form onSubmit={handleSubmit}>
        
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
                      <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wide mb-1">Unit</label>
                      <select
                        disabled={!isCreateMode || lockUnitDepartment}
                        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-kauvery-purple outline-none text-gray-900 font-medium"
                        value={formData.unit}
                        onChange={e => setFormData({...formData, unit: e.target.value})}
                        required
                      >
                        <option value="">Select Unit...</option>
                        {unitOptions.map(u => (
                          <option key={u.id} value={u.code}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wide mb-1">Department</label>
                      <select
                        required
                        disabled={!isCreateMode || lockUnitDepartment}
                        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-kauvery-purple outline-none text-gray-900 font-medium"
                        value={formData.department}
                        onChange={e => setFormData({...formData, department: e.target.value})}
                      >
                        <option value="">Select...</option>
                        {departmentOptions.map(d => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wide mb-1">Area / Location</label>
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
                    <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wide mb-1">Idea Title / Short Description</label>
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
                    <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wide mb-1">Detailed Description</label>
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
                      <h3 className="text-[11px] font-extrabold text-gray-700 uppercase">Expected Benefits (PQCDSEM)</h3>
                      <span className="text-[10px] text-gray-500 font-semibold">Select all that apply</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {['productivity', 'quality', 'cost', 'delivery', 'safety', 'environment', 'morale', 'energy'].map(key => (
                        <label key={key} className={`cursor-pointer px-3 py-2 rounded-md border transition-all select-none text-center font-bold ${formData.expectedBenefits?.[key] ? 'bg-kauvery-purple text-white border-purple-800' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'}`}>
                          <input
                            type="checkbox"
                            disabled={!isCreateMode}
                            checked={formData.expectedBenefits?.[key]}
                            onChange={e => handleNestedChange('expectedBenefits', key, e.target.checked)}
                            className="hidden"
                          />
                          <span className="text-[11px] uppercase">{key}</span>
                        </label>
                      ))}
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

            {currentSheet === 1 && (
            <div
              ref={templateSheetCaptureRef}
              className="kaizen-template-capture-root bg-white border-2 border-slate-600 rounded-lg shadow-sm overflow-hidden"
            >
              <div className="grid grid-cols-12 items-stretch">
                <div className="col-span-12 bg-kauvery-purple text-white text-center font-black text-lg py-2 border-b-2 border-gray-700">
                  Kaizen Sheet
                </div>
                <div className="col-span-6 bg-kauvery-purple text-white font-black px-2 py-2 border-r border-gray-700 flex items-center min-h-[2.5rem]">
                  <span className="text-white/90">Title/Theme:</span>{' '}
                  <span className="font-semibold break-words">{getDynamicHeaderFields().title || '-'}</span>
                </div>
                <div className="col-span-5 bg-kauvery-purple text-white font-black px-2 py-2 border-r border-gray-700 flex items-center min-h-[2.5rem]">
                  <span className="text-white/90">Kaizen No:</span>{' '}
                  <span className="font-semibold">{getDynamicHeaderFields().kaizenNo || '-'}</span>
                </div>
                <div className="col-span-1 bg-white flex min-h-[2.5rem] items-center justify-center border-l border-gray-200 p-1">
                  <KauveryHeaderLogo />
                </div>
              </div>

              <div className="relative min-h-[290px] border-t border-gray-500 bg-gray-100 overflow-visible py-4 px-2">
                {(() => {
                  const rows: TeamMemberRow[] = Array.isArray(formData.teamMemberRows)
                    ? (formData.teamMemberRows as TeamMemberRow[])
                    : [];
                  const memberIds = rows
                    .map(r => (r.employeeId || '').trim())
                    .filter(Boolean)
                    .slice(0, 5);

                  const count = memberIds.length;
                  const gridClass =
                    count <= 1
                      ? 'grid grid-cols-1'
                      : count === 2
                        ? 'grid grid-cols-2'
                        : count === 3
                          ? 'grid grid-cols-3'
                          : count === 4
                            ? 'grid grid-cols-2'
                            : 'grid grid-cols-3';

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
                            onClick={() =>
                              document.getElementById(`team-photo-${employeeId}`)?.click()
                            }
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
                          onChange={e => handleTeamMemberPhotoUpload(employeeId, e.target.files)}
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

                <div className="absolute bottom-0 right-0 bg-yellow-300 text-black font-black px-3 py-0.5 z-20 pointer-events-none">
                  1
                </div>
              </div>

              {/* Team members (default 1 row, max 5) */}
              <div className="grid grid-cols-12 border-t border-gray-500 text-sm">
                <div className="col-span-12 p-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-black text-gray-800">
                      Team members (max 5)
                    </div>
                    <button
                      type="button"
                      onClick={handleAddTeamMember}
                      disabled={Array.isArray(formData.teamMemberRows) && formData.teamMemberRows.length >= 5}
                      className="w-7 h-7 rounded-full bg-kauvery-purple text-white font-black flex items-center justify-center disabled:opacity-40"
                      title="Add team member"
                      aria-label="Add team member"
                    >
                      +
                    </button>
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
                  ).slice(0, 5).map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
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
                          placeholder="EMP1001"
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
              <div className="bg-kauvery-purple text-white text-center font-black text-lg py-2 border-b border-gray-700">
                Kaizen Sheet
              </div>
              <div className="grid grid-cols-12 border-b border-gray-500 items-stretch">
                <div className="col-span-6 bg-kauvery-purple text-white font-black px-2 py-2 border-r border-gray-700 flex items-center min-h-[2.5rem]">
                  <span className="text-white/90">Title/Theme:</span>{' '}
                  <span className="font-semibold break-words">{getDynamicHeaderFields().title || '-'}</span>
                </div>
                <div className="col-span-5 bg-kauvery-purple text-white font-black px-2 py-2 border-r border-gray-700 flex items-center min-h-[2.5rem]">
                  <span className="text-white/90">Kaizen No:</span>{' '}
                  <span className="font-semibold">{getDynamicHeaderFields().kaizenNo || '-'}</span>
                </div>
                <div className="col-span-1 bg-white flex min-h-[2.5rem] items-center justify-center border-l border-gray-200 p-1">
                  <KauveryHeaderLogo />
                </div>
              </div>
              <div className="grid grid-cols-12 border-b border-slate-500 text-[11px] font-bold text-slate-800 items-stretch bg-slate-50/50">
                <div className="col-span-2 border-r border-slate-400 p-2 flex flex-col gap-1.5 min-h-[5.25rem] bg-white">
                  <span className="shrink-0 leading-tight text-slate-700 font-bold text-[11px]">Category:</span>
                  <select
                    className={`${KTZ_SELECT} mt-auto`}
                    value={formData.category || 'Clinical'}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="Clinical">Clinical</option>
                    <option value="Supportive">Supportive</option>
                  </select>
                </div>
                <div className="col-span-2 border-r border-slate-400 p-2 flex flex-col gap-1.5 min-h-[5.25rem] bg-white">
                  <span className="shrink-0 leading-tight text-slate-700 font-bold text-[11px]">Unit:</span>
                  <textarea
                    spellCheck={false}
                    rows={2}
                    className={`${KTZ_TEXTAREA} flex-1 min-h-[2.5rem]`}
                    value={formData.unit || ''}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                  />
                </div>
                <div className="col-span-2 border-r border-slate-400 p-2 flex flex-col gap-1.5 min-h-[5.25rem] bg-white">
                  <span className="shrink-0 leading-tight text-slate-700 font-bold text-[11px]">Area / Location:</span>
                  <textarea
                    spellCheck={false}
                    rows={2}
                    className={`${KTZ_TEXTAREA} flex-1 min-h-[2.5rem]`}
                    value={formData.area || ''}
                    onChange={e => setFormData({ ...formData, area: e.target.value })}
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
                            <textarea
                              spellCheck={false}
                              rows={2}
                              className={`${KTZ_TEXTAREA} min-h-[2.75rem]`}
                              value={
                                idx === 0
                                  ? formData.problem?.what || ''
                                  : idx === 1
                                    ? formData.problem?.where || ''
                                    : formData.problem?.when || ''
                              }
                              onChange={e => {
                                const key = idx === 0 ? 'what' : idx === 1 ? 'where' : 'when';
                                handleNestedChange('problem', key, e.target.value);
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
                            <textarea
                              spellCheck={false}
                              rows={2}
                              className={`${KTZ_TEXTAREA} min-h-[2.75rem]`}
                              value={idx === 0 ? formData.problem?.how || '' : formData.howMuch || ''}
                              onChange={e =>
                                idx === 0
                                  ? handleNestedChange('problem', 'how', e.target.value)
                                  : setFormData({ ...formData, howMuch: e.target.value })
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
                          <textarea
                            spellCheck={false}
                            rows={2}
                            className={`${KTZ_TEXTAREA} min-h-[2.75rem]`}
                            value={formData.analysis?.[`why${n}`] || ''}
                            onChange={(e) => handleNestedChange('analysis', `why${n}`, e.target.value)}
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
                        <textarea
                          spellCheck={false}
                          rows={3}
                          className={`${KTZ_TEXTAREA} flex-1 min-h-[4rem]`}
                          value={formData.analysis?.rootCause || ''}
                          onChange={e => handleNestedChange('analysis', 'rootCause', e.target.value)}
                        />
                      </div>
                      <div className="p-2 flex flex-col gap-1.5 min-h-0">
                        <span className="text-kauvery-purple font-black shrink-0 text-[11px]">Idea to Eliminate:</span>
                        <textarea
                          spellCheck={false}
                          rows={3}
                          className={`${KTZ_TEXTAREA} flex-1 min-h-[4rem]`}
                          value={formData.ideaToEliminate || ''}
                          onChange={e => setFormData({ ...formData, ideaToEliminate: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-2 flex-1 min-h-[88px] bg-emerald-50/50 border-t border-slate-300">
                    <div className="text-emerald-800 font-black text-[11px] mb-1.5 uppercase tracking-wide">
                      Counter Measure
                    </div>
                    <textarea
                      spellCheck={false}
                      className={`${KTZ_TEXTAREA} min-h-[5rem] ${editedFieldSet.has('counterMeasure') ? 'border-amber-400 bg-amber-50/80 ring-1 ring-amber-200' : ''}`}
                      value={formData.counterMeasure || ''}
                      onChange={e => setFormData({ ...formData, counterMeasure: e.target.value })}
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
                    <span className="font-bold text-kauvery-purple">E</span> Environment/Energy ·{' '}
                    <span className="font-bold text-kauvery-purple">M</span> Morale
                  </div>
                  <div className="grid grid-cols-7 text-[11px] font-black border-b border-black bg-white">
                    {(
                      [
                        ['P', 'productivity'],
                        ['Q', 'quality'],
                        ['C', 'cost'],
                        ['D', 'delivery'],
                        ['S', 'safety'],
                        ['E', 'environment'],
                        ['M', 'morale'],
                      ] as const
                    ).map(([letter, mapKey]) => {
                      const level = readPqcdsemLevel(formData.expectedBenefits?.[mapKey]);
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
                          title="Click: off → primary (green) → secondary (yellow) → off"
                          className={`flex flex-col items-center justify-center py-2.5 border-r border-black last:border-r-0 min-h-[2.75rem] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-kauvery-purple focus-visible:ring-inset ${cellCls}`}
                          onClick={() =>
                            handleNestedChange(
                              'expectedBenefits',
                              mapKey,
                              serializePqcdsemLevel(nextPqcdsemLevel(level)),
                            )
                          }
                        >
                          <span className="text-sm font-black">{letter}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[9px] leading-snug px-2 py-1 text-slate-600 border-b border-slate-200 bg-white">
                    Click each letter: <span className="font-bold text-emerald-700">green = primary</span>
                    {' · '}
                    <span className="font-bold text-amber-700">yellow = secondary</span>
                    {' · white = not highlighted'}
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
                      <textarea
                        spellCheck={false}
                        rows={2}
                        placeholder="Others (specify)"
                        className={`${KTZ_TEXTAREA} mt-2 min-h-[2.75rem]`}
                        value={formData.standardization?.othersDescription || ''}
                        onChange={e =>
                          handleNestedChange('standardization', 'othersDescription', e.target.value)
                        }
                      />
                    )}
                  </div>

                  <div className="text-xs font-black text-center border-b border-slate-300 py-2 bg-slate-100 text-slate-800 tracking-wide">
                    Quantitative Results
                  </div>
                  <div className="p-3 border-b border-slate-200 bg-white">
                    <textarea
                      spellCheck={false}
                      placeholder="Enter measurable outcomes..."
                      className={`${KTZ_TEXTAREA} min-h-[5.5rem] ${editedFieldSet.has('quantitativeResults') ? 'border-amber-400 bg-amber-50/80 ring-1 ring-amber-200' : ''}`}
                      value={formData.quantitativeResults || ''}
                      onChange={e => setFormData({ ...formData, quantitativeResults: e.target.value })}
                    />
                  </div>

                  <div className="text-xs font-black text-center border-b border-slate-300 py-2 bg-slate-100 text-slate-800 tracking-wide">
                    Horizontal Deployment
                  </div>
                  <div className="p-3 pb-3 border-b border-slate-200 bg-white">
                    <p className="text-[10px] text-slate-600 leading-snug mb-2 font-medium">
                      Yes / No — If yes, describe where this Kaizen was replicated or extended.
                    </p>
                    <textarea
                      spellCheck={false}
                      placeholder="e.g., rolled out to sister units, other departments…"
                      className={`${KTZ_TEXTAREA} min-h-[4.25rem] ${editedFieldSet.has('horizontalDeployment') ? 'border-amber-400 bg-amber-50/80 ring-1 ring-amber-200' : ''}`}
                      value={formData.horizontalDeployment || ''}
                      onChange={e => setFormData({ ...formData, horizontalDeployment: e.target.value })}
                    />
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
                    Approved By: <span className="font-normal text-white/90 ml-1">FD — Ops. Head</span>
                  </div>
                </div>
                <div className="grid grid-cols-12 border-b border-slate-400 text-[9px] sm:text-[10px] bg-white">
                  <div className="col-span-3 border-r border-slate-300 px-1 py-2 text-slate-700 font-bold text-center flex items-center justify-center">
                    (Idea initiated by)
                  </div>
                  <div className="col-span-3 border-r border-slate-300 px-1 py-2 text-slate-700 font-bold text-center flex items-center justify-center leading-snug">
                    Department In-charger / HOD
                  </div>
                  <div className="col-span-3 border-r border-slate-300 px-1 py-2 text-slate-700 font-bold text-center flex flex-col items-center justify-center leading-snug">
                    <span>Unit – Head of Finance</span>
                    <span className="text-[8px] font-semibold text-slate-500 normal-case mt-0.5">
                      (Note: If cost saving is {'>'} ₹ 5 Lakhs)
                    </span>
                  </div>
                  <div className="col-span-3 px-1 py-2 text-slate-700 font-bold text-center flex items-center justify-center">
                    Ops. Head
                  </div>
                </div>
                <div className="grid grid-cols-12 border-b border-slate-500 text-xs items-stretch bg-white">
                  <div className="col-span-3 border-r border-slate-400 p-2 flex flex-col gap-2">
                    <input
                      type="text"
                      className={`${KTZ_DATE} bg-white font-semibold`}
                      placeholder="Name"
                      value={formData.templateSigPreparedBy ?? ''}
                      onChange={(e) => setFormData({ ...formData, templateSigPreparedBy: e.target.value })}
                    />
                    <textarea
                      spellCheck={false}
                      placeholder="Reporting to (optional)"
                      className={`${KTZ_TEXTAREA} min-h-[2.25rem] text-[10px]`}
                      value={formData.templateSigReportingTo ?? ''}
                      onChange={(e) => setFormData({ ...formData, templateSigReportingTo: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3 border-r border-slate-400 p-2 flex flex-col">
                    <input
                      type="text"
                      className={`${KTZ_DATE} bg-white font-semibold`}
                      placeholder="Name / role"
                      value={formData.templateSigValidatedDeptHod ?? ''}
                      onChange={(e) => setFormData({ ...formData, templateSigValidatedDeptHod: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3 border-r border-slate-400 p-2 flex flex-col">
                    <input
                      type="text"
                      className={`${KTZ_DATE} bg-white font-semibold`}
                      placeholder="Name / role"
                      value={formData.templateSigValidatedFinance ?? ''}
                      onChange={(e) => setFormData({ ...formData, templateSigValidatedFinance: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3 p-2 flex flex-col">
                    <input
                      type="text"
                      className={`${KTZ_DATE} bg-white font-semibold`}
                      placeholder="Name"
                      value={formData.templateSigApprovedOpsHead ?? ''}
                      onChange={(e) => setFormData({ ...formData, templateSigApprovedOpsHead: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t border-gray-400">
                <div className="bg-yellow-300 text-black font-black px-3 py-0.5">2</div>
              </div>
            </div>
            </>
            )}

            {currentSheet === 3 && (
            <div
              ref={templateSheetCaptureRef}
              className="kaizen-template-capture-root bg-white border-2 border-slate-600 rounded-lg shadow-sm overflow-hidden"
            >
              {/* Slide 3 — Before / After: title bar + Kauvery logo (reference layout) */}
              <div className="bg-kauvery-purple text-white flex items-center min-h-[52px] border-b-2 border-gray-800">
                <div className="flex-1 min-w-[72px]" aria-hidden />
                <div className="flex items-center justify-center px-4 py-2">
                  <span className="font-black text-lg tracking-wide">Kaizen Sheet</span>
                </div>
                <div className="flex-1 flex items-center justify-end pr-3 py-1.5 min-w-[72px]">
                  <div
                    className="bg-white rounded-sm shadow-md w-[72px] h-[52px] border border-gray-200 overflow-hidden"
                    title="Kauvery"
                  >
                    <KauveryHeaderLogo variant="hero" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 border-b-2 border-gray-800">
                <div className="bg-kauvery-purple text-white font-black px-3 py-2.5 text-sm border-r border-white/25">
                  <span className="text-white/90">Title/Theme:</span>{' '}
                  <span className="font-semibold">{getDynamicHeaderFields().title || '—'}</span>
                </div>
                <div className="bg-kauvery-purple text-white font-black px-3 py-2.5 text-sm">
                  <span className="text-white/90">Kaizen No:</span>{' '}
                  <span className="font-semibold">{getDynamicHeaderFields().kaizenNo || '—'}</span>
                </div>
              </div>

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
                </div>
              </div>

              <div className="flex justify-end border-t border-gray-200 bg-white">
                <div className="bg-yellow-300 text-black font-black px-3 py-1 shadow-sm">3</div>
              </div>
            </div>
            )}

            {currentSheet === 4 && (
            <div
              ref={templateSheetCaptureRef}
              className="kaizen-template-capture-root bg-white border-2 border-slate-600 rounded-lg shadow-sm overflow-hidden"
            >
              <div className="bg-kauvery-purple text-white text-center font-black text-lg py-2 border-b border-gray-700">
                Kaizen Sheet
              </div>
              <div className="grid grid-cols-12 border-b border-gray-500 items-stretch">
                <div className="col-span-9 bg-kauvery-purple text-white font-black px-2 py-2 border-r border-gray-700 flex items-center min-h-[2.5rem]">
                  Title/Theme: <span className="font-semibold break-words ml-1">{getDynamicHeaderFields().title || '-'}</span>
                </div>
                <div className="col-span-2 bg-kauvery-purple text-white font-black px-2 py-2 border-r border-gray-700 flex items-center min-h-[2.5rem]">
                  Kaizen No: <span className="font-semibold ml-1">{getDynamicHeaderFields().kaizenNo || '-'}</span>
                </div>
                <div className="col-span-1 bg-white flex min-h-[2.5rem] items-center justify-center border-l border-gray-200 p-1">
                  <KauveryHeaderLogo />
                </div>
              </div>

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
                    {formData.processBeforeVideoPath ? (
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
                                {String(formData.processBeforeVideoPath)}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <video
                            className="h-full w-full object-contain bg-gray-100"
                            controls
                            src={`${apiBase}/kaizen-files/${String(formData.processBeforeVideoPath)}`}
                          />
                        )}
                      </button>
                    ) : (
                      <label
                        className="h-full w-full flex items-center justify-center cursor-pointer"
                        htmlFor="before-video-file"
                      >
                        <div className="text-center">
                          <div className="text-xs font-black text-gray-800">Upload Before Video</div>
                          <div className="text-[10px] text-gray-500 font-semibold mt-1">MP4 recommended</div>
                        </div>
                      </label>
                    )}
                    <input
                      id="before-video-file"
                      ref={processBeforeVideoInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => handleProcessVideoUpload('before', e.target.files)}
                    />
                  </div>
                </div>

                {/* AFTER */}
                <div className="bg-gray-100 p-2 flex flex-col h-full min-h-0 min-w-0">
                  <div className="relative flex-1 min-h-[380px] border border-gray-400 bg-white rounded overflow-hidden">
                    {formData.processAfterVideoPath ? (
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
                                {String(formData.processAfterVideoPath)}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <video
                            className="h-full w-full object-contain bg-gray-100"
                            controls
                            src={`${apiBase}/kaizen-files/${String(formData.processAfterVideoPath)}`}
                          />
                        )}
                      </button>
                    ) : (
                      <label
                        className="h-full w-full flex items-center justify-center cursor-pointer"
                        htmlFor="after-video-file"
                      >
                        <div className="text-center">
                          <div className="text-xs font-black text-gray-800">Upload After Video</div>
                          <div className="text-[10px] text-gray-500 font-semibold mt-1">MP4 recommended</div>
                        </div>
                      </label>
                    )}
                    <input
                      id="after-video-file"
                      ref={processAfterVideoInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => handleProcessVideoUpload('after', e.target.files)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <div className="bg-yellow-300 text-black font-black px-3 py-0.5">4</div>
              </div>
            </div>
            )}

            {currentSheet === 5 && (
            <>
            <div
              ref={templateSheetCaptureRef}
              className="kaizen-template-capture-root bg-white border-2 border-slate-600 rounded-lg shadow-sm overflow-hidden"
            >
              <div className="bg-kauvery-purple text-white text-center font-black text-lg py-2 border-b border-gray-700">
                Kaizen Sheet
              </div>
              <div className="grid grid-cols-12 border-b border-gray-500 items-stretch">
                <div className="col-span-9 bg-kauvery-purple text-white font-black px-2 py-2 border-r border-gray-700 flex items-center min-h-[2.5rem]">
                  Title/Theme: <span className="font-semibold break-words ml-1">{getDynamicHeaderFields().title || '-'}</span>
                </div>
                <div className="col-span-2 bg-kauvery-purple text-white font-black px-2 py-2 border-r border-gray-700 flex items-center min-h-[2.5rem]">
                  Kaizen No: <span className="font-semibold ml-1">{getDynamicHeaderFields().kaizenNo || '-'}</span>
                </div>
                <div className="col-span-1 bg-white flex min-h-[2.5rem] items-center justify-center border-l border-gray-200 p-1">
                  <KauveryHeaderLogo />
                </div>
              </div>

              <div className="grid grid-cols-12 border-b border-gray-500">
                <div className="col-span-9 bg-kauvery-purple text-white text-center font-black py-1 border-r border-gray-700 text-2xl">
                  Results
                </div>
                <div className="col-span-3 bg-kauvery-purple text-white text-center font-black py-1" />
              </div>

              <div className="px-3 py-2 border-b border-gray-300 bg-white text-[11px] font-bold text-gray-700">
                Fill any 3 result KPIs (safety / cost / time / quality / etc.)
              </div>

              <div className="grid grid-cols-3 border-b border-gray-500 text-white text-center text-xs font-bold">
                {visibleResultKpis.map((row: any, idx: number) => (
                  <div key={`${row.id}-header`} className={`${idx < 2 ? 'border-r border-gray-500' : ''} bg-kauvery-purple py-1`}>
                    {row.title || `KPI ${idx + 1}`}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 min-h-[500px] border-b border-gray-500 items-stretch">
                {visibleResultKpis.map((row: any, idx: number) => (
                  <div
                    key={row.id}
                    className={`${idx < 2 ? 'border-r border-gray-500' : ''} bg-gray-100 p-2 flex flex-col min-h-0 min-w-0`}
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
                          <label className="inline-flex items-center gap-1.5 text-[10px] font-black text-gray-700 shrink-0 sm:pt-1">
                            <input
                              type="checkbox"
                              className="shrink-0"
                              checked={!!row.higherIsBetter}
                              onChange={(e) => {
                                const v = e.target.checked;
                                setFormData((prev: any) => {
                                  const list: ResultKpi[] = Array.isArray(prev.resultKpis) ? [...prev.resultKpis] : [];
                                  const pageSize = 3;
                                  const start = (((row.safePage || 1) - 1) * pageSize) + idx;
                                  if (!list[start]) return prev;
                                  list[start] = { ...list[start], higherIsBetter: v };
                                  return { ...prev, resultKpis: list };
                                });
                              }}
                            />
                            <span className="leading-tight">Higher is better</span>
                          </label>
                        </div>
                      </div>
                      <div className="text-center leading-none flex flex-col items-center justify-start pt-0.5 w-full">
                        {(() => {
                          const same = Number(row.beforeNum || 0) === Number(row.afterNum || 0);
                          const isGood = row.improved && !same;
                          const label = same ? 'No change' : isGood ? 'Good' : 'Bad';
                          const higherBetter = !!row.higherIsBetter;
                          const icon = same
                            ? 'remove'
                            : isGood
                              ? higherBetter
                                ? 'arrow_upward'
                                : 'arrow_downward'
                              : 'arrow_upward';
                          const iconClass = same
                            ? 'text-gray-500'
                            : isGood
                              ? 'text-green-600'
                              : 'text-red-600';
                          const textClass = same
                            ? 'text-gray-600'
                            : isGood
                              ? 'text-green-700'
                              : 'text-red-700';
                          return (
                            <>
                              <span className={`material-icons-round text-3xl ${iconClass}`}>
                                {icon}
                              </span>
                              <div className={`text-lg sm:text-[22px] font-black ${textClass} leading-tight mt-0.5`}>
                                {label}
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
                              strokeWidth="1.75"
                              strokeDasharray="5 4"
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
                                const s = 2.4;
                                const ax = x2 - ux * 4.5;
                                const ay = y2 - uy * 4.5;
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

              <div className="grid grid-cols-3 text-xs font-bold border-b border-gray-500 items-stretch">
                {visibleResultKpis.map((row: any, idx: number) => (
                  <div
                    key={`${row.id}-result`}
                    className={`${idx < 2 ? 'border-r border-gray-500' : ''} p-2 flex flex-col min-h-0 min-w-0`}
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

              <div className="flex justify-end">
                <div className="bg-yellow-300 text-black font-black px-3 py-0.5">5</div>
              </div>
            </div>
            </>
            )}
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
              By submitting, you agree that this idea is original and complies with hospital policy.
            </p>
          )}
        </div>
        )}
      </form>
    </div>
  );
});

SuggestionForm.displayName = 'SuggestionForm';
