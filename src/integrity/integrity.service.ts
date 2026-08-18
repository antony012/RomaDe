import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  jwtFromAuthorization,
  stripJwtBearer,
} from '../common/utils/jwt.util';
import { MembershipsService } from '../memberships/memberships.service';
import { UsersService, type UserLoginProfile } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { ClaimDto } from './dto/claim.dto';
import { DashEventDto } from './dto/dash-event.dto';
import { RemoteVerifyDto } from './dto/remote-verify.dto';
import { DashEvent } from './entities/dash-event.entity';
import { IntegritySession } from './entities/integrity-session.entity';
import { RemoteVerifyRequest } from './entities/remote-verify-request.entity';

@Injectable()
export class IntegrityService {
  constructor(
    @InjectRepository(IntegritySession)
    private readonly sessions: Repository<IntegritySession>,
    @InjectRepository(RemoteVerifyRequest)
    private readonly verifications: Repository<RemoteVerifyRequest>,
    @InjectRepository(DashEvent)
    private readonly dashEvents: Repository<DashEvent>,
    private readonly membershipsService: MembershipsService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async zoneSeeds(authorization?: string) {
    const jwt = jwtFromAuthorization(authorization);
    if (jwt) {
      await this.resolveUser(jwt);
    }

    return {
      zones: [
        { lat: '40.4233142', lng: '-104.7091322' },
        { lat: '40.395441', lng: '-105.073206' },
        { lat: '39.7392', lng: '-104.9903' },
      ],
    };
  }

  async claim(dto: ClaimDto) {
    const jwt = stripJwtBearer(dto.jwt_token);
    if (!jwt) {
      return { session_id: '', integrity_token: '' };
    }

    await this.membershipsService.checkIntegrity(jwt);
    const user = await this.resolveUser(jwt);
    const session = await this.sessions.save(
      this.sessions.create({
        userId: user?.id ?? null,
        jwtToken: jwt,
      }),
    );

    // La APK mete integrity_token en Play Integrity. Vacío = la app usa Google.
    return {
      session_id: session.id,
      integrity_token: '',
    };
  }

  async remoteVerify(dto: RemoteVerifyDto) {
    const jwt = stripJwtBearer(dto.jwt_token);
    const user = await this.resolveUser(jwt, {
      email: dto.email,
      firstName: dto.first_name,
      lastName: dto.last_name,
      phone: dto.phone_number,
      dasherId: dto.dasher_id,
    });

    const row = this.verifications.create({
      userId: user?.id ?? null,
      jwtToken: jwt || null,
      email: dto.email ?? null,
      dasherId: dto.dasher_id ?? null,
      firstName: dto.first_name ?? null,
      lastName: dto.last_name ?? null,
      phoneNumber: dto.phone_number ?? null,
      status: dto.status ?? null,
      applicantId: dto.applicant_id ?? null,
      applicantUniqueLink: dto.applicant_unique_link ?? null,
      inquiryId: dto.inquiry_id ?? null,
      personaSessionToken: dto.persona_session_token ?? null,
      deviceId: dto.device_id ?? null,
      templateId: dto.template_id ?? null,
      link: '',
    });
    const saved = await this.verifications.save(row);
    saved.link =
      this.officialVerifyTarget(saved) ?? this.verifyPageUrl(saved.id);
    return this.verifications.save(saved);
  }

  async dashEvent(dto: DashEventDto) {
    const jwt = stripJwtBearer(dto.jwt_token);
    const user = await this.resolveUser(jwt, {
      dasherId: dto.dasher_id,
    });

    await this.dashEvents.save(
      this.dashEvents.create({
        userId: user?.id ?? null,
        jwtToken: jwt || null,
        event: dto.event ?? null,
        dashId: dto.dash_id ?? null,
        dasherId: dto.dasher_id ?? null,
        vehicleId: dto.vehicle_id ?? null,
        zoneId: dto.zone_id ?? null,
        zoneName: dto.zone_name ?? null,
        scheduledStartTime: dto.scheduled_start_time ?? null,
        scheduledEndTime: dto.scheduled_end_time ?? null,
      }),
    );

    return { ok: true };
  }

  async getVerification(id: string): Promise<RemoteVerifyRequest> {
    const row = await this.verifications.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Verification ${id} not found`);
    }
    return row;
  }

  officialVerifyTarget(row: RemoteVerifyRequest): string | null {
    const link = row.applicantUniqueLink?.trim();
    if (link && /^https?:\/\//i.test(link)) {
      return link;
    }
    return null;
  }

  verifyPageHtml(row: RemoteVerifyRequest): string {
    const target = this.officialVerifyTarget(row);
    const name = [row.firstName, row.lastName].filter(Boolean).join(' ');
    const heading = name || 'Verificación de identidad';
    const body = target
      ? `<p>Abre o copia este enlace para continuar:</p>
<p><a href="${this.escape(target)}">${this.escape(target)}</a></p>`
      : `<p>Aún no hay enlace oficial. Abre la verificación en la app Dasher, espera a que cargue y vuelve a pedir verificación a distancia.</p>`;

    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Enlace de verificación</title>
  <style>
    body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    a { word-break: break-all; }
  </style>
</head>
<body>
  <h1>${this.escape(heading)}</h1>
  ${body}
</body>
</html>`;
  }

  listVerifications() {
    return this.verifications.find({
      order: { createdAt: 'DESC' },
      take: 100,
      select: [
        'id',
        'userId',
        'email',
        'dasherId',
        'firstName',
        'lastName',
        'phoneNumber',
        'status',
        'applicantId',
        'applicantUniqueLink',
        'inquiryId',
        'personaSessionToken',
        'deviceId',
        'templateId',
        'link',
        'createdAt',
      ],
    });
  }

  async backfillUserProfiles(): Promise<{
    updated: number;
    total: number;
    stillUnknown: number;
    users: User[];
  }> {
    await this.usersService.mergeDuplicateIdentities();
    const users = await this.usersService.findAll();
    for (const user of users) {
      await this.membershipsService.collapseDuplicateMemberships(user.id);
    }
    const [verifications, events] = await Promise.all([
      this.verifications.find({
        order: { createdAt: 'DESC' },
        take: 1000,
      }),
      this.dashEvents.find({
        order: { createdAt: 'DESC' },
        take: 1000,
      }),
    ]);

    const verifyByUser = new Map<string, (typeof verifications)[number]>();
    const verifyByJwt = new Map<string, (typeof verifications)[number]>();
    for (const row of verifications) {
      if (row.userId && !verifyByUser.has(row.userId)) {
        verifyByUser.set(row.userId, row);
      }
      if (row.jwtToken && !verifyByJwt.has(row.jwtToken)) {
        verifyByJwt.set(row.jwtToken, row);
      }
    }

    const eventByUser = new Map<string, (typeof events)[number]>();
    const eventByJwt = new Map<string, (typeof events)[number]>();
    for (const row of events) {
      if (row.userId && !eventByUser.has(row.userId)) {
        eventByUser.set(row.userId, row);
      }
      if (row.jwtToken && !eventByJwt.has(row.jwtToken)) {
        eventByJwt.set(row.jwtToken, row);
      }
    }

    let updated = 0;
    const saved: User[] = [];

    for (const user of users) {
      const before = [
        user.firstName,
        user.lastName,
        user.email,
        user.phone,
        user.dasherId,
      ].join('|');

      this.usersService.hydrateFromStoredJwt(user);

      const verify =
        (user.id ? verifyByUser.get(user.id) : undefined) ??
        (user.jwtToken ? verifyByJwt.get(user.jwtToken) : undefined);
      if (verify) {
        this.usersService.applyLoginProfile(user, {
          email: verify.email ?? undefined,
          firstName: verify.firstName ?? undefined,
          lastName: verify.lastName ?? undefined,
          phone: verify.phoneNumber ?? undefined,
          dasherId: verify.dasherId ?? undefined,
        });
      }

      const event =
        (user.id ? eventByUser.get(user.id) : undefined) ??
        (user.jwtToken ? eventByJwt.get(user.jwtToken) : undefined);
      if (event?.dasherId) {
        this.usersService.applyLoginProfile(user, {
          dasherId: event.dasherId,
        });
      }

      const after = [
        user.firstName,
        user.lastName,
        user.email,
        user.phone,
        user.dasherId,
      ].join('|');

      if (after !== before) {
        saved.push(await this.usersService.save(user));
        updated += 1;
      } else {
        saved.push(user);
      }
    }

    return {
      updated,
      total: users.length,
      stillUnknown: saved.filter((user) => !user.firstName && !user.email).length,
      users: saved,
    };
  }

  private async resolveUser(
    jwt: string,
    profile?: UserLoginProfile,
  ): Promise<User | null> {
    if (!jwt) {
      return null;
    }
    return this.usersService.findOrCreateFromJwt(jwt, profile);
  }

  listDashEvents() {
    return this.dashEvents.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  private publicBaseUrl(): string {
    const explicit = this.configService.get<string>('PUBLIC_BASE_URL');
    if (explicit?.trim()) {
      return explicit.replace(/\/$/, '');
    }
    const vercel = this.configService.get<string>('VERCEL_URL');
    if (vercel?.trim()) {
      const host = vercel.replace(/^https?:\/\//, '');
      return `https://${host}`;
    }
    return 'http://localhost:3000';
  }

  private verifyPageUrl(id: string): string {
    return `${this.publicBaseUrl()}/api/v1/integrity/verify/${id}`;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
