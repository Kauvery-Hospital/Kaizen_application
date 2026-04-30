import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleCode } from '@prisma/client';

export class SetUnitScopesDto {
  @IsEnum(RoleCode)
  roleCode!: RoleCode;

  @IsArray()
  @IsString({ each: true })
  unitCodes!: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  assignedBy?: string;
}

