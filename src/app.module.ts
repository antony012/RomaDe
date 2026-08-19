import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminsModule } from './admins/admins.module';
import { HealthController } from './health.controller';
import { typeormOptions } from './config/database';
import { DatabaseSecurityService } from './config/database-security.service';
import { IntegrityModule } from './integrity/integrity.module';
import { MembershipsModule } from './memberships/memberships.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: typeormOptions,
    }),
    UsersModule,
    MembershipsModule,
    IntegrityModule,
    AdminsModule,
  ],
  controllers: [HealthController],
  providers: [DatabaseSecurityService],
})
export class AppModule {}
