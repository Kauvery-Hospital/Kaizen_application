import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_TOKEN_ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtAccessPayload } from './jwt-auth.guard';

@Injectable()
export class TokenRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_TOKEN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ user?: JwtAccessPayload }>();
    const tokenRoles = req.user?.roles ?? [];
    const hasRole = required.some((r: string) => tokenRoles.includes(r));
    if (!hasRole) {
      throw new ForbiddenException('Insufficient role permissions');
    }
    return true;
  }
}
