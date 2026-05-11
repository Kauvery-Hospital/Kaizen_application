import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

function parseQueryInt(
  value: unknown,
  fallback: number,
  opts?: { min?: number; max?: number },
): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = parseInt(String(value), 10);
  if (Number.isNaN(n)) return fallback;
  let x = n;
  if (opts?.min !== undefined) x = Math.max(opts.min, x);
  if (opts?.max !== undefined) x = Math.min(opts.max, x);
  return x;
}

export class ListUsersQueryDto {
  /** Pagination — always coerced so ValidationPipe whitelist accepts query keys. */
  @Transform(({ value }) => parseQueryInt(value, 0, { min: 0 }))
  @IsInt()
  @Min(0)
  skip!: number;

  @Transform(({ value }) => parseQueryInt(value, 50, { min: 1, max: 200 }))
  @IsInt()
  @Min(1)
  @Max(200)
  take!: number;

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

  /** Role code (e.g. EMPLOYEE, UNIT_COORDINATOR). Users who have this role. */
  @IsOptional()
  @IsString()
  role?: string;

  /** Filter by active flag */
  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: string;
}
