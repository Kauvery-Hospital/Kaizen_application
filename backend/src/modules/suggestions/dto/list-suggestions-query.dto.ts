import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AppRole } from '../suggestions.types';

export class ListSuggestionsQueryDto {
  @IsOptional()
  @IsEnum(AppRole)
  role?: AppRole;

  @IsOptional()
  @IsString()
  currentUserName?: string;
}
