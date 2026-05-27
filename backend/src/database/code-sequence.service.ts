import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

type TxClient = Prisma.TransactionClient;

/**
 * Allocates Kaizen idea / implemented codes from `code_counters` while staying
 * aligned with the highest code already stored in `suggestions` (or implemented_kaizen).
 *
 * Prevents "jumped" series when creates fail after incrementing the counter, and
 * heals counters that ran ahead of real rows after manual DB fixes.
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
        MAX(CAST(SUBSTRING(code FROM ${fromIndex}) AS INTEGER)),
        0
      ) AS max_seq
      FROM suggestions
      WHERE code LIKE ${like}
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
        MAX(CAST(SUBSTRING(implemented_code FROM ${fromIndex}) AS INTEGER)),
        0
      ) AS max_seq
      FROM implemented_kaizen
      WHERE implemented_code LIKE ${like}
    `;
    return Number(rows[0]?.max_seq ?? 0);
  }

  /**
   * Set `code_counters.next` to one past the highest code in use (suggestions + implemented).
   */
  async reconcileCounter(prefix: string, year: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const maxFromDb = Math.max(
        await this.maxSeqFromSuggestions(tx, prefix, year),
        await this.maxSeqFromImplementedKaizen(tx, prefix, year),
      );
      const next = maxFromDb + 1;
      await tx.codeCounter.upsert({
        where: { prefix_year: { prefix, year } },
        update: { next },
        create: { prefix, year, next },
      });
    });
  }

  /**
   * Reserve the next code inside an open transaction. Counter is only advanced if the
   * caller commits (e.g. suggestion.create in the same transaction).
   */
  async allocate(tx: TxClient, prefix: string, year: number): Promise<string> {
    const maxFromDb = Math.max(
      await this.maxSeqFromSuggestions(tx, prefix, year),
      prefix === 'KH-KZ'
        ? await this.maxSeqFromImplementedKaizen(tx, prefix, year)
        : 0,
    );
    const floor = maxFromDb + 1;

    // Ensure counter row exists (create with floor when missing).
    await tx.codeCounter.upsert({
      where: { prefix_year: { prefix, year } },
      update: {},
      create: { prefix, year, next: floor },
    });

    /**
     * Atomic allocation:
     * - Advance `next` to at least `floor`
     * - Increment by 1
     * - Return allocated sequence = new_next - 1
     *
     * This prevents duplicates under concurrency (single row update).
     */
    const rows = await tx.$queryRaw<{ allocated: number | null }[]>`
      UPDATE code_counters
      SET next = GREATEST(next, ${floor}) + 1
      WHERE prefix = ${prefix} AND year = ${year}
      RETURNING (next - 1) AS allocated
    `;

    const allocated = Number(rows?.[0]?.allocated ?? 0);
    if (!Number.isFinite(allocated) || allocated <= 0) {
      throw new Error(`Failed to allocate code for ${prefix}-${year}`);
    }
    return this.formatCode(prefix, year, allocated);
  }

  /** Standalone allocate (own transaction). Prefer {@link allocate} inside create tx. */
  async allocateStandalone(prefix: string, year: number): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => this.allocate(tx, prefix, year),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
