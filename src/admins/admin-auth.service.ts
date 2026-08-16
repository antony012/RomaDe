import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminsService } from './admins.service';
import { LoginAdminDto } from './dto/login-admin.dto';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly adminsService: AdminsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginAdminDto) {
    const admin = await this.adminsService.validateCredentials(
      dto.username,
      dto.password,
    );

    const expiresIn = this.configService.get<string>(
      'ADMIN_JWT_EXPIRES_IN',
      '12h',
    );

    const accessToken = await this.jwtService.signAsync(
      {
        sub: admin.id,
        username: admin.username,
      },
      { expiresIn: expiresIn as `${number}h` | `${number}d` | `${number}m` },
    );

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      admin: this.adminsService.sanitize(admin),
    };
  }
}
