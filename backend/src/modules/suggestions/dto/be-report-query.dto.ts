import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const BE_REPORT_VIEWS = [
  'summary',
  'pre',
  'post',
  'employees',
  'employee-ideas',
] as const;

export type BeReportView = (typeof BE_REPORT_VIEWS)[number];

export class BeReportQueryDto {
  @IsIn(['summary', 'pre', 'post', 'employees', 'employee-ideas'])
  view!: BeReportView;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;

  @IsOptional()
  @IsString()
  q?: string;

  /** Directory / idea-list lookup key (lowercase name, or lowercase implementer code when `employeeByCode`). */
  @IsOptional()
  @IsString()
  employeeKey?: string;

  /** When true with `view=employee-ideas` and `ideaMode=implemented`, match `assigned_implementer_code` instead of name. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  employeeByCode?: boolean;

  @IsOptional()
  @IsIn(['submitted', 'implemented'])
  ideaMode?: 'submitted' | 'implemented';

  @IsOptional()
  @IsIn(['all', 'submitter', 'implementer'])
  employeeFilter?: 'all' | 'submitter' | 'implementer';

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  department?: string;
}
