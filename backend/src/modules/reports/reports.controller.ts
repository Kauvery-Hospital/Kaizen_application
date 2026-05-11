import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard, type JwtAccessPayload } from '../auth/guards/jwt-auth.guard';
import { ReportsQueryDto } from './dto/reports-query.dto';
import { REPORT_CATALOG } from './reports.types';
import { ReportsService } from './reports.service';
import {
  breakdownExportColumns,
  isSuggestionListRow,
  pickSuggestionTableRow,
  scalarMetricRows,
  SUGGESTION_TABLE_EXPORT_COLUMNS,
} from './reports-export.helpers';

function isBreakdownReport(report: string): boolean {
  return REPORT_CATALOG.some((r) => r.id === report && r.kind === 'breakdown');
}

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  async runReport(
    @Req() req: { user: JwtAccessPayload },
    @Query() query: ReportsQueryDto,
  ) {
    return await this.reports.runReport(req.user, query);
  }

  @Get('export')
  async exportReport(
    @Req() req: { user: JwtAccessPayload },
    @Query() query: ReportsQueryDto,
    @Res() res: Response,
  ) {
    // Fetch the JSON first (reuses authorization + scoping).
    const data = await this.reports.runReport(req.user, query);
    const base = String(query.report || 'report').replace(/[^a-zA-Z0-9-_]/g, '');
    const stamp = new Date().toISOString().slice(0, 10);

    // Prefer XLSX via exceljs if available; otherwise fall back to CSV.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Report');

      const d = data as Record<string, unknown>;

      if (Array.isArray(d?.items)) {
        const items = d.items as unknown[];
        const first = items[0] as Record<string, unknown> | undefined;
        const useSuggestionColumns =
          items.length > 0
            ? Boolean(first && isSuggestionListRow(first))
            : !isBreakdownReport(String(query.report));
        if (useSuggestionColumns) {
          // Same 7 columns as Reports.tsx suggestion table
          ws.columns = SUGGESTION_TABLE_EXPORT_COLUMNS.map((c) => ({
            header: c.header,
            key: String(c.key),
            width:
              c.key === 'theme'
                ? 40
                : c.key === 'status'
                  ? 22
                  : c.key === 'code'
                    ? 18
                    : 16,
          }));
          ws.addRows(
            items
              .filter((r) => r && typeof r === 'object')
              .map((r) => pickSuggestionTableRow(r as Record<string, unknown>)),
          );
        } else if (items.length) {
          const cols = breakdownExportColumns(first);
          ws.columns = cols.map((c) => ({
            header: c.header,
            key: c.key,
            width: c.key === 'key' ? 30 : 12,
          }));
          ws.addRows(
            items
              .filter((r) => r && typeof r === 'object')
              .map((r) => {
                const row = r as Record<string, unknown>;
                const out: Record<string, unknown> = {};
                for (const c of cols) {
                  out[c.key] = row[c.key] ?? '';
                }
                return out;
              }),
          );
        } else {
          ws.columns = breakdownExportColumns(undefined).map((c) => ({
            header: c.header,
            key: c.key,
            width: 20,
          }));
        }
      } else if (
        typeof d?.overall === 'number' &&
        Array.isArray(d?.byUnit)
      ) {
        // implementationStatusOverallAndUnit — match UI: total + Unit / Count table
        ws.addRow(['Total in implementation stages', (d.overall as number).toLocaleString()]);
        ws.addRow([]);
        ws.addRow(['Unit', 'Count']);
        for (const r of d.byUnit as { key?: string; count?: number }[]) {
          ws.addRow([r?.key ?? '', r?.count ?? '']);
        }
      } else {
        // Scalar KPI / approval summary (no raw nested JSON)
        ws.columns = [
          { header: 'Metric', key: 'metric', width: 36 },
          { header: 'Value', key: 'value', width: 18 },
        ];
        ws.addRows(scalarMetricRows(d));
      }

      const buf = await wb.xlsx.writeBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
      res.setHeader('Content-Disposition', `attachment; filename="${base}-${stamp}.xlsx"`);
      return res.send(Buffer.from(buf));
    } catch {
      const d = data as Record<string, unknown>;
      let csv: string;
      if (Array.isArray(d?.items)) {
        const items = d.items as unknown[];
        const first = items[0] as Record<string, unknown> | undefined;
        const useSuggestionColumns =
          items.length > 0
            ? Boolean(first && isSuggestionListRow(first))
            : !isBreakdownReport(String(query.report));
        if (useSuggestionColumns) {
          csv = toCsv(
            items
              .filter((r) => r && typeof r === 'object')
              .map((r) => pickSuggestionTableRow(r as Record<string, unknown>)),
          );
        } else if (items.length) {
          const cols = breakdownExportColumns(first);
          csv = toCsv(
            items
              .filter((r) => r && typeof r === 'object')
              .map((r) => {
                const row = r as Record<string, unknown>;
                const out: Record<string, unknown> = {};
                for (const c of cols) out[c.key] = row[c.key] ?? '';
                return out;
              }),
          );
        } else {
          csv = breakdownExportColumns(undefined)
            .map((c) => c.header)
            .join(',');
        }
      } else if (typeof d?.overall === 'number' && Array.isArray(d?.byUnit)) {
        const lines = [
          `Total in implementation stages,${csvEscape(d.overall)}`,
          '',
          'Unit,Count',
          ...(d.byUnit as { key?: string; count?: number }[]).map(
            (r) => `${csvEscape(r?.key ?? '')},${csvEscape(r?.count ?? '')}`,
          ),
        ];
        csv = lines.join('\n');
      } else {
        csv = toCsv(scalarMetricRows(d).map((r) => ({ metric: r.metric, value: r.value })));
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
      res.setHeader('Content-Disposition', `attachment; filename="${base}-${stamp}.csv"`);
      return res.send(csv);
    }
  }
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: any[]): string {
  const arr = Array.isArray(rows) ? rows : [];
  const objects = arr.filter((r) => r && typeof r === 'object');
  const headers = Array.from(
    new Set(objects.flatMap((o) => Object.keys(o))),
  );
  const lines: string[] = [];
  lines.push(headers.map(csvEscape).join(','));
  for (const r of objects) {
    lines.push(headers.map((h) => csvEscape((r as any)[h])).join(','));
  }
  return lines.join('\n');
}

