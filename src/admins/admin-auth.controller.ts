import { Body, Controller, Post } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { LoginAdminDto } from './dto/login-admin.dto';

@Controller('api/v1/admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  login(@Body() dto: LoginAdminDto) {
    return this.adminAuthService.login(dto);
  }
}
