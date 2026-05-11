import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAccessPayload, JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh-session')
  @UseGuards(JwtAuthGuard)
  refreshSession(@Req() req: { user?: JwtAccessPayload }) {
    return this.authService.refreshSession(req.user!);
  }
}
