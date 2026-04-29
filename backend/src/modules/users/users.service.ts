import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import type { JwtAccessPayload } from '../auth/guards/jwt-auth.guard';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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

  async listEmployees(search?: string, department?: string) {
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

    return users.map((u) => ({
      id: u.id,
      employeeCode: u.employeeCode,
      name: u.name,
      email: u.email,
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
