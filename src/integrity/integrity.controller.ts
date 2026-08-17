import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ClaimDto } from './dto/claim.dto';
import { DashEventDto } from './dto/dash-event.dto';
import { RemoteVerifyDto } from './dto/remote-verify.dto';
import { IntegrityService } from './integrity.service';

@Controller()
export class IntegrityController {
  constructor(private readonly integrityService: IntegrityService) {}

  @Get('api/v1/integrity/zone-seeds')
  zoneSeeds(@Headers('authorization') authorization?: string) {
    return this.integrityService.zoneSeeds(authorization);
  }

  @Post('api/v1/integrity/dash-event')
  @HttpCode(200)
  dashEvent(@Body() dto: DashEventDto) {
    return this.integrityService.dashEvent(dto);
  }

  @Post('api/v1/integrity/claim')
  @HttpCode(200)
  claim(@Body() dto: ClaimDto) {
    return this.integrityService.claim(dto);
  }

  @Post('api/v1/integrity/remote-verify')
  @HttpCode(200)
  async remoteVerify(@Body() dto: RemoteVerifyDto) {
    const row = await this.integrityService.remoteVerify(dto);
    return { link: row.link };
  }

  @Get('api/v1/integrity/verify/:id')
  async verifyPage(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const row = await this.integrityService.getVerification(id);
    const target = this.integrityService.officialVerifyTarget(row);
    if (target) {
      return res.redirect(302, target);
    }
    return res
      .type('html')
      .send(this.integrityService.verifyPageHtml(row));
  }
}
