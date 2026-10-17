/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

const DAY = 24 * 60 * 60 * 1000;
const INTERVAL = 14 * DAY;
const MAX_MILEAGE = 2_147_483_647;

interface TelegramSendResponse {
  ok: boolean;
  result?: {
    message_id: number;
  };
  description?: string;
}

@Injectable()
export class MileageService {
  private readonly logger = new Logger(MileageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Send a Telegram reminder using ForceReply.
   *
   * Telegram returns a message_id, which we save
   * so the owner's reply identifies the correct car.
   */
  private async sendForceReply(chatId: string, text: string): Promise<number> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');

    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is missing');
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          reply_markup: {
            force_reply: true,
            input_field_placeholder: 'Enter mileage in km',
          },
        }),
      },
    );

    const data = (await response.json()) as TelegramSendResponse;

    if (
      !response.ok ||
      !data.ok ||
      !Number.isSafeInteger(data.result?.message_id)
    ) {
      throw new Error(
        data.description ?? 'Telegram failed to send mileage reminder',
      );
    }

    return data.result!.message_id;
  }

  /**
   * Send reminders for eligible cars.
   */
  async sendDueReminders(): Promise<{
    sent: number;
    failed: number;
  }> {
    const now = new Date();

    const cars = await this.prisma.car.findMany({
      where: {
        ownerId: {
          not: null,
        },
        owner: {
          telegramConnection: {
            is: {
              notificationsEnabled: true,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    for (const car of cars) {
      await this.prisma.mileageReminder.upsert({
        where: {
          carId: car.id,
        },
        create: {
          carId: car.id,
        },
        update: {},
      });
    }

    const due = await this.prisma.mileageReminder.findMany({
      where: {
        nextDueAt: {
          lte: now,
        },
        pendingSince: null,
        OR: [
          {
            leaseUntil: null,
          },
          {
            leaseUntil: {
              lt: now,
            },
          },
        ],
        car: {
          owner: {
            telegramConnection: {
              is: {
                notificationsEnabled: true,
              },
            },
          },
        },
      },
      select: {
        carId: true,
      },
      take: 100,
    });

    let sent = 0;
    let failed = 0;

    for (const item of due) {
      const claimed = await this.prisma.mileageReminder.updateMany({
        where: {
          carId: item.carId,
          nextDueAt: {
            lte: now,
          },
          pendingSince: null,
          OR: [
            {
              leaseUntil: null,
            },
            {
              leaseUntil: {
                lt: now,
              },
            },
          ],
        },
        data: {
          leaseUntil: new Date(Date.now() + 2 * 60_000),
        },
      });

      if (!claimed.count) {
        continue;
      }

      try {
        const car = await this.prisma.car.findUnique({
          where: {
            id: item.carId,
          },
          include: {
            owner: {
              include: {
                telegramConnection: true,
              },
            },
          },
        });

        const connection = car?.owner?.telegramConnection;

        if (!car || !connection?.notificationsEnabled) {
          await this.prisma.mileageReminder.update({
            where: {
              carId: item.carId,
            },
            data: {
              leaseUntil: null,
            },
          });

          continue;
        }

        const messageId = await this.sendForceReply(
          connection.chatId,
          `🚗 Mileage check\n\n` +
            `${car.make} ${car.model} (${car.year})\n` +
            `Last recorded: ${car.mileage.toLocaleString('en-US')} km\n\n` +
            `Please enter your current mileage in km.\n\n` +
            `Example: ${car.mileage + 100}`,
        );

        const sentAt = new Date();

        await this.prisma.mileageReminder.update({
          where: {
            carId: car.id,
          },
          data: {
            telegramMessageId: messageId,
            pendingSince: sentAt,
            lastSentAt: sentAt,
            nextDueAt: new Date(sentAt.getTime() + INTERVAL),
            leaseUntil: null,
          },
        });

        sent++;

        this.logger.log(
          `ForceReply reminder sent for car ${car.id}, message ${messageId}`,
        );
      } catch (error: unknown) {
        failed++;

        this.logger.error(
          `Mileage reminder failed for ${item.carId}`,
          error instanceof Error ? error.stack : String(error),
        );

        await this.prisma.mileageReminder.update({
          where: {
            carId: item.carId,
          },
          data: {
            leaseUntil: null,
            nextDueAt: new Date(Date.now() + 60 * 60_000),
          },
        });
      }
    }

    return {
      sent,
      failed,
    };
  }

  /**
   * Save mileage after verifying that the Telegram
   * chat is linked to the car's owner.
   */
  private async saveMileage(
    chatId: string,
    telegramUserId: string,
    carId: string,
    mileage: number,
  ): Promise<boolean> {
    if (chatId !== telegramUserId) {
      this.logger.warn('Mileage rejected: sender/chat mismatch');
      return true;
    }

    const connection = await this.prisma.telegramConnection.findUnique({
      where: {
        chatId,
      },
    });

    if (!connection) {
      await this.telegram.sendMessage({
        chatId,
        text: '❌ Your Telegram account is not linked to LovableCar.',
      });

      return true;
    }

    const car = await this.prisma.car.findFirst({
      where: {
        id: carId,
        ownerId: connection.userId,
      },
    });

    if (!car) {
      await this.telegram.sendMessage({
        chatId,
        text: '❌ Car not found in your LovableCar account.',
      });

      return true;
    }

    if (
      !Number.isSafeInteger(mileage) ||
      mileage < 0 ||
      mileage > MAX_MILEAGE
    ) {
      await this.telegram.sendMessage({
        chatId,
        text: '❌ Enter a valid whole-number mileage in km.',
      });

      return true;
    }

    if (mileage < car.mileage) {
      await this.telegram.sendMessage({
        chatId,
        text:
          `❌ Mileage cannot be below ` +
          `${car.mileage.toLocaleString('en-US')} km.\n\n` +
          `Please enter the current odometer value.`,
      });

      return true;
    }

    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.car.updateMany({
          where: {
            id: car.id,
            ownerId: connection.userId,
            mileage: {
              lte: mileage,
            },
          },
          data: {
            mileage,
          },
        });

        if (!updated.count) {
          throw new Error('Mileage changed concurrently');
        }

        await tx.mileageReading.create({
          data: {
            carId: car.id,
            mileage,
          },
        });

        await tx.mileageReminder.upsert({
          where: {
            carId: car.id,
          },
          create: {
            carId: car.id,
            nextDueAt: new Date(now.getTime() + INTERVAL),
            lastSubmittedAt: now,
          },
          update: {
            pendingSince: null,
            leaseUntil: null,
            telegramMessageId: null,
            lastSubmittedAt: now,
            nextDueAt: new Date(now.getTime() + INTERVAL),
          },
        });
      });

      this.logger.log(`Mileage saved for car ${car.id}: ${mileage}`);
    } catch (error: unknown) {
      this.logger.error(
        `Mileage save failed for car ${car.id}`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.telegram.sendMessage({
        chatId,
        text: '❌ Could not save mileage. Please try again.',
      });

      return true;
    }

    await this.telegram.sendMessage({
      chatId,
      text:
        `✅ Mileage saved!\n\n` +
        `${car.make} ${car.model}: ` +
        `${mileage.toLocaleString('en-US')} km\n\n` +
        `📅 Next check in 14 days.`,
    });

    return true;
  }

  /**
   * Existing manual command remains available:
   * /mileage CAR_ID VALUE
   */
  async handleMessage(
    chatId: string,
    telegramUserId: string,
    text: string,
  ): Promise<boolean> {
    const trimmed = text.trim();

    const match = /^\/mileage(?:@\w+)?\s+(\S+)\s+(\d+)\s*$/i.exec(trimmed);

    if (!match) {
      if (/^\/mileage(?:@\w+)?(?:\s|$)/i.test(trimmed)) {
        await this.telegram.sendMessage({
          chatId,
          text: 'Use:\n/mileage CAR_ID CURRENT_MILEAGE',
        });

        return true;
      }

      return false;
    }

    return this.saveMileage(chatId, telegramUserId, match[1], Number(match[2]));
  }

  /**
   * Handle a numeric reply to a ForceReply reminder.
   */
  async handleNumericReply(
    chatId: string,
    telegramUserId: string,
    text: string,
    replyToMessageId: number,
  ): Promise<boolean> {
    if (chatId !== telegramUserId) {
      return false;
    }

    const connection = await this.prisma.telegramConnection.findUnique({
      where: {
        chatId,
      },
    });

    if (!connection) {
      return false;
    }

    const reminder = await this.prisma.mileageReminder.findFirst({
      where: {
        telegramMessageId: replyToMessageId,
        pendingSince: {
          not: null,
        },
        car: {
          ownerId: connection.userId,
        },
      },
      select: {
        carId: true,
      },
    });

    if (!reminder) {
      return false;
    }

    const trimmed = text.trim();

    if (!/^\d+$/.test(trimmed)) {
      await this.telegram.sendMessage({
        chatId,
        text: 'Please reply with numbers only.\n' + 'Example: 129450',
      });

      return true;
    }

    return this.saveMileage(
      chatId,
      telegramUserId,
      reminder.carId,
      Number(trimmed),
    );
  }
}
