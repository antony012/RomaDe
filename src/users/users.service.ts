import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  claimAsNumber,
  claimAsString,
  decodeJwt,
  stripJwtBearer,
  type DecodedJwt,
} from '../common/utils/jwt.util';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

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
  async findOrCreateFromJwt(jwtToken: string): Promise<User> {
    const cleaned = stripJwtBearer(jwtToken);
    const byToken = await this.findByJwtToken(cleaned);
    if (byToken) {
      return byToken;
    }

    try {
      const decoded = decodeJwt(cleaned);
      const sub = claimAsString(decoded.payload, 'sub');
      if (sub) {
        const bySub = await this.usersRepository.findOne({
          where: { sub },
          relations: { memberships: true },
        });
        if (bySub) {
          return this.usersRepository.save(
            this.applyJwtFields(bySub, cleaned, decoded),
          );
        }
      }
      return this.usersRepository.save(
        this.usersRepository.create(this.applyJwtFields({}, cleaned, decoded)),
      );
    } catch {
      return this.usersRepository.save(
        this.usersRepository.create({
          jwtToken: cleaned,
          jwtHeader: null,
          jwtPayload: null,
          jwtSignature: null,
        }),
      );
    }
  }

  async createFromJwt(jwtToken: string): Promise<User> {
    return this.findOrCreateFromJwt(jwtToken);
  }

  private applyJwtFields(
    user: Partial<User>,
    cleaned: string,
    decoded: DecodedJwt,
  ): Partial<User> {
    const { payload, header, signature, rawToken } = decoded;
    const audValue = payload.aud;
    const aud =
      typeof audValue === 'string'
        ? audValue
        : Array.isArray(audValue)
          ? audValue.map(String).join(',')
          : claimAsString(payload, 'aud');

    user.jwtToken = rawToken || cleaned;
    user.jwtHeader = header;
    user.jwtPayload = payload;
    user.jwtSignature = signature || null;
    user.sub = claimAsString(payload, 'sub');
    user.email =
      claimAsString(payload, 'email') ??
      claimAsString(payload, 'user_email') ??
      claimAsString(payload, 'preferred_username');
    user.iss = claimAsString(payload, 'iss');
    user.aud = aud;
    user.iat = claimAsNumber(payload, 'iat')?.toString() ?? null;
    user.exp = claimAsNumber(payload, 'exp')?.toString() ?? null;
    user.jti = claimAsString(payload, 'jti');
    user.firstName =
      claimAsString(payload, 'given_name') ??
      claimAsString(payload, 'first_name') ??
      claimAsString(payload, 'firstName');
    user.lastName =
      claimAsString(payload, 'family_name') ??
      claimAsString(payload, 'last_name') ??
      claimAsString(payload, 'lastName');
    user.phone =
      claimAsString(payload, 'phone_number') ??
      claimAsString(payload, 'phone');
    return user;
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
