import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TokenRolesGuard } from './guards/token-roles.guard';
import { PrismaModule } from '../../database/prisma.module';
import { SuperAdminBootstrapService } from './superadmin-bootstrap.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: (() => {
          const secret = config.get<string>('JWT_SECRET');
          if (!secret) {
            throw new Error('JWT_SECRET is required');
          }
          return secret;
        })(),
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    TokenRolesGuard,
    SuperAdminBootstrapService,
  ],
  exports: [AuthService, JwtModule, JwtAuthGuard, TokenRolesGuard],
})
export class AuthModule {}
