/**
 * Column set aligned with {@link frontend/src/screens/Reports.tsx} suggestion table
 * (Idea code → Title). Export must not dump full Prisma rows.
 */
export const SUGGESTION_TABLE_EXPORT_COLUMNS: { header: string; key: string }[] = [
  { header: 'Idea code', key: 'code' },
  { header: 'Submitted', key: 'dateSubmitted' },
  { header: 'Unit', key: 'unit' },
  { header: 'Department', key: 'department' },
  { header: 'Clinical / supportive', key: 'category' },
  { header: 'Status', key: 'status' },
  { header: 'Title', key: 'theme' },
];

export function isSuggestionListRow(row: unknown): row is Record<string, unknown> {
  if (!row || typeof row !== 'object') return false;
  const o = row as Record<string, unknown>;
  if ('theme' in o) return true;
  if ('employeeName' in o) return true;
  if ('dateSubmitted' in o && 'status' in o) return true;
  return false;
}

export function pickSuggestionTableRow(
  r: Record<string, unknown>,
): Record<string, unknown> {
  const code = r.code ?? r.id;
  return {
    code: code != null ? String(code) : '',
    dateSubmitted: r.dateSubmitted != null ? String(r.dateSubmitted) : '',
    unit: r.unit != null ? String(r.unit) : '',
    department: r.department != null ? String(r.department) : '',
    category: r.category != null ? String(r.category) : '',
    status: r.status != null ? String(r.status) : '',
    theme: r.theme != null ? String(r.theme) : '',
  };
}

const BREAKDOWN_KEY_ORDER = ['key', 'count', 'approved', 'pending', 'total'] as const;

export function breakdownExportColumns(
  first: Record<string, unknown> | undefined,
): { header: string; key: string }[] {
  if (!first) {
    return [
      { header: 'Name', key: 'key' },
      { header: 'Count', key: 'count' },
    ];
  }
  return BREAKDOWN_KEY_ORDER.filter((k) => k in first).map((key) => ({
    key,
    header:
      key === 'key'
        ? 'Name'
        : key === 'count'
          ? 'Count'
          : key === 'approved'
            ? 'Approved'
            : key === 'pending'
              ? 'Pending'
              : 'Total',
  }));
}

/** KPI-style payloads: scalar fields only (matches Reports KPI cards, not raw JSON blobs). */
export function scalarMetricRows(data: Record<string, unknown>): { metric: string; value: string }[] {
  const out: { metric: string; value: string }[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (k === 'items' || k === 'byUnit') continue;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') continue;
    out.push({ metric: k, value: String(v) });
  }
  return out;
}
