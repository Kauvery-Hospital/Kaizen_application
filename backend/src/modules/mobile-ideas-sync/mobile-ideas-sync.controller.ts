import { BadRequestException, Controller, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { RequireTokenRoles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TokenRolesGuard } from '../auth/guards/token-roles.guard';
import { MobileIdeasSyncService } from './mobile-ideas-sync.service';

@Controller('mobile-ideas-sync')
@UseGuards(JwtAuthGuard, TokenRolesGuard)
export class MobileIdeasSyncController {
  private readonly logger = new Logger(MobileIdeasSyncController.name);
  constructor(private readonly sync: MobileIdeasSyncService) {}

  @Post('run-now')
  @RequireTokenRoles('ADMIN', 'SUPER_ADMIN')
  async runNow(@Query('take') take?: string) {
    try {
      const n = take ? Number(take) : undefined;
      return await this.sync.runNow({
        take: Number.isFinite(n as any) ? (n as number) : undefined,
      });
    } catch (e) {
      const err = e as Error;
      this.logger.error(`Manual mobile sync failed: ${err.message}`, err.stack);
      throw new BadRequestException(err.message || 'Mobile sync failed');
    }
  }
}

