import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import type { Express } from 'express';
import { PrismaService } from '../../database/prisma.service';

export type SavedKaizenFiles = {
  /** Relative to upload root, POSIX slashes */
  folderRelative: string;
  /** Full relative paths including folder + filename */
  filePaths: string[];
  files: {
    storedFileName: string;
    relativePath: string;
    originalName: string;
  }[];
};

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  getUploadRoot(): string {
    return this.config.get<string>('uploadRoot')!;
  }

  sanitizeEmployeeCode(raw: string | undefined): string {
    const s = (raw ?? 'unknown').trim();
    const safe = s.replace(/[^a-zA-Z0-9_-]/g, '');
    return safe.length > 0 ? safe : 'unknown';
  }

  private formatDateTimeForFileName(d: Date): string {
    const p = (n: number, len = 2) => String(n).padStart(len, '0');
    return (
      `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
      `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`
    );
  }

  private toPosix(rel: string): string {
    return rel.split(/[/\\]+/).join('/');
  }

  /**
   * Saves under: {uploadRoot}/kaizen/{employeeCode}/kaizen_idea/
   * Filenames: {employeeCode}_{yyyyMMddHHmmssSSS}_{index}{ext}
   */
  async saveIdeaAttachments(
    employeeCode: string,
    files: Express.Multer.File[],
  ): Promise<SavedKaizenFiles> {
    return this.saveUnderKaizenSubfolder(employeeCode, 'kaizen_idea', files);
  }

  /**
   * Saves under: {uploadRoot}/kaizen/{employeeCode}/kaizen_template/
   */
  async saveTemplateAttachments(
    employeeCode: string,
    files: Express.Multer.File[],
    fileNamePrefixRaw?: string,
  ): Promise<SavedKaizenFiles> {
    return this.saveUnderKaizenSubfolder(
      employeeCode,
      'kaizen_template',
      files,
      fileNamePrefixRaw,
    );
  }

  private async saveUnderKaizenSubfolder(
    employeeCodeRaw: string,
    subfolder: 'kaizen_idea' | 'kaizen_template',
    files: Express.Multer.File[],
    fileNamePrefixRaw?: string,
  ): Promise<SavedKaizenFiles> {
    if (!files?.length) {
      throw new BadRequestException('No files uploaded');
    }
    const emp = this.sanitizeEmployeeCode(employeeCodeRaw);
    const filePrefix =
      fileNamePrefixRaw !== undefined
        ? this.sanitizeEmployeeCode(fileNamePrefixRaw).slice(0, 30)
        : emp;
    const uploadRoot = this.getUploadRoot();
    const folderRelative = this.toPosix(join('kaizen', emp, subfolder));
    const absDir = join(uploadRoot, 'kaizen', emp, subfolder);
    await mkdir(absDir, { recursive: true });

    const stamp = this.formatDateTimeForFileName(new Date());
    const filePaths: string[] = [];
    const meta: SavedKaizenFiles['files'] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = extname(file.originalname || '') || '.bin';
      const storedFileName = `${filePrefix}_${stamp}_${i + 1}${ext}`;
      const absPath = join(absDir, storedFileName);
      await writeFile(absPath, file.buffer);
      const relativePath = this.toPosix(join(folderRelative, storedFileName));
      filePaths.push(relativePath);
      meta.push({
        storedFileName,
        relativePath,
        originalName: file.originalname || storedFileName,
      });
    }

    return { folderRelative, filePaths, files: meta };
  }

  async deleteKaizenFile(employeeCodeRaw: string, relativePathRaw: string) {
    const emp = this.sanitizeEmployeeCode(employeeCodeRaw);
    const rel = this.toPosix(relativePathRaw || '').trim();
    if (!rel) throw new BadRequestException('path is required');
    if (rel.includes('..')) throw new BadRequestException('Invalid path');
    if (!rel.startsWith(`kaizen/${emp}/`)) {
      throw new BadRequestException('File must be inside your kaizen folder');
    }
    const uploadRoot = this.getUploadRoot();
    const absPath = join(uploadRoot, ...rel.split('/'));
    try {
      await unlink(absPath);
      return { deleted: true };
    } catch (e: any) {
      // If already missing, treat as deleted (idempotent)
      if (e?.code === 'ENOENT') return { deleted: true };
      throw e;
    }
  }

  async attachTemplateToSuggestion(
    suggestionId: string,
    saved: SavedKaizenFiles,
  ): Promise<void> {
    const suggestion = await this.prisma.suggestion.findUnique({
      where: { id: suggestionId },
    });
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }
    await this.prisma.suggestion.update({
      where: { id: suggestionId },
      data: {
        templateAttachmentsFolder: saved.folderRelative,
        templateAttachmentPaths: saved.filePaths,
      },
    });
  }
}
