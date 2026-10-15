/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TelegramLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createLink(userId: string): Promise<{ url: string; expiresAt: Date }> {
    const botUsername =
      this.config.get<string>('TELEGRAM_BOT_USERNAME') ?? 'lovablecar_bot';

    if (!/^[A-Za-z0-9_]{5,32}$/.test(botUsername)) {
      throw new BadRequestException('Invalid bot username configuration');
    }

    const token = randomBytes(24).toString('base64url');

    const expiresAt = new Date(Date.now() + 10 * 60_000);

    const tokenHash = createHash('sha256').update(token).digest('hex');

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
      return false;
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const link = await this.prisma.telegramLinkToken.findUnique({
      where: { tokenHash },
      include: {
        user: true,
      },
    });

    if (
      !link ||
      link.expiresAt <= new Date() ||
      link.user.telegramUserId !== telegramUserId
    ) {
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
          throw new ConflictException('Link already used or expired');
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

      return true;
    } catch (error) {
      if (error instanceof ConflictException) {
        return false;
      }

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
