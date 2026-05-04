import { Type } from 'class-transformer';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { AppRole, AppStatus } from '../suggestions.types';

class ActorDto {
  @IsString()
  name!: string;

  @IsEnum(AppRole)
  role!: AppRole;

  /** HRMS employee code — used to match assignee when names differ from stored text */
  @IsOptional()
  @IsString()
  employeeCode?: string;
}

export class UpdateSuggestionStatusDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor!: ActorDto;

  @IsEnum(AppStatus)
  status!: AppStatus;

  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;
}
