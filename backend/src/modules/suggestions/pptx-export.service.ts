import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, readdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import PptxGenJS from 'pptxgenjs';
import { PDFDocument } from 'pdf-lib';
import { PrismaService } from '../../database/prisma.service';

type AnyRecord = Record<string, any>;

@Injectable()
export class PptxExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async toDataUriFromRelativePath(relPath: string): Promise<string | null> {
    const rel = String(relPath || '').trim().replace(/\\/g, '/');
    if (!rel) return null;
    const uploadRoot = this.config.get<string>('uploadRoot');
    if (!uploadRoot) return null;
    const abs = join(uploadRoot, ...rel.split('/'));
    const buf = await readFile(abs);
    const ext = extname(rel).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
            ? 'image/webp'
            : 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  }

  private addPageNumber(slide: any, pageNo: number) {
    slide.addShape((PptxGenJS as any).ShapeType.rect, {
      x: 12.55,
      y: 7.05,
      w: 0.78,
      h: 0.38,
      fill: { color: 'FACC15' }, // yellow-300
      line: { color: '111827', width: 0.5 },
    });
    slide.addText(String(pageNo), {
      x: 12.55,
      y: 7.05,
      w: 0.78,
      h: 0.38,
      fontFace: 'Calibri',
      fontSize: 14,
      bold: true,
      color: '111827',
      align: 'center',
    });
  }

  private addHeaderBar(slide: any, opts: { showLogoBox?: boolean } = {}) {
    const purple = '7A1F5C';
    slide.addShape((PptxGenJS as any).ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.33,
      h: 0.55,
      fill: { color: purple },
      line: { color: '111827', width: 1 },
    });
    slide.addText('Kaizen Sheet', {
      x: 0,
      y: 0,
      w: 13.33,
      h: 0.55,
      fontFace: 'Calibri',
      fontSize: 20,
      bold: true,
      color: 'FFFFFF',
      align: 'center',
    });

    if (opts.showLogoBox) {
      // White logo placeholder box on the right like UI (svg can't be reproduced easily in pptxgenjs)
      slide.addShape((PptxGenJS as any).ShapeType.roundRect, {
        x: 12.52,
        y: 0.06,
        w: 0.74,
        h: 0.43,
        fill: { color: 'FFFFFF' },
        line: { color: 'E5E7EB', width: 1 },
      } as any);
      slide.addText('kh', {
        x: 12.52,
        y: 0.12,
        w: 0.74,
        h: 0.35,
        fontFace: 'Calibri',
        fontSize: 14,
        bold: true,
        color: purple,
        align: 'center',
      });
    }
  }

  private addTitleKaizenRow(
    slide: any,
    data: { title: string; kaizenNo: string },
    opts: { variant: 'sheet1' | 'sheet2' | 'sheet3' | 'sheet4' | 'sheet5' } = { variant: 'sheet1' },
  ) {
    const purple = '7A1F5C';
    // Common row: Title/Theme + Kaizen No + small logo cell
    if (opts.variant === 'sheet1') {
      // Match Sheet 2 layout: values shown directly inside the purple bar (no separate "input" value row).
      // UI grid: 6 / 5 / 1 columns (out of 12) across 13.33" width.
      const div1 = 13.33 * (6 / 12); // ~6.665
      const div2 = 13.33 * (11 / 12); // ~12.22
      slide.addShape((PptxGenJS as any).ShapeType.rect, { x: 0, y: 0.55, w: 13.33, h: 0.35, fill: { color: purple }, line: { color: '374151', width: 1 } });
      slide.addShape((PptxGenJS as any).ShapeType.line, { x: div1, y: 0.55, w: 0, h: 0.35, line: { color: '374151', width: 1 } });
      slide.addShape((PptxGenJS as any).ShapeType.line, { x: div2, y: 0.55, w: 0, h: 0.35, line: { color: '374151', width: 1 } });
      slide.addText(`Title/Theme: ${data.title || '-'}`, { x: 0.2, y: 0.58, w: div1 - 0.3, h: 0.3, fontFace: 'Calibri', fontSize: 12, bold: true, color: 'FFFFFF' });
      slide.addText(`Kaizen No: ${data.kaizenNo || '-'}`, { x: div1 + 0.15, y: 0.58, w: (div2 - div1) - 0.25, h: 0.3, fontFace: 'Calibri', fontSize: 12, bold: true, color: 'FFFFFF' });
      slide.addShape((PptxGenJS as any).ShapeType.rect, { x: div2, y: 0.55, w: 13.33 - div2, h: 0.35, fill: { color: 'FFFFFF' }, line: { color: '374151', width: 1 } });
      slide.addText('kauvery', { x: div2, y: 0.6, w: 13.33 - div2, h: 0.25, fontFace: 'Calibri', fontSize: 10, bold: true, color: purple, align: 'center' });
      return;
    }

    // Sheets 2/4/5 share 9 / 2 / 1-ish look in UI; implement a consistent row.
    slide.addShape((PptxGenJS as any).ShapeType.rect, { x: 0, y: 0.55, w: 13.33, h: 0.35, fill: { color: purple }, line: { color: '374151', width: 1 } });
    slide.addShape((PptxGenJS as any).ShapeType.line, { x: 10.95, y: 0.55, w: 0, h: 0.35, line: { color: '374151', width: 1 } });
    slide.addShape((PptxGenJS as any).ShapeType.line, { x: 12.22, y: 0.55, w: 0, h: 0.35, line: { color: '374151', width: 1 } });
    slide.addText(`Title/Theme: ${data.title || '-'}`, { x: 0.2, y: 0.58, w: 10.7, h: 0.3, fontFace: 'Calibri', fontSize: 12, bold: true, color: 'FFFFFF' });
    slide.addText(`Kaizen No: ${data.kaizenNo || '-'}`, { x: 11.05, y: 0.58, w: 1.1, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: 'FFFFFF' });
    slide.addShape((PptxGenJS as any).ShapeType.rect, { x: 12.22, y: 0.55, w: 1.11, h: 0.35, fill: { color: 'FFFFFF' }, line: { color: '374151', width: 1 } });
    slide.addText('kh', { x: 12.22, y: 0.6, w: 1.11, h: 0.25, fontFace: 'Calibri', fontSize: 12, bold: true, color: purple, align: 'center' });
  }

  async buildSuggestionPptx(suggestionId: string): Promise<Buffer> {
    const suggestion = await this.prisma.suggestion.findUnique({
      where: { id: suggestionId },
      include: { implementedKaizen: true },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');

    const snapshot = (suggestion.implementedKaizen?.dataSnapshot as AnyRecord | null) ?? null;
    const draft =
      (suggestion.implementationDraft as AnyRecord | null) ??
      (snapshot?.implementationDraft as AnyRecord | null) ??
      null;
    const data: AnyRecord = { ...(snapshot || {}), ...(draft || {}) };

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'Kaizen Application';
    pptx.company = 'Kauvery Hospital';
    pptx.subject = 'Kaizen Implementation Template';

    const title = String(suggestion.theme || '');
    const kaizenNo = String(suggestion.code || suggestion.id);
    const purple = '7A1F5C';

    // Slide 1
    {
      const s1 = pptx.addSlide();
      this.addHeaderBar(s1);
      this.addTitleKaizenRow(s1, { title, kaizenNo }, { variant: 'sheet1' });

      // Photo area background + border (matches UI large grey panel)
      s1.addShape((PptxGenJS as any).ShapeType.rect, {
        x: 0,
        y: 1.4,
        w: 13.33,
        h: 3.35,
        fill: { color: 'F3F4F6' },
        line: { color: '6B7280', width: 1 },
      });

      // Member photos (up to 5) placed in a grid like UI
      const memberPhotoPaths: Record<string, string> =
        (data.teamMemberPhotoPaths as any) ?? {};
      const memberIds = Object.keys(memberPhotoPaths).slice(0, 5);
      const count = memberIds.length || 1;
      const cols = count <= 1 ? 1 : count <= 2 ? 2 : 3;
      const rows = count <= 3 ? 1 : 2;
      const startX = 0.45;
      const startY = 1.55;
      const usableW = 12.43;
      const usableH = 3.05;
      const gap = 0.18;
      const boxW = (usableW - gap * (cols - 1)) / cols;
      const boxH = (usableH - gap * (rows - 1)) / rows;

      for (let i = 0; i < memberIds.length; i++) {
        const id = memberIds[i];
        const rel = memberPhotoPaths[id];
        const uri = await this.toDataUriFromRelativePath(rel);
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = startX + c * (boxW + gap);
        const y = startY + r * (boxH + gap);

        // slot border like UI
        s1.addShape((PptxGenJS as any).ShapeType.roundRect, {
          x,
          y,
          w: boxW,
          h: boxH,
          fill: { color: 'FFFFFF' },
          line: { color: '9CA3AF', width: 1 },
        } as any);
        // Employee badge (black translucent in UI; use solid dark)
        s1.addShape((PptxGenJS as any).ShapeType.roundRect, {
          x: x + 0.08,
          y: y + 0.08,
          w: 1.25,
          h: 0.28,
          fill: { color: '111827' },
          line: { color: '111827', width: 0.5 },
        } as any);
        s1.addText(id, {
          x: x + 0.1,
          y: y + 0.1,
          w: 1.21,
          h: 0.24,
          fontFace: 'Calibri',
          fontSize: 11,
          bold: true,
          color: 'FFFFFF',
          align: 'center',
        });

        if (!uri) continue;
        s1.addImage({
          data: uri,
          x: x + 0.06,
          y: y + 0.06,
          w: boxW - 0.12,
          h: boxH - 0.12,
        });
      }

      this.addPageNumber(s1, 1);
    }

    // Slide 2 (text-heavy snapshot)
    {
      const s2 = pptx.addSlide();
      // Match UI overall framing: header + title/kaizen row + two main columns + footer bars.
      this.addHeaderBar(s2, { showLogoBox: false });
      this.addTitleKaizenRow(s2, { title, kaizenNo }, { variant: 'sheet2' });

      // Main content frame
      const topY = 0.9;
      const mainY = 1.25;
      const mainH = 4.95;
      s2.addShape((PptxGenJS as any).ShapeType.rect, {
        x: 0,
        y: topY,
        w: 13.33,
        h: 6.55 - topY,
        fill: { color: 'FFFFFF' },
        line: { color: '6B7280', width: 1 },
      });

      // Two columns (6 / 6) with divider
      s2.addShape((PptxGenJS as any).ShapeType.line, { x: 6.66, y: mainY, w: 0, h: mainH, line: { color: '6B7280', width: 1 } });

      // Left column header
      s2.addShape((PptxGenJS as any).ShapeType.rect, { x: 0, y: mainY, w: 6.66, h: 0.25, fill: { color: 'F3F4F6' }, line: { color: '6B7280', width: 1 } });
      s2.addText('Problem / Present Status', { x: 0, y: mainY + 0.02, w: 6.66, h: 0.22, fontFace: 'Calibri', fontSize: 10, bold: true, color: '111827', align: 'center' });

      // Right column header
      s2.addShape((PptxGenJS as any).ShapeType.rect, { x: 6.66, y: mainY, w: 6.67, h: 0.25, fill: { color: 'F3F4F6' }, line: { color: '6B7280', width: 1 } });
      s2.addText('PQCDSEM / Standardization / Results', { x: 6.66, y: mainY + 0.02, w: 6.67, h: 0.22, fontFace: 'Calibri', fontSize: 10, bold: true, color: '111827', align: 'center' });

      const safe = (v: any) => String(v ?? '').trim();
      const leftTextLines = [
        `Problem - What: ${safe(data.problem?.what)}`,
        `Problem - Where: ${safe(data.problem?.where)}`,
        `Problem - When: ${safe(data.problem?.when)}`,
        `Present Status - How: ${safe(data.problem?.how)}`,
        `Present Status - How Much: ${safe(data.howMuch)}`,
        '',
        'Why-Why Analysis:',
        `Why 1: ${safe(data.analysis?.why1)}`,
        `Why 2: ${safe(data.analysis?.why2)}`,
        `Why 3: ${safe(data.analysis?.why3)}`,
        `Root Cause: ${safe(data.analysis?.rootCause)}`,
        `Idea to Eliminate: ${safe(data.ideaToEliminate)}`,
        '',
        `Counter Measure: ${safe(data.counterMeasure)}`,
      ].filter(Boolean);

      s2.addText(leftTextLines.join('\n'), {
        x: 0.25,
        y: mainY + 0.3,
        w: 6.2,
        h: mainH - 0.35,
        fontFace: 'Calibri',
        fontSize: 10,
        color: '111827',
        valign: 'top',
      } as any);

      const expected = data.expectedBenefits || {};
      const pqcdsem = [
        `P Productivity: ${expected.productivity ? 'Yes' : 'No'}`,
        `Q Quality: ${expected.quality ? 'Yes' : 'No'}`,
        `C Cost: ${expected.cost ? 'Yes' : 'No'}`,
        `D Delivery: ${expected.delivery ? 'Yes' : 'No'}`,
        `S Safety: ${expected.safety ? 'Yes' : 'No'}`,
        `E Environment/Energy: ${expected.environment ? 'Yes' : 'No'}`,
        `M Morale: ${expected.morale ? 'Yes' : 'No'}`,
      ];
      const std = data.standardization || {};
      const stdLines = [
        'Standardization:',
        `OPL: ${std.opl ? 'Yes' : 'No'}`,
        `SOP: ${std.sop ? 'Yes' : 'No'}`,
        `Manual: ${std.manual ? 'Yes' : 'No'}`,
        `Others: ${std.others ? `Yes (${safe(std.othersDescription)})` : 'No'}`,
      ];

      const rightTextLines = [
        `Category: ${safe(data.category)}`,
        `Unit: ${safe(data.unit)}`,
        `Area/Location: ${safe(data.area)}`,
        `Start Date: ${safe(data.startDate)}`,
        `Completion Date: ${safe(data.completionDate)}`,
        '',
        ...pqcdsem,
        '',
        ...stdLines,
        '',
        `Quantitative Results:\n${safe(data.quantitativeResults) || '—'}`,
        '',
        `Horizontal Deployment:\n${safe(data.horizontalDeployment) || '—'}`,
      ];

      s2.addText(rightTextLines.join('\n'), {
        x: 6.9,
        y: mainY + 0.3,
        w: 6.2,
        h: mainH - 0.35,
        fontFace: 'Calibri',
        fontSize: 10,
        color: '111827',
        valign: 'top',
      } as any);

      // Footer bands like UI (simplified but keeps purple bar sections)
      const footerY = 6.25;
      s2.addShape((PptxGenJS as any).ShapeType.rect, { x: 0, y: footerY, w: 13.33, h: 0.32, fill: { color: purple }, line: { color: '6B7280', width: 1 } });
      s2.addText('Team Members | Prepared By | Validated By (HOD) | Validated By (Finance)', {
        x: 0.2,
        y: footerY + 0.05,
        w: 12.9,
        h: 0.25,
        fontFace: 'Calibri',
        fontSize: 10,
        bold: true,
        color: 'FFFFFF',
      });

      this.addPageNumber(s2, 2);
    }

    // Slide 3 (before/after images if available)
    {
      const s3 = pptx.addSlide();
      // UI: header bar with logo box on right + title/kaizen row + Before/After header row + two framed areas
      this.addHeaderBar(s3, { showLogoBox: true });

      // Title/Kaizen row (2 columns)
      s3.addShape((PptxGenJS as any).ShapeType.rect, { x: 0, y: 0.55, w: 13.33, h: 0.45, fill: { color: purple }, line: { color: '111827', width: 1 } });
      s3.addShape((PptxGenJS as any).ShapeType.line, { x: 6.665, y: 0.55, w: 0, h: 0.45, line: { color: 'FFFFFF', width: 0.5 } });
      s3.addText(`Title/Theme: ${title || '—'}`, { x: 0.25, y: 0.64, w: 6.2, h: 0.3, fontFace: 'Calibri', fontSize: 14, bold: true, color: 'FFFFFF' });
      s3.addText(`Kaizen No: ${kaizenNo || '—'}`, { x: 6.9, y: 0.64, w: 6.2, h: 0.3, fontFace: 'Calibri', fontSize: 14, bold: true, color: 'FFFFFF' });

      // Before/After header row
      s3.addShape((PptxGenJS as any).ShapeType.rect, { x: 0, y: 1.0, w: 13.33, h: 0.42, fill: { color: purple }, line: { color: '111827', width: 1 } });
      s3.addShape((PptxGenJS as any).ShapeType.line, { x: 6.665, y: 1.0, w: 0, h: 0.42, line: { color: 'FFFFFF', width: 0.5 } });
      s3.addText('Before', { x: 0, y: 1.05, w: 6.665, h: 0.3, fontFace: 'Calibri', fontSize: 16, bold: true, color: 'FFFFFF', align: 'center' });
      s3.addText('After', { x: 6.665, y: 1.05, w: 6.665, h: 0.3, fontFace: 'Calibri', fontSize: 16, bold: true, color: 'FFFFFF', align: 'center' });

      // Image frames
      const frameY = 1.42;
      const frameH = 5.55;
      s3.addShape((PptxGenJS as any).ShapeType.rect, { x: 0, y: frameY, w: 13.33, h: frameH, fill: { color: 'FFFFFF' }, line: { color: '111827', width: 1 } });
      s3.addShape((PptxGenJS as any).ShapeType.line, { x: 6.665, y: frameY, w: 0, h: frameH, line: { color: '111827', width: 1 } });
      s3.addShape((PptxGenJS as any).ShapeType.rect, { x: 0.25, y: frameY + 0.25, w: 6.165, h: frameH - 0.5, fill: { color: 'F3F4F6' }, line: { color: '9CA3AF', width: 1 } });
      s3.addShape((PptxGenJS as any).ShapeType.rect, { x: 6.915, y: frameY + 0.25, w: 6.165, h: frameH - 0.5, fill: { color: 'F3F4F6' }, line: { color: '9CA3AF', width: 1 } });

      const beforePath = String((data.beforeImagePath || '').trim());
      const afterPath = String((data.afterImagePath || '').trim());
      const beforeUri = beforePath ? await this.toDataUriFromRelativePath(beforePath) : null;
      const afterUri = afterPath ? await this.toDataUriFromRelativePath(afterPath) : null;
      if (beforeUri) s3.addImage({ data: beforeUri, x: 0.28, y: frameY + 0.28, w: 6.11, h: frameH - 0.56 });
      if (afterUri) s3.addImage({ data: afterUri, x: 6.945, y: frameY + 0.28, w: 6.11, h: frameH - 0.56 });
      if (!beforeUri) s3.addText('No before image uploaded.', { x: 0.25, y: frameY + 2.8, w: 6.165, h: 0.4, fontFace: 'Calibri', fontSize: 14, bold: true, color: '6B7280', align: 'center' });
      if (!afterUri) s3.addText('No after image uploaded.', { x: 6.915, y: frameY + 2.8, w: 6.165, h: 0.4, fontFace: 'Calibri', fontSize: 14, bold: true, color: '6B7280', align: 'center' });

      this.addPageNumber(s3, 3);
    }

    // Slide 4 (video captions + links)
    {
      const s4 = pptx.addSlide();
      this.addHeaderBar(s4);
      this.addTitleKaizenRow(s4, { title, kaizenNo }, { variant: 'sheet4' });

      // Blue note bar (UI)
      s4.addShape((PptxGenJS as any).ShapeType.rect, { x: 0, y: 0.9, w: 13.33, h: 0.45, fill: { color: '2563EB' }, line: { color: '1E40AF', width: 1 } });
      s4.addText('Note: If any process flow or video demonstration is required, Kindly use this slide.', {
        x: 0.25,
        y: 0.98,
        w: 12.83,
        h: 0.35,
        fontFace: 'Calibri',
        fontSize: 12,
        bold: true,
        color: 'FFFFFF',
        align: 'center',
      });

      // Before/After header row
      s4.addShape((PptxGenJS as any).ShapeType.rect, { x: 0, y: 1.35, w: 13.33, h: 0.32, fill: { color: purple }, line: { color: '6B7280', width: 1 } });
      s4.addShape((PptxGenJS as any).ShapeType.line, { x: 6.665, y: 1.35, w: 0, h: 0.32, line: { color: '6B7280', width: 1 } });
      s4.addText('Before', { x: 0, y: 1.4, w: 6.665, h: 0.22, fontFace: 'Calibri', fontSize: 14, bold: true, color: 'FFFFFF', align: 'center' });
      s4.addText('After', { x: 6.665, y: 1.4, w: 6.665, h: 0.22, fontFace: 'Calibri', fontSize: 14, bold: true, color: 'FFFFFF', align: 'center' });

      // Two columns with grey background
      const bodyY = 1.67;
      const bodyH = 5.38;
      s4.addShape((PptxGenJS as any).ShapeType.rect, { x: 0, y: bodyY, w: 13.33, h: bodyH, fill: { color: 'F3F4F6' }, line: { color: '6B7280', width: 1 } });
      s4.addShape((PptxGenJS as any).ShapeType.line, { x: 6.665, y: bodyY, w: 0, h: bodyH, line: { color: '6B7280', width: 1 } });

      // Video frames
      const frameY = bodyY + 0.2;
      const frameH = 3.9;
      s4.addShape((PptxGenJS as any).ShapeType.roundRect, { x: 0.35, y: frameY, w: 6.0, h: frameH, fill: { color: 'FFFFFF' }, line: { color: '9CA3AF', width: 1 }, radius: 0.08 } as any);
      s4.addShape((PptxGenJS as any).ShapeType.roundRect, { x: 6.98, y: frameY, w: 6.0, h: frameH, fill: { color: 'FFFFFF' }, line: { color: '9CA3AF', width: 1 }, radius: 0.08 } as any);

      const beforeVid = String((data.processBeforeVideoPath || '').trim());
      const afterVid = String((data.processAfterVideoPath || '').trim());
      const beforeCap = String((data.processBeforeVideoCaption || '').trim());
      const afterCap = String((data.processAfterVideoCaption || '').trim());

      // Captions (below frame)
      s4.addText('Caption', { x: 0.35, y: frameY + frameH + 0.12, w: 6.0, h: 0.2, fontFace: 'Calibri', fontSize: 10, bold: true, color: '374151' });
      s4.addShape((PptxGenJS as any).ShapeType.roundRect, { x: 0.35, y: frameY + frameH + 0.32, w: 6.0, h: 0.45, fill: { color: 'FFFFFF' }, line: { color: 'D1D5DB', width: 1 }, radius: 0.06 } as any);
      s4.addText(beforeCap || '—', { x: 0.45, y: frameY + frameH + 0.36, w: 5.8, h: 0.38, fontFace: 'Calibri', fontSize: 11, bold: true, color: '111827' });

      s4.addText('Caption', { x: 6.98, y: frameY + frameH + 0.12, w: 6.0, h: 0.2, fontFace: 'Calibri', fontSize: 10, bold: true, color: '374151' });
      s4.addShape((PptxGenJS as any).ShapeType.roundRect, { x: 6.98, y: frameY + frameH + 0.32, w: 6.0, h: 0.45, fill: { color: 'FFFFFF' }, line: { color: 'D1D5DB', width: 1 }, radius: 0.06 } as any);
      s4.addText(afterCap || '—', { x: 7.08, y: frameY + frameH + 0.36, w: 5.8, h: 0.38, fontFace: 'Calibri', fontSize: 11, bold: true, color: '111827' });

      // File references inside frames (until we embed videos)
      s4.addText(beforeVid ? `Video: ${beforeVid}` : 'No before video uploaded.', {
        x: 0.55,
        y: frameY + 1.7,
        w: 5.6,
        h: 0.6,
        fontFace: 'Calibri',
        fontSize: 12,
        bold: true,
        color: beforeVid ? '1D4ED8' : '6B7280',
        align: 'center',
      });
      s4.addText(afterVid ? `Video: ${afterVid}` : 'No after video uploaded.', {
        x: 7.18,
        y: frameY + 1.7,
        w: 5.6,
        h: 0.6,
        fontFace: 'Calibri',
        fontSize: 12,
        bold: true,
        color: afterVid ? '1D4ED8' : '6B7280',
        align: 'center',
      });

      this.addPageNumber(s4, 4);
    }

    // Slide 5 (3 KPI summary)
    {
      const s5 = pptx.addSlide();
      this.addHeaderBar(s5);
      this.addTitleKaizenRow(s5, { title, kaizenNo }, { variant: 'sheet5' });

      // Results row (big)
      s5.addShape((PptxGenJS as any).ShapeType.rect, { x: 0, y: 0.9, w: 13.33, h: 0.55, fill: { color: purple }, line: { color: '6B7280', width: 1 } });
      s5.addShape((PptxGenJS as any).ShapeType.line, { x: 9.99, y: 0.9, w: 0, h: 0.55, line: { color: '6B7280', width: 1 } });
      s5.addText('Results', { x: 0, y: 0.98, w: 9.99, h: 0.4, fontFace: 'Calibri', fontSize: 26, bold: true, color: 'FFFFFF', align: 'center' });

      // Helper line
      s5.addText('Fill any 3 result KPIs (safety / cost / time / quality / etc.)', {
        x: 0.25,
        y: 1.5,
        w: 12.8,
        h: 0.25,
        fontFace: 'Calibri',
        fontSize: 11,
        bold: true,
        color: '374151',
      });

      // KPI header (3 columns)
      const headerY = 1.8;
      s5.addShape((PptxGenJS as any).ShapeType.rect, { x: 0, y: headerY, w: 13.33, h: 0.32, fill: { color: purple }, line: { color: '6B7280', width: 1 } });
      s5.addShape((PptxGenJS as any).ShapeType.line, { x: 4.443, y: headerY, w: 0, h: 0.32, line: { color: '6B7280', width: 1 } });
      s5.addShape((PptxGenJS as any).ShapeType.line, { x: 8.886, y: headerY, w: 0, h: 0.32, line: { color: '6B7280', width: 1 } });

      const kpis = Array.isArray(data.resultKpis) ? data.resultKpis.slice(0, 3) : [];
      for (let i = 0; i < 3; i++) {
        const k = kpis[i] || {};
        const x0 = i * 4.443;
        const w = 4.443;
        const titleText = String(k.title || `KPI ${i + 1}`);
        s5.addText(titleText, { x: x0, y: headerY + 0.06, w, h: 0.22, fontFace: 'Calibri', fontSize: 12, bold: true, color: 'FFFFFF', align: 'center' });

        // Column body background like UI (gray-100)
        const colY = headerY + 0.32;
        const colH = 4.75;
        s5.addShape((PptxGenJS as any).ShapeType.rect, { x: x0, y: colY, w, h: colH, fill: { color: 'F3F4F6' }, line: { color: '6B7280', width: 1 } });

        const beforeVal = k.before ?? '';
        const afterVal = k.after ?? '';
        const higherIsBetter = !!k.higherIsBetter;
        const bNum = Number(beforeVal);
        const aNum = Number(afterVal);
        const same = Number.isFinite(bNum) && Number.isFinite(aNum) ? bNum === aNum : false;
        const improved = Number.isFinite(bNum) && Number.isFinite(aNum)
          ? (higherIsBetter ? aNum > bNum : aNum < bNum)
          : false;
        const label = same ? 'No change' : improved ? 'Good' : 'Bad';
        const labelColor = same ? '6B7280' : improved ? '15803D' : 'B91C1C';

        s5.addText(label, { x: x0 + 2.9, y: colY + 0.1, w: w - 3.1, h: 0.35, fontFace: 'Calibri', fontSize: 18, bold: true, color: labelColor, align: 'right' });
        s5.addText(String(k.metricLabel || ''), { x: x0 + 0.2, y: colY + 0.1, w: 2.6, h: 0.3, fontFace: 'Calibri', fontSize: 10, bold: true, color: '374151' });

        // Simple chart area (white box)
        s5.addShape((PptxGenJS as any).ShapeType.rect, { x: x0 + 0.2, y: colY + 0.55, w: w - 0.4, h: 2.45, fill: { color: 'FFFFFF' }, line: { color: 'D1D5DB', width: 1 } });

        // Bars (normalized)
        const max = Math.max(1, ...(Number.isFinite(bNum) ? [bNum] : [0]), ...(Number.isFinite(aNum) ? [aNum] : [0]));
        const barMaxH = 1.75;
        const beforePct = Number.isFinite(bNum) ? Math.max(0, Math.min(1, bNum / max)) : 0;
        const afterPct = Number.isFinite(aNum) ? Math.max(0, Math.min(1, aNum / max)) : 0;
        const baseY = colY + 0.55 + 2.25;
        s5.addShape((PptxGenJS as any).ShapeType.rect, { x: x0 + 1.25, y: baseY - barMaxH * beforePct, w: 0.5, h: barMaxH * beforePct, fill: { color: 'DC2626' }, line: { color: 'B91C1C', width: 1 } });
        s5.addShape((PptxGenJS as any).ShapeType.rect, { x: x0 + 2.55, y: baseY - barMaxH * afterPct, w: 0.5, h: barMaxH * afterPct, fill: { color: '15803D' }, line: { color: '166534', width: 1 } });
        s5.addText(String(Number.isFinite(bNum) ? bNum : 0), { x: x0 + 1.05, y: baseY - barMaxH * beforePct - 0.25, w: 0.9, h: 0.2, fontFace: 'Calibri', fontSize: 9, bold: true, color: '374151', align: 'center' });
        s5.addText(String(Number.isFinite(aNum) ? aNum : 0), { x: x0 + 2.35, y: baseY - barMaxH * afterPct - 0.25, w: 0.9, h: 0.2, fontFace: 'Calibri', fontSize: 9, bold: true, color: '374151', align: 'center' });
        s5.addText('Before', { x: x0 + 0.9, y: baseY + 0.05, w: 1.2, h: 0.2, fontFace: 'Calibri', fontSize: 10, bold: true, color: '374151', align: 'center' });
        s5.addText('After', { x: x0 + 2.2, y: baseY + 0.05, w: 1.2, h: 0.2, fontFace: 'Calibri', fontSize: 10, bold: true, color: '374151', align: 'center' });

        // Result note area (bottom, like UI)
        s5.addText('Result:', { x: x0 + 0.2, y: colY + 3.1, w: w - 0.4, h: 0.25, fontFace: 'Calibri', fontSize: 14, bold: true, italic: true, underline: { style: 'sng' }, color: '111827' } as any);
        s5.addShape((PptxGenJS as any).ShapeType.rect, { x: x0 + 0.2, y: colY + 3.35, w: w - 0.4, h: 1.05, fill: { color: 'FFFFFF' }, line: { color: 'D1D5DB', width: 1 } });
        s5.addText(String(k.resultNote || ''), { x: x0 + 0.25, y: colY + 3.4, w: w - 0.5, h: 0.95, fontFace: 'Calibri', fontSize: 10, color: '111827', valign: 'top' } as any);
      }

      this.addPageNumber(s5, 5);
    }

    // typings differ across pptxgenjs versions
    const out = await (pptx as any).write('nodebuffer');
    return Buffer.from(out);
  }

  async buildRenderedSlidesPptx(slides: string[]): Promise<Buffer> {
    const list = Array.isArray(slides) ? slides.filter(Boolean) : [];
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'Kaizen Application';
    pptx.company = 'Kauvery Hospital';
    pptx.subject = 'Kaizen Implementation Template (Rendered)';

    // Wide layout is 13.33 x 7.5 in pptxgenjs
    const W = 13.33;
    const H = 7.5;
    const M = 0.08; // small margin to avoid edge clipping in viewers
    const maxW = W - M * 2;
    const maxH = H - M * 2;

    for (const dataUri of list) {
      const uri = String(dataUri || '').trim();
      if (!uri.startsWith('data:image/')) continue;
      const slide = pptx.addSlide();
      // Always fit the captured slide image inside a safe frame.
      // This guarantees no cropping across PPT viewers even if the PNG aspect ratio is slightly off.
      slide.addImage({ data: uri, x: M, y: M, w: maxW, h: maxH });
    }

    if (list.length === 0) {
      const s = pptx.addSlide();
      s.addText('No rendered slides provided.', { x: 0.6, y: 1.0, w: 12.0, h: 0.6, fontFace: 'Calibri', fontSize: 18, bold: true });
    }

    const out = await (pptx as any).write('nodebuffer');
    return Buffer.from(out);
  }

  private tryGetImageSize(
    mime: string,
    bytes: Uint8Array,
  ): { width: number; height: number } | null {
    const m = String(mime || '').toLowerCase();
    if (m === 'image/png') return this.tryGetPngSize(bytes);
    if (m === 'image/jpeg' || m === 'image/jpg') return this.tryGetJpegSize(bytes);
    return null;
  }

  private tryGetPngSize(bytes: Uint8Array): { width: number; height: number } | null {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (!bytes || bytes.length < 24) return null;
    if (
      bytes[0] !== 0x89 ||
      bytes[1] !== 0x50 ||
      bytes[2] !== 0x4e ||
      bytes[3] !== 0x47 ||
      bytes[4] !== 0x0d ||
      bytes[5] !== 0x0a ||
      bytes[6] !== 0x1a ||
      bytes[7] !== 0x0a
    ) {
      return null;
    }
    // First chunk should be IHDR at offset 12 (after 8-byte sig + 4-byte length)
    const t0 = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (t0 !== 'IHDR') return null;
    try {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = dv.getUint32(16, false);
      const height = dv.getUint32(20, false);
      if (!width || !height) return null;
      return { width, height };
    } catch {
      return null;
    }
  }

  private tryGetJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
    // Minimal JPEG SOF parser (supports baseline/progressive SOF markers)
    if (!bytes || bytes.length < 4) return null;
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // SOI
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      // Standalone markers: restart markers + TEM
      if (marker === 0xd9) break; // EOI
      if (marker >= 0xd0 && marker <= 0xd7) {
        i += 2;
        continue;
      }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len < 2) return null;
      const isSof =
        marker === 0xc0 ||
        marker === 0xc1 ||
        marker === 0xc2 ||
        marker === 0xc3 ||
        marker === 0xc5 ||
        marker === 0xc6 ||
        marker === 0xc7 ||
        marker === 0xc9 ||
        marker === 0xca ||
        marker === 0xcb ||
        marker === 0xcd ||
        marker === 0xce ||
        marker === 0xcf;
      if (isSof) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        if (!width || !height) return null;
        return { width, height };
      }
      i += 2 + len;
    }
    return null;
  }

  private decodeDataUri(
    dataUri: string,
  ): { mime: string; bytes: Uint8Array } | null {
    const s = String(dataUri || '').trim();
    const m = s.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/);
    if (!m) return null;
    const mime = m[1];
    const b64 = m[2];
    try {
      return { mime, bytes: Uint8Array.from(Buffer.from(b64, 'base64')) };
    } catch {
      return null;
    }
  }

  async buildRenderedSlidesPdf(slides: string[]): Promise<Buffer> {
    // The 4th sheet (index 3) is the "before/after process video" page.
    // In some environments html-to-image capture of that sheet can produce a blank/white image.
    // PPT output can still include it, but for PDF exports we intentionally drop that sheet.
    const list = Array.isArray(slides)
      ? slides.filter(Boolean).filter((_, idx) => idx !== 3)
      : [];
    const pdfDoc = await PDFDocument.create();

    for (const dataUri of list) {
      const decoded = this.decodeDataUri(dataUri);
      if (!decoded?.bytes) continue;
      // html-to-image exports PNG by default; embed as PNG
      const img = await pdfDoc.embedPng(decoded.bytes);
      const { width, height } = img.size();
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(img, { x: 0, y: 0, width, height });
    }

    if (pdfDoc.getPageCount() === 0) {
      const page = pdfDoc.addPage([842, 595]); // A4 landscape (approx)
      page.drawText('No rendered slides provided.', { x: 50, y: 520, size: 22 });
    }

    const out = await pdfDoc.save();
    return Buffer.from(out);
  }

  async finalizeTemplateAssets(
    suggestionId: string,
    slides: string[],
    fileNameBaseRaw?: string,
  ): Promise<{ pptPath: string; pdfPath: string }> {
    const suggestion = await this.prisma.suggestion.findUnique({
      where: { id: suggestionId },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');

    const uploadRoot = this.config.get<string>('uploadRoot');
    if (!uploadRoot) throw new NotFoundException('Upload root not configured');

    const employeeCode = String(suggestion.assignedImplementerCode || 'UNKNOWN')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '') || 'UNKNOWN';

    const safeBase = String(fileNameBaseRaw || suggestion.code || suggestionId)
      .trim()
      .replace(/[^a-zA-Z0-9-_]/g, '')
      .slice(0, 60);

    const relDir = `kaizen/${employeeCode}/kaizen_template/final`;
    const absDir = join(uploadRoot, ...relDir.split('/'));
    await mkdir(absDir, { recursive: true });

    // Deterministic filenames so "final" truly replaces (no file growth).
    const pptFile = `${safeBase || 'kaizen'}.pptx`;
    const pdfFile = `${safeBase || 'kaizen'}.pdf`;

    const pptBuf = await this.buildRenderedSlidesPptx(slides);
    const pdfBuf = await this.buildRenderedSlidesPdf(slides);

    const absPpt = join(absDir, pptFile);
    const absPdf = join(absDir, pdfFile);

    // Clean up old exports in the final folder (best-effort).
    // We intentionally keep only ONE final PPT + PDF in this directory.
    try {
      const items = await readdir(absDir, { withFileTypes: true });
      const deletions = items
        .filter((d) => d.isFile())
        .map((d) => d.name)
        .filter((name) => {
          const n = name.toLowerCase();
          return n.endsWith('.pptx') || n.endsWith('.ppt') || n.endsWith('.pdf');
        })
        .filter((name) => name !== pptFile && name !== pdfFile)
        .map(async (name) => {
          try {
            await unlink(join(absDir, name));
          } catch {
            // ignore missing/locked files
          }
        });
      await Promise.all(deletions);
    } catch {
      // ignore cleanup failures; overwrite will still happen
    }

    await writeFile(absPpt, pptBuf);
    await writeFile(absPdf, pdfBuf);

    const pptPath = `${relDir}/${pptFile}`;
    const pdfPath = `${relDir}/${pdfFile}`;

    const existing: string[] = Array.isArray(suggestion.templateAttachmentPaths)
      ? (suggestion.templateAttachmentPaths as any)
      : [];

    // Replace previous FINAL exports in DB (avoid appending on every re-finalize).
    const keepNonFinal = existing.filter(
      (p) => !String(p || '').replace(/\\/g, '/').startsWith(`${relDir}/`),
    );
    const next = [...keepNonFinal, pptPath, pdfPath];
    await this.prisma.suggestion.update({
      where: { id: suggestionId },
      data: { templateAttachmentPaths: next as any },
    });

    return { pptPath, pdfPath };
  }
}

