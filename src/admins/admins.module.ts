import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrityModule } from '../integrity/integrity.module';
import { Membership } from '../memberships/entities/membership.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminsService } from './admins.service';
import { Admin } from './entities/admin.entity';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { JwtStrategy } from './guards/jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin, User, Membership]),
    UsersModule,
    MembershipsModule,
    IntegrityModule,
    PassportModule.register({ defaultStrategy: 'admin-jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('ADMIN_JWT_SECRET', 'change-me-admin-secret'),
        signOptions: {
          expiresIn: config.get('ADMIN_JWT_EXPIRES_IN', '12h'),
        },
      }),
    }),
  ],
  controllers: [AdminAuthController, AdminDashboardController],
  providers: [
    AdminsService,
    AdminAuthService,
    AdminDashboardService,
    JwtStrategy,
    AdminJwtAuthGuard,
  ],
  exports: [AdminsService, AdminJwtAuthGuard],
})
export class AdminsModule {}
