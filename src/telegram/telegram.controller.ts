import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

import { MileageService } from '../mileage/mileage.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramService } from './telegram.service';

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
  reply_to_message?: {
    message_id: number;
    from?: TelegramWebhookUser;
  };
}

interface TelegramWebhookUpdate {
  update_id: number;
  message?: TelegramWebhookMessage;
}

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly telegramLinkService: TelegramLinkService,
    private readonly telegramService: TelegramService,

    @Inject(forwardRef(() => MileageService))
    private readonly mileageService: MileageService,
  ) {}

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

  private async handleStart(message: TelegramWebhookMessage): Promise<void> {
    const text = message.text?.trim() ?? '';

    const match = /^\/start(?:@\w+)?\s+link_([A-Za-z0-9_-]{32})$/i.exec(text);

    if (!match || !message.from) {
      return;
    }

    const chatId = String(message.chat.id);

    const connected = await this.telegramLinkService.consumeStart(
      match[1],
      String(message.from.id),
      chatId,
    );

    await this.telegramService.sendMessage({
      chatId,
      text: connected
        ? '✅ Telegram connected to LovableCar.\n\nMaintenance reminders and mileage checks are enabled.'
        : '❌ Telegram linking failed.\n\nPlease generate a new linking URL in LovableCar.',
    });
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-telegram-bot-api-secret-token')
    webhookSecret: string | undefined,

    @Body()
    update: TelegramWebhookUpdate,
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

    if (
      !message ||
      message.chat?.type !== 'private' ||
      !message.from ||
      message.from.is_bot ||
      typeof message.text !== 'string'
    ) {
      return { ok: true };
    }

    const text = message.text.trim();

    const chatId = String(message.chat.id);
    const telegramUserId = String(message.from.id);

    // 1. Telegram account linking.
    if (/^\/start(?:@\w+)?\s+link_/i.test(text)) {
      await this.handleStart(message);
      return { ok: true };
    }

    // 2. Existing manual mileage command.
    if (/^\/mileage(?:@\w+)?(?:\s|$)/i.test(text)) {
      await this.mileageService.handleMessage(chatId, telegramUserId, text);

      return { ok: true };
    }

    // 3. Reply to a mileage reminder.
    const repliedMessage = message.reply_to_message;

    if (
      repliedMessage &&
      Number.isSafeInteger(repliedMessage.message_id) &&
      repliedMessage.from?.is_bot === true
    ) {
      const handled = await this.mileageService.handleNumericReply(
        chatId,
        telegramUserId,
        text,
        repliedMessage.message_id,
      );

      if (handled) {
        this.logger.log('Mileage reply processed');
      }

      return { ok: true };
    }

    return { ok: true };
  }
}
