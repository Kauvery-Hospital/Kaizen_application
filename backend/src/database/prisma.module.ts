import { Global, Module } from '@nestjs/common';
import { CodeSequenceService } from './code-sequence.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, CodeSequenceService],
  exports: [PrismaService, CodeSequenceService],
})
export class PrismaModule {}
