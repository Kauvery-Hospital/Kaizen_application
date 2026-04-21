import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { employeeCode: dto.employeeCode },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid employee ID or password');
    }

    if (!user.password) {
      throw new UnauthorizedException('Invalid employee ID or password');
    }

    const passwordOk = user.password.startsWith('$2')
      ? await bcrypt.compare(dto.password, user.password)
      : user.password === dto.password;

    if (!passwordOk) {
      throw new UnauthorizedException('Invalid employee ID or password');
    }

    const roles = user.roles.map((mapping) => String(mapping.role.code));

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      employeeCode: user.employeeCode,
      email: user.email,
      name: user.name,
      roles,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        email: user.email,
        name: user.name,
        roles,
      },
    };
  }
}
