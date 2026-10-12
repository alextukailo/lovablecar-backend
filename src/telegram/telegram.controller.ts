/* eslint-disable @typescript-eslint/require-await */
import {
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Body,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

interface TelegramWebhookUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
}

interface TelegramWebhookChat {
  id: number;
  type: string;
}

interface TelegramWebhookMessage {
  message_id: number;
  text?: string;
  from?: TelegramWebhookUser;
  chat: TelegramWebhookChat;
}

interface TelegramWebhookUpdate {
  update_id: number;
  message?: TelegramWebhookMessage;
}

@Controller('telegram')
export class TelegramController {
  constructor(private readonly config: ConfigService) {}

  private verifyWebhookSecret(providedSecret: string | undefined): void {
    const expectedSecret = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');

    if (!expectedSecret) {
      throw new ServiceUnavailableException(
        'Telegram webhook is not configured',
      );
    }

    if (!providedSecret) {
      throw new ForbiddenException('Invalid Telegram webhook secret');
    }

    const expected = Buffer.from(expectedSecret, 'utf8');
    const provided = Buffer.from(providedSecret, 'utf8');

    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      throw new ForbiddenException('Invalid Telegram webhook secret');
    }
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-telegram-bot-api-secret-token')
    webhookSecret: string | undefined,
    @Body() update: TelegramWebhookUpdate,
  ): Promise<{ ok: true }> {
    this.verifyWebhookSecret(webhookSecret);

    if (
      !update ||
      typeof update.update_id !== 'number' ||
      !Number.isSafeInteger(update.update_id)
    ) {
      throw new ForbiddenException('Invalid Telegram update');
    }

    const message = update.message;

    if (!message) {
      return { ok: true };
    }

    if (
      message.chat?.type !== 'private' ||
      !message.from ||
      message.from.is_bot
    ) {
      return { ok: true };
    }

    // Account linking will be implemented in a
    // separate step using a short-lived, one-time
    // code bound to an authenticated user.
    //
    // Never trust a user ID or chat ID sent by
    // the Expo application.
    //
    // For now, acknowledge valid updates without
    // modifying user accounts or sending messages.

    return { ok: true };
  }
}
