import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

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
}
