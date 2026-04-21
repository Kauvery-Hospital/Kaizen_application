import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
      take: 500,
    });
    return rows;
  }
}

