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

    if (!latest) {
      const membership = await this.createForUser(user.id, {
        days: this.defaultDays(),
        pending: true,
      });
      return this.toCheckResponse(membership);
    }

    if (this.isPendingPayment(latest)) {
      return this.toCheckResponse(latest);
    }

    if (!this.isCurrentlyActive(latest)) {
      if (latest.isActive) {
        latest.isActive = false;
        await this.membershipsRepository.save(latest);
      }
      return this.toCheckResponse(latest);
    }

    return this.toCheckResponse(latest);
  }

  async createForUser(
    userId: string,
    options: { days?: number; price?: number; pending?: boolean } = {},
  ): Promise<Membership> {
    await this.usersService.findOne(userId);
    await this.collapseDuplicateMemberships(userId);

    const existing = await this.findLatestForUser(userId);
    if (existing && this.isCurrentlyActive(existing)) {
      return existing;
    }

    const startsAt = new Date();
    const pending = options.pending === true;
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
      paymentVerifiedAt: pending ? null : startsAt,
      countsTowardRevenue: !pending,
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
   * Restaura cancelaciones automáticas antiguas.
   * Una reconciliación de identidad nunca debe cancelar ni acortar membresías.
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
    const recoverable = list.filter(
      (membership) =>
        membership.cancelReason === 'duplicate_same_user' &&
        membership.expiresAt.getTime() > now.getTime() &&
        (!membership.isActive || membership.cancelledAt !== null),
    );

    for (const membership of recoverable) {
      membership.isActive = true;
      membership.cancelledAt = null;
      // Conserva la marca interna para no volver a sumar un cobro duplicado.
    }

    if (recoverable.length) {
      await this.membershipsRepository.save(recoverable);
    }

    return this.findLatestForUser(userId);
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
