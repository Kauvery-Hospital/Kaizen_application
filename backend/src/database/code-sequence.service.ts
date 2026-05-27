import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

type TxClient = Prisma.TransactionClient;

const ALLOCATE_SCAN_LIMIT = 500;

/**
 * Allocates Kaizen idea / implemented codes from `code_counters` while staying
 * aligned with the highest code already stored in `suggestions` (or implemented_kaizen).
 */
@Injectable()
export class CodeSequenceService implements OnModuleInit {
  private readonly logger = new Logger(CodeSequenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const year = new Date().getFullYear();
    for (const prefix of ['KH', 'KH-KZ'] as const) {
      try {
        await this.reconcileCounter(prefix, year);
      } catch (e) {
        const err = e as Error;
        this.logger.warn(
          `Code counter reconcile skipped for ${prefix}-${year}: ${err.message}`,
        );
      }
    }
  }

  formatCode(prefix: string, year: number, seq: number): string {
    return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  }

  /** `KH-2026-0001` → part 3; `KH-KZ-2026-0001` → part 4 */
  private seqSplitPartIndex(prefix: string): number {
    const segments = prefix.split('-').filter(Boolean).length;
    return segments + 2;
  }

  /** Highest numeric suffix (same logic as manual SQL: split_part on code). */
  async maxSeqFromSuggestions(
    tx: TxClient,
    prefix: string,
    year: number,
  ): Promise<number> {
    const like = `${prefix}-${year}-%`;
    const partIdx = this.seqSplitPartIndex(prefix);
    const rows = await tx.$queryRaw<{ max_seq: number | null }[]>`
      SELECT COALESCE(
        MAX(CAST(NULLIF(TRIM(split_part(code, '-', ${partIdx})), '') AS INTEGER)),
        0
      ) AS max_seq
      FROM suggestions
      WHERE code LIKE ${like}
        AND split_part(code, '-', ${partIdx}) ~ '^[0-9]+$'
    `;
    return Number(rows[0]?.max_seq ?? 0);
  }

  async maxSeqFromImplementedKaizen(
    tx: TxClient,
    prefix: string,
    year: number,
  ): Promise<number> {
    const like = `${prefix}-${year}-%`;
    const partIdx = this.seqSplitPartIndex(prefix);
    const rows = await tx.$queryRaw<{ max_seq: number | null }[]>`
      SELECT COALESCE(
        MAX(
          CAST(
            NULLIF(TRIM(split_part(implemented_code, '-', ${partIdx})), '')
            AS INTEGER
          )
        ),
        0
      ) AS max_seq
      FROM implemented_kaizen
      WHERE implemented_code LIKE ${like}
        AND split_part(implemented_code, '-', ${partIdx}) ~ '^[0-9]+$'
    `;
    return Number(rows[0]?.max_seq ?? 0);
  }

  private async floorSeq(
    tx: TxClient,
    prefix: string,
    year: number,
  ): Promise<number> {
    const maxFromDb = Math.max(
      await this.maxSeqFromSuggestions(tx, prefix, year),
      prefix === 'KH-KZ'
        ? await this.maxSeqFromImplementedKaizen(tx, prefix, year)
        : 0,
    );
    return maxFromDb + 1;
  }

  /**
   * Set `code_counters.next` to one past the highest code in use (suggestions + implemented).
   */
  async reconcileCounter(prefix: string, year: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const next = await this.floorSeq(tx, prefix, year);
      await tx.codeCounter.upsert({
        where: { prefix_year: { prefix, year } },
        update: { next },
        create: { prefix, year, next },
      });
      this.logger.log(`Reconciled ${prefix}-${year} counter → next=${next}`);
    });
  }

  /**
   * Reserve the next unused code inside an open transaction.
   * Always starts at max(DB)+1 (never a stale low counter).
   */
  async allocate(tx: TxClient, prefix: string, year: number): Promise<string> {
    const floor = await this.floorSeq(tx, prefix, year);
    const counterBefore = await tx.codeCounter.findUnique({
      where: { prefix_year: { prefix, year } },
      select: { next: true },
    });

    if ((counterBefore?.next ?? 0) < floor) {
      this.logger.warn(
        `Code counter ${prefix}-${year} was behind DB (counter=${counterBefore?.next ?? 'none'}, floor=${floor}); using DB max`,
      );
    }

    let seq = floor;

    for (let step = 0; step < ALLOCATE_SCAN_LIMIT; step++) {
      const code = this.formatCode(prefix, year, seq);
      const exists = await tx.suggestion.count({ where: { code } });
      if (exists === 0) {
        await tx.codeCounter.upsert({
          where: { prefix_year: { prefix, year } },
          update: { next: seq + 1 },
          create: { prefix, year, next: seq + 1 },
        });
        this.logger.debug(
          `Allocated ${code} for ${prefix}-${year} (floor=${floor})`,
        );
        return code;
      }
      seq++;
    }

    throw new Error(
      `Unable to allocate unique code for ${prefix}-${year} after scanning ${ALLOCATE_SCAN_LIMIT} values from seq ${floor}`,
    );
  }

  /** Standalone allocate (own transaction). Prefer {@link allocate} inside create tx. */
  async allocateStandalone(prefix: string, year: number): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => this.allocate(tx, prefix, year),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
