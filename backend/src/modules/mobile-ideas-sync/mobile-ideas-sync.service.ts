import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Pool } from 'pg';
import { CodeSequenceService } from '../../database/code-sequence.service';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, SuggestionSource, SyncStatus } from '@prisma/client';

const IDEA_PREFIX = 'KH';
const DEFAULT_MOBILE_IDEA_SYNC_START_DATE = '2026-05-10';

export type MobileIdeasSyncRunResult = {
  scanned: number;
  inserted: number;
  updated: number;
  skippedUnmappedEmployee: number;
  /** True when SUGGESTION_SYNC=false — nothing was read from HRMS */
  disabled?: boolean;
  message?: string;
};

function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class MobileIdeasSyncService {
  private readonly logger = new Logger(MobileIdeasSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codeSequence: CodeSequenceService,
    private readonly config: ConfigService,
  ) {}

  private isSuggestionSyncEnabled(): boolean {
    const raw = String(this.config.get<string>('SUGGESTION_SYNC') ?? 'true')
      .trim()
      .toLowerCase();
    return raw !== 'false' && raw !== '0' && raw !== 'no' && raw !== 'off';
  }

  private getMobileIdeaSyncStartDate(): string {
    const raw = String(
      this.config.get<string>('MOBILE_IDEA_SYNC_START_DATE') ??
        DEFAULT_MOBILE_IDEA_SYNC_START_DATE,
    ).trim();
    if (!raw) return DEFAULT_MOBILE_IDEA_SYNC_START_DATE;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      return `${raw.slice(6, 10)}-${raw.slice(3, 5)}-${raw.slice(0, 2)}`;
    }
    // Avoid `new Date('YYYY-MM-DD')` → UTC midnight → wrong calendar day in some TZs when re-serialized.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return DEFAULT_MOBILE_IDEA_SYNC_START_DATE;
    }
    return parsed.toISOString().slice(0, 10);
  }

  /** Which HRMS column drives the start-date filter: idea `date` vs row `created_at`. */
  private getMobileIdeaSyncDateField(): 'date' | 'created_at' {
    const v = String(
      this.config.get<string>('MOBILE_IDEA_SYNC_DATE_FIELD') ?? 'date',
    )
      .trim()
      .toLowerCase();
    return v === 'created_at' || v === 'created' ? 'created_at' : 'date';
  }

  @Cron(process.env.MOBILE_IDEA_SYNC_CRON ?? '0 */5 * * * *')
  async scheduledSync(): Promise<void> {
    if (!this.isSuggestionSyncEnabled()) {
      this.logger.log(
        'Scheduled mobile-ideas sync skipped (SUGGESTION_SYNC=false).',
      );
      return;
    }
    try {
      const r = await this.runNow();
      this.logger.log(
        `Scheduled mobile-ideas sync done. scanned=${r.scanned} inserted=${r.inserted} updated=${r.updated} skippedUnmappedEmployee=${r.skippedUnmappedEmployee}`,
      );
    } catch (e) {
      const err = e as Error;
      this.logger.error(`Scheduled mobile-ideas sync failed: ${err.message}`);
    }
  }

  /**
   * Map HRMS unit text to Kaizen `hrms_units.code` so Unit Coordinator lists (scoped by unit_code) match.
   */
  private matchHrmsUnitToCode(
    raw: string,
    hrmsUnits: { code: string; name: string }[],
  ): string | null {
    const t = String(raw ?? '').trim();
    if (!t) return null;
    const lower = t.toLowerCase();
    for (const u of hrmsUnits) {
      if (u.code.toLowerCase() === lower) return u.code;
    }
    for (const u of hrmsUnits) {
      if (u.name.toLowerCase() === lower) return u.code;
    }
    return null;
  }

  /**
   * Prefer suggestion row unit → employee master unit → 'NA'.
   * Canonical codes come from {@link HrmsUnit} when names/codes align.
   */
  private async resolveMobileSuggestionUnit(
    pool: Pool,
    employeeCode: string,
    hrmsSuggestionUnit: string | null | undefined,
    hrmsUnits: { code: string; name: string }[],
  ): Promise<string> {
    let raw = String(hrmsSuggestionUnit ?? '').trim();
    if (!raw) {
      try {
        const er = await pool.query(
          `select unit::text as unit from hrms_employees where employee_id::text = $1 limit 1`,
          [employeeCode],
        );
        raw = String(er.rows?.[0]?.unit ?? '').trim();
      } catch {
        // HRMS schema may differ by deployment
      }
    }
    const canon = this.matchHrmsUnitToCode(raw, hrmsUnits);
    if (canon) return canon;
    return raw || 'NA';
  }

  async runNow(opts: { take?: number } = {}): Promise<MobileIdeasSyncRunResult> {
    if (!this.isSuggestionSyncEnabled()) {
      return {
        scanned: 0,
        inserted: 0,
        updated: 0,
        skippedUnmappedEmployee: 0,
        disabled: true,
        message:
          'Suggestion sync is turned off (SUGGESTION_SYNC is false or unset to off in backend .env). Set SUGGESTION_SYNC=true and restart the API — no rows were read from HRMS.',
      };
    }
    const take = Math.min(Math.max(Number(opts.take ?? 500), 1), 5000);

    const syncLog = await this.prisma.hrmsSyncLog.create({
      data: { status: SyncStatus.SUCCESS, source: 'SUGGESTION' } as any,
    });

    // Mobile app writes into HRMS DB table `hrms_suggestions`.
    // We read from HRMS_DATABASE_URL and upsert into kaizen_kh.suggestions.
    const hrmsDbUrl = String(
      this.config.get<string>('HRMS_DATABASE_URL') ?? '',
    ).trim();
    if (!hrmsDbUrl) {
      const msg = 'HRMS_DATABASE_URL is not configured';
      await this.prisma.hrmsSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: SyncStatus.FAILED,
          syncEndedAt: new Date(),
          errorMessage: msg,
        },
      });
      throw new Error(msg);
    }

    const pool = new Pool({ connectionString: hrmsDbUrl });
    let rows: Array<{
      id: string;
      employee_id: string;
      date: string;
      suggestion: string;
      unit: string | null;
      department: string | null;
      created_at: string;
    }> = [];

    let inserted = 0;
    let updated = 0;
    let skippedUnmappedEmployee = 0;
    const syncStartDate = this.getMobileIdeaSyncStartDate();
    const dateField = this.getMobileIdeaSyncDateField();
    this.logger.log(
      `Mobile ideas sync: startDate=${syncStartDate} dateField=${dateField} take=${take}`,
    );

    try {
      // Inclusive cutoff: `date >= $1` so rows on MOBILE_IDEA_SYNC_START_DATE are not skipped.
      // Sync only HRMS rows with `is_active = false` (per business / deployment rule).
      const datePredicate =
        dateField === 'created_at'
          ? 'coalesce(created_at::date, date) >= $1::date'
          : 'date >= $1::date';
      const orderBy =
        dateField === 'created_at'
          ? 'order by created_at desc nulls last, date desc'
          : 'order by date desc, created_at desc';

      const res = await pool.query(
        `
        select
          id::text as id,
          employee_id::text as employee_id,
          date::text as date,
          suggestion::text as suggestion,
          unit::text as unit,
          department::text as department,
          created_at::text as created_at
        from hrms_suggestions
        where (${datePredicate})
          and is_active = false
        ${orderBy}
        limit $2
        `,
        [syncStartDate, take],
      );
      rows = Array.isArray(res.rows) ? (res.rows as any) : [];

      const hrmsUnits = await this.prisma.hrmsUnit.findMany({
        select: { code: true, name: true },
      });

      for (const r of rows) {
        const sourceId = String(r.id);
        const employeeCode = String(r.employee_id || '').trim();
        if (!employeeCode) {
          skippedUnmappedEmployee += 1;
          continue;
        }

        const user = await this.prisma.user.findUnique({
          where: { employeeCode },
          select: { name: true },
        });
        if (!user?.name) {
          skippedUnmappedEmployee += 1;
          continue;
        }

        const existing = await this.prisma.suggestion.findFirst({
          where: { source: SuggestionSource.MOBILE, sourceId },
          select: { id: true, status: true },
        });

        const resolvedUnit = await this.resolveMobileSuggestionUnit(
          pool,
          employeeCode,
          r.unit,
          hrmsUnits,
        );

        const payload = {
          source: SuggestionSource.MOBILE,
          sourceId,
          // Full text stays in `description`; Unit Coordinator sets the display heading at screening.
          theme: '',
          unit: resolvedUnit,
          area: 'Mobile',
          department: String(r.department || '').trim() || 'NA',
          dateSubmitted: String(r.date || '').trim() || toYmd(new Date()),
          employeeName: user.name,
          originatorEmployeeCode: employeeCode,
          description: String(r.suggestion || '').trim(),
          expectedBenefits: {
            productivity: false,
            quality: false,
            cost: false,
            delivery: false,
            safety: false,
            energy: false,
            environment: false,
            morale: false,
          } as any,
          status: 'Idea Submitted',
          currentStageRole: 'Unit Coordinator',
          workflowThread: [
            {
              id: `WF-MOBILE-${Date.now()}`,
              actor: user.name,
              role: 'Employee',
              text: `${user.name} submitted the idea via Mobile App.`,
              date: new Date().toISOString(),
            },
          ] as any,
        };

        if (!existing) {
          const year = new Date().getFullYear();
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              await this.prisma.$transaction(
                async (tx) => {
                  const code = await this.codeSequence.allocate(
                    tx,
                    IDEA_PREFIX,
                    year,
                  );
                  await tx.suggestion.create({
                    data: { ...payload, code },
                  });
                },
                {
                  isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
                },
              );
              inserted += 1;
              break;
            } catch (e: any) {
              if (e?.code === 'P2002') continue;
              throw e;
            }
          }
        } else {
          // Only update basic fields if the idea is still at the first stage.
          if (String(existing.status) === 'Idea Submitted') {
            await this.prisma.suggestion.update({
              where: { id: existing.id },
              data: {
                theme: payload.theme,
                unit: payload.unit,
                department: payload.department,
                description: payload.description,
              },
            });
            updated += 1;
          }
        }
      }

      await this.prisma.hrmsSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: SyncStatus.SUCCESS,
          insertedCount: inserted,
          updatedCount: updated,
          syncEndedAt: new Date(),
        },
      });
    } catch (e) {
      const err = e as Error;
      await this.prisma.hrmsSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: SyncStatus.FAILED,
          insertedCount: inserted,
          updatedCount: updated,
          syncEndedAt: new Date(),
          errorMessage: err.message,
        },
      });
      throw e;
    } finally {
      await pool.end().catch(() => undefined);
    }

    return {
      scanned: rows.length,
      inserted,
      updated,
      skippedUnmappedEmployee,
    };
  }
}
