import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateSuggestionDto {
  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  employeeName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Booleans from idea form; strings primary/secondary from Kaizen sheet */
  @IsOptional()
  @IsObject()
  expectedBenefits?: Record<string, boolean | string>;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  actorName?: string;

  /** Must match upload API response; validated against JWT employee code */
  @IsOptional()
  @IsString()
  ideaAttachmentsFolder?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ideaAttachmentPaths?: string[];
}
