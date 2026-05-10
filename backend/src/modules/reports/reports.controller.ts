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
import { ReportsService } from './reports.service';

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

      if (Array.isArray((data as any)?.items)) {
        const items = (data as any).items as any[];
        if (items.length && typeof items[0] === 'object' && !('key' in items[0] && 'count' in items[0])) {
          // Suggestion-like rows
          ws.columns = [
            { header: 'Code', key: 'code', width: 18 },
            { header: 'Date Submitted', key: 'dateSubmitted', width: 14 },
            { header: 'Unit', key: 'unit', width: 18 },
            { header: 'Department', key: 'department', width: 18 },
            { header: 'Category', key: 'category', width: 12 },
            { header: 'Status', key: 'status', width: 22 },
            { header: 'Theme', key: 'theme', width: 40 },
            { header: 'Employee', key: 'employeeName', width: 22 },
            { header: 'Assigned Implementer', key: 'assignedImplementer', width: 22 },
            { header: 'Assigned Unit', key: 'assignedUnit', width: 18 },
            { header: 'Implementation Stage', key: 'implementationStage', width: 16 },
            { header: 'Progress', key: 'implementationProgress', width: 10 },
          ];
          ws.addRows(
            items.map((r) => ({
              code: r.code,
              dateSubmitted: r.dateSubmitted,
              unit: r.unit,
              department: r.department,
              category: r.category,
              status: r.status,
              theme: r.theme,
              employeeName: r.employeeName,
              assignedImplementer: r.assignedImplementer,
              assignedUnit: r.assignedUnit,
              implementationStage: r.implementationStage,
              implementationProgress: r.implementationProgress,
            })),
          );
        } else {
          // Breakdown rows (key/count) or mixed
          ws.columns = [
            { header: 'Key', key: 'key', width: 30 },
            { header: 'Count', key: 'count', width: 12 },
            { header: 'Approved', key: 'approved', width: 12 },
            { header: 'Pending', key: 'pending', width: 12 },
            { header: 'Total', key: 'total', width: 12 },
          ];
          ws.addRows(items);
        }
      } else {
        // KPI object -> key/value
        ws.columns = [
          { header: 'Metric', key: 'metric', width: 30 },
          { header: 'Value', key: 'value', width: 16 },
        ];
        ws.addRows(
          Object.entries(data as Record<string, unknown>).map(([k, v]) => ({
            metric: k,
            value: typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
          })),
        );
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
      const rows = Array.isArray((data as any)?.items) ? (data as any).items : [data];
      const csv = toCsv(rows);
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

