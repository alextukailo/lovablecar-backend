import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { MileageService } from './mileage.service';

@Controller('cron/mileage')
export class MileageController {
  constructor(private readonly service: MileageService, private readonly config: ConfigService) {}
  @Get()
  async run(@Headers('authorization') authorization?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret || !authorization) throw new UnauthorizedException();
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(authorization);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new UnauthorizedException();
    return this.service.sendDueReminders();
  }
}
