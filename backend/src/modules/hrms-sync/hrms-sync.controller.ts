import { Controller, Post, UseGuards } from '@nestjs/common';
import { RequireTokenRoles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TokenRolesGuard } from '../auth/guards/token-roles.guard';
import { HrmsSyncService } from './hrms-sync.service';

@Controller('hrms-sync')
@UseGuards(JwtAuthGuard, TokenRolesGuard)
export class HrmsSyncController {
  constructor(private readonly hrmsSyncService: HrmsSyncService) {}

  @Post('run-now')
  @RequireTokenRoles('ADMIN', 'SUPER_ADMIN')
  runNow() {
    return this.hrmsSyncService.runNow();
  }
}
