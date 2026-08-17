import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { CancelMembershipDto } from './dto/cancel-membership.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { Membership } from './entities/membership.entity';

export interface MembershipCheckResponse {
  is_active: boolean;
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
    const raw = this.configService.get<string>('MEMBERSHIP_DEFAULT_PRICE', '80');
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

  private toCheckResponse(membership: Membership | null): MembershipCheckResponse {
    if (!membership) {
      return { is_active: false };
    }

    const active = this.isCurrentlyActive(membership);
    return {
      is_active: active,
      expires_at: membership.expiresAt.toISOString(),
    };
  }

  async checkIntegrity(jwtToken: string): Promise<MembershipCheckResponse> {
    if (!jwtToken?.trim()) {
      throw new BadRequestException('jwt_token is required');
    }

    const user = await this.usersService.findOrCreateFromJwt(jwtToken);

    const latest = await this.findLatestForUser(user.id);

    if (!latest) {
      const membership = await this.createForUser(user.id, {
        days: this.defaultDays(),
      });
      return this.toCheckResponse(membership);
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
    options: { days?: number; price?: number } = {},
  ): Promise<Membership> {
    await this.usersService.findOne(userId);

    const startsAt = new Date();
    const expiresAt = this.computeExpiry(
      startsAt,
      options.days ?? this.defaultDays(),
    );

    const membership = this.membershipsRepository.create({
      userId,
      isActive: true,
      price: options.price ?? this.defaultPrice(),
      currency: 'USD',
      startsAt,
      expiresAt,
      cancelledAt: null,
      cancelReason: null,
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
    }

    if (dto.days !== undefined) {
      membership.expiresAt = this.computeExpiry(
        membership.startsAt,
        dto.days,
      );
    }

    return this.membershipsRepository.save(membership);
  }

  async findAll(): Promise<Membership[]> {
    return this.membershipsRepository.find({
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
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
    return this.membershipsRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async cancel(id: string, dto: CancelMembershipDto = {}): Promise<Membership> {
    const membership = await this.findOne(id);

    if (!membership.isActive || membership.cancelledAt) {
      throw new BadRequestException('Membership is already cancelled or inactive');
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
    const startsAt = new Date();

    membership.isActive = true;
    membership.cancelledAt = null;
    membership.cancelReason = null;
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
