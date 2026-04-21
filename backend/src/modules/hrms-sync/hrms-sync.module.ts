import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HrmsMasterdataController } from './hrms-masterdata.controller';
import { HrmsSyncController } from './hrms-sync.controller';
import { HrmsSyncService } from './hrms-sync.service';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HrmsSyncController, HrmsMasterdataController],
  providers: [HrmsSyncService],
  exports: [HrmsSyncService],
})
export class HrmsSyncModule {}
