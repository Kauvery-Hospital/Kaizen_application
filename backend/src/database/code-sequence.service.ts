import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

type TxClient = Prisma.TransactionClient;

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

  private codePrefixForQuery(prefix: string, year: number): string {
    return `${prefix}-${year}-`;
  }

  /** Highest numeric suffix for codes like `PREFIX-YEAR-0001`. */
  async maxSeqFromSuggestions(
    tx: TxClient,
    prefix: string,
    year: number,
  ): Promise<number> {
    const head = this.codePrefixForQuery(prefix, year);
    const like = `${head}%`;
    const fromIndex = head.length + 1;
    const rows = await tx.$queryRaw<{ max_seq: number | null }[]>`
      SELECT COALESCE(
        MAX(
          CAST(
            NULLIF(
              TRIM(SUBSTRING(code FROM ${fromIndex})),
              ''
            ) AS INTEGER
          )
        ),
        0
      ) AS max_seq
      FROM suggestions
      WHERE code LIKE ${like}
        AND SUBSTRING(code FROM ${fromIndex}) ~ '^[0-9]+$'
    `;
    return Number(rows[0]?.max_seq ?? 0);
  }

  async maxSeqFromImplementedKaizen(
    tx: TxClient,
    prefix: string,
    year: number,
  ): Promise<number> {
    const head = this.codePrefixForQuery(prefix, year);
    const like = `${head}%`;
    const fromIndex = head.length + 1;
    const rows = await tx.$queryRaw<{ max_seq: number | null }[]>`
      SELECT COALESCE(
        MAX(
          CAST(
            NULLIF(
              TRIM(SUBSTRING(implemented_code FROM ${fromIndex})),
              ''
            ) AS INTEGER
          )
        ),
        0
      ) AS max_seq
      FROM implemented_kaizen
      WHERE implemented_code LIKE ${like}
        AND SUBSTRING(implemented_code FROM ${fromIndex}) ~ '^[0-9]+$'
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
    });
  }

  /**
   * Reserve the next unused code inside an open transaction.
   * Syncs counter to DB max, atomically increments, and skips any code that already exists.
   */
  async allocate(tx: TxClient, prefix: string, year: number): Promise<string> {
    for (let attempt = 0; attempt < 25; attempt++) {
      const floor = await this.floorSeq(tx, prefix, year);

      await tx.codeCounter.upsert({
        where: { prefix_year: { prefix, year } },
        update: {},
        create: { prefix, year, next: floor },
      });

      await tx.$executeRaw`
        UPDATE code_counters
        SET next = GREATEST(next, ${floor})
        WHERE prefix = ${prefix} AND year = ${year}
      `;

      const rows = await tx.$queryRaw<{ allocated: number | null }[]>`
        UPDATE code_counters
        SET next = next + 1
        WHERE prefix = ${prefix} AND year = ${year}
        RETURNING (next - 1) AS allocated
      `;

      const allocated = Number(rows?.[0]?.allocated ?? 0);
      if (!Number.isFinite(allocated) || allocated <= 0) {
        throw new Error(`Failed to allocate code for ${prefix}-${year}`);
      }

      const code = this.formatCode(prefix, year, allocated);
      const exists = await tx.suggestion.count({ where: { code } });
      if (exists === 0) {
        return code;
      }

      this.logger.warn(
        `Code ${code} already exists; bumping counter (attempt ${attempt + 1})`,
      );
      await tx.codeCounter.update({
        where: { prefix_year: { prefix, year } },
        data: { next: allocated + 1 },
      });
    }

    throw new Error(
      `Unable to allocate unique code for ${prefix}-${year} after retries`,
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
