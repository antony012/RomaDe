import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CancelMembershipDto } from '../memberships/dto/cancel-membership.dto';
import { CreateMembershipDto } from '../memberships/dto/create-membership.dto';
import { UpdateMembershipDto } from '../memberships/dto/update-membership.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { AdminDashboardService } from './admin-dashboard.service';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import type { AuthAdmin } from './decorators/current-admin.decorator';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';

@Controller('api/v1/admin')
@UseGuards(AdminJwtAuthGuard)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('me')
  me(@CurrentAdmin() admin: AuthAdmin) {
    return admin;
  }

  /** Home / inicio del dashboard */
  @Get('home')
  getHome() {
    return this.dashboardService.getOverview();
  }

  @Get('dashboard')
  getOverview() {
    return this.dashboardService.getOverview();
  }

  @Get('users')
  listUsers() {
    return this.dashboardService.listUsers();
  }

  @Post('users/backfill')
  backfillUsers() {
    return this.dashboardService.backfillUsers();
  }

  @Get('users/:id')
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.dashboardService.getUser(id);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.dashboardService.updateUser(id, dto);
  }

  @Get('memberships')
  listMemberships() {
    return this.dashboardService.listMemberships();
  }

  @Get('memberships/:id')
  getMembership(@Param('id', ParseUUIDPipe) id: string) {
    return this.dashboardService.getMembership(id);
  }

  @Post('memberships')
  createMembership(@Body() dto: CreateMembershipDto) {
    return this.dashboardService.createMembership(dto);
  }

  @Patch('memberships/:id')
  updateMembership(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.dashboardService.updateMembership(id, dto);
  }

  @Patch('memberships/:id/cancel')
  cancelMembership(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelMembershipDto,
  ) {
    return this.dashboardService.cancelMembership(id, dto);
  }

  @Patch('memberships/:id/reactivate')
  reactivateMembership(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('days') days?: string,
    @Query('price') price?: string,
  ) {
    const parsedDays = days ? Number(days) : undefined;
    const parsedPrice = price ? Number(price) : undefined;
    return this.dashboardService.reactivateMembership(id, {
      days: Number.isFinite(parsedDays) ? parsedDays : undefined,
      price: Number.isFinite(parsedPrice) ? parsedPrice : undefined,
    });
  }

  @Get('verifications')
  listVerifications() {
    return this.dashboardService.listVerifications();
  }

  @Get('dash-events')
  listDashEvents() {
    return this.dashboardService.listDashEvents();
  }

  @Get('admins')
  listAdmins() {
    return this.dashboardService.listAdmins();
  }

  @Get('admins/:id')
  getAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.dashboardService.getAdmin(id);
  }

  @Post('admins')
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.dashboardService.createAdmin(dto);
  }

  @Patch('admins/:id')
  updateAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.dashboardService.updateAdmin(id, dto);
  }

  @Delete('admins/:id')
  removeAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.dashboardService.removeAdmin(id);
  }
}
