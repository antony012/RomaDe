import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  claimAsNumber,
  pickClaim,
  stripJwtBearer,
  tryDecodeJwt,
  type DecodedJwt,
} from '../common/utils/jwt.util';
import { Membership } from '../memberships/entities/membership.entity';
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
    @InjectRepository(Membership)
    private readonly membershipsRepository: Repository<Membership>,
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

  /** Misma identidad: JWT actual, `sub`/`user_id`, o dasher_id del login. */
  async findOrCreateFromJwt(
    jwtToken: string,
    profile?: UserLoginProfile,
  ): Promise<User> {
    const cleaned = stripJwtBearer(jwtToken);
    const decoded = tryDecodeJwt(cleaned);
    const sub = this.identitySub(decoded);
    const dasherId = profile?.dasherId?.trim() || this.identityDasher(decoded);

    let user = await this.findByIdentity({
      jwtToken: cleaned,
      sub,
      dasherId,
      email: profile?.email,
    });

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
    return this.saveIdentity(user, profile);
  }

  async mergeDuplicateIdentities(): Promise<number> {
    const users = await this.usersRepository.find({
      order: { createdAt: 'ASC' },
    });
    const groups = new Map<string, User[]>();

    const add = (key: string, user: User) => {
      const list = groups.get(key) ?? [];
      if (!list.some((item) => item.id === user.id)) {
        list.push(user);
      }
      groups.set(key, list);
    };

    for (const user of users) {
      this.hydrateFromStoredJwt(user);
      if (user.sub) add(`sub:${user.sub}`, user);
      if (user.dasherId) add(`dasher:${user.dasherId}`, user);
      if (user.email?.includes('@'))
        add(`email:${user.email.toLowerCase()}`, user);
    }

    const absorbed = new Set<string>();
    let merged = 0;

    for (const group of groups.values()) {
      const unique = group.filter((user) => !absorbed.has(user.id));
      if (unique.length < 2) {
        continue;
      }
      const keeper = this.pickIdentityKeeper(unique);
      for (const extra of unique) {
        if (absorbed.has(extra.id) || extra.id === keeper.id) {
          continue;
        }
        await this.absorbUser(keeper, extra);
        absorbed.add(extra.id);
        merged += 1;
      }
    }

    return merged;
  }

  /** Preferir el registro más completo (email, nombre, dasher) y más antiguo. */
  private pickIdentityKeeper(users: User[]): User {
    return [...users].sort((a, b) => {
      const score = (user: User) =>
        Number(Boolean(user.email?.includes('@'))) * 8 +
        Number(Boolean(user.dasherId)) * 4 +
        Number(Boolean(user.firstName || user.lastName)) * 2 +
        Number(Boolean(user.sub));
      const byScore = score(b) - score(a);
      if (byScore !== 0) {
        return byScore;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    })[0];
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
    user.sub =
      pickClaim(payload, ['sub']) ??
      pickClaim(payload, ['user_id', 'userId', 'dd_user_id']);
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
    const dasherId = pickClaim(payload, ['dasher_id', 'dasherId', 'dasherID']);

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
    const decoded = tryDecodeJwt(user.jwtToken);
    if (!decoded) {
      return user;
    }
    return this.applyJwtFields(user, user.jwtToken, decoded);
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

  private identitySub(decoded: DecodedJwt | null): string | null {
    if (!decoded) {
      return null;
    }
    return (
      pickClaim(decoded.payload, ['sub']) ??
      pickClaim(decoded.payload, ['user_id', 'userId', 'dd_user_id'])
    );
  }

  private identityDasher(decoded: DecodedJwt | null): string | null {
    if (!decoded) {
      return null;
    }
    return pickClaim(decoded.payload, ['dasher_id', 'dasherId', 'dasherID']);
  }

  private async findByIdentity(keys: {
    jwtToken?: string;
    sub?: string | null;
    dasherId?: string | null;
    email?: string;
  }): Promise<User | null> {
    const byDasher = await this.keeperByField('dasherId', keys.dasherId);
    if (byDasher) {
      return byDasher;
    }

    const email = keys.email?.trim();
    if (email?.includes('@')) {
      const byEmail = await this.keeperByEmail(email);
      if (byEmail) {
        return byEmail;
      }
    }

    const bySub = await this.keeperByField('sub', keys.sub);
    if (bySub) {
      return bySub;
    }

    if (keys.jwtToken) {
      const byJwt = await this.findByJwtToken(keys.jwtToken);
      if (byJwt) {
        return byJwt;
      }
    }

    return null;
  }

  private async keeperByEmail(email: string): Promise<User | null> {
    const matches = await this.usersRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email: email.trim() })
      .orderBy('user.createdAt', 'ASC')
      .getMany();
    if (!matches.length) {
      return null;
    }
    const keeper = this.pickIdentityKeeper(matches);
    for (const extra of matches) {
      if (extra.id === keeper.id) {
        continue;
      }
      await this.absorbUser(keeper, extra);
    }
    return keeper;
  }

  private async keeperByField(
    field: 'sub' | 'dasherId',
    value?: string | null,
  ): Promise<User | null> {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    const matches = await this.usersRepository.find({
      where: { [field]: trimmed },
      order: { createdAt: 'ASC' },
      relations: { memberships: true },
    });
    if (!matches.length) {
      return null;
    }

    const keeper = this.pickIdentityKeeper(matches);
    for (const extra of matches) {
      if (extra.id === keeper.id) {
        continue;
      }
      await this.absorbUser(keeper, extra);
    }
    return keeper;
  }

  private async saveIdentity(
    user: User,
    profile?: UserLoginProfile,
  ): Promise<User> {
    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const holder = await this.findByJwtToken(user.jwtToken);
      if (!holder) {
        const recovered = await this.findByIdentity({
          jwtToken: user.jwtToken,
          sub: user.sub,
          dasherId: user.dasherId,
          email: user.email ?? profile?.email,
        });
        if (recovered) {
          this.applyLoginProfile(recovered, profile);
          return this.usersRepository.save(recovered);
        }
        throw error;
      }

      if (!user.id || user.id === holder.id) {
        this.applyLoginProfile(holder, profile);
        if (user.jwtPayload) {
          holder.jwtHeader = user.jwtHeader;
          holder.jwtPayload = user.jwtPayload;
          holder.jwtSignature = user.jwtSignature;
          holder.sub = holder.sub || user.sub;
        }
        return this.usersRepository.save(holder);
      }

      await this.absorbUser(user, holder, true);
      return this.usersRepository.save(user);
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driver = error.driverError as { code?: string } | undefined;
    return driver?.code === '23505';
  }

  private jwtIsNewer(candidate: User, current: User): boolean {
    const a = Number(candidate.iat ?? 0);
    const b = Number(current.iat ?? 0);
    if (a !== b) {
      return a > b;
    }
    return (
      (candidate.updatedAt?.getTime() ?? 0) >
      (current.updatedAt?.getTime() ?? 0)
    );
  }

  private copyMissingProfile(keeper: User, extra: User): void {
    const take = <K extends keyof User>(key: K) => {
      if (!keeper[key] && extra[key]) {
        keeper[key] = extra[key];
      }
    };
    take('email');
    take('firstName');
    take('lastName');
    take('phone');
    take('dasherId');
    take('sub');
    take('notes');
  }

  private async absorbUser(
    keeper: User,
    extra: User,
    preferExtraJwt = false,
  ): Promise<void> {
    if (!keeper?.id || !extra?.id || keeper.id === extra.id) {
      return;
    }

    const still = await this.usersRepository.findOne({
      where: { id: extra.id },
    });
    if (!still) {
      return;
    }

    this.copyMissingProfile(keeper, still);

    const takeJwt = preferExtraJwt || this.jwtIsNewer(still, keeper);
    const extraToken = still.jwtToken;
    const extraHeader = still.jwtHeader;
    const extraPayload = still.jwtPayload;
    const extraSignature = still.jwtSignature;

    still.jwtToken = `__merged__:${still.id}:${Date.now()}`;
    await this.usersRepository.save(still);

    if (takeJwt && extraToken && !extraToken.startsWith('__merged__')) {
      keeper.jwtToken = extraToken;
      keeper.jwtHeader = extraHeader;
      keeper.jwtPayload = extraPayload;
      keeper.jwtSignature = extraSignature;
      if (extraPayload && typeof extraPayload === 'object') {
        this.applyJwtFields(keeper, extraToken, {
          header: extraHeader ?? {},
          payload: extraPayload,
          signature: extraSignature ?? '',
          rawToken: extraToken,
        });
      }
    }

    await this.membershipsRepository
      .createQueryBuilder()
      .update(Membership)
      .set({ userId: keeper.id })
      .where('user_id = :id', { id: still.id })
      .execute();

    for (const sql of [
      `UPDATE dash_events SET user_id = $1 WHERE user_id = $2`,
      `UPDATE remote_verify_requests SET user_id = $1 WHERE user_id = $2`,
      `UPDATE integrity_sessions SET user_id = $1 WHERE user_id = $2`,
    ]) {
      try {
        await this.usersRepository.manager.query(sql, [keeper.id, still.id]);
      } catch {
        // Tabla ausente en algún entorno: la fusión de usuarios sigue.
      }
    }

    await this.usersRepository.remove(still);
    await this.usersRepository.save(keeper);
  }
}
