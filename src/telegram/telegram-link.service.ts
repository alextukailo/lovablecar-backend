/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';

type TelegramStatus = {
  connected: boolean;
  notificationsEnabled: boolean;
};

@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createLink(userId: string): Promise<{
    url: string;
    expiresAt: Date;
  }> {
    const botUsername =
      this.config.get<string>('TELEGRAM_BOT_USERNAME') ?? 'lovablecar_bot';

    if (!/^[A-Za-z0-9_]{5,32}$/.test(botUsername)) {
      throw new BadRequestException(
        'Invalid Telegram bot username configuration',
      );
    }

    const token = randomBytes(24).toString('base64url');

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const expiresAt = new Date(Date.now() + 10 * 60_000);

    await this.prisma.$transaction(async (tx) => {
      await tx.telegramLinkToken.deleteMany({
        where: { userId },
      });

      await tx.telegramLinkToken.create({
        data: {
          userId,
          tokenHash,
          expiresAt,
        },
      });
    });

    this.logger.log('Telegram linking token created');

    return {
      url: `https://t.me/${botUsername}?start=link_${token}`,
      expiresAt,
    };
  }

  async consumeStart(
    token: string,
    telegramUserId: string,
    chatId: string,
  ): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) {
      this.logger.warn('Telegram linking rejected: invalid token format');
      return false;
    }

    if (
      !/^[1-9]\d*$/.test(telegramUserId) ||
      !/^[1-9]\d*$/.test(chatId) ||
      telegramUserId !== chatId
    ) {
      this.logger.warn('Telegram linking rejected: invalid private chat');
      return false;
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const link = await this.prisma.telegramLinkToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
      },
    });

    if (!link) {
      this.logger.warn('Telegram linking rejected: token not found');
      return false;
    }

    if (link.expiresAt <= new Date()) {
      this.logger.warn('Telegram linking rejected: token expired');
      return false;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.telegramLinkToken.deleteMany({
          where: {
            id: link.id,
            expiresAt: {
              gt: new Date(),
            },
          },
        });

        if (consumed.count !== 1) {
          throw new ConflictException('Link token already used or expired');
        }

        const existingChat = await tx.telegramConnection.findUnique({
          where: { chatId },
        });

        if (existingChat && existingChat.userId !== link.userId) {
          throw new ConflictException(
            'Telegram chat is already linked to another account',
          );
        }

        await tx.telegramConnection.upsert({
          where: {
            userId: link.userId,
          },
          create: {
            userId: link.userId,
            chatId,
            notificationsEnabled: true,
          },
          update: {
            chatId,
            connectedAt: new Date(),
          },
        });
      });

      this.logger.log('Telegram account linked successfully');

      return true;
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        this.logger.warn(`Telegram linking rejected: ${error.message}`);
        return false;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          'Telegram linking rejected: unique connection conflict',
        );
        return false;
      }

      this.logger.error(
        'Telegram linking database transaction failed',
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  async status(userId: string): Promise<TelegramStatus> {
    const connection = await this.prisma.telegramConnection.findUnique({
      where: { userId },
    });

    return {
      connected: Boolean(connection),
      notificationsEnabled: connection?.notificationsEnabled ?? false,
    };
  }

  async updateNotifications(
    userId: string,
    body: unknown,
  ): Promise<TelegramStatus> {
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      !('enabled' in body) ||
      typeof body.enabled !== 'boolean'
    ) {
      throw new BadRequestException('enabled must be a boolean');
    }

    const enabled = body.enabled;

    const updated = await this.prisma.telegramConnection.updateMany({
      where: { userId },
      data: {
        notificationsEnabled: enabled,
      },
    });

    if (updated.count === 0) {
      throw new NotFoundException('Telegram account is not connected');
    }

    this.logger.log(
      `Telegram notifications ${enabled ? 'enabled' : 'disabled'}`,
    );

    return {
      connected: true,
      notificationsEnabled: enabled,
    };
  }

  async disconnect(userId: string): Promise<TelegramStatus> {
    await this.prisma.$transaction(async (tx) => {
      // Invalidate pending Telegram linking URLs.
      await tx.telegramLinkToken.deleteMany({
        where: { userId },
      });

      // Disconnect only the authenticated user's chat.
      await tx.telegramConnection.deleteMany({
        where: { userId },
      });
    });

    this.logger.log('Telegram account disconnected');

    return {
      connected: false,
      notificationsEnabled: false,
    };
  }
}
