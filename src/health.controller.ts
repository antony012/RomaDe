import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  root() {
    return {
      name: 'RomaDe API',
      health: '/health',
      membership: 'POST /api/memberships',
      login: 'POST /api/v1/admin/auth/login',
    };
  }

  @Get('health')
  health() {
    return { ok: true };
  }
}
