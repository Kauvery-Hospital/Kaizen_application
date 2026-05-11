import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join, relative, resolve } from 'path';
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

  /**
   * HR reward proof photo — stored next to the Kaizen template files:
   * 1) {@link templateFolderRelative} from the suggestion (`template_attachments_folder`)
   * 2) else `kaizen/{implementer}/kaizen_template/` when {@link fallbackImplementerEmployeeCode} is set
   * 3) else `kaizen/{uploader}/hr_reward_validation/`
   */
  async saveHrRewardValidationImage(
    employeeCodeRaw: string,
    file: Express.Multer.File,
    opts?: {
      templateFolderRelative?: string | null;
      /** Implementer employee code — same layout as template uploads */
      fallbackImplementerEmployeeCode?: string | null;
    },
  ): Promise<{ relativePath: string; appendToTemplateAttachmentPaths: boolean }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }
    const mime = String(file.mimetype || '').toLowerCase();
    const okMime =
      mime === 'image/jpeg' ||
      mime === 'image/png' ||
      mime === 'image/webp' ||
      mime === 'image/gif';
    if (!okMime) {
      throw new BadRequestException(
        'Reward validation must be an image (JPEG, PNG, WebP, or GIF).',
      );
    }
    const emp = this.sanitizeEmployeeCode(employeeCodeRaw);
    const uploadRoot = this.getUploadRoot();

    const safeKaizenDir = (
      normalizedFolder: string,
    ): { folderRelative: string; absDir: string } | null => {
      if (
        !normalizedFolder ||
        normalizedFolder.includes('..') ||
        !normalizedFolder.startsWith('kaizen/')
      ) {
        return null;
      }
      const rootResolved = resolve(uploadRoot);
      const absDir = resolve(uploadRoot, ...normalizedFolder.split('/'));
      const relFromRoot = relative(rootResolved, absDir);
      if (!relFromRoot || relFromRoot.startsWith('..') || relFromRoot.includes('..')) {
        return null;
      }
      return { folderRelative: normalizedFolder, absDir };
    };

    let resolved = safeKaizenDir(
      this.toPosix(String(opts?.templateFolderRelative ?? '').trim()).replace(
        /^\/+/,
        '',
      ),
    );

    if (!resolved) {
      const fb = this.sanitizeEmployeeCode(
        opts?.fallbackImplementerEmployeeCode ?? '',
      );
      if (fb && fb !== 'unknown') {
        resolved = safeKaizenDir(this.toPosix(join('kaizen', fb, 'kaizen_template')));
      }
    }

    let appendToTemplateAttachmentPaths = false;
    let folderRelative: string;
    let absDir: string;

    if (resolved) {
      folderRelative = resolved.folderRelative;
      absDir = resolved.absDir;
      appendToTemplateAttachmentPaths = folderRelative.includes('/kaizen_template');
    } else {
      folderRelative = this.toPosix(join('kaizen', emp, 'hr_reward_validation'));
      absDir = join(uploadRoot, 'kaizen', emp, 'hr_reward_validation');
      appendToTemplateAttachmentPaths = false;
    }

    await mkdir(absDir, { recursive: true });

    const stamp = this.formatDateTimeForFileName(new Date());
    const ext =
      extname(file.originalname || '') ||
      (mime.includes('png')
        ? '.png'
        : mime.includes('webp')
          ? '.webp'
          : mime.includes('gif')
            ? '.gif'
            : '.jpg');
    const storedFileName = `hr_reward_validation_${stamp}${ext}`;
    const absPath = join(absDir, storedFileName);
    await writeFile(absPath, file.buffer);
    const relativePath = this.toPosix(join(folderRelative, storedFileName));
    return { relativePath, appendToTemplateAttachmentPaths };
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
