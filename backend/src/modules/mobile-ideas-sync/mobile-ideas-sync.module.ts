import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../database/prisma.module';
import { MobileIdeasSyncController } from './mobile-ideas-sync.controller';
import { MobileIdeasSyncService } from './mobile-ideas-sync.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MobileIdeasSyncController],
  providers: [MobileIdeasSyncService],
  exports: [MobileIdeasSyncService],
})
export class MobileIdeasSyncModule {}

