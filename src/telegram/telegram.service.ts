import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: {
    retry_after?: number;
  };
}

interface TelegramMessageResult {
  message_id: number;
  date: number;
  chat: {
    id: number;
    type: string;
  };
}

export interface SendTelegramMessageInput {
  chatId: string;
  text: string;
  disableNotification?: boolean;
}

export interface SendTelegramMessageResult {
  messageId: number;
  chatId: string;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  private readonly requestTimeoutMs = 10000;
  private readonly maxMessageLength = 4096;

  constructor(private readonly config: ConfigService) {}

  private getBotToken(): string {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');

    if (!token) {
      throw new ServiceUnavailableException('Telegram bot is not configured');
    }

    return token;
  }

  private validateChatId(chatId: string): void {
    if (typeof chatId !== 'string' || !/^-?[1-9][0-9]*$/.test(chatId)) {
      throw new Error('Invalid Telegram chat ID');
    }
  }

  private validateMessage(text: string): void {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Telegram message cannot be empty');
    }

    if (text.length > this.maxMessageLength) {
      throw new Error('Telegram message exceeds the maximum length');
    }
  }

  /**
   * Escapes text before inserting it into a Telegram
   * message formatted using parse_mode: HTML.
   */
  escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Sends a plain-text message.
   *
   * No parse_mode is supplied, so Telegram treats
   * the content as ordinary text.
   */
  async sendMessage(
    input: SendTelegramMessageInput,
  ): Promise<SendTelegramMessageResult> {
    this.validateChatId(input.chatId);
    this.validateMessage(input.text);

    const token = this.getBotToken();

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
          disable_notification: input.disableNotification ?? false,
        }),
        signal: controller.signal,
      });

      const result =
        (await response.json()) as TelegramApiResponse<TelegramMessageResult>;

      if (!response.ok || !result.ok || !result.result) {
        const errorCode = result.error_code ?? response.status;

        const retryAfter = result.parameters?.retry_after;

        this.logger.warn(
          `Telegram sendMessage failed: status=${errorCode}` +
            (retryAfter ? ` retryAfter=${retryAfter}s` : ''),
        );

        throw new ServiceUnavailableException(
          'Telegram could not deliver the message',
        );
      }

      return {
        messageId: result.result.message_id,
        chatId: String(result.result.chat.id),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? 'timeout'
          : 'network or response error';

      this.logger.warn(`Telegram sendMessage failed: ${reason}`);

      throw new ServiceUnavailableException(
        'Telegram messaging is temporarily unavailable',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Sends a formatted maintenance reminder.
   *
   * All dynamic values are escaped before being
   * inserted into the Telegram HTML message.
   */
  async sendMaintenanceReminder(input: {
    chatId: string;
    carName: string;
    maintenanceTitle: string;
    status: 'UPCOMING' | 'DUE' | 'OVERDUE';
    details?: string;
  }): Promise<SendTelegramMessageResult> {
    const statusLabels = {
      UPCOMING: 'Upcoming maintenance',
      DUE: 'Maintenance due',
      OVERDUE: 'Overdue maintenance',
    };

    const statusIcons = {
      UPCOMING: '🔔',
      DUE: '🛠️',
      OVERDUE: '⚠️',
    };

    const lines = [
      `${statusIcons[input.status]} ${statusLabels[input.status]}`,
      '',
      `🚗 ${input.carName}`,
      `🔧 ${input.maintenanceTitle}`,
    ];

    if (input.details?.trim()) {
      lines.push('', input.details.trim());
    }

    lines.push('', 'Open LovableCar to view your maintenance schedule.');

    return this.sendMessage({
      chatId: input.chatId,
      text: lines.join('\n'),
    });
  }
}
