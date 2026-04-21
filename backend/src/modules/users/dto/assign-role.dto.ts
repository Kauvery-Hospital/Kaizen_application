import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleCode } from '@prisma/client';

export class AssignRoleDto {
  @IsEnum(RoleCode)
  roleCode!: RoleCode;

  @IsOptional()
  @IsString()
  @MinLength(1)
  assignedBy?: string;
}
