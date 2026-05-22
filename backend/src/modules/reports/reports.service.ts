import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { mapTokenRolesToAppRoles } from '../auth/auth-role-mapping';
import type { JwtAccessPayload } from '../auth/guards/jwt-auth.guard';
import { AppRole, AppStatus } from '../suggestions/suggestions.types';
import {
  ACCEPTED_STATUSES,
  IMPLEMENTED_STATUSES,
  REPORT_CATALOG,
  REPORT_ALLOWED_FOR,
  isNotFeasibleOrWithdrawn,
  isRejected,
} from './reports.types';
import { ReportsQueryDto } from './dto/reports-query.dto';

type BreakdownRow = { key: string; count: number };

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private norm(v?: string | null): string {
    return String(v ?? '').trim();
  }

  private lc(v?: string | null): string {
    return this.norm(v).toLowerCase();
  }

  private resolveActorRole(payload: JwtAccessPayload): AppRole {
    const allowed = mapTokenRolesToAppRoles(payload.roles ?? []);
    // Prefer BE Head > BE Member > other roles (assertReportAllowed still gates catalog access).
    if (allowed.includes(AppRole.BUSINESS_EXCELLENCE_HEAD))
      return AppRole.BUSINESS_EXCELLENCE_HEAD;
    if (allowed.includes(AppRole.BUSINESS_EXCELLENCE))
      return AppRole.BUSINESS_EXCELLENCE;
    if (allowed.includes(AppRole.UNIT_COORDINATOR)) return AppRole.UNIT_COORDINATOR;
    return allowed[0] ?? AppRole.EMPLOYEE;
  }

  private scopeWhereForRole(actorRole: AppRole): Prisma.SuggestionWhereInput {
    if (actorRole === AppRole.BUSINESS_EXCELLENCE || actorRole === AppRole.BUSINESS_EXCELLENCE_HEAD) {
      return {};
    }
    throw new ForbiddenException(
      'Kaizen reports are only available for the Business Excellence team.',
    );
  }

  private assertReportAllowed(report: string, role: AppRole) {
    const exists = REPORT_CATALOG.some((r) => r.id === report);
    if (!exists) throw new ForbiddenException('Unknown report');
    if (!REPORT_ALLOWED_FOR(report as any, role)) {
      throw new ForbiddenException('Not allowed to access this report');
    }
  }

  private applyCommonFilters(dto: ReportsQueryDto): Prisma.SuggestionWhereInput {
    const and: Prisma.SuggestionWhereInput[] = [];

    const q = this.lc(dto.q);
    if (q) {
      and.push({
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { theme: { contains: q, mode: 'insensitive' } },
          { unit: { contains: q, mode: 'insensitive' } },
          { department: { contains: q, mode: 'insensitive' } },
          { employeeName: { contains: q, mode: 'insensitive' } },
          { status: { contains: q, mode: 'insensitive' } },
          { assignedImplementer: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    if (dto.unit && this.lc(dto.unit) !== 'all') {
      and.push({ unit: this.norm(dto.unit) });
    }
    if (dto.department && this.lc(dto.department) !== 'all') {
      and.push({ department: this.norm(dto.department) });
    }
    if (dto.status && this.lc(dto.status) !== 'all') {
      and.push({ status: this.norm(dto.status) });
    }
    if (dto.category && this.lc(dto.category) !== 'all') {
      and.push({ category: this.norm(dto.category) });
    }

    const from = this.norm(dto.from);
    const to = this.norm(dto.to);
    if (from || to) {
      // dateSubmitted is stored as YYYY-MM-DD string, so lexical comparisons are valid.
      if (from && to) and.push({ dateSubmitted: { gte: from, lte: to } });
      else if (from) and.push({ dateSubmitted: { gte: from } });
      else if (to) and.push({ dateSubmitted: { lte: to } });
    }

    return and.length ? { AND: and } : {};
  }

  private async groupByCount(
    where: Prisma.SuggestionWhereInput,
    by: 'unit' | 'department' | 'category',
  ): Promise<BreakdownRow[]> {
    const rows = await this.prisma.suggestion.groupBy({
      by: [by],
      where,
      _count: { _all: true },
    });
    const mapped = (Array.isArray(rows) ? rows : [])
      .map((r: any) => ({
        key: this.norm(r?.[by]) || 'NA',
        count: Number(r?._count?._all ?? 0),
      }))
      .filter((r) => r.key !== '');
    mapped.sort((a, b) => b.count - a.count);
    return mapped;
  }

  private acceptedWhere(): Prisma.SuggestionWhereInput {
    return { status: { in: Array.from(ACCEPTED_STATUSES) as any } };
  }

  private implementedWhere(): Prisma.SuggestionWhereInput {
    return { status: { in: Array.from(IMPLEMENTED_STATUSES) as any } };
  }

  private async kpiCounts(where: Prisma.SuggestionWhereInput) {
    const [total, pending, rewarded] = await Promise.all([
      this.prisma.suggestion.count({ where }),
      this.prisma.suggestion.count({
        where: { AND: [where, { status: AppStatus.IDEA_SUBMITTED as any }] },
      }),
      this.prisma.suggestion.count({
        where: { AND: [where, { status: AppStatus.REWARDED as any }] },
      }),
    ]);
    const accepted = await this.prisma.suggestion.count({
      where: { AND: [where, this.acceptedWhere()] },
    });
    const implemented = await this.prisma.suggestion.count({
      where: { AND: [where, this.implementedWhere()] },
    });

    // Not feasible / withdrawn is not a first-class status in current enum; detect by substring.
    const notFeasibleLike = await this.prisma.suggestion.count({
      where: {
        AND: [
          where,
          {
            OR: [
              { status: { contains: 'Not Feasible', mode: 'insensitive' } },
              { status: { contains: 'Withdraw', mode: 'insensitive' } },
            ],
          },
        ],
      },
    });

    const ongoing = Math.max(0, accepted - rewarded);

    return {
      totalReceived: total,
      accepted,
      implemented,
      ongoing,
      pending,
      rewarded,
      notFeasibleOrWithdrawn: notFeasibleLike,
    };
  }

  private async approvalStatus(where: Prisma.SuggestionWhereInput) {
    const rows = await this.prisma.suggestion.findMany({
      where: { AND: [where, { status: AppStatus.VERIFIED_PENDING_APPROVAL as any }] },
      select: { requiredApprovals: true, approvals: true },
      take: 20000,
    });
    let total = 0;
    let complete = 0;
    let pending = 0;
    for (const r of rows) {
      total += 1;
      const req = Array.isArray(r.requiredApprovals) ? (r.requiredApprovals as string[]) : [];
      const approvals = (r.approvals as Record<string, boolean> | null | undefined) ?? {};
      const ok = req.length === 0 ? true : req.every((k) => Boolean(approvals?.[k]));
      if (ok) complete += 1;
      else pending += 1;
    }
    return { totalInApprovalStage: total, approvalsComplete: complete, approvalsPending: pending };
  }

  private async approvalStatusByRole(where: Prisma.SuggestionWhereInput) {
    const rows = await this.prisma.suggestion.findMany({
      where: { AND: [where, { status: AppStatus.VERIFIED_PENDING_APPROVAL as any }] },
      select: { requiredApprovals: true, approvals: true },
      take: 20000,
    });
    const byRole = new Map<string, { pending: number; approved: number; total: number }>();
    for (const r of rows) {
      const req = Array.isArray(r.requiredApprovals) ? (r.requiredApprovals as string[]) : [];
      const approvals = (r.approvals as Record<string, boolean> | null | undefined) ?? {};
      for (const role of req) {
        if (!byRole.has(role)) byRole.set(role, { pending: 0, approved: 0, total: 0 });
        const bucket = byRole.get(role)!;
        bucket.total += 1;
        if (approvals?.[role]) bucket.approved += 1;
        else bucket.pending += 1;
      }
    }
    return [...byRole.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.total - a.total);
  }

  async runReport(payload: JwtAccessPayload, dto: ReportsQueryDto) {
    const actorRole = this.resolveActorRole(payload);
    this.assertReportAllowed(dto.report, actorRole);

    const skip = dto.skip ?? 0;
    const take = dto.take ?? 50;

    const scopeWhere = this.scopeWhereForRole(actorRole);
    const commonWhere = this.applyCommonFilters(dto);
    const baseWhere: Prisma.SuggestionWhereInput = { AND: [scopeWhere, commonWhere] };

    if (dto.report === 'kpiCounts' || dto.report === 'receivedSummary') {
      return await this.kpiCounts(baseWhere);
    }

    if (dto.report === 'receivedByUnit') {
      return { items: await this.groupByCount(baseWhere, 'unit') };
    }
    if (dto.report === 'receivedByDepartment') {
      return { items: await this.groupByCount(baseWhere, 'department') };
    }
    if (dto.report === 'receivedByServiceCategory') {
      return { items: await this.groupByCount(baseWhere, 'category') };
    }

    if (dto.report === 'acceptedByUnit') {
      return { items: await this.groupByCount({ AND: [baseWhere, this.acceptedWhere()] }, 'unit') };
    }
    if (dto.report === 'acceptedByDepartment') {
      return { items: await this.groupByCount({ AND: [baseWhere, this.acceptedWhere()] }, 'department') };
    }
    if (dto.report === 'acceptedByServiceCategory') {
      return { items: await this.groupByCount({ AND: [baseWhere, this.acceptedWhere()] }, 'category') };
    }

    if (dto.report === 'notAcceptedByUnit') {
      return { items: await this.groupByCount({ AND: [baseWhere, { status: AppStatus.IDEA_REJECTED as any }] }, 'unit') };
    }
    if (dto.report === 'notAcceptedByDepartment') {
      return { items: await this.groupByCount({ AND: [baseWhere, { status: AppStatus.IDEA_REJECTED as any }] }, 'department') };
    }
    if (dto.report === 'notAcceptedByServiceCategory') {
      return { items: await this.groupByCount({ AND: [baseWhere, { status: AppStatus.IDEA_REJECTED as any }] }, 'category') };
    }

    if (dto.report === 'approvalStatus') {
      return await this.approvalStatus(baseWhere);
    }
    if (dto.report === 'approvalStatusByRole') {
      return { items: await this.approvalStatusByRole(baseWhere) };
    }

    if (
      dto.report === 'implementationStatusOverallAndUnit' ||
      dto.report === 'implementationStatusByDepartment' ||
      dto.report === 'implementationStatusByServiceCategory'
    ) {
      const implWhere = { AND: [baseWhere, this.implementedWhere()] };
      if (dto.report === 'implementationStatusOverallAndUnit') {
        const overall = await this.prisma.suggestion.count({ where: implWhere });
        const byUnit = await this.groupByCount(implWhere, 'unit');
        return { overall, byUnit };
      }
      if (dto.report === 'implementationStatusByDepartment') {
        return { items: await this.groupByCount(implWhere, 'department') };
      }
      return { items: await this.groupByCount(implWhere, 'category') };
    }

    if (dto.report === 'waitingForAssignment') {
      const where = { AND: [baseWhere, { status: AppStatus.APPROVED_FOR_ASSIGNMENT as any }] };
      const [items, total] = await Promise.all([
        this.prisma.suggestion.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.prisma.suggestion.count({ where }),
      ]);
      return { items, total };
    }

    if (dto.report === 'assignmentStatus') {
      const where = { AND: [baseWhere, { status: { in: [AppStatus.APPROVED_FOR_ASSIGNMENT, AppStatus.ASSIGNED_FOR_IMPLEMENTATION] as any } }] };
      const [waiting, assigned] = await Promise.all([
        this.prisma.suggestion.count({ where: { AND: [baseWhere, { status: AppStatus.APPROVED_FOR_ASSIGNMENT as any }] } }),
        this.prisma.suggestion.count({ where: { AND: [baseWhere, { status: AppStatus.ASSIGNED_FOR_IMPLEMENTATION as any }] } }),
      ]);
      const [items, total] = await Promise.all([
        this.prisma.suggestion.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.prisma.suggestion.count({ where }),
      ]);
      return { waitingForAssignment: waiting, assignedForImplementation: assigned, items, total };
    }

    if (dto.report === 'acceptedBySelectionCommittee') {
      const where = { AND: [baseWhere, this.acceptedWhere()] };
      const [items, total] = await Promise.all([
        this.prisma.suggestion.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.prisma.suggestion.count({ where }),
      ]);
      return { items, total };
    }

    if (dto.report === 'notAcceptedBySelectionCommittee') {
      // Use IDEA_REJECTED plus text-detected not feasible/withdrawn.
      const where = {
        AND: [
          baseWhere,
          {
            OR: [
              { status: AppStatus.IDEA_REJECTED as any },
              { status: { contains: 'Not Feasible', mode: 'insensitive' } },
              { status: { contains: 'Withdraw', mode: 'insensitive' } },
            ],
          },
        ],
      };
      const [items, total] = await Promise.all([
        this.prisma.suggestion.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.prisma.suggestion.count({ where }),
      ]);
      return { items, total };
    }

    if (dto.report === 'acceptedTop10Group' || dto.report === 'acceptedTop10Unit') {
      const unitExtra =
        dto.report === 'acceptedTop10Unit' && dto.unit && this.lc(dto.unit) !== 'all'
          ? { unit: this.norm(dto.unit) }
          : {};
      const where = { AND: [baseWhere, this.acceptedWhere(), unitExtra] };
      const items = await this.prisma.suggestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      return { items, total: items.length };
    }

    if (dto.report === 'implementationStatus') {
      const where = { AND: [baseWhere, this.implementedWhere()] };
      const [items, total] = await Promise.all([
        this.prisma.suggestion.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip,
          take,
        }),
        this.prisma.suggestion.count({ where }),
      ]);
      return { items, total };
    }

    // Default: overall register table (and fallback for unknown but allowed)
    {
      const where = baseWhere;
      const [items, total] = await Promise.all([
        this.prisma.suggestion.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.prisma.suggestion.count({ where }),
      ]);
      return { items, total };
    }
  }
}

