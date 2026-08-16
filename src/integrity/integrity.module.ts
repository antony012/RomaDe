import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipsModule } from '../memberships/memberships.module';
import { UsersModule } from '../users/users.module';
import { DashEvent } from './entities/dash-event.entity';
import { IntegritySession } from './entities/integrity-session.entity';
import { RemoteVerifyRequest } from './entities/remote-verify-request.entity';
import { IntegrityController } from './integrity.controller';
import { IntegrityService } from './integrity.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IntegritySession,
      RemoteVerifyRequest,
      DashEvent,
    ]),
    UsersModule,
    MembershipsModule,
  ],
  controllers: [IntegrityController],
  providers: [IntegrityService],
  exports: [IntegrityService],
})
export class IntegrityModule {}
