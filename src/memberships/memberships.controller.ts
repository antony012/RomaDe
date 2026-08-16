import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CancelMembershipDto } from './dto/cancel-membership.dto';
import { CheckMembershipDto } from './dto/check-membership.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
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

  @Get('api/v1/memberships')
  findAll() {
    return this.membershipsService.findAll();
  }

  @Get('api/v1/memberships/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.membershipsService.findOne(id);
  }

  @Post('api/v1/memberships')
  create(@Body() dto: CreateMembershipDto) {
    return this.membershipsService.create(dto);
  }

  @Patch('api/v1/memberships/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.membershipsService.update(id, dto);
  }

  @Patch('api/v1/memberships/:id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelMembershipDto,
  ) {
    return this.membershipsService.cancel(id, dto);
  }

  @Patch('api/v1/memberships/:id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('days') days?: string,
    @Query('price') price?: string,
  ) {
    const parsedDays = days ? Number(days) : undefined;
    const parsedPrice = price ? Number(price) : undefined;
    return this.membershipsService.reactivate(id, {
      days: Number.isFinite(parsedDays) ? parsedDays : undefined,
      price: Number.isFinite(parsedPrice) ? parsedPrice : undefined,
    });
  }
}
