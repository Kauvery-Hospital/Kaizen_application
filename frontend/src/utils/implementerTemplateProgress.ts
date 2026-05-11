/**
 * Derives implementation % from Kaizen template draft content.
 * Sheet numbering matches SuggestionForm: 1–2 fixed, then Before/After, Process video, Results KPI pages.
 */

const trim = (v: unknown) => String(v ?? '').trim();

function hasAny(...vals: unknown[]) {
  return vals.some((v) => trim(v).length > 0);
}

/** Safe array length (avoids NaN if data is malformed). */
function safeLen(a: unknown): number {
  if (!Array.isArray(a)) return 0;
  const n = a.length;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Mirrors `totalSheets` in SuggestionForm (implement mode). */
export function computeTotalSheetsFromDraft(d: Record<string, unknown> | null | undefined): number {
  const ba = safeLen(d?.beforeAfterSlides);
  const pv = safeLen(d?.processVideoSlides);
  const kLen = safeLen(d?.resultKpis);
  const resultPages = kLen > 0 ? Math.ceil(kLen / 3) : 0;
  const total = 2 + ba + pv + resultPages;
  if (!Number.isFinite(total) || total < 2) return 2;
  return total;
}

/** Stored/API progress → 0–100 integer (never NaN). */
export function clampImplementationPercent(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function isSlide1Filled(d: Record<string, unknown>): boolean {
  const paths = d.teamMemberPhotoPaths as Record<string, unknown> | undefined;
  if (paths && typeof paths === 'object') {
    if (Object.keys(paths).some((k) => trim(paths[k]).length > 0)) return true;
  }
  const rows = Array.isArray(d.teamMemberRows) ? d.teamMemberRows : [];
  if (
    (rows as { employeeId?: string; name?: string }[]).some(
      (r) => trim(r?.employeeId).length > 0 || trim(r?.name).length > 0,
    )
  )
    return true;
  if (trim(d.teamPhotoPath).length > 0 || trim(d.teamPhoto).length > 0) return true;
  return false;
}

function isSlide2Filled(d: Record<string, unknown>): boolean {
  const p = (d.problem || {}) as Record<string, unknown>;
  const a = (d.analysis || {}) as Record<string, unknown>;
  if (hasAny(p.what, p.where, p.when, p.who, p.how)) return true;
  if (hasAny(a.why1, a.why2, a.rootCause)) return true;
  if (trim(d.counterMeasure).length > 0) return true;
  if (trim(d.ideaToEliminate).length > 0) return true;
  if (trim(d.quantitativeResults).length > 0) return true;
  if (trim(d.horizontalDeployment).length > 0) return true;
  const hdCost = Array.isArray(d.horizontalDeploymentCostRows)
    ? (d.horizontalDeploymentCostRows as { item?: string; cost?: string }[])
    : [];
  if (hdCost.some((r) => trim(r?.item).length > 0 || trim(r?.cost).length > 0)) return true;
  const eb = (d.expectedBenefits || {}) as Record<string, unknown>;
  for (const v of Object.values(eb)) {
    if (v === true || v === 'primary' || v === 'secondary') return true;
  }
  const std = (d.standardization || {}) as Record<string, unknown>;
  if (std.opl || std.sop || std.manual || std.others) return true;
  if (trim(std.othersDescription).length > 0) return true;
  return false;
}

function isBaSlideFilled(row: Record<string, unknown> | undefined): boolean {
  if (!row) return false;
  return hasAny(row.beforeImagePath, row.afterImagePath, row.beforeCaption, row.afterCaption);
}

function isProcessSlideFilled(row: Record<string, unknown> | undefined): boolean {
  if (!row) return false;
  return hasAny(
    row.processBeforeVideoPath,
    row.processAfterVideoPath,
    row.processBeforeVideoCaption,
    row.processAfterVideoCaption,
  );
}

function isKpiPageFilled(d: Record<string, unknown>, pageIdx: number): boolean {
  const kpis = Array.isArray(d.resultKpis) ? (d.resultKpis as Record<string, unknown>[]) : [];
  const start = pageIdx * 3;
  const slice = kpis.slice(start, start + 3);
  return slice.some((k) =>
    hasAny(k?.title, k?.metricLabel, k?.before, k?.after, k?.resultNote),
  );
}

/**
 * Counts how many logical slides have meaningful content, divides by total slide count,
 * returns 0–100 (rounded). Used when saving implementation draft.
 */
export function computeImplementationProgressPercentFromDraft(
  draft: Record<string, unknown> | null | undefined,
): number {
  const d = draft || {};
  const total = computeTotalSheetsFromDraft(d);
  if (!Number.isFinite(total) || total <= 0) return 0;

  let filled = 0;
  if (isSlide1Filled(d)) filled++;
  if (isSlide2Filled(d)) filled++;

  const bas = Array.isArray(d.beforeAfterSlides) ? d.beforeAfterSlides : [];
  for (let i = 0; i < bas.length; i++) {
    if (isBaSlideFilled(bas[i] as Record<string, unknown>)) filled++;
  }

  const pvs = Array.isArray(d.processVideoSlides) ? d.processVideoSlides : [];
  for (let i = 0; i < pvs.length; i++) {
    if (isProcessSlideFilled(pvs[i] as Record<string, unknown>)) filled++;
  }

  const kpis = Array.isArray(d.resultKpis) ? d.resultKpis : [];
  const resultPages = kpis.length ? Math.ceil(kpis.length / 3) : 0;
  for (let p = 0; p < resultPages; p++) {
    if (isKpiPageFilled(d, p)) filled++;
  }

  if (!Number.isFinite(filled) || filled < 0) filled = 0;

  const pct = Math.round((filled / total) * 100);
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Card/list display: max(server-stored %, % inferred from saved implementation draft).
 * Lists often showed 0% because users looked before PATCH merged or stored field lagged draft JSON.
 */
export function effectiveImplementationProgressDisplay(s: {
  implementationProgress?: number | null;
  implementationDraft?: unknown;
} | null | undefined): number {
  if (!s) return 0;
  const stored = clampImplementationPercent(s.implementationProgress);
  const fromDraft = computeImplementationProgressPercentFromDraft(
    (s.implementationDraft ?? {}) as Record<string, unknown>,
  );
  return clampImplementationPercent(Math.max(stored, fromDraft));
}
