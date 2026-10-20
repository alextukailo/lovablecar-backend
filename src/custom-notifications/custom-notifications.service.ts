/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { CustomNotificationStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

import { SaveCustomNotificationDto } from './custom-notifications.dto';

@Injectable()
export class CustomNotificationsService {
  private readonly logger = new Logger(CustomNotificationsService.name);

  private readonly batchSize = 100;
  private readonly maxErrorLength = 500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  // -----------------------------------------
  // VALIDATION
  // -----------------------------------------

  private validateInput(dto: SaveCustomNotificationDto) {
    const text = dto.text.trim();

    if (!text) {
      throw new BadRequestException('Notification text is required');
    }

    if (text.length > 500) {
      throw new BadRequestException(
        'Notification text cannot exceed 500 characters',
      );
    }

    const scheduledAt = new Date(dto.scheduledAt);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid notification date');
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('Notification date must be in the future');
    }

    const timeZone = dto.timeZone.trim();

    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone,
      });
    } catch {
      throw new BadRequestException('Invalid time zone');
    }

    return {
      text,
      scheduledAt,
      timeZone,
    };
  }

  // -----------------------------------------
  // GET ALL NOTIFICATIONS
  // -----------------------------------------

  async list(userId: string) {
    return this.prisma.customNotification.findMany({
      where: {
        userId,
      },

      orderBy: [
        {
          scheduledAt: 'asc',
        },
      ],
    });
  }

  // -----------------------------------------
  // GET SINGLE NOTIFICATION
  // -----------------------------------------

  async findOne(userId: string, id: string) {
    const notification = await this.prisma.customNotification.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  // -----------------------------------------
  // CREATE NOTIFICATION
  // -----------------------------------------

  async create(userId: string, dto: SaveCustomNotificationDto) {
    const data = this.validateInput(dto);

    const notification = await this.prisma.customNotification.create({
      data: {
        userId,

        text: data.text,
        scheduledAt: data.scheduledAt,
        timeZone: data.timeZone,

        status: CustomNotificationStatus.PENDING,

        attempts: 0,
      },
    });

    this.logger.log(`Custom notification created: ${notification.id}`);

    return notification;
  }

  // -----------------------------------------
  // UPDATE NOTIFICATION
  // -----------------------------------------

  async update(userId: string, id: string, dto: SaveCustomNotificationDto) {
    const data = this.validateInput(dto);

    const result = await this.prisma.customNotification.updateMany({
      where: {
        id,
        userId,
        status: CustomNotificationStatus.PENDING,
      },

      data: {
        text: data.text,
        scheduledAt: data.scheduledAt,
        timeZone: data.timeZone,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Pending notification not found');
    }

    const notification = await this.prisma.customNotification.findFirstOrThrow({
      where: {
        id,
        userId,
      },
    });

    this.logger.log(`Custom notification updated: ${id}`);

    return notification;
  }

  // -----------------------------------------
  // DELETE NOTIFICATION
  // -----------------------------------------

  async remove(userId: string, id: string) {
    const result = await this.prisma.customNotification.deleteMany({
      where: {
        id,
        userId,

        status: {
          not: CustomNotificationStatus.SENDING,
        },
      },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        'Notification not found or currently sending',
      );
    }

    this.logger.log(`Custom notification deleted: ${id}`);

    return {
      deleted: true,
      id,
    };
  }

  // -----------------------------------------
  // FORMAT TELEGRAM MESSAGE
  // -----------------------------------------

  private formatTelegramMessage(notification: {
    text: string;
    scheduledAt: Date;
    timeZone: string;
  }): string {
    const formattedDate = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: notification.timeZone,
    }).format(notification.scheduledAt);

    return [
      '🔔 LovableCar Reminder',
      '',
      notification.text,
      '',
      `📅 ${formattedDate}`,
      '',
      '🚗 LovableCar',
    ].join('\n');
  }

  // -----------------------------------------
  // MARK NOTIFICATION AS FAILED
  // -----------------------------------------

  private async markAsFailed(id: string, error: string) {
    await this.prisma.customNotification.update({
      where: {
        id,
      },

      data: {
        status: CustomNotificationStatus.FAILED,

        lastError: error.slice(0, this.maxErrorLength),

        claimedAt: null,
      },
    });
  }

  // -----------------------------------------
  // SEND DUE NOTIFICATIONS
  // -----------------------------------------

  async sendDueNotifications() {
    const now = new Date();

    this.logger.log(`Starting custom notification scan: ${now.toISOString()}`);

    const dueNotifications = await this.prisma.customNotification.findMany({
      where: {
        status: CustomNotificationStatus.PENDING,

        scheduledAt: {
          lte: now,
        },
      },

      orderBy: {
        scheduledAt: 'asc',
      },

      take: this.batchSize,
    });

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const notification of dueNotifications) {
      // Atomic claim prevents two cron executions
      // from processing the same pending notification.

      const claimed = await this.prisma.customNotification.updateMany({
        where: {
          id: notification.id,
          status: CustomNotificationStatus.PENDING,
        },

        data: {
          status: CustomNotificationStatus.SENDING,

          claimedAt: new Date(),

          attempts: {
            increment: 1,
          },

          lastError: null,
        },
      });

      if (claimed.count === 0) {
        skipped++;
        continue;
      }

      try {
        // Find Telegram connection belonging
        // to the notification owner.

        const connection = await this.prisma.telegramConnection.findUnique({
          where: {
            userId: notification.userId,
          },
        });

        if (!connection) {
          await this.markAsFailed(
            notification.id,
            'Telegram account is not connected',
          );

          failed++;
          continue;
        }

        if (!connection.notificationsEnabled) {
          await this.markAsFailed(
            notification.id,
            'Telegram notifications are disabled',
          );

          failed++;
          continue;
        }

        // Build Telegram message.

        const message = this.formatTelegramMessage({
          text: notification.text,
          scheduledAt: notification.scheduledAt,
          timeZone: notification.timeZone,
        });

        // Send using the existing LovableCar
        // TelegramService.

        const telegramResult = await this.telegram.sendMessage({
          chatId: connection.chatId,
          text: message,
        });

        // Mark notification as delivered.

        await this.prisma.customNotification.update({
          where: {
            id: notification.id,
          },

          data: {
            status: CustomNotificationStatus.SENT,

            sentAt: new Date(),

            telegramMessageId: telegramResult.messageId,

            claimedAt: null,
            lastError: null,
          },
        });

        sent++;

        this.logger.log(`Custom notification sent: ${notification.id}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown Telegram error';

        this.logger.error(
          `Failed to send notification ${notification.id}: ${message}`,
        );

        await this.markAsFailed(notification.id, message);

        failed++;
      }
    }

    const result = {
      ok: true,
      checked: dueNotifications.length,
      sent,
      failed,
      skipped,
    };

    this.logger.log(
      `Custom notification scan completed: ${JSON.stringify(result)}`,
    );

    return result;
  }
}
