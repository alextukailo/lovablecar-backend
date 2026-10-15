/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Body,
  ServiceUnavailableException,
} from '@nestjs/common';

import { TelegramService } from './telegram.service';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { MaintenanceNotificationWorker } from './maintenance-notification.worker';

@Controller('telegram/dev/maintenance-notifications')
export class MaintenanceNotificationDevController {
  constructor(
    private readonly config: ConfigService,
    private readonly worker: MaintenanceNotificationWorker,
    private readonly telegram: TelegramService,
  ) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  async run(
    @Headers('x-maintenance-dev-secret')
    providedSecret: string | undefined,
  ): Promise<{ ok: true; message: string }> {
    if (this.config.get<string>('NODE_ENV') !== 'development') {
      throw new ForbiddenException('Development endpoint is disabled');
    }

    const expectedSecret = this.config.get<string>('MAINTENANCE_DEV_SECRET');

    if (!expectedSecret || expectedSecret.length < 24) {
      throw new ServiceUnavailableException(
        'Development secret is not configured',
      );
    }

    const expected = Buffer.from(expectedSecret, 'utf8');
    const provided = Buffer.from(providedSecret ?? '', 'utf8');

    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      throw new ForbiddenException('Invalid development secret');
    }

    await this.worker.run();

    return {
      ok: true,
      message:
        'Maintenance notification scan completed; check logs and database for delivery results.',
    };
  }

  @Post('test-message')
  @HttpCode(HttpStatus.OK)
  async sendTestMessage(
    @Headers('x-maintenance-dev-secret')
    providedSecret: string | undefined,
    @Body() body: { chatId?: string },
  ): Promise<{ ok: true; message: string }> {
    if (this.config.get<string>('NODE_ENV') !== 'development') {
      throw new ForbiddenException('Development endpoint is disabled');
    }

    const expectedSecret = this.config.get<string>('MAINTENANCE_DEV_SECRET');

    if (!expectedSecret || expectedSecret.length < 24) {
      throw new ServiceUnavailableException(
        'Development secret is not configured',
      );
    }

    const expected = Buffer.from(expectedSecret, 'utf8');
    const provided = Buffer.from(providedSecret ?? '', 'utf8');

    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      throw new ForbiddenException('Invalid development secret');
    }

    if (!body?.chatId || !/^\d{1,20}$/.test(body.chatId)) {
      throw new BadRequestException('Valid chatId is required');
    }

    await this.telegram.sendMaintenanceReminder({
      chatId: body.chatId,
      carName: 'Volkswagen Tiguan',
      maintenanceTitle: 'Engine oil + filter',
      status: 'UPCOMING',
      details:
        'Next date: 2026-10-17\n' +
        'Current mileage: 128500 km\n' +
        '2 days remaining\n' +
        'TEST NOTIFICATION',
    });

    return {
      ok: true,
      message: 'Test notification sent to Telegram',
    };
  }
}
