/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/session-auth.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';

import { TelegramLinkService } from './telegram-link.service';

@Controller('telegram/link')
@UseGuards(SessionAuthGuard)
export class TelegramLinkController {
  constructor(private readonly links: TelegramLinkService) {}

  @Post()
  async create(@Req() request: AuthenticatedRequest): Promise<{
    url: string;
    expiresAt: Date;
  }> {
    return this.links.createLink(request.user.id);
  }

  @Get('status')
  async status(@Req() request: AuthenticatedRequest): Promise<{
    connected: boolean;
    notificationsEnabled: boolean;
  }> {
    return this.links.status(request.user.id);
  }

  @Patch('notifications')
  async updateNotifications(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<{
    connected: boolean;
    notificationsEnabled: boolean;
  }> {
    return this.links.updateNotifications(request.user.id, body);
  }

  @Delete()
  async disconnect(@Req() request: AuthenticatedRequest): Promise<{
    connected: boolean;
    notificationsEnabled: boolean;
  }> {
    return this.links.disconnect(request.user.id);
  }
}
