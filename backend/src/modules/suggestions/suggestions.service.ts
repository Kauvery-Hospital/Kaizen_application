import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BeReportQueryDto } from './dto/be-report-query.dto';
import { CreateSuggestionDto } from './dto/create-suggestion.dto';
import { UpdateSuggestionStatusDto } from './dto/update-suggestion-status.dto';
import { AppRole, AppStatus, WorkflowEvent } from './suggestions.types';

const APP_ROLE_VALUES = new Set<string>(Object.values(AppRole));
const IDEA_PREFIX = 'KH';
const IMPLEMENTED_PREFIX = 'KH-KZ';

@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SuggestionsService.name);
  constructor(private readonly prisma: PrismaService) {}

  private normalizeUnitCode(v?: string | null): string {
    return String(v ?? '').trim();
  }

  private async getAllowedUnitsForRole(
    userId: string | undefined,
    role: AppRole,
  ): Promise<string[] | null> {
    if (!userId) return null;
    let roleCode: RoleCode | null = null;
    if (role === AppRole.UNIT_COORDINATOR) roleCode = RoleCode.UNIT_COORDINATOR;
    if (role === AppRole.SELECTION_COMMITTEE)
      roleCode = RoleCode.SELECTION_COMMITTEE;
    if (!roleCode) return null;

    const rows = await (this.prisma as any).userRoleUnitScope.findMany({
      where: { userId, roleCode },
      select: { unitCode: true },
      take: 5000,
    });
    const units = (Array.isArray(rows) ? rows : [])
      .map((r: any) => this.normalizeUnitCode(r.unitCode))
      .filter(Boolean);
    return Array.from(new Set(units));
  }

  private coordinatorRoutingUnitForStatus(s: any): string {
    const st = String(s?.status ?? '');
    // Early stages: coordinator is bound to originator unit.
    if (
      st === AppStatus.IDEA_SUBMITTED ||
      st === AppStatus.APPROVED_FOR_ASSIGNMENT
    ) {
      return this.normalizeUnitCode(s?.unit);
    }
    // Later coordinator actions can be on assigned unit (cross-unit assignment).
    return this.normalizeUnitCode(s?.assignedUnit || s?.unit);
  }

  private coordinatorRoutingUnitForNextStatus(
    current: any,
    nextStatus: AppStatus,
  ): string {
    // Early coordinator decisions are always tied to originator unit.
    if (
      nextStatus === AppStatus.APPROVED_FOR_ASSIGNMENT ||
      nextStatus === AppStatus.IDEA_REJECTED
    ) {
      return this.normalizeUnitCode(current?.unit);
    }
    return this.normalizeUnitCode(current?.assignedUnit || current?.unit);
  }

  private async assertUnitScopeAllowed(
    actorUserId: string | undefined,
    actorRole: AppRole,
    current: any,
    nextStatus: AppStatus,
  ): Promise<void> {
    if (
      actorRole !== AppRole.UNIT_COORDINATOR &&
      actorRole !== AppRole.SELECTION_COMMITTEE
    ) {
      return;
    }
    if (!actorUserId) {
      throw new ForbiddenException('Missing actor user id for scope validation');
    }

    const allowedUnits = await this.getAllowedUnitsForRole(actorUserId, actorRole);
    if (!allowedUnits || allowedUnits.length === 0) {
      throw new ForbiddenException(
        `No unit scopes configured for role ${actorRole}`,
      );
    }
    const allowed = new Set(allowedUnits.map((u) => u.toLowerCase()));

    if (actorRole === AppRole.SELECTION_COMMITTEE) {
      // Selection committee assignment is scoped to originator unit.
      const unit = this.normalizeUnitCode(current?.unit);
      if (!unit || !allowed.has(unit.toLowerCase())) {
        throw new ForbiddenException(
          `Selection Committee is not allowed for unit "${unit || 'NA'}"`,
        );
      }
      return;
    }

    // Unit coordinator action:
    // - Approve/reject bound to originator unit
    // - Later coordinator actions bound to assignedUnit (if set) else originator unit
    const unit = this.coordinatorRoutingUnitForNextStatus(current, nextStatus);
    if (!unit || !allowed.has(unit.toLowerCase())) {
      throw new ForbiddenException(
        `Unit Coordinator is not allowed for unit "${unit || 'NA'}"`,
      );
    }
  }

  private approvalsComplete(row: any): boolean {
    const required = Array.isArray(row?.requiredApprovals)
      ? (row.requiredApprovals as string[])
      : [];
    if (required.length === 0) return true;
    const approvals =
      (row?.approvals as Record<string, boolean> | null | undefined) ?? {};
    return required.every((r) => Boolean(approvals?.[r]));
  }

  async create(
    dto: CreateSuggestionDto,
    ctx: { employeeCode: string },
  ) {
    const year = new Date().getFullYear();
    const payload = dto.data ?? {};
    const actorName = dto.actorName ?? dto.employeeName ?? 'Employee';
    const employeeName = (dto.employeeName ??
      payload.employeeName ??
      'Current User') as string;

    const { ideaFolder, ideaPaths } = this.validateIdeaAttachments(
      ctx.employeeCode,
      dto.ideaAttachmentsFolder,
      dto.ideaAttachmentPaths,
    );

    const expectedBenefits = dto.expectedBenefits ??
      (payload.expectedBenefits as Record<string, boolean> | undefined) ?? {
        productivity: false,
        quality: false,
        cost: false,
        delivery: false,
        safety: false,
        energy: false,
        environment: false,
        morale: false,
      };

    const workflowThread: WorkflowEvent[] = [
      {
        id: `WF-${Date.now()}`,
        actor: actorName,
        role: AppRole.EMPLOYEE,
        text: `${actorName} submitted the idea.`,
        date: new Date().toISOString(),
      },
    ];

    const baseRow = {
      theme: (dto.theme ?? payload.theme ?? 'Untitled') as string,
      unit: (dto.unit ?? payload.unit ?? '') as string,
      area: (dto.area ?? payload.area ?? '') as string,
      department: (dto.department ?? payload.department ?? '') as string,
      dateSubmitted: new Date().toISOString().split('T')[0],
      employeeName,
      description: (dto.description ?? payload.description ?? '') as string,
      status: AppStatus.IDEA_SUBMITTED,
      expectedBenefits: expectedBenefits as any,
      workflowThread: workflowThread as any,
    };

    // Defensive retry: if code counters were reset or concurrent inserts happen,
    // regenerate a new code and try again.
    for (let attempt = 0; attempt < 5; attempt++) {
      const seq = await this.nextSequence(IDEA_PREFIX, year);
      const code = `${IDEA_PREFIX}-${year}-${String(seq).padStart(4, '0')}`;
      const row = { ...baseRow, code };
      try {
        return await this.prisma.suggestion.create({
          data: {
            ...row,
            ideaAttachmentsFolder: ideaFolder ?? undefined,
            ideaAttachmentPaths: ideaPaths ?? undefined,
            currentStageRole: this.deriveCurrentStageRole(
              AppStatus.IDEA_SUBMITTED,
              row as any,
            ),
          },
        });
      } catch (e: any) {
        if (
          e?.code === 'P2002' &&
          Array.isArray(e?.meta?.target) &&
          e.meta.target.includes('code')
        ) {
          continue;
        }
        throw e;
      }
    }
    throw new BadRequestException('Unable to generate unique idea code');
  }

  private sanitizeEmployeeCodeForPath(raw: string): string {
    const s = raw.trim();
    const safe = s.replace(/[^a-zA-Z0-9_-]/g, '');
    return safe.length > 0 ? safe : 'unknown';
  }

  private validateIdeaAttachments(
    employeeCode: string,
    folder: string | undefined,
    paths: string[] | undefined,
  ): { ideaFolder: string | null; ideaPaths: string[] | null } {
    if (!paths?.length) {
      return { ideaFolder: folder ?? null, ideaPaths: null };
    }
    const emp = this.sanitizeEmployeeCodeForPath(employeeCode);
    const expected = `kaizen/${emp}/kaizen_idea`;
    const normFolder = (folder ?? expected).replace(/\\/g, '/');
    if (normFolder !== expected) {
      throw new BadRequestException(
        'ideaAttachmentsFolder must be kaizen/{your_employee_code}/kaizen_idea',
      );
    }
    for (const p of paths) {
      const n = p.replace(/\\/g, '/');
      if (!n.startsWith(`${expected}/`)) {
        throw new BadRequestException(
          'ideaAttachmentPaths must live under your kaizen_idea folder',
        );
      }
    }
    return { ideaFolder: expected, ideaPaths: paths };
  }

  async list(
    role?: AppRole,
    currentUserName?: string,
    userId?: string,
    currentUserEmployeeCode?: string,
  ) {
    if (!role) {
      return await this.prisma.suggestion.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          implementedKaizen: {
            select: {
              implementedCode: true,
              ideaCode: true,
            },
          },
        },
      });
    }

    const allowedUnits = await this.getAllowedUnitsForRole(userId, role);

    // For unit-scoped roles, if there are no scopes configured, return empty list
    // (prevents “all-unit visibility” until admin assigns scopes).
    if (
      (role === AppRole.UNIT_COORDINATOR ||
        role === AppRole.SELECTION_COMMITTEE) &&
      (!allowedUnits || allowedUnits.length === 0)
    ) {
      return [];
    }

    // Default: fetch within unit(s) first (keeps results bounded), then apply remaining role/status logic.
    // Coordinator can see items from either originator unit (early stages) or assignedUnit (later stages),
    // so we broaden the unit filter across both fields.
    const baseWhere: any = {};
    if (allowedUnits?.length) {
      if (role === AppRole.UNIT_COORDINATOR) {
        baseWhere.OR = [
          { unit: { in: allowedUnits } },
          { assignedUnit: { in: allowedUnits } },
        ];
      } else if (role === AppRole.SELECTION_COMMITTEE) {
        baseWhere.unit = { in: allowedUnits };
      }
    }

    const suggestions = await this.prisma.suggestion.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      include: {
        implementedKaizen: {
          select: {
            implementedCode: true,
            ideaCode: true,
          },
        },
      },
    });

    if (role === AppRole.UNIT_COORDINATOR && allowedUnits?.length) {
      const allowed = new Set(allowedUnits.map((u) => u.toLowerCase()));
      return suggestions.filter((s: any) => {
        const unitForStage = this.coordinatorRoutingUnitForStatus(s);
        if (!unitForStage) return false;
        if (!allowed.has(unitForStage.toLowerCase())) return false;
        return this.filterByRole(
          role,
          s as any,
          currentUserName,
          currentUserEmployeeCode,
        );
      });
    }

    return suggestions.filter((s) =>
      this.filterByRole(role, s as any, currentUserName, currentUserEmployeeCode),
    );
  }

  private static readonly BE_REPORT_PRE_STATUSES: AppStatus[] = [
    AppStatus.IDEA_SUBMITTED,
    AppStatus.IDEA_REJECTED,
    AppStatus.APPROVED_FOR_ASSIGNMENT,
    AppStatus.ASSIGNED_FOR_IMPLEMENTATION,
  ];

  private beReportInclude() {
    return {
      implementedKaizen: {
        select: {
          implementedCode: true,
          ideaCode: true,
        },
      },
    };
  }

  private beReportPhaseWhere(phase: 'pre' | 'post'): Prisma.SuggestionWhereInput {
    return phase === 'pre'
      ? { status: { in: SuggestionsService.BE_REPORT_PRE_STATUSES as unknown as string[] } }
      : { status: { notIn: SuggestionsService.BE_REPORT_PRE_STATUSES as unknown as string[] } };
  }

  private beReportTextSearch(
    q: string | undefined,
    phase: 'pre' | 'post',
  ): Prisma.SuggestionWhereInput {
    const n = String(q ?? '').trim();
    if (!n) return {};
    const or: Prisma.SuggestionWhereInput[] = [
      { code: { contains: n, mode: 'insensitive' } },
      { theme: { contains: n, mode: 'insensitive' } },
      { unit: { contains: n, mode: 'insensitive' } },
      { department: { contains: n, mode: 'insensitive' } },
      { employeeName: { contains: n, mode: 'insensitive' } },
      { status: { contains: n, mode: 'insensitive' } },
      { assignedImplementer: { contains: n, mode: 'insensitive' } },
    ];
    if (phase === 'post') {
      or.push({
        implementedKaizen: {
          is: {
            implementedCode: { contains: n, mode: 'insensitive' },
          },
        },
      });
    }
    return { OR: or };
  }

  /**
   * Paginated BE reporting API. Use `view=summary` for KPIs; `pre` / `post` for registers;
   * `employees` for directory; `employee-ideas` for one person’s idea list.
   */
  async beReport(dto: BeReportQueryDto) {
    const skip = dto.skip ?? 0;
    const take = dto.take ?? 50;

    if (dto.view === 'summary') {
      const preStatuses = SuggestionsService.BE_REPORT_PRE_STATUSES as unknown as string[];
      const [total, pre, rewarded, unitRows, departmentRows] = await Promise.all([
        this.prisma.suggestion.count(),
        this.prisma.suggestion.count({ where: { status: { in: preStatuses } } }),
        this.prisma.suggestion.count({
          where: { status: AppStatus.REWARDED as string },
        }),
        this.prisma.suggestion.findMany({
          distinct: ['unit'],
          where: { unit: { not: '' } },
          select: { unit: true },
          orderBy: { unit: 'asc' },
        }),
        this.prisma.suggestion.findMany({
          distinct: ['department'],
          where: { department: { not: '' } },
          select: { department: true },
          orderBy: { department: 'asc' },
        }),
      ]);
      const post = Math.max(0, total - pre);
      const inProgressKaizen = Math.max(0, post - rewarded);
      return {
        total,
        pre,
        post,
        rewarded,
        inProgressKaizen,
        units: unitRows.map((r) => r.unit).filter(Boolean),
        departments: departmentRows.map((r) => r.department).filter(Boolean),
      };
    }

    if (dto.view === 'pre' || dto.view === 'post') {
      const phase = dto.view;
      const where: Prisma.SuggestionWhereInput = {
        AND: [this.beReportPhaseWhere(phase), this.beReportTextSearch(dto.q, phase)],
      };
      const [items, total] = await Promise.all([
        this.prisma.suggestion.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: this.beReportInclude(),
        }),
        this.prisma.suggestion.count({ where }),
      ]);
      return { items, total };
    }

    if (dto.view === 'employees') {
      return this.beReportEmployees(dto, skip, take);
    }

    if (dto.view === 'employee-ideas') {
      return this.beReportEmployeeIdeas(dto, skip, take);
    }

    throw new BadRequestException('Invalid be-report view');
  }

  private norm(v?: string | null): string {
    return String(v ?? '').trim();
  }

  private lc(v?: string | null): string {
    return this.norm(v).toLowerCase();
  }

  /** Stable lowercase key for matching person display names (spacing / Unicode). */
  private personNameKey(v?: string | null): string {
    try {
      return this.norm(v)
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    } catch {
      return this.lc(v);
    }
  }

  private async beReportEmployees(dto: BeReportQueryDto, skip: number, take: number) {
    const rows = await this.prisma.suggestion.findMany({
      select: {
        employeeName: true,
        assignedImplementer: true,
        assignedImplementerCode: true,
        department: true,
        unit: true,
      },
    });

    type Row = (typeof rows)[number];
    type ImplBucket = { rows: Row[]; keyedByCode: boolean };

    const submittedBy = new Map<string, Row[]>();
    const implementedBy = new Map<string, ImplBucket>();

    for (const r of rows) {
      const submitKey = this.personNameKey(r.employeeName) || 'unknown';
      if (!submittedBy.has(submitKey)) submittedBy.set(submitKey, []);
      submittedBy.get(submitKey)!.push(r);

      const code = this.norm(r.assignedImplementerCode).toLowerCase();
      const nameKey = this.personNameKey(r.assignedImplementer);
      if (!code && !nameKey) continue;
      const implKey = code || nameKey;
      if (!implementedBy.has(implKey)) {
        implementedBy.set(implKey, { rows: [], keyedByCode: Boolean(code) });
      }
      const bucket = implementedBy.get(implKey)!;
      bucket.rows.push(r);
      bucket.keyedByCode = bucket.keyedByCode || Boolean(code);
    }

    const filter = dto.employeeFilter ?? 'all';
    const keys =
      filter === 'submitter'
        ? new Set<string>([...submittedBy.keys()])
        : filter === 'implementer'
          ? new Set<string>([...implementedBy.keys()])
          : new Set<string>([...submittedBy.keys(), ...implementedBy.keys()]);

    type EmpRow = {
      key: string;
      name: string;
      matchedByCode?: boolean;
      department?: string;
      unit?: string;
      submittedCount: number;
      implementedCount: number;
    };

    const merged: EmpRow[] = [];
    for (const key of keys) {
      const submitted = submittedBy.get(key) || [];
      const implBucket = implementedBy.get(key);
      const implemented = implBucket?.rows ?? [];
      const best = submitted[0] || implemented[0];

      let name: string;
      if (submitted.length && !implemented.length) {
        name =
          this.norm(submitted[0]?.employeeName) ||
          (key === 'unknown' ? 'Unknown employee' : key);
      } else if (!submitted.length && implemented.length) {
        name =
          this.norm(implemented[0]?.assignedImplementer) ||
          this.norm(implemented[0]?.assignedImplementerCode) ||
          (key === 'unknown' ? 'Unknown employee' : key);
      } else {
        name =
          this.norm(submitted[0]?.employeeName) ||
          this.norm(implemented[0]?.assignedImplementer) ||
          (key === 'unknown' ? 'Unknown employee' : key);
      }

      merged.push({
        key,
        name,
        matchedByCode: implBucket?.keyedByCode,
        department: this.norm(best?.department) || undefined,
        unit: this.norm(best?.unit) || undefined,
        submittedCount: submitted.length,
        implementedCount: implemented.length,
      });
    }

    merged.sort(
      (a, b) =>
        b.submittedCount +
        b.implementedCount -
        (a.submittedCount + a.implementedCount),
    );

    const q = this.lc(dto.q);
    const u = this.lc(dto.unit);
    const d = this.lc(dto.department);
    const unitFilter = dto.unit ?? 'all';
    const deptFilter = dto.department ?? 'all';

    let filtered = merged.filter((e) => {
      if (unitFilter !== 'all' && this.lc(e.unit) !== u) return false;
      if (deptFilter !== 'all' && this.lc(e.department) !== d) return false;
      return true;
    });

    if (q) {
      filtered = filtered.filter((e) => {
        const hay = `${e.name} ${e.key} ${e.department || ''} ${e.unit || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }

    const total = filtered.length;
    const items = filtered.slice(skip, skip + take);
    return { items, total };
  }

  private async beReportEmployeeIdeas(dto: BeReportQueryDto, skip: number, take: number) {
    const rawKey = String(dto.employeeKey ?? '').trim();
    const mode = dto.ideaMode ?? 'submitted';
    if (!rawKey) {
      return { items: [] as unknown[], total: 0 };
    }

    const key =
      dto.employeeByCode && mode === 'implemented'
        ? this.norm(rawKey).toLowerCase()
        : rawKey === 'unknown'
          ? 'unknown'
          : this.personNameKey(rawKey);

    const needle = String(dto.q ?? '').trim();
    const p = needle ? `%${needle.replace(/%/g, '\\%').replace(/_/g, '\\_')}%` : '';

    const employeeMatch =
      mode === 'submitted'
        ? key === 'unknown'
          ? Prisma.sql`(s.employee_name IS NULL OR TRIM(s.employee_name) = '')`
          : Prisma.sql`LOWER(TRIM(REGEXP_REPLACE(COALESCE(s.employee_name, ''), '[[:space:]]+', ' ', 'g'))) = ${key}`
        : dto.employeeByCode
          ? Prisma.sql`LOWER(TRIM(COALESCE(s.assigned_implementer_code, ''))) = ${key} AND TRIM(COALESCE(s.assigned_implementer_code, '')) <> ''`
          : Prisma.sql`LOWER(TRIM(REGEXP_REPLACE(COALESCE(s.assigned_implementer, ''), '[[:space:]]+', ' ', 'g'))) = ${key} AND TRIM(COALESCE(s.assigned_implementer, '')) <> ''`;

    const searchSql = needle
      ? Prisma.sql` AND (
          s.code ILIKE ${p}
          OR s.theme ILIKE ${p}
          OR s.unit ILIKE ${p}
          OR s.department ILIKE ${p}
          OR s.employee_name ILIKE ${p}
          OR s.status ILIKE ${p}
          OR s.assigned_implementer ILIKE ${p}
          OR s.assigned_implementer_code ILIKE ${p}
          OR EXISTS (
            SELECT 1 FROM implemented_kaizen k
            WHERE k.suggestion_id = s.id AND k.implemented_code ILIKE ${p}
          )
        )`
      : Prisma.empty;

    const idRows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT s.id
      FROM suggestions s
      WHERE ${employeeMatch}
      ${searchSql}
      ORDER BY s.created_at DESC
      OFFSET ${skip} LIMIT ${take}
    `);

    const countRows = await this.prisma.$queryRaw<{ c: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS c
      FROM suggestions s
      WHERE ${employeeMatch}
      ${searchSql}
    `);
    const total = Number(countRows[0]?.c ?? 0);

    const ids = idRows.map((r) => r.id);
    if (!ids.length) {
      return { items: [], total };
    }

    const items = await this.prisma.suggestion.findMany({
      where: { id: { in: ids } },
      include: this.beReportInclude(),
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return { items, total };
  }

  findOne(id: string) {
    return this.prisma.suggestion.findUnique({
      where: { id },
      include: {
        implementedKaizen: {
          select: {
            implementedCode: true,
            ideaCode: true,
          },
        },
      },
    });
  }

  async updateStatus(id: string, dto: UpdateSuggestionStatusDto, actorUserId?: string) {
    const suggestion = await this.prisma.suggestion.findUnique({
      where: { id },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');

    const current = suggestion as any;
    await this.assertUnitScopeAllowed(actorUserId, dto.actor.role, current, dto.status);
    this.assertTransitionAllowed(current.status, dto.status, dto.actor.role);

    const rawExtra = (dto.extraData ?? {}) as Record<string, unknown>;
    const safeExtra = this.sanitizeExtraData(
      dto.actor,
      current,
      rawExtra,
    );
    const eventText = this.buildWorkflowEventText(
      current,
      dto.status,
      safeExtra,
      dto.actor.name,
    );

    const workflowThread: WorkflowEvent[] = [
      ...((current.workflowThread as WorkflowEvent[] | null) ?? []),
      {
        id: `WF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actor: dto.actor.name,
        role: dto.actor.role,
        text: eventText,
        date: new Date().toISOString(),
      },
    ];

    const merged = { ...current, ...safeExtra, status: dto.status };
    const currentStageRole = this.deriveCurrentStageRole(dto.status, merged);

    return this.prisma.$transaction(async (tx) => {
      // --- Mandatory remarks on rejection paths ---
      // 1) Unit Coordinator reject at idea screening
      if (dto.status === AppStatus.IDEA_REJECTED) {
        const remark = String((safeExtra as any).screeningNotes ?? '').trim();
        if (!remark) {
          throw new BadRequestException('Remarks are required when rejecting an idea.');
        }
      }
      // 2) BE member sends back to implementer (IMPLEMENTATION_DONE -> ASSIGNED_FOR_IMPLEMENTATION)
      // Do not block Selection Committee assignment, which also sets ASSIGNED_FOR_IMPLEMENTATION.
      if (
        dto.status === AppStatus.ASSIGNED_FOR_IMPLEMENTATION &&
        current.status === AppStatus.IMPLEMENTATION_DONE
      ) {
        const remark = String((safeExtra as any).beReviewNotes ?? '').trim();
        if (!remark) {
          throw new BadRequestException('Remarks are required when marking as not approved.');
        }
      }
      // 3) Unit Coordinator send-back after BE review (not implementer resubmitting template)
      if (
        current.status === AppStatus.BE_REVIEW_DONE &&
        dto.status === AppStatus.IMPLEMENTATION_DONE &&
        (dto.actor.role === AppRole.UNIT_COORDINATOR ||
          dto.actor.role === AppRole.ADMIN)
      ) {
        const remark = String((safeExtra as any).coordinatorSuggestion ?? '').trim();
        if (!remark) {
          throw new BadRequestException('Remarks are required when marking as not approved.');
        }
      }
      // 4) Functional approver sends back during approvals (VERIFIED -> BE_REVIEW_DONE)
      if (
        current.status === AppStatus.VERIFIED_PENDING_APPROVAL &&
        dto.status === AppStatus.BE_REVIEW_DONE
      ) {
        const remark = String((safeExtra as any).beReviewNotes ?? '').trim();
        if (!remark) {
          throw new BadRequestException('Remarks are required when marking as not approved.');
        }
      }

      // --- Finance approval rule ---
      // If BE Head recommends voucher > 2000, route through Finance Head approval before HR reward processing.
      // We enforce requiredApprovals includes FINANCE_HOD when moving into VERIFIED_PENDING_APPROVAL with such voucher.
      if (dto.status === AppStatus.VERIFIED_PENDING_APPROVAL) {
        const voucher = Number((merged as any)?.rewardEvaluation?.voucherValue ?? 0);
        if (voucher > 2000) {
          const existingReq = Array.isArray((merged as any).requiredApprovals)
            ? ((merged as any).requiredApprovals as string[])
            : [];
          if (!existingReq.includes(AppRole.FINANCE_HOD)) {
            (safeExtra as any).requiredApprovals = [...existingReq, AppRole.FINANCE_HOD];
            (merged as any).requiredApprovals = (safeExtra as any).requiredApprovals;
          }
        }
      }

      // --- Guard: only move to BE Head evaluation after approvals are complete ---
      if (
        current.status === AppStatus.VERIFIED_PENDING_APPROVAL &&
        dto.status === AppStatus.BE_EVALUATION_PENDING
      ) {
        const after = { ...(current as any), ...(safeExtra as any) };
        if (!this.approvalsComplete(after)) {
          throw new BadRequestException(
            'All required approvals must be completed before BE Head evaluation.',
          );
        }
      }

      const updated = await tx.suggestion.update({
        where: { id },
        data: {
          ...(safeExtra as any),
          status: dto.status,
          currentStageRole,
          workflowThread: workflowThread as any,
        },
      });

      // When Selection Committee assigns implementer, ensure the assignee gets IMPLEMENTER role.
      if (
        dto.status === AppStatus.ASSIGNED_FOR_IMPLEMENTATION &&
        (safeExtra as any).assignedImplementerCode
      ) {
        try {
          const employeeCode = String((safeExtra as any).assignedImplementerCode);
          const user = await tx.user.findUnique({ where: { employeeCode } });
          if (user) {
            const isSuperAdmin = (await tx.userRoleMapping.count({
              where: { userId: user.id, role: { code: RoleCode.SUPER_ADMIN } },
            })) > 0;
            if (isSuperAdmin) {
              // SUPER_ADMIN must not get additional roles.
              // Skip role auto-grant.
            } else {
              const role = await tx.role.upsert({
                where: { code: RoleCode.IMPLEMENTER },
                update: { name: 'Implementer' },
                create: {
                  code: RoleCode.IMPLEMENTER,
                  name: 'Implementer',
                  description: 'Auto-assigned when work is assigned',
                },
              });
              await tx.userRoleMapping.upsert({
                where: {
                  userId_roleId: {
                    userId: user.id,
                    roleId: role.id,
                  },
                },
                update: {
                  assignedBy: 'AUTO_ASSIGN_IMPLEMENTER',
                  assignedAt: new Date(),
                },
                create: {
                  userId: user.id,
                  roleId: role.id,
                  assignedBy: 'AUTO_ASSIGN_IMPLEMENTER',
                },
              });
            }
          }
        } catch (e: any) {
          // Assignment should not fail just because role auto-grant failed.
          this.logger.error(
            `Auto-assign IMPLEMENTER failed`,
            e?.stack || String(e),
          );
        }
      }

      // Implemented-kaizen series should represent fully closed ideas.
      // Create the implemented record when the workflow reaches REWARDED (final),
      // and never change an existing implementedCode (preserves history).
      if (current.status !== dto.status && dto.status === AppStatus.REWARDED) {
        const existing = await tx.implementedKaizen.findUnique({
          where: { suggestionId: updated.id },
          select: { implementedCode: true },
        });

        const year = new Date().getFullYear();
        const implementedCode =
          existing?.implementedCode ||
          `${IMPLEMENTED_PREFIX}-${year}-${String(await this.nextSequence(IMPLEMENTED_PREFIX, year, tx)).padStart(4, '0')}`;

        await tx.implementedKaizen.upsert({
          where: { suggestionId: updated.id },
          update: {
            ideaCode: (updated as any).code,
            implementedCode,
            dataSnapshot: { ...(updated as any), ...(rawExtra as any) } as any,
            implementedAt: new Date(),
          },
          create: {
            suggestionId: updated.id,
            ideaCode: (updated as any).code,
            implementedCode,
            dataSnapshot: { ...(updated as any), ...(rawExtra as any) } as any,
          },
        });
      }

      return updated;
    });
  }

  private async nextSequence(
    prefix: string,
    year: number,
    prisma: PrismaService | any = this.prisma,
  ) {
    const row = await prisma.codeCounter.upsert({
      where: { prefix_year: { prefix, year } },
      update: { next: { increment: 1 } },
      create: { prefix, year, next: 1 },
    });
    return row.next;
  }

  /** Which AppRole primarily owns the next inbox action for this status (denormalized on the row). */
  private deriveCurrentStageRole(
    status: AppStatus,
    row: Record<string, unknown>,
  ): string {
    switch (status) {
      case AppStatus.IDEA_SUBMITTED:
        return AppRole.UNIT_COORDINATOR;
      case AppStatus.IDEA_REJECTED:
        return AppRole.EMPLOYEE;
      case AppStatus.APPROVED_FOR_ASSIGNMENT:
        return AppRole.SELECTION_COMMITTEE;
      case AppStatus.ASSIGNED_FOR_IMPLEMENTATION:
        return AppRole.IMPLEMENTER;
      case AppStatus.IMPLEMENTATION_DONE:
        return AppRole.BUSINESS_EXCELLENCE;
      case AppStatus.BE_REVIEW_DONE:
        return AppRole.UNIT_COORDINATOR;
      case AppStatus.VERIFIED_PENDING_APPROVAL: {
        const required =
          (row.requiredApprovals as string[] | null | undefined) ?? [];
        const approvals =
          (row.approvals as Record<string, boolean> | null | undefined) ?? {};
        const pending = required.find((r) => !approvals[r]);
        if (pending && APP_ROLE_VALUES.has(pending)) return pending;
        return AppRole.QUALITY_HOD;
      }
      case AppStatus.BE_EVALUATION_PENDING:
        return AppRole.BUSINESS_EXCELLENCE_HEAD;
      case AppStatus.REWARD_PENDING:
        return AppRole.HR_HEAD;
      case AppStatus.REWARDED:
        return AppRole.EMPLOYEE;
      default:
        return AppRole.EMPLOYEE;
    }
  }

  private sanitizeExtraData(
    actor: { name: string; role: AppRole; employeeCode?: string },
    current: any,
    extraData: Record<string, unknown>,
  ): Record<string, unknown> {
    let safeExtra: Record<string, unknown> = { ...extraData };

    // Only allow fields that exist on `Suggestion` (prevents Prisma validation errors
    // and avoids callers injecting immutable/system fields).
    const ALLOWED_SUGGESTION_FIELDS = new Set<string>([
      'assignedImplementer',
      'assignedImplementerCode',
      'assignedUnit',
      'assignedDepartment',
      'implementationDeadline',
      'implementationAssignedDate',
      'deadlineChangeRemark',
      'implementationStage',
      'implementationProgress',
      'implementationUpdate',
      'implementationUpdateDate',
      'screeningNotes',
      'coordinatorSuggestion',
      'requiredApprovals',
      'hodApproverNames',
      'approvals',
      'rewardEvaluation',
      'beReviewNotes',
      'beEditedFields',
      'ideaAttachmentsFolder',
      'ideaAttachmentPaths',
      'templateAttachmentsFolder',
      'templateAttachmentPaths',
      'comments',
      'implementationDraft',
    ]);

    safeExtra = Object.fromEntries(
      Object.entries(safeExtra).filter(([k]) => ALLOWED_SUGGESTION_FIELDS.has(k)),
    );

    const touchesWork =
      safeExtra.implementationProgress !== undefined ||
      safeExtra.implementationUpdate !== undefined ||
      safeExtra.implementationStage !== undefined;

    if (touchesWork) {
      const assignee = (current.assignedImplementer || '').trim().toLowerCase();
      const actorName = (actor.name || '').trim().toLowerCase();
      const assigneeCode = (current.assignedImplementerCode || '').trim().toLowerCase();
      const actorCode = (actor.employeeCode || '').trim().toLowerCase();
      let isAssignedImplementer = false;
      if (actor.role === AppRole.IMPLEMENTER) {
        if (assigneeCode && actorCode) {
          isAssignedImplementer = assigneeCode === actorCode;
        } else if (!assignee && !assigneeCode) {
          isAssignedImplementer = true;
        } else if (assignee && actorName) {
          isAssignedImplementer = assignee === actorName;
        }
      }

      const canSetImplementationFields =
        isAssignedImplementer ||
        actor.role === AppRole.BUSINESS_EXCELLENCE ||
        actor.role === AppRole.ADMIN;

      if (!canSetImplementationFields) {
        const {
          implementationProgress: _p,
          implementationUpdate: _u,
          implementationUpdateDate: _ud,
          implementationStage: _st,
          ...rest
        } = safeExtra;
        safeExtra = rest;
      }
    }

    if (safeExtra.implementationProgress !== undefined) {
      const prevP = current.implementationProgress ?? 0;
      const next = Number(safeExtra.implementationProgress);
      safeExtra.implementationProgress = Math.max(
        prevP,
        Math.min(100, Number.isNaN(next) ? prevP : next),
      );
    }

    return safeExtra;
  }

  private filterByRole(
    role: AppRole,
    suggestion: any,
    currentUserName?: string,
    currentUserEmployeeCode?: string,
  ) {
    if (role === AppRole.ADMIN) return true;
    if (role === AppRole.EMPLOYEE) {
      if (!currentUserName) return false;
      return (
        suggestion.employeeName?.trim().toLowerCase() ===
        currentUserName.trim().toLowerCase()
      );
    }
    if (role === AppRole.UNIT_COORDINATOR) {
      // Coordinator view should focus on approval/workflow actions (not the coordinator's own submissions).
      // Own ideas remain visible under the Employee role view.
      const isOwn =
        currentUserName &&
        String(suggestion.employeeName || '').trim().toLowerCase() ===
          currentUserName.trim().toLowerCase();
      if (isOwn) return false;
      // Include every in-flight status so assigned / verified / evaluation stages stay visible after screening approval.
      return [
        AppStatus.IDEA_SUBMITTED,
        AppStatus.APPROVED_FOR_ASSIGNMENT,
        AppStatus.ASSIGNED_FOR_IMPLEMENTATION,
        AppStatus.IMPLEMENTATION_DONE,
        AppStatus.BE_REVIEW_DONE,
        AppStatus.VERIFIED_PENDING_APPROVAL,
        AppStatus.BE_EVALUATION_PENDING,
        AppStatus.REWARD_PENDING,
        AppStatus.REWARDED,
      ].includes(suggestion.status);
    }
    if (role === AppRole.SELECTION_COMMITTEE)
      return suggestion.status === AppStatus.APPROVED_FOR_ASSIGNMENT;
    if (role === AppRole.IMPLEMENTER) {
      const sugCode = (suggestion.assignedImplementerCode || '')
        .trim()
        .toLowerCase();
      const myCode = (currentUserEmployeeCode || '').trim().toLowerCase();
      const sugName = (suggestion.assignedImplementer || '').trim().toLowerCase();
      const myName = (currentUserName || '').trim().toLowerCase();
      const isAssignedToMe = (() => {
        if (myCode && sugCode) return sugCode === myCode;
        if (myName && sugName) return sugName === myName;
        if (!myCode && !myName) return true;
        return false;
      })();
      return (
        isAssignedToMe &&
        [
          AppStatus.ASSIGNED_FOR_IMPLEMENTATION,
          AppStatus.BE_REVIEW_DONE,
          AppStatus.BE_EVALUATION_PENDING,
          AppStatus.VERIFIED_PENDING_APPROVAL,
          AppStatus.REWARD_PENDING,
          AppStatus.REWARDED,
        ].includes(suggestion.status)
      );
    }
    if (role === AppRole.BUSINESS_EXCELLENCE)
      return true;
    if (role === AppRole.BUSINESS_EXCELLENCE_HEAD)
      return [
        AppStatus.BE_EVALUATION_PENDING,
        AppStatus.REWARD_PENDING,
        AppStatus.REWARDED,
      ].includes(suggestion.status);
    if (
      [AppRole.HR_HEAD, AppRole.QUALITY_HOD, AppRole.FINANCE_HOD].includes(role)
    ) {
      if (
        role === AppRole.HR_HEAD &&
        [AppStatus.REWARD_PENDING, AppStatus.REWARDED].includes(
          suggestion.status,
        )
      )
        return true;
      const requiredApprovals = (suggestion.requiredApprovals ??
        []) as string[];
      const approvals = (suggestion.approvals ?? {}) as Record<string, boolean>;
      if (!requiredApprovals.includes(role)) return false;
      // Pending this head’s sign-off
      if (
        suggestion.status === AppStatus.VERIFIED_PENDING_APPROVAL &&
        !approvals[role]
      )
        return true;
      // Already approved by this head (others pending, or workflow moved on)
      if (approvals[role]) return true;
      return false;
    }
    return true;
  }

  private assertTransitionAllowed(
    currentStatus: AppStatus,
    nextStatus: AppStatus,
    actorRole: AppRole,
  ) {
    if (currentStatus === nextStatus) return;

    const key = `${currentStatus}->${nextStatus}`;
    const allowed: Record<string, AppRole[]> = {
      [`${AppStatus.IDEA_SUBMITTED}->${AppStatus.APPROVED_FOR_ASSIGNMENT}`]: [
        AppRole.UNIT_COORDINATOR,
        AppRole.ADMIN,
      ],
      [`${AppStatus.IDEA_SUBMITTED}->${AppStatus.IDEA_REJECTED}`]: [
        AppRole.UNIT_COORDINATOR,
        AppRole.ADMIN,
      ],
      // Send-back paths ("Not approved" -> previous stage)
      [`${AppStatus.IMPLEMENTATION_DONE}->${AppStatus.ASSIGNED_FOR_IMPLEMENTATION}`]: [
        AppRole.BUSINESS_EXCELLENCE,
        AppRole.ADMIN,
      ],
      [`${AppStatus.BE_REVIEW_DONE}->${AppStatus.IMPLEMENTATION_DONE}`]: [
        AppRole.UNIT_COORDINATOR,
        AppRole.IMPLEMENTER,
        AppRole.ADMIN,
      ],
      [`${AppStatus.APPROVED_FOR_ASSIGNMENT}->${AppStatus.ASSIGNED_FOR_IMPLEMENTATION}`]:
        [AppRole.SELECTION_COMMITTEE, AppRole.ADMIN],
      [`${AppStatus.ASSIGNED_FOR_IMPLEMENTATION}->${AppStatus.IMPLEMENTATION_DONE}`]:
        [AppRole.IMPLEMENTER, AppRole.BUSINESS_EXCELLENCE, AppRole.ADMIN],
      [`${AppStatus.IMPLEMENTATION_DONE}->${AppStatus.BE_REVIEW_DONE}`]: [
        AppRole.BUSINESS_EXCELLENCE,
        AppRole.ADMIN,
      ],
      // Unit Coordinator routes to functional approvals after BE Member review
      [`${AppStatus.BE_REVIEW_DONE}->${AppStatus.VERIFIED_PENDING_APPROVAL}`]: [
        AppRole.UNIT_COORDINATOR,
        AppRole.ADMIN,
      ],
      // After approvals are completed, move to BE Head evaluation
      [`${AppStatus.VERIFIED_PENDING_APPROVAL}->${AppStatus.BE_EVALUATION_PENDING}`]:
        [AppRole.UNIT_COORDINATOR, AppRole.ADMIN, AppRole.FINANCE_HOD, AppRole.QUALITY_HOD, AppRole.HR_HEAD],
      [`${AppStatus.BE_EVALUATION_PENDING}->${AppStatus.VERIFIED_PENDING_APPROVAL}`]: [
        AppRole.BUSINESS_EXCELLENCE_HEAD,
        AppRole.ADMIN,
      ],
      [`${AppStatus.BE_EVALUATION_PENDING}->${AppStatus.REWARD_PENDING}`]: [
        AppRole.BUSINESS_EXCELLENCE_HEAD,
        AppRole.ADMIN,
      ],
      [`${AppStatus.REWARD_PENDING}->${AppStatus.REWARDED}`]: [
        AppRole.HR_HEAD,
        AppRole.UNIT_COORDINATOR,
        AppRole.ADMIN,
      ],
    };

    const allowedRoles = allowed[key] ?? [];
    if (!allowedRoles.includes(actorRole)) {
      throw new BadRequestException(
        `Transition ${key} is not allowed for role ${actorRole}`,
      );
    }
  }

  private buildWorkflowEventText(
    prev: any,
    nextStatus: AppStatus,
    extraData: Record<string, unknown>,
    actor: string,
  ) {
    if (prev.status !== nextStatus) {
      if (
        nextStatus === AppStatus.ASSIGNED_FOR_IMPLEMENTATION &&
        extraData.assignedImplementer
      ) {
        const unitPart = extraData.assignedUnit
          ? ` at unit ${extraData.assignedUnit}`
          : '';
        const deptPart = extraData.assignedDepartment
          ? `, ${extraData.assignedDepartment}`
          : '';
        const deadlinePart = extraData.implementationDeadline
          ? `, deadline ${extraData.implementationDeadline}`
          : '';
        return `${actor} assigned implementer ${extraData.assignedImplementer}${unitPart}${deptPart}${deadlinePart}.`;
      }
      return `${actor} ${this.statusLabel(nextStatus)}.`;
    }
    if (
      extraData.implementationUpdate ||
      extraData.implementationProgress !== undefined ||
      extraData.implementationStage
    ) {
      const progress =
        (extraData.implementationProgress as number | undefined) ??
        prev.implementationProgress ??
        0;
      const stage =
        (extraData.implementationStage as string | undefined) ||
        prev.implementationStage ||
        'In Progress';
      const note = extraData.implementationUpdate
        ? ` Note: ${extraData.implementationUpdate}`
        : '';
      return `${actor} updated work status to ${stage} (${progress}%).${note}`;
    }
    if (extraData.coordinatorSuggestion) {
      return `${actor} added coordinator suggestion and reviewed template.`;
    }
    if (
      extraData.assignedImplementer &&
      extraData.assignedImplementer !== prev.assignedImplementer
    ) {
      return `${actor} updated assignee to ${extraData.assignedImplementer}.`;
    }
    if (
      extraData.implementationDeadline &&
      extraData.implementationDeadline !== prev.implementationDeadline
    ) {
      const remark = extraData.deadlineChangeRemark
        ? ` Remark: ${extraData.deadlineChangeRemark}`
        : '';
      return `${actor} updated deadline to ${extraData.implementationDeadline}.${remark}`;
    }
    return `${actor} updated workflow details.`;
  }

  private statusLabel(status: AppStatus) {
    if (status === AppStatus.IDEA_SUBMITTED) return 'submitted the idea';
    if (status === AppStatus.APPROVED_FOR_ASSIGNMENT)
      return 'approved the idea';
    if (status === AppStatus.IDEA_REJECTED) return 'rejected the idea';
    if (status === AppStatus.ASSIGNED_FOR_IMPLEMENTATION)
      return 'assigned implementer and timeline';
    if (status === AppStatus.IMPLEMENTATION_DONE)
      return 'submitted implementation template';
    if (status === AppStatus.BE_REVIEW_DONE)
      return 'completed BE review and routed to Unit Coordinator';
    if (status === AppStatus.VERIFIED_PENDING_APPROVAL)
      return 'routed for functional approvals';
    if (status === AppStatus.BE_EVALUATION_PENDING)
      return 'moved to BE Head evaluation and scoring';
    if (status === AppStatus.REWARD_PENDING)
      return 'completed BE evaluation and moved to reward processing';
    if (status === AppStatus.REWARDED) return 'closed idea with reward';
    return `updated status to ${String(status)}`;
  }
}
