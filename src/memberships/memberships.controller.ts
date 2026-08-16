import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CheckMembershipDto } from './dto/check-membership.dto';
import { MembershipsService } from './memberships.service';

@Controller()
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post('api/v1/integrity/membership')
  @HttpCode(200)
  checkIntegrity(@Body() dto: CheckMembershipDto) {
    return this.membershipsService.checkIntegrity(dto.jwt_token);
  }

  @Post('api/memberships')
  @HttpCode(200)
  checkForApk(@Body() dto: CheckMembershipDto) {
    return this.membershipsService.checkIntegrity(dto.jwt_token);
  }
}
