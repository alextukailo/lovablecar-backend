/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createLink(userId: string): Promise<{ url: string; expiresAt: Date }> {
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
    // Only accept tokens with the expected format.
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) {
      this.logger.warn('Telegram linking rejected: invalid token format');
      return false;
    }

    // This service only links private Telegram chats.
    // In a private chat, sender ID and chat ID must match.
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
        // Consume the token atomically.
        // Only one request can delete this record.
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

        // Do not let one LovableCar account take over
        // a Telegram chat linked to another account.
        const existingChat = await tx.telegramConnection.findUnique({
          where: { chatId },
        });

        if (existingChat && existingChat.userId !== link.userId) {
          throw new ConflictException(
            'Telegram chat is already linked to another account',
          );
        }

        // Create or update the connection belonging
        // to the authenticated LovableCar user.
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

  async status(userId: string): Promise<{
    connected: boolean;
    notificationsEnabled: boolean;
  }> {
    const connection = await this.prisma.telegramConnection.findUnique({
      where: { userId },
    });

    return {
      connected: Boolean(connection),
      notificationsEnabled: connection?.notificationsEnabled ?? false,
    };
  }
}
