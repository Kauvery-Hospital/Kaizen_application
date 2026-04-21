import { IsOptional, IsString } from 'class-validator';

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
