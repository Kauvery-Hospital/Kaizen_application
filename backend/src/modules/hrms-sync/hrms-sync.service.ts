import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma, RoleCode, SyncStatus } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaService } from '../../database/prisma.service';

const DEFAULT_ROLE = 'EMPLOYEE';
type HrmsEmployee = {
  employeeId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  password?: string | null;
  phone: string;
  dateOfBirth: string; // YYYY-MM-DD
  joiningDate: string; // YYYY-MM-DD
  department?: string | null;
  unit?: string | null;
  manager?: string | null;
  hod?: string | null;
  jobtitle?: string | null;
  isActive?: boolean;
};

@Injectable()
export class HrmsSyncService {
  private readonly logger = new Logger(HrmsSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron(process.env.HRMS_SYNC_CRON ?? '0 */30 * * * *')
  async scheduledSync(): Promise<void> {
    try {
      const syncResult = await this.runNow();
      this.logger.log(
        `Scheduled HRMS sync done. Inserted: ${syncResult.insertedCount}, Updated: ${syncResult.updatedCount}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Scheduled HRMS sync failed: ${err.message}`);
    }
  }

  async runNow() {
    const employees = await this.fetchEmployeesFromHrms();

    const syncLog = await this.prisma.hrmsSyncLog.create({
      data: { status: SyncStatus.SUCCESS },
    });

    let insertedCount = 0;
    let updatedCount = 0;

    try {
      for (const employee of employees) {
        const fullName = `${employee.firstName} ${employee.lastName}`.trim();
        const safeEmail = await this.resolveUniqueEmail(
          employee.email ?? '',
          employee.employeeId,
        );

        // Maintain master tables for dropdowns (optional but useful)
        const unitCode = employee.unit?.trim() || undefined;
        if (unitCode) {
          await (this.prisma as any).hrmsUnit.upsert({
            where: { code: unitCode },
            create: { code: unitCode, name: unitCode.slice(0, 120) },
            update: {},
          });
        }
        const deptName = employee.department?.trim();
        if (deptName) {
          await (this.prisma as any).hrmsDepartment.upsert({
            where: { name: deptName.slice(0, 120) },
            create: { name: deptName.slice(0, 120) },
            update: {},
          });
        }

        // Mirror HRMS row in kaizen_kh.hrms_employees using exact requested structure
        const mirrorCreate = {
          employee_id: employee.employeeId,
          first_name: employee.firstName,
          last_name: employee.lastName,
          email: (employee.email ?? null) || null,
          password: (employee.password ?? null) || null,
          phone: employee.phone,
          date_of_birth: new Date(`${employee.dateOfBirth}T00:00:00.000Z`),
          joining_date: new Date(`${employee.joiningDate}T00:00:00.000Z`),
          department: employee.department ?? null,
          unit: employee.unit ?? null,
          manager: employee.manager ?? null,
          hod: employee.hod ?? null,
          jobtitle: employee.jobtitle ?? null,
          is_active: employee.isActive ?? true,
        } as any;

        await (this.prisma as any).hrms_employees.upsert({
          where: { employee_id: employee.employeeId },
          create: mirrorCreate,
          update: { ...mirrorCreate, updated_at: new Date() } as any,
        });

        await this.prisma.hrmsEmployeeStaging.upsert({
          where: { employeeCode: employee.employeeId },
          update: {
            email: safeEmail,
            name: fullName,
            department: employee.department ?? undefined,
            designation: employee.jobtitle ?? undefined,
            isActive: employee.isActive ?? true,
            syncedAt: new Date(),
          },
          create: {
            employeeCode: employee.employeeId,
            email: safeEmail,
            name: fullName,
            department: employee.department ?? undefined,
            designation: employee.jobtitle ?? undefined,
            isActive: employee.isActive ?? true,
          },
        });

        const existingUser = await this.prisma.user.findUnique({
          where: { employeeCode: employee.employeeId },
        });

        if (existingUser) {
          await this.prisma.user.update({
            where: { id: existingUser.id },
            data: {
              email: safeEmail,
              name: fullName,
              password: employee.password ?? existingUser.password ?? null,
              department: employee.department ?? null,
              designation: employee.jobtitle ?? null,
              isActive: employee.isActive ?? true,
            },
          });
          updatedCount += 1;
        } else {
          const createdUser = await this.prisma.user.create({
            data: {
              employeeCode: employee.employeeId,
              email: safeEmail,
              name: fullName,
              password: employee.password ?? null,
              department: employee.department ?? null,
              designation: employee.jobtitle ?? null,
              isActive: employee.isActive ?? true,
            },
          });
          insertedCount += 1;

          const defaultRole = await this.prisma.role.upsert({
            where: { code: RoleCode.EMPLOYEE },
            update: {},
            create: {
              code: RoleCode.EMPLOYEE,
              name: DEFAULT_ROLE,
              description: 'Default role for synced employees',
            },
          });

          await this.prisma.userRoleMapping.upsert({
            where: {
              userId_roleId: {
                userId: createdUser.id,
                roleId: defaultRole.id,
              },
            },
            update: {},
            create: {
              userId: createdUser.id,
              roleId: defaultRole.id,
              assignedBy: 'HRMS_SYNC',
            },
          });
        }
      }

      await this.prisma.hrmsSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: SyncStatus.SUCCESS,
          insertedCount,
          updatedCount,
          syncEndedAt: new Date(),
        },
      });

