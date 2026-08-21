import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService, type UserLoginProfile } from '../users/users.service';
import { CancelMembershipDto } from './dto/cancel-membership.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { Membership } from './entities/membership.entity';

export type MembershipStatus = 'pending' | 'active' | 'cancelled' | 'expired';

export interface MembershipCheckResponse {
  is_active: boolean;
  status?: MembershipStatus;
  expires_at?: string;
}

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership)
    private readonly membershipsRepository: Repository<Membership>,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  private defaultDays(): number {
    const raw = this.configService.get<string>('MEMBERSHIP_DEFAULT_DAYS', '7');
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
  }

  private defaultPrice(): number {
    const raw = this.configService.get<string>(
      'MEMBERSHIP_DEFAULT_PRICE',
      '80',
    );
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 80;
  }

  private computeExpiry(from: Date, days: number): Date {
    const expiresAt = new Date(from);
    expiresAt.setDate(expiresAt.getDate() + days);
    return expiresAt;
  }

  private isCurrentlyActive(membership: Membership, now = new Date()): boolean {
    return (
      membership.isActive &&
      membership.cancelledAt === null &&
      membership.expiresAt.getTime() > now.getTime()
    );
  }

  /** Pendiente de pago: inactiva, no cancelada y sin periodo real (inicio ≈ expira). */
  isPendingPayment(membership: Membership): boolean {
    if (
      membership.isActive ||
      membership.cancelledAt ||
      membership.paymentVerifiedAt
    ) {
      return false;
    }
    return (
      membership.expiresAt.getTime() - membership.startsAt.getTime() < 60_000
    );
  }

  membershipStatus(membership: Membership, now = new Date()): MembershipStatus {
    if (membership.cancelledAt) {
      return 'cancelled';
    }
    if (this.isCurrentlyActive(membership, now)) {
      return 'active';
    }
    if (this.isPendingPayment(membership)) {
      return 'pending';
    }
    return 'expired';
  }

  private toCheckResponse(
    membership: Membership | null,
  ): MembershipCheckResponse {
    if (!membership) {
      return { is_active: false, status: 'pending' };
    }

    const status = this.membershipStatus(membership);
    return {
      is_active: status === 'active',
      status,
      expires_at:
        status === 'active' ? membership.expiresAt.toISOString() : undefined,
    };
  }

  async checkIntegrity(
    jwtToken: string,
    profile?: UserLoginProfile,
  ): Promise<MembershipCheckResponse> {
    if (!jwtToken?.trim()) {
      throw new BadRequestException('jwt_token is required');
    }

    const user = await this.usersService.findOrCreateFromJwt(jwtToken, profile);
    await this.collapseDuplicateMemberships(user.id);
    const latest = await this.findLatestForUser(user.id);

    if (latest && this.isCurrentlyActive(latest)) {
      return this.toCheckResponse(latest);
    }

    // Cancelación manual desde el panel: no reactivar sola.
    if (latest && this.isAdminBlocked(latest)) {
      return this.toCheckResponse(latest);
    }

    // Reemplaza la fila existente (o crea una) y siempre entra activa.
    const membership = await this.activateOrReplaceForUser(user.id, latest);
    return this.toCheckResponse(membership);
  }

  private isAdminBlocked(membership: Membership): boolean {
    if (!membership.cancelledAt) {
      return false;
    }
    return membership.cancelReason !== 'duplicate_same_user';
  }

  /** Activa in-place la membresía actual o crea una sola fila activa. */
  private async activateOrReplaceForUser(
    userId: string,
    existing: Membership | null,
  ): Promise<Membership> {
    const startsAt = new Date();
    const expiresAt = this.computeExpiry(startsAt, this.defaultDays());

    if (existing && !this.isAdminBlocked(existing)) {
      existing.isActive = true;
      existing.cancelledAt = null;
      existing.cancelReason = null;
      existing.startsAt = startsAt;
      existing.expiresAt = expiresAt;
      existing.paymentVerifiedAt = null;
      existing.countsTowardRevenue = false;
      return this.membershipsRepository.save(existing);
    }

    const created = this.membershipsRepository.create({
      userId,
      isActive: true,
      price: this.defaultPrice(),
      currency: 'USD',
      startsAt,
      expiresAt,
      cancelledAt: null,
      cancelReason: null,
      paymentVerifiedAt: null,
      countsTowardRevenue: false,
    });
    return this.membershipsRepository.save(created);
  }

  async createForUser(
    userId: string,
    options: {
      days?: number;
      price?: number;
      pending?: boolean;
      countsTowardRevenue?: boolean;
    } = {},
  ): Promise<Membership> {
    await this.usersService.findOne(userId);
    await this.collapseDuplicateMemberships(userId);

    const existing = await this.findLatestForUser(userId);
    if (existing && this.isCurrentlyActive(existing)) {
      return existing;
    }

    if (existing && this.isAdminBlocked(existing)) {
      throw new BadRequestException(
        'User membership was cancelled by admin; reactivate it first',
      );
    }

    if (existing && options.pending !== true) {
      const startsAt = new Date();
      existing.isActive = true;
      existing.cancelledAt = null;
      existing.cancelReason = null;
      existing.startsAt = startsAt;
      existing.expiresAt = this.computeExpiry(
        startsAt,
        options.days ?? this.defaultDays(),
      );
      existing.price = options.price ?? existing.price ?? this.defaultPrice();
      const countsTowardRevenue = options.countsTowardRevenue ?? true;
      existing.countsTowardRevenue = countsTowardRevenue;
      existing.paymentVerifiedAt = countsTowardRevenue ? startsAt : null;
      return this.membershipsRepository.save(existing);
    }

    const startsAt = new Date();
    const pending = options.pending === true;
    const countsTowardRevenue = options.countsTowardRevenue ?? !pending;
    const expiresAt = pending
      ? startsAt
      : this.computeExpiry(startsAt, options.days ?? this.defaultDays());

    const membership = this.membershipsRepository.create({
      userId,
      isActive: !pending,
      price: options.price ?? this.defaultPrice(),
      currency: 'USD',
      startsAt,
      expiresAt,
      cancelledAt: null,
      cancelReason: null,
      paymentVerifiedAt: countsTowardRevenue ? startsAt : null,
      countsTowardRevenue,
    });

    return this.membershipsRepository.save(membership);
  }

  async create(dto: CreateMembershipDto): Promise<Membership> {
    return this.createForUser(dto.userId, {
      days: dto.days,
      price: dto.price,
    });
  }

  async update(id: string, dto: UpdateMembershipDto): Promise<Membership> {
    const membership = await this.findOne(id);

    if (dto.price !== undefined) {
      membership.price = dto.price;
      membership.countsTowardRevenue = true;
    }

    if (dto.days !== undefined) {
      membership.expiresAt = this.computeExpiry(membership.startsAt, dto.days);
    }

    return this.membershipsRepository.save(membership);
  }

  async findAll(): Promise<Membership[]> {
    return this.membershipsRepository.find({
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
  }

  async purgeCancelled(): Promise<{ deleted: number }> {
    const result = await this.membershipsRepository
      .createQueryBuilder()
      .delete()
      .from(Membership)
      .where('cancelled_at IS NOT NULL')
      .execute();
    return { deleted: result.affected ?? 0 };
  }

  async findOne(id: string): Promise<Membership> {
    const membership = await this.membershipsRepository.findOne({
      where: { id },
      relations: { user: true },
    });

    if (!membership) {
      throw new NotFoundException(`Membership ${id} not found`);
    }

    return membership;
  }

  async findLatestForUser(userId: string): Promise<Membership | null> {
    const list = await this.membershipsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!list.length) {
      return null;
    }

    const now = new Date();
    const active = list.find((membership) =>
      this.isCurrentlyActive(membership, now),
    );
    if (active) {
      return active;
    }

    const pending = list.find((membership) =>
      this.isPendingPayment(membership),
    );
    return pending ?? list[0];
  }

  /**
   * Una sola membresía por usuario.
   * Reemplaza duplicados: conserva la mejor fila y elimina el resto.
   * No cancela (cancelar puede cortar el acceso del dasher).
   */
  async collapseDuplicateMemberships(
    userId: string,
  ): Promise<Membership | null> {
    const list = await this.membershipsRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    if (!list.length) {
      return null;
    }

    const now = new Date();
    const actives = list.filter((membership) =>
      this.isCurrentlyActive(membership, now),
    );
    const adminBlocked = list.filter((membership) =>
      this.isAdminBlocked(membership),
    );

    // Si el admin canceló y no hay otra activa, conservar ese bloqueo.
    if (!actives.length && adminBlocked.length) {
      const keeper = [...adminBlocked].sort(
        (a, b) => b.cancelledAt!.getTime() - a.cancelledAt!.getTime(),
      )[0];
      const extras = list.filter((membership) => membership.id !== keeper.id);
      if (extras.length) {
        await this.membershipsRepository.remove(extras);
      }
      return keeper;
    }

    const score = (membership: Membership) => {
      const active = this.isCurrentlyActive(membership, now);
      const future =
        !this.isAdminBlocked(membership) &&
        membership.expiresAt.getTime() > now.getTime();
      return (
        Number(active) * 100 +
        Number(future) * 50 +
        Number(membership.countsTowardRevenue) * 10 +
        membership.expiresAt.getTime() / 1_000_000_000
      );
    };

    const keeper = [...list].sort((a, b) => score(b) - score(a))[0];
    const mergePool = list.filter(
      (membership) => !this.isAdminBlocked(membership),
    );
    const latestExpiry = Math.max(
      ...mergePool.map((membership) => membership.expiresAt.getTime()),
      keeper.expiresAt.getTime(),
    );

    if (!this.isAdminBlocked(keeper)) {
      const revenueSource = mergePool.find(
        (membership) => membership.countsTowardRevenue,
      );
      if (latestExpiry > keeper.expiresAt.getTime()) {
        keeper.expiresAt = new Date(latestExpiry);
      }
      if (keeper.expiresAt.getTime() > now.getTime()) {
        keeper.isActive = true;
        keeper.cancelledAt = null;
        keeper.cancelReason = null;
      }
      if (revenueSource) {
        keeper.countsTowardRevenue = true;
        keeper.price = revenueSource.price;
        keeper.paymentVerifiedAt =
          revenueSource.paymentVerifiedAt ?? keeper.paymentVerifiedAt;
      }
      await this.membershipsRepository.save(keeper);
    }

    const extras = list.filter((membership) => membership.id !== keeper.id);
    if (extras.length) {
      await this.membershipsRepository.remove(extras);
    }

    return this.findLatestForUser(userId);
  }

  async collapseAllDuplicateMemberships(): Promise<number> {
    const userIds = await this.membershipsRepository
      .createQueryBuilder('m')
      .select('DISTINCT m.user_id', 'userId')
      .getRawMany<{ userId: string }>();

    for (const row of userIds) {
      await this.collapseDuplicateMemberships(row.userId);
    }
    return userIds.length;
  }

  async cancel(id: string, dto: CancelMembershipDto = {}): Promise<Membership> {
    const membership = await this.findOne(id);

    if (!membership.isActive || membership.cancelledAt) {
      throw new BadRequestException(
        'Membership is already cancelled or inactive',
      );
    }

    membership.isActive = false;
    membership.cancelledAt = new Date();
    membership.cancelReason = dto.reason ?? 'cancelled_by_admin';

    return this.membershipsRepository.save(membership);
  }

  async reactivate(
    id: string,
    options: { days?: number; price?: number } = {},
  ): Promise<Membership> {
    const membership = await this.findOne(id);
    const current = await this.findLatestForUser(membership.userId);
    if (
      current &&
      this.isCurrentlyActive(current) &&
      current.id !== membership.id
    ) {
      return current;
    }

    const startsAt = new Date();

    membership.isActive = true;
    membership.cancelledAt = null;
    membership.cancelReason = null;
    membership.startsAt = startsAt;
    membership.expiresAt = this.computeExpiry(
      startsAt,
      options.days ?? this.defaultDays(),
    );
    membership.paymentVerifiedAt = startsAt;
    membership.countsTowardRevenue = true;

    if (options.price !== undefined) {
      membership.price = options.price;
    }

    return this.membershipsRepository.save(membership);
  }

  async verifyPayment(
    id: string,
    options: { days?: number; price?: number } = {},
  ): Promise<Membership> {
    const membership = await this.findOne(id);

    if (this.isCurrentlyActive(membership)) {
      throw new BadRequestException('Membership is already active');
    }

    if (membership.cancelledAt) {
      throw new BadRequestException(
        'Cancelled memberships must be reactivated, not payment-verified',
      );
    }

    if (!this.isPendingPayment(membership)) {
      throw new BadRequestException('Membership is not pending payment');
    }

    const startsAt = new Date();
    membership.isActive = true;
    membership.cancelledAt = null;
    membership.cancelReason = null;
    membership.paymentVerifiedAt = startsAt;
    membership.countsTowardRevenue = true;
    membership.startsAt = startsAt;
    membership.expiresAt = this.computeExpiry(
      startsAt,
      options.days ?? this.defaultDays(),
    );

    if (options.price !== undefined) {
      membership.price = options.price;
    }

    return this.membershipsRepository.save(membership);
  }
}
