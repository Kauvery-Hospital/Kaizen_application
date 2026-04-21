import { SetMetadata } from '@nestjs/common';

export const REQUIRED_TOKEN_ROLES_KEY = 'requiredTokenRoles';
export const RequireTokenRoles = (...roles: string[]) =>
  SetMetadata(REQUIRED_TOKEN_ROLES_KEY, roles);
