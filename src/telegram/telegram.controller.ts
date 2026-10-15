import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

import { TelegramLinkService } from './telegram-link.service';
import { TelegramService } from './telegram.service';

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    from?: {
      id: number;
      is_bot?: boolean;
    };
    chat?: {
      id: number;
      type: string;
    };
  };
}

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly config: ConfigService,
    private readonly links: TelegramLinkService,
    private readonly telegram: TelegramService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers('x-telegram-bot-api-secret-token')
    secret: string | undefined,
    @Body() update: TelegramUpdate,
  ): Promise<{ ok: true }> {
    const configured = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');

    if (!configured) {
      throw new ServiceUnavailableException('Telegram webhook not configured');
    }

    const a = Buffer.from(configured);
    const b = Buffer.from(secret ?? '');

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid Telegram webhook secret');
    }

    if (!update || !Number.isSafeInteger(update.update_id)) {
      throw new ForbiddenException('Invalid Telegram update');
    }

    const message = update.message;

    if (
      !message ||
      message.chat?.type !== 'private' ||
      !message.from ||
      message.from.is_bot
    ) {
      return { ok: true };
    }

    const match = /^\/start link_([A-Za-z0-9_-]{32})$/.exec(
      message.text?.trim() ?? '',
    );

    if (!match) {
      return { ok: true };
    }

    const linked = await this.links.consumeStart(
      match[1],
      String(message.from.id),
      String(message.chat.id),
    );

    await this.telegram.sendMessage({
      chatId: String(message.chat.id),
      text: linked
        ? '✅ Telegram connected to LovableCar. Maintenance reminders are enabled.'
        : '⚠️ Linking failed. Open LovableCar and generate a new link.',
    });

    return { ok: true };
  }
}
