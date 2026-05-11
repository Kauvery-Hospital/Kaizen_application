import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';

@Controller('hrms')
@UseGuards(JwtAuthGuard)
export class HrmsMasterdataController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('units')
  async listUnits(@Query('q') q?: string) {
    const query = q?.trim();
    const rows = await (this.prisma as any).hrmsUnit.findMany({
      where: query
        ? {
            OR: [
              { code: { contains: query, mode: 'insensitive' } },
              { name: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, name: true },
      take: 500,
    });
    return rows;
  }

  @Get('departments')
  async listDepartments(@Query('q') q?: string) {
    const query = q?.trim();
    const rows = await (this.prisma as any).hrmsDepartment.findMany({
      where: query
        ? { name: { contains: query, mode: 'insensitive' } }
        : undefined,
      orderBy: [{ name: 'asc' }],
      select: { id: true, name: true },
      take: 3000,
    });
    return rows;
  }

  /**
   * Full department catalog for UC Level 1: all rows in `hrms_departments` plus any distinct
   * `hrms_employees.department` values at the given unit (covers units not fully synced to master).
   */
  @Get('departments-for-unit')
  async listDepartmentsForUnit(@Query('unitCode') unitCodeRaw?: string) {
    const unitCode = String(unitCodeRaw ?? '').trim();
    const byKey = new Map<string, { id: string; name: string }>();

    const master = await (this.prisma as any).hrmsDepartment.findMany({
      orderBy: [{ name: 'asc' }],
      select: { id: true, name: true },
      take: 5000,
    });
    for (const d of master) {
      const name = String(d.name ?? '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, { id: String(d.id), name });
    }

    if (unitCode) {
      const extra = await this.prisma.$queryRaw<{ name: string }[]>(Prisma.sql`
        SELECT DISTINCT TRIM(department::text) AS name
        FROM hrms_employees
        WHERE is_active = true
          AND unit IS NOT NULL
          AND TRIM(unit::text) <> ''
          AND LOWER(TRIM(unit::text)) = LOWER(${unitCode})
          AND department IS NOT NULL
          AND TRIM(department::text) <> ''
      `);
      let i = 0;
      for (const row of extra) {
        const name = String(row.name ?? '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (byKey.has(key)) continue;
        byKey.set(key, { id: `emp-dept-${i++}-${key.slice(0, 24)}`, name });
      }
    }

    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
