import {
  BadRequestException,
  Controller,
  Delete,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  JwtAuthGuard,
  type JwtAccessPayload,
} from '../auth/guards/jwt-auth.guard';
import { AttachmentsService } from './attachments.service';

const MAX_FILES = 20;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('kaizen-idea')
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
    }),
  )
  async uploadIdeaFiles(
    @Req() req: { user: JwtAccessPayload },
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const list = files ?? [];
    if (!list.length) {
      throw new BadRequestException('Attach at least one file');
    }
    const employeeCode = req.user.employeeCode;
    if (!employeeCode) {
      throw new BadRequestException('Employee code missing from token');
    }
    const saved = await this.attachmentsService.saveIdeaAttachments(
      employeeCode,
      list,
    );
    return {
      folderPath: saved.folderRelative,
      filePaths: saved.filePaths,
      files: saved.files,
    };
  }

  @Post('kaizen-template')
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
    }),
  )
  async uploadTemplateFiles(
    @Req() req: { user: JwtAccessPayload },
    @Query('suggestionId') suggestionId: string | undefined,
    @Query('prefix') prefix: string | undefined,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const list = files ?? [];
    if (!list.length) {
      throw new BadRequestException('Attach at least one file');
    }
    const employeeCode = req.user.employeeCode;
    if (!employeeCode) {
      throw new BadRequestException('Employee code missing from token');
    }
    const saved = await this.attachmentsService.saveTemplateAttachments(
      employeeCode,
      list,
      prefix,
    );
    if (suggestionId) {
      await this.attachmentsService.attachTemplateToSuggestion(
        suggestionId,
        saved,
      );
    }
    return {
      folderPath: saved.folderRelative,
      filePaths: saved.filePaths,
      files: saved.files,
      suggestionUpdated: Boolean(suggestionId),
    };
  }

  @Delete('kaizen-file')
  async deleteKaizenFile(
    @Req() req: { user: JwtAccessPayload },
    @Query('path') path: string | undefined,
  ) {
    const employeeCode = req.user.employeeCode;
    if (!employeeCode) {
      throw new BadRequestException('Employee code missing from token');
    }
    if (!path) {
      throw new BadRequestException('path is required');
    }
    return this.attachmentsService.deleteKaizenFile(employeeCode, path);
  }
}
