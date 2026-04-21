import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export type JwtAccessPayload = {
  sub: string;
  employeeCode: string;
  email: string;
  name: string;
  roles: string[];
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string } }>();
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }
    try {
      const payload = this.jwtService.verify<JwtAccessPayload>(token);
      (req as { user?: JwtAccessPayload }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
