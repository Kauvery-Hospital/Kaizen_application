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
