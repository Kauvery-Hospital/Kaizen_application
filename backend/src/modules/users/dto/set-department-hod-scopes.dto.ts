import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class SetDepartmentHodScopesDto {
  @IsString()
  @MinLength(1)
  departmentName!: string;

  @IsArray()
  @IsString({ each: true })
  unitCodes!: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  assignedBy?: string;
}
