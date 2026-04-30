import { IsOptional, IsString } from 'class-validator';

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  department?: string;

  /**
   * When true, include unit-scoped role assignments (unit scopes) for each user.
   * Used by Super Admin "Role List" view.
   */
  @IsOptional()
  @IsString()
  includeUnitScopes?: string;
}
