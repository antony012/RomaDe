import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, MoreThan, Not, Repository } from 'typeorm';
import { IntegrityService } from '../integrity/integrity.service';
import { CancelMembershipDto } from '../memberships/dto/cancel-membership.dto';
import { CreateMembershipDto } from '../memberships/dto/create-membership.dto';
import { UpdateMembershipDto } from '../memberships/dto/update-membership.dto';
import { Membership } from '../memberships/entities/membership.entity';
import { MembershipsService } from '../memberships/memberships.service';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AdminsService } from './admins.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Membership)
    private readonly membershipsRepository: Repository<Membership>,
    private readonly usersService: UsersService,
    private readonly membershipsService: MembershipsService,
    private readonly adminsService: AdminsService,
    private readonly integrityService: IntegrityService,
  ) {}

  private async sumRevenueSince(from?: Date): Promise<number> {
    const qb = this.membershipsRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.price), 0)', 'total');

    if (from) {
      qb.where('m.created_at >= :from', { from });
    }

    const raw = await qb.getRawOne<{ total: string | number }>();
    return Number(raw?.total ?? 0);
  }

  async getOverview() {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const [
      usersTotal,
      membershipsTotal,
      activeMemberships,
      cancelledMemberships,
      expiredMemberships,
      recentUsers,
      recentMemberships,
      activeSubscriptions,
      revenueLastWeek,
      revenueLastMonth,
      revenueTotal,
    ] = await Promise.all([
      this.usersRepository.count(),
      this.membershipsRepository.count(),
      this.membershipsRepository.count({
        where: {
          isActive: true,
          cancelledAt: IsNull(),
          expiresAt: MoreThan(now),
        },
      }),
      this.membershipsRepository.count({
        where: {
          cancelledAt: Not(IsNull()),
        },
      }),
      this.membershipsRepository.count({
        where: {
          isActive: true,
          expiresAt: LessThanOrEqual(now),
          cancelledAt: IsNull(),
        },
      }),
      this.usersRepository.find({
        order: { createdAt: 'DESC' },
        take: 8,
        relations: { memberships: true },
      }),
      this.membershipsRepository.find({
        order: { createdAt: 'DESC' },
        take: 8,
        relations: { user: true },
      }),
      this.membershipsRepository.find({
        where: {
          isActive: true,
          cancelledAt: IsNull(),
          expiresAt: MoreThan(now),
        },
        relations: { user: true },
        order: { expiresAt: 'ASC' },
        take: 50,
      }),
      this.sumRevenueSince(weekAgo),
      this.sumRevenueSince(monthAgo),
      this.sumRevenueSince(),
    ]);

    return {
      stats: {
        usersTotal,
        membershipsTotal,
        activeMemberships,
        cancelledMemberships,
        expiredMemberships,
      },
      earnings: {
        currency: 'USD',
        lastWeek: revenueLastWeek,
        lastMonth: revenueLastMonth,
        total: revenueTotal,
      },
      activeSubscriptions: activeSubscriptions.map((membership) =>
        this.serializeMembership(membership),
      ),
      recentUsers: recentUsers.map((user) => this.serializeUser(user)),
      recentMemberships: recentMemberships.map((membership) =>
        this.serializeMembership(membership),
      ),
    };
  }

  async listUsers() {
    const { users } = await this.integrityService.backfillUserProfiles();
    return users.map((user) => this.serializeUser(user));
  }

  async backfillUsers() {
    const result = await this.integrityService.backfillUserProfiles();
    return {
      updated: result.updated,
      total: result.total,
      stillUnknown: result.stillUnknown,
      users: result.users.map((user) => this.serializeUser(user)),
    };
  }

  async getUser(id: string) {
    const user = await this.usersService.findOne(id);
    return this.serializeUser(user, true);
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.usersService.update(id, dto);
    return this.serializeUser(user, true);
  }

  async listMemberships() {
    const memberships = await this.membershipsService.findAll();
    return memberships.map((membership) => this.serializeMembership(membership));
  }

  async getMembership(id: string) {
    const membership = await this.membershipsService.findOne(id);
    return this.serializeMembership(membership);
  }

  async createMembership(dto: CreateMembershipDto) {
    const membership = await this.membershipsService.create(dto);
    return this.serializeMembership(
      await this.membershipsService.findOne(membership.id),
    );
  }

  async updateMembership(id: string, dto: UpdateMembershipDto) {
    const membership = await this.membershipsService.update(id, dto);
    return this.serializeMembership(membership);
  }

  async cancelMembership(id: string, dto: CancelMembershipDto) {
    const membership = await this.membershipsService.cancel(id, dto);
    return this.serializeMembership(membership);
  }

  async reactivateMembership(
    id: string,
    options: { days?: number; price?: number } = {},
  ) {
    const membership = await this.membershipsService.reactivate(id, options);
    return this.serializeMembership(membership);
  }

  async verifyPayment(
    id: string,
    options: { days?: number; price?: number } = {},
  ) {
    const membership = await this.membershipsService.verifyPayment(id, options);
    return this.serializeMembership(membership);
  }

  listAdmins() {
    return this.adminsService.findAll();
  }

  listVerifications() {
    return this.integrityService.listVerifications();
  }

  listDashEvents() {
    return this.integrityService.listDashEvents();
  }

  getAdmin(id: string) {
    return this.adminsService.findOne(id);
  }

  createAdmin(dto: CreateAdminDto) {
    return this.adminsService.create(dto);
  }

  updateAdmin(id: string, dto: UpdateAdminDto) {
    return this.adminsService.update(id, dto);
  }

  removeAdmin(id: string) {
    return this.adminsService.remove(id);
  }

  private serializeUser(user: User, includeToken = false) {
    const memberships = (user.memberships ?? []).map((membership) =>
      this.serializeMembership(membership, false),
    );

    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.email ||
      (user.dasherId ? `Dasher ${user.dasherId}` : null) ||
      (user.sub ? user.sub.slice(0, 18) : null);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName,
      phone: user.phone,
      notes: user.notes,
      dasherId: user.dasherId,
      sub: user.sub,
      iss: user.iss,
      aud: user.aud,
      iat: user.iat,
      exp: user.exp,
      jti: user.jti,
      jwtPayload: user.jwtPayload,
      jwtTokenPreview: user.jwtToken
        ? `${user.jwtToken.slice(0, 24)}…${user.jwtToken.slice(-12)}`
        : null,
      jwtToken: includeToken ? user.jwtToken : undefined,
      memberships,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private serializeMembership(membership: Membership, includeUser = true) {
    const status = this.membershipsService.membershipStatus(membership);
    const isCurrentlyActive = status === 'active';
    const isPendingPayment = status === 'pending';

    return {
      id: membership.id,
      userId: membership.userId,
      status,
      isActive: membership.isActive,
      isCurrentlyActive,
      isPendingPayment,
      canVerifyPayment: isPendingPayment,
      canCancel: isCurrentlyActive,
      canReactivate: status === 'cancelled' || status === 'expired',
      price: Number(membership.price ?? 80),
      currency: membership.currency ?? 'USD',
      startsAt: isPendingPayment ? null : membership.startsAt,
      expiresAt: isPendingPayment ? null : membership.expiresAt,
      cancelledAt: membership.cancelledAt,
      cancelReason: membership.cancelReason,
      paymentVerifiedAt: membership.paymentVerifiedAt,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
      user:
        includeUser && membership.user
          ? {
              id: membership.user.id,
              email: membership.user.email,
              firstName: membership.user.firstName,
              lastName: membership.user.lastName,
              dasherId: membership.user.dasherId,
              displayName:
                [membership.user.firstName, membership.user.lastName]
                  .filter(Boolean)
                  .join(' ')
                  .trim() ||
                membership.user.email ||
                (membership.user.dasherId
                  ? `Dasher ${membership.user.dasherId}`
                  : null),
            }
          : undefined,
    };
  }
}
