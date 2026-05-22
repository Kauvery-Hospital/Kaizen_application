import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { RoleCode } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import type { JwtAccessPayload } from './guards/jwt-auth.guard';

export type AuthUserUnitScopes = {
  UNIT_COORDINATOR?: string[];
  SELECTION_COMMITTEE?: string[];
  HOD_FINANCE?: string[];
  HOD_QUALITY?: string[];
  HOD_HR?: string[];
  HOD_OPS?: string[];
  HOD_NURSING?: string[];
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private async listUnitScopesForUser(userId: string): Promise<AuthUserUnitScopes> {
    const rows = await this.prisma.userRoleUnitScope.findMany({
      where: {
        userId,
        roleCode: {
          in: [
            RoleCode.UNIT_COORDINATOR,
            RoleCode.SELECTION_COMMITTEE,
            RoleCode.HOD_FINANCE,
            RoleCode.HOD_QUALITY,
            RoleCode.HOD_HR,
            RoleCode.HOD_OPS,
            RoleCode.HOD_NURSING,
          ],
        },
      },
      select: { roleCode: true, unitCode: true },
      take: 5000,
    });

    const bundle: AuthUserUnitScopes = {};
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      const role = String(r.roleCode || '');
      const unit = String(r.unitCode || '').trim();
      if (!unit) return;
      const key =
        role === 'UNIT_COORDINATOR'
          ? 'UNIT_COORDINATOR'
          : role === 'SELECTION_COMMITTEE'
            ? 'SELECTION_COMMITTEE'
            : role === 'HOD_FINANCE'
              ? 'HOD_FINANCE'
              : role === 'HOD_QUALITY'
                ? 'HOD_QUALITY'
                : role === 'HOD_HR'
                  ? 'HOD_HR'
                  : role === 'HOD_OPS'
                    ? 'HOD_OPS'
                    : role === 'HOD_NURSING'
                      ? 'HOD_NURSING'
                      : null;
      if (!key) return;
      bundle[key] = Array.from(new Set([...(bundle[key] || []), unit])).sort((a, b) =>
        a.localeCompare(b),
      );
    });
    return bundle;
  }

  private async listDepartmentHodAssignments(userId: string): Promise<string[]> {
    const rows = await (this.prisma as any).departmentHodAssignment.findMany({
      where: { userId },
      select: { departmentName: true },
      take: 5000,
    });
    return Array.from(
      new Set(
        (Array.isArray(rows) ? rows : [])
          .map((r: any) => String(r?.departmentName ?? '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { employeeCode: dto.employeeCode },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid employee ID or password');
    }

    if (!user.password) {
      throw new UnauthorizedException('Invalid employee ID or password');
    }

    const stored = String(user.password);
    const input = String(dto.password ?? '');
    const isBcrypt = stored.startsWith('$2');
    const isMd5 = /^[a-f0-9]{32}$/i.test(stored);

    let passwordOk = false;
    if (isBcrypt) {
      passwordOk = await bcrypt.compare(input, stored);
    } else if (isMd5) {
      const inputMd5 = createHash('md5').update(input, 'utf8').digest('hex');
      passwordOk = inputMd5.toLowerCase() === stored.toLowerCase();
    } else {
      // Backward compatibility for any existing plaintext passwords (should be migrated to bcrypt).
      passwordOk = stored === input;
    }

    if (!passwordOk) {
      throw new UnauthorizedException('Invalid employee ID or password');
    }

    // Opportunistically migrate weaker password storage to bcrypt after successful auth.
    if (!isBcrypt) {
      const nextHash = await bcrypt.hash(input, 10);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { password: nextHash },
      });
    }

    const roles = user.roles.map((mapping: any) => String(mapping.role.code));
    const [departmentHodAssignments, unitScopes] = await Promise.all([
      this.listDepartmentHodAssignments(user.id),
      this.listUnitScopesForUser(user.id),
    ]);

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      employeeCode: user.employeeCode,
      email: user.email,
      name: user.name,
      roles,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        email: user.email,
        name: user.name,
        roles,
        departmentHodAssignments,
        unitScopes,
      },
    };
  }

  async refreshSession(token: JwtAccessPayload) {
    const user = await this.prisma.user.findFirst({
      where: { id: token.sub },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const roles = user.roles.map((mapping: any) => String(mapping.role.code));
    const [departmentHodAssignments, unitScopes] = await Promise.all([
      this.listDepartmentHodAssignments(user.id),
      this.listUnitScopesForUser(user.id),
    ]);
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      employeeCode: user.employeeCode,
      email: user.email,
      name: user.name,
      roles,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        email: user.email,
        name: user.name,
        roles,
        departmentHodAssignments,
        unitScopes,
      },
    };
  }
}
