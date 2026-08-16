import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminsService } from '../admins.service';

interface JwtPayload {
  sub: string;
  username: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    configService: ConfigService,
    private readonly adminsService: AdminsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'ADMIN_JWT_SECRET',
        'change-me-admin-secret',
      ),
    });
  }

  async validate(payload: JwtPayload) {
    const admin = await this.adminsService.findActiveById(payload.sub);
    if (!admin) {
      throw new UnauthorizedException('Admin not found or inactive');
    }

    return { id: admin.id, username: admin.username };
  }
}
