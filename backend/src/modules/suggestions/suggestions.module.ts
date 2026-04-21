import { Module } from '@nestjs/common';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';
import { PptxExportService } from './pptx-export.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService, PptxExportService],
  exports: [SuggestionsService],
})
export class SuggestionsModule {}