      return { message: 'HRMS sync completed', insertedCount, updatedCount };
    } catch (error) {
      const err = error as Error;
      await this.prisma.hrmsSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: SyncStatus.FAILED,
          insertedCount,
          updatedCount,
          syncEndedAt: new Date(),
          errorMessage: err.message,
        },
      });
      throw error;
    }
  }

  private async resolveUniqueEmail(raw: string, employeeId: string) {
    const trimmed = (raw ?? '').trim().toLowerCase();
    const safeEmp = this.sanitizeEmployeeCodeForEmail(employeeId);
    const base =
      trimmed && trimmed.includes('@')
        ? trimmed
        : `${safeEmp}@hrms.local`;

    const conflictInHrms = await (this.prisma as any).hrms_employees.findFirst({
      where: {
        email: base,
        NOT: { employee_id: employeeId },
      },
      select: { employee_id: true },
    });

    const conflictInUsers = await this.prisma.user.findFirst({
      where: {
        email: base,
        NOT: { employeeCode: employeeId },
      },
      select: { employeeCode: true },
    });

    if (!conflictInHrms && !conflictInUsers) return base;

    const fallback = `${safeEmp}@dup.local`;
    this.logger.warn(
      `Duplicate email "${base}" detected; using "${fallback}" for ${employeeId}`,
    );
    return fallback;
  }

  private sanitizeEmployeeCodeForEmail(raw: string): string {
    const s = (raw ?? '').trim();
    const safe = s.replace(/[^a-zA-Z0-9_-]/g, '');
    return safe.length > 0 ? safe : 'unknown';
  }

  // NOTE: hrms_employees now stores unit/department as flat TEXT fields.
  // We still keep hrms_units/hrms_departments master tables for dropdowns, but no longer store FK ids.

  private async fetchEmployeesFromHrms(): Promise<HrmsEmployee[]> {
    const hrmsDbUrl = this.config.get<string>('HRMS_DATABASE_URL');
    if (!hrmsDbUrl) {
      this.logger.warn('HRMS_DATABASE_URL is not configured.');
      return [];
    }

    const pool = new Pool({ connectionString: hrmsDbUrl });
    try {
      const colsRes = await pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'hrms_employees'`,
      );
      const cols = new Set<string>(colsRes.rows.map((r) => r.column_name));

      const required = [
        'employee_id',
        'first_name',
        'last_name',
        'phone',
        'date_of_birth',
        'joining_date',
        'is_active',
      ];
      const missing = required.filter((c) => !cols.has(c));
      if (missing.length) {
        throw new Error(
          `HRMS hrms_employees missing columns: ${missing.join(', ')}`,
        );
      }

      const result = await pool.query(
        `SELECT employee_id,
                first_name,
                last_name,
                email,
                ${cols.has('password') ? 'password' : 'NULL::text AS password'},
                phone,
                to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
                to_char(joining_date, 'YYYY-MM-DD') AS joining_date,
                department,
                unit,
                manager,
                hod,
                jobtitle,
                is_active
         FROM hrms_employees
         WHERE is_active = true`,
      );

      return result.rows.map((row: Record<string, unknown>) => ({
        employeeId: String(row.employee_id),
        firstName: String(row.first_name ?? ''),
        lastName: String(row.last_name ?? ''),
        email: row.email ? String(row.email) : null,
        password: row.password ? String(row.password) : null,
        phone: String(row.phone ?? ''),
        dateOfBirth: String(row.date_of_birth),
        joiningDate: String(row.joining_date),
        department: row.department ? String(row.department) : null,
        unit: row.unit ? String(row.unit) : null,
        manager: row.manager ? String(row.manager) : null,
        hod: row.hod ? String(row.hod) : null,
        jobtitle: row.jobtitle ? String(row.jobtitle) : null,
        isActive: Boolean(row.is_active),
      }));
    } finally {
      await pool.end();
    }
  }
}
