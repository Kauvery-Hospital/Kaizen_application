import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type { ReportId } from '../reports.types';

export class ReportsQueryDto {
  @IsIn([
    'overallRegister',
    'receivedSummary',
    'receivedByUnit',
    'receivedByDepartment',
    'receivedByServiceCategory',
    'acceptedBySelectionCommittee',
    'acceptedTop10Group',
    'acceptedTop10Unit',
    'acceptedByUnit',
    'acceptedByDepartment',
    'acceptedByServiceCategory',
    'notAcceptedBySelectionCommittee',
    'notAcceptedByUnit',
    'notAcceptedByDepartment',
    'notAcceptedByServiceCategory',
    'assignmentStatus',
    'waitingForAssignment',
    'approvalStatus',
    'approvalStatusByRole',
    'implementationStatus',
    'implementationStatusOverallAndUnit',
    'implementationStatusByServiceCategory',
    'implementationStatusByDepartment',
    'kpiCounts',
  ])
  report!: ReportId;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  from?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  to?: string; // YYYY-MM-DD

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  includeDetails?: boolean;
}

