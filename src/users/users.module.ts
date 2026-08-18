import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Membership } from '../memberships/entities/membership.entity';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Membership])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
