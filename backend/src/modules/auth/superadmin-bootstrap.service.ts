import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleCode } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SuperAdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SuperAdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled =
      String(this.config.get<string>('SUPER_ADMIN_BOOTSTRAP_ENABLED') ?? 'true')
        .trim()
        .toLowerCase() !== 'false';
    if (!enabled) return;

    const employeeCode =
      this.config.get<string>('SUPER_ADMIN_EMPLOYEE_CODE')?.trim() ||
      'SUPERADMIN';
    const password =
      this.config.get<string>('SUPER_ADMIN_PASSWORD')?.trim() ||
      'SuperAdmin@123';
    const email =
      this.config.get<string>('SUPER_ADMIN_EMAIL')?.trim() ||
      'superadmin@local';
    const name =
      this.config.get<string>('SUPER_ADMIN_NAME')?.trim() || 'Super Admin';

    try {
      // Ensure role exists
      const role = await this.prisma.role.upsert({
        where: { code: RoleCode.SUPER_ADMIN },
        update: { name: 'Super Admin' },
        create: {
          code: RoleCode.SUPER_ADMIN,
          name: 'Super Admin',
          description: 'Bootstrap super admin role',
        },
      });

      const existing = await this.prisma.user.findUnique({
        where: { employeeCode },
      });

      const passwordHash = password.startsWith('$2')
        ? password
        : await bcrypt.hash(password, 10);

      const user = existing
        ? await this.prisma.user.update({
            where: { id: existing.id },
            data: {
              email,
              name,
              password: passwordHash,
              isActive: true,
            },
          })
        : await this.prisma.user.create({
            data: {
              employeeCode,
              email,
              name,
              password: passwordHash,
              isActive: true,
            },
          });

      await this.prisma.userRoleMapping.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: role.id,
          },
        },
        update: { assignedBy: 'BOOTSTRAP_SUPER_ADMIN', assignedAt: new Date() },
        create: {
          userId: user.id,
          roleId: role.id,
          assignedBy: 'BOOTSTRAP_SUPER_ADMIN',
        },
      });

      this.logger.log(
        `SUPER_ADMIN ensured for employeeCode="${employeeCode}" (userId=${user.id}).`,
      );
    } catch (e) {
      const err = e as Error;
      this.logger.error(`SUPER_ADMIN bootstrap failed: ${err.message}`);
    }
  }
}

