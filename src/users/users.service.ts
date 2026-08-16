import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  claimAsNumber,
  claimAsString,
  decodeJwt,
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
    const cleaned = jwtToken.replace(/^Bearer\s+/i, '').trim();
    return this.usersRepository.findOne({
      where: { jwtToken: cleaned },
      relations: { memberships: true },
    });
  }

  async createFromJwt(jwtToken: string): Promise<User> {
    const decoded = decodeJwt(jwtToken);
    const { payload, header, signature, rawToken } = decoded;

    const audValue = payload.aud;
    const aud =
      typeof audValue === 'string'
        ? audValue
        : Array.isArray(audValue)
          ? audValue.map(String).join(',')
          : claimAsString(payload, 'aud');

    const user = this.usersRepository.create({
      jwtToken: rawToken,
      jwtHeader: header,
      jwtPayload: payload,
      jwtSignature: signature || null,
      sub: claimAsString(payload, 'sub'),
      email:
        claimAsString(payload, 'email') ??
        claimAsString(payload, 'user_email') ??
        claimAsString(payload, 'preferred_username'),
      iss: claimAsString(payload, 'iss'),
      aud,
      iat: claimAsNumber(payload, 'iat')?.toString() ?? null,
      exp: claimAsNumber(payload, 'exp')?.toString() ?? null,
      jti: claimAsString(payload, 'jti'),
      firstName:
        claimAsString(payload, 'given_name') ??
        claimAsString(payload, 'first_name') ??
        claimAsString(payload, 'firstName'),
      lastName:
        claimAsString(payload, 'family_name') ??
        claimAsString(payload, 'last_name') ??
        claimAsString(payload, 'lastName'),
      phone:
        claimAsString(payload, 'phone_number') ??
        claimAsString(payload, 'phone'),
    });

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
