import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { SetUnitScopesDto } from './dto/set-unit-scopes.dto';
import type { JwtAccessPayload } from '../auth/guards/jwt-auth.guard';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeUnitCode(v: string): string {
    return String(v ?? '').trim();
  }

  private async userHasSuperAdmin(userId: string): Promise<boolean> {
    const count = await this.prisma.userRoleMapping.count({
      where: {
        userId,
        role: { code: RoleCode.SUPER_ADMIN },
      },
    });
    return count > 0;
  }

  async getEmployeeHrms(employeeIdRaw: string) {
    const employeeId = employeeIdRaw?.trim();
    if (!employeeId) return null;
    const row = await (this.prisma as any).hrms_employees.findFirst({
      where: { employee_id: employeeId },
      select: {
        employee_id: true,
        first_name: true,
        last_name: true,
        department: true,
        unit: true,
        manager: true,
        hod: true,
        jobtitle: true,
        is_active: true,
      },
    });
    if (!row) return null;
    return {
      employeeId: String(row.employee_id),
      name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
      unit: row.unit ? String(row.unit) : null,
      department: row.department ? String(row.department) : null,
      manager: row.manager ? String(row.manager) : null,
      hod: row.hod ? String(row.hod) : null,
      jobtitle: row.jobtitle ? String(row.jobtitle) : null,
      isActive: Boolean(row.is_active),
    };
  }

  async getMe(token: JwtAccessPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: token.sub },
    });

    const hrmsEmp = await (this.prisma as any).hrms_employees.findFirst({
      where: { employee_id: token.employeeCode },
      select: {
        unit: true,
        department: true,
        jobtitle: true,
      },
    });

    const unitCode = hrmsEmp?.unit ? String(hrmsEmp.unit) : null;
    const unitMaster = unitCode
      ? await (this.prisma as any).hrmsUnit.findFirst({
          where: { code: unitCode },
          select: { name: true },
        })
      : null;

    return {
      id: token.sub,
      employeeCode: token.employeeCode,
      email: token.email,
      name: token.name,
      unit: unitCode
        ? { code: unitCode, name: String(unitMaster?.name ?? unitCode) }
        : null,
      department:
        (hrmsEmp?.department as string | undefined) ??
        user?.department ??
        null,
      designation: user?.designation ?? null,
    };
  }

  async listImplementers(unitCodeRaw: string, departmentRaw: string) {
    const unitCode = unitCodeRaw?.trim();
    const department = departmentRaw?.trim();
    if (!unitCode || !department) return [];

    const hrmsEmployees = await (this.prisma as any).hrms_employees.findMany({
      where: {
        is_active: true,
        unit: unitCode,
        department,
      },
      select: { employee_id: true, manager: true },
      take: 1000,
    });

    const managerByEmployeeCode = new Map<string, string>();
    hrmsEmployees.forEach((e: any) => {
      const code = String(e.employee_id);
      const mgr = (e.manager ?? '').toString().trim();
      if (code && mgr) managerByEmployeeCode.set(code, mgr);
    });

    const employeeCodes = hrmsEmployees.map((e: any) => String(e.employee_id));
    if (!employeeCodes.length) return [];

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        employeeCode: { in: employeeCodes },
        OR: [
          { roles: { some: { role: { code: RoleCode.EMPLOYEE } } } },
          /** New installs often have no rows in user_role_mapping yet */
          { roles: { none: {} } },
        ],
      },
      orderBy: [{ name: 'asc' }],
      select: { employeeCode: true, name: true },
      take: 1000,
    });

    return users.map((u) => ({
      employeeCode: u.employeeCode,
      name: u.name,
      manager: managerByEmployeeCode.get(String(u.employeeCode)) || null,
    }));
  }

  async listEmployees(
    search?: string,
    department?: string,
    includeUnitScopes = false,
  ) {
    const q = search?.trim();
    const dept = department?.trim();
    const users = await this.prisma.user.findMany({
      where: {
        ...(dept
          ? { department: { equals: dept, mode: 'insensitive' } }
          : {}),
        ...(q
          ? {
              OR: [
                { employeeCode: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { department: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const employeeCodes = users
      .map((u) => String(u.employeeCode || '').trim())
      .filter(Boolean);
    const hrms: Array<{ employee_id: string; unit: string | null }> = employeeCodes.length
      ? ((await (this.prisma as any).$queryRaw(
          Prisma.sql`
            SELECT employee_id::text as employee_id, unit::text as unit
            FROM hrms_employees
            WHERE TRIM(employee_id::text) IN (${Prisma.join(employeeCodes)})
          `,
        )) as any)
      : [];
    const unitByEmployeeCode = new Map<string, string | null>();
    (Array.isArray(hrms) ? hrms : []).forEach((r: any) => {
      const code = String(r.employee_id || '').trim();
      if (!code) return;
      unitByEmployeeCode.set(code, r.unit ? String(r.unit).trim() : null);
    });

    const userIds = users.map((u) => u.id);
    const unitScopesByUserRole = new Map<
      string,
      { UNIT_COORDINATOR?: string[]; SELECTION_COMMITTEE?: string[] }
    >();
    if (includeUnitScopes && userIds.length) {
      const rows = await (this.prisma as any).userRoleUnitScope.findMany({
        where: {
          userId: { in: userIds },
          roleCode: { in: [RoleCode.UNIT_COORDINATOR, RoleCode.SELECTION_COMMITTEE] },
        },
        select: { userId: true, roleCode: true, unitCode: true },
        take: 50000,
      });
      (Array.isArray(rows) ? rows : []).forEach((r: any) => {
        const uid = String(r.userId || '');
        if (!uid) return;
        const role = String(r.roleCode || '');
        const unit = String(r.unitCode || '').trim();
        if (!unit) return;
        const entry =
          unitScopesByUserRole.get(uid) || ({} as any);
        const key = role === 'UNIT_COORDINATOR' ? 'UNIT_COORDINATOR' : 'SELECTION_COMMITTEE';
        entry[key] = Array.from(new Set([...(entry[key] || []), unit])).sort((a, b) =>
          a.localeCompare(b),
        );
        unitScopesByUserRole.set(uid, entry);
      });
    }

    return users.map((u) => ({
      id: u.id,
      employeeCode: u.employeeCode,
      name: u.name,
      email: u.email,
      unitCode: unitByEmployeeCode.get(String(u.employeeCode || '').trim()) ?? null,
      unitScopes: includeUnitScopes ? (unitScopesByUserRole.get(u.id) ?? {}) : undefined,
      department: u.department,
      designation: u.designation,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      roles: u.roles.map((r) => String(r.role.code)),
    }));
  }

  async assignRole(userId: string, dto: AssignRoleDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Hard rule: a SUPER_ADMIN user must not have any other roles.
    // - If user already has SUPER_ADMIN, block assigning any other role.
    // - If assigning SUPER_ADMIN, remove all other role mappings first.
    const hasSuperAdmin = await this.userHasSuperAdmin(user.id);
    if (dto.roleCode !== RoleCode.SUPER_ADMIN && hasSuperAdmin) {
      throw new ForbiddenException(
        'Cannot assign additional roles to a SUPER_ADMIN user',
      );
    }

    let role = await this.prisma.role.findUnique({
      where: { code: dto.roleCode },
    });
    if (!role) {
      role = await this.prisma.role.create({
        data: {
          code: dto.roleCode,
          name: dto.roleCode,
        },
      });
    }

    const mapping = await this.prisma.$transaction(async (tx) => {
      if (dto.roleCode === RoleCode.SUPER_ADMIN) {
        await tx.userRoleMapping.deleteMany({
          where: {
            userId: user.id,
            role: { code: { not: RoleCode.SUPER_ADMIN } },
          },
        });
      }

      return tx.userRoleMapping.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: role.id,
          },
        },
        update: {
          assignedBy: dto.assignedBy,
          assignedAt: new Date(),
        },
        create: {
          userId: user.id,
          roleId: role.id,
          assignedBy: dto.assignedBy,
        },
      });
    });

    return {
      message: 'Role assigned',
      mappingId: mapping.id,
      userId: user.id,
      role: role.code,
    };
  }

  async getUnitScopes(userId: string, roleCodeRaw: string) {
    const roleCode = String(roleCodeRaw || '').trim().toUpperCase();
    if (!roleCode) return [];
    const allowed = new Set<string>(Object.values(RoleCode) as any);
    if (!allowed.has(roleCode)) return [];

    const rows = await (this.prisma as any).userRoleUnitScope.findMany({
      where: { userId, roleCode: roleCode as any },
      orderBy: { unitCode: 'asc' },
      select: { unitCode: true, assignedBy: true, assignedAt: true },
      take: 5000,
    });
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      unitCode: String(r.unitCode),
      assignedBy: r.assignedBy ? String(r.assignedBy) : null,
      assignedAt: r.assignedAt ? String(r.assignedAt) : null,
    }));
  }

  async setUnitScopes(userId: string, dto: SetUnitScopesDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const roleCode = dto.roleCode;
    const unitCodes = Array.from(
      new Set(
        (Array.isArray(dto.unitCodes) ? dto.unitCodes : [])
          .map((u) => this.normalizeUnitCode(u))
          .filter(Boolean),
      ),
    ).slice(0, 5000);

    const assignedBy = dto.assignedBy?.trim() || 'ADMIN_UI';

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).userRoleUnitScope.deleteMany({
        where: { userId, roleCode },
      });
      if (unitCodes.length) {
        await (tx as any).userRoleUnitScope.createMany({
          data: unitCodes.map((unitCode) => ({
            userId,
            roleCode,
            unitCode,
            assignedBy,
          })),
          skipDuplicates: true,
        });
      }
    });

    return this.getUnitScopes(userId, String(roleCode));
  }

  async removeRole(userId: string, roleCodeRaw: string) {
    const roleCode = roleCodeRaw?.trim();
    if (!roleCode) {
      throw new NotFoundException('Role not found');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const role = await this.prisma.role.findUnique({
      where: { code: roleCode as any },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.code === RoleCode.SUPER_ADMIN) {
      throw new ForbiddenException('SUPER_ADMIN role cannot be removed');
    }

    await this.prisma.userRoleMapping.deleteMany({
      where: { userId: user.id, roleId: role.id },
    });

    return {
      message: 'Role removed',
      userId: user.id,
      role: role.code,
    };
  }
}
