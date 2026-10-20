import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedRequest } from '../auth/session-auth.guard';

import { CustomNotificationsService } from './custom-notifications.service';
import { SaveCustomNotificationDto } from './custom-notifications.dto';

@Controller('custom-notifications')
@UseGuards(SessionAuthGuard)
export class CustomNotificationsController {
  constructor(private readonly service: CustomNotificationsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.service.list(request.user.id);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SaveCustomNotificationDto,
  ) {
    return this.service.create(request.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SaveCustomNotificationDto,
  ) {
    return this.service.update(request.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(request.user.id, id);
  }
}

@Controller('cron/custom-notifications')
export class CustomNotificationsCronController {
  constructor(
    private readonly service: CustomNotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  run(@Headers('authorization') authorization?: string) {
    const secret = this.config.get<string>('CRON_SECRET');

    if (!secret || !authorization) {
      throw new UnauthorizedException();
    }

    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(authorization);

    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException();
    }

    return this.service.sendDueNotifications();
  }
}
