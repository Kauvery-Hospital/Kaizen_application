import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => trimStr(value))
  @IsString()
  @MinLength(1, { message: 'Employee ID is required' })
  employeeCode!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;
}
