import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  claimAsNumber,
  decodeJwt,
  pickClaim,
  stripJwtBearer,
  type DecodedJwt,
} from '../common/utils/jwt.util';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

export type UserLoginProfile = {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  dasherId?: string;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      order: { createdAt: 'DESC' },
      relations: { memberships: true },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: { memberships: true },
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return user;
  }

  async findByJwtToken(jwtToken: string): Promise<User | null> {
    const cleaned = stripJwtBearer(jwtToken);
    if (!cleaned) {
      return null;
    }
    return this.usersRepository.findOne({
      where: { jwtToken: cleaned },
      relations: { memberships: true },
    });
  }

  /** Misma identidad que TokenClaimer: JWT actual, o el mismo `sub` si el token se renovó. */
  async findOrCreateFromJwt(
    jwtToken: string,
    profile?: UserLoginProfile,
  ): Promise<User> {
    const cleaned = stripJwtBearer(jwtToken);
    let user = await this.findByJwtToken(cleaned);
    let decoded: DecodedJwt | null = null;

    try {
      decoded = decodeJwt(cleaned);
    } catch {
      decoded = null;
    }

    if (!user && decoded) {
      const sub = pickClaim(decoded.payload, ['sub']);
      if (sub) {
        user = await this.usersRepository.findOne({
          where: { sub },
          relations: { memberships: true },
        });
      }
    }

    if (!user) {
      user = this.usersRepository.create({
        jwtToken: cleaned,
        jwtHeader: null,
        jwtPayload: null,
        jwtSignature: null,
      });
    }

    if (decoded) {
      this.applyJwtFields(user, cleaned, decoded);
    } else {
      user.jwtToken = cleaned;
    }

    this.applyLoginProfile(user, profile);
    return this.usersRepository.save(user);
  }

  async createFromJwt(jwtToken: string): Promise<User> {
    return this.findOrCreateFromJwt(jwtToken);
  }

  applyLoginProfile(user: User, profile?: UserLoginProfile): User {
    if (!profile) {
      return user;
    }
    const next = (value?: string) => value?.trim() || undefined;
    const email = next(profile.email);
    const firstName = next(profile.firstName);
    const lastName = next(profile.lastName);
    const phone = next(profile.phone);
    const dasherId = next(profile.dasherId);
    if (email) user.email = email;
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (dasherId) user.dasherId = dasherId;
    return user;
  }

  private applyJwtFields(
    user: User,
    cleaned: string,
    decoded: DecodedJwt,
  ): User {
    const { payload, header, signature, rawToken } = decoded;
    const audValue = payload.aud;
    const aud =
      typeof audValue === 'string'
        ? audValue
        : Array.isArray(audValue)
          ? audValue.map(String).join(',')
          : pickClaim(payload, ['aud']);

    user.jwtToken = rawToken || cleaned;
    user.jwtHeader = header;
    user.jwtPayload = payload;
    user.jwtSignature = signature || null;
    user.sub = pickClaim(payload, ['sub']);
    user.iss = pickClaim(payload, ['iss']);
    user.aud = aud;
    user.iat = claimAsNumber(payload, 'iat')?.toString() ?? user.iat;
    user.exp = claimAsNumber(payload, 'exp')?.toString() ?? user.exp;
    user.jti = pickClaim(payload, ['jti']);

    const email = pickClaim(payload, [
      'email',
      'user_email',
      'preferred_username',
    ]);
    const firstName = pickClaim(payload, [
      'given_name',
      'first_name',
      'firstName',
    ]);
    const lastName = pickClaim(payload, [
      'family_name',
      'last_name',
      'lastName',
    ]);
    const fullName = pickClaim(payload, ['name', 'full_name', 'fullName']);
    const phone = pickClaim(payload, ['phone_number', 'phone']);
    const dasherId = pickClaim(payload, ['dasher_id', 'dasherId']);

    if (email) user.email = email;
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (!user.firstName && fullName) {
      const [head, ...rest] = fullName.split(/\s+/);
      user.firstName = head ?? null;
      if (!user.lastName && rest.length) {
        user.lastName = rest.join(' ');
      }
    }
    if (phone) user.phone = phone;
    if (dasherId) user.dasherId = dasherId;
    return user;
  }

  hydrateFromStoredJwt(user: User): User {
    if (user.jwtPayload && typeof user.jwtPayload === 'object') {
      return this.applyJwtFields(user, user.jwtToken, {
        header: user.jwtHeader ?? {},
        payload: user.jwtPayload,
        signature: user.jwtSignature ?? '',
        rawToken: user.jwtToken,
      });
    }
    if (!user.jwtToken) {
      return user;
    }
    try {
      return this.applyJwtFields(
        user,
        user.jwtToken,
        decodeJwt(user.jwtToken),
      );
    } catch {
      return user;
    }
  }

  save(user: User): Promise<User> {
    return this.usersRepository.save(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.notes !== undefined) user.notes = dto.notes;
    if (dto.email !== undefined) user.email = dto.email;

    return this.usersRepository.save(user);
  }
}
