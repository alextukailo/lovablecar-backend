/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';

export interface TelegramLoginPayload {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

export interface VerifiedTelegramUser {
  telegramUserId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
}

export interface AuthenticatedSession {
  token: string;
  expiresAt: Date;
  user: VerifiedTelegramUser & {
    id: string;
  };
}

@Injectable()
export class TelegramAuthService {
  private readonly maxAuthAgeSeconds = 300;
  private readonly sessionLifetimeDays = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private getBotToken(): string {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');

    if (!token) {
      throw new ServiceUnavailableException(
        'Telegram authentication is not configured',
      );
    }

    return token;
  }

  /**
   * Verify a legacy Telegram Login Widget payload.
   *
   * This method performs no database writes and
   * creates no backend session.
   *
   * It does not verify Telegram Mini App initData
   * or Telegram OIDC authorization-code responses.
   */
  verifyTelegramPayload(payload: TelegramLoginPayload): VerifiedTelegramUser {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      typeof payload.hash !== 'string' ||
      !/^[a-fA-F0-9]{64}$/.test(payload.hash)
    ) {
      throw new UnauthorizedException('Invalid Telegram login response');
    }

    const telegramUserId = String(payload.id ?? '');

    if (!/^[1-9][0-9]*$/.test(telegramUserId)) {
      throw new UnauthorizedException('Invalid Telegram user ID');
    }

    const authDateString = String(payload.auth_date ?? '');

    if (!/^[0-9]+$/.test(authDateString)) {
      throw new UnauthorizedException('Invalid Telegram authentication date');
    }

    const authDate = Number(authDateString);
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isSafeInteger(authDate) ||
      authDate > now + 30 ||
      now - authDate > this.maxAuthAgeSeconds
    ) {
      throw new UnauthorizedException('Telegram authentication has expired');
    }

    const allowedFields = [
      'id',
      'first_name',
      'last_name',
      'username',
      'photo_url',
      'auth_date',
    ] as const;

    const entries: string[] = [];

    for (const field of allowedFields) {
      const value = payload[field];

      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new UnauthorizedException('Invalid Telegram login response');
      }

      entries.push(`${field}=${String(value)}`);
    }

    entries.sort();

    const dataCheckString = entries.join('\n');

    const secretKey = createHash('sha256').update(this.getBotToken()).digest();

    const expectedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest();

    const receivedHash = Buffer.from(payload.hash, 'hex');

    if (
      receivedHash.length !== expectedHash.length ||
      !timingSafeEqual(receivedHash, expectedHash)
    ) {
      throw new UnauthorizedException('Telegram login verification failed');
    }

    for (const field of [
      'first_name',
      'last_name',
      'username',
      'photo_url',
    ] as const) {
      const value = payload[field];

      if (value !== undefined && typeof value !== 'string') {
        throw new UnauthorizedException('Invalid Telegram user profile');
      }
    }

    return {
      telegramUserId,
      firstName: payload.first_name ?? null,
      lastName: payload.last_name ?? null,
      username: payload.username ?? null,
      photoUrl: payload.photo_url ?? null,
    };
  }

  /**
   * Verify Telegram identity and persist the user.
   *
   * Kept for compatibility with existing callers.
   * The new mobile approval flow will instead use
   * verifyTelegramPayload() and persist the user
   * inside its own approval transaction.
   */
  async verifyTelegramIdentity(payload: TelegramLoginPayload) {
    const verified = this.verifyTelegramPayload(payload);

    return this.prisma.user.upsert({
      where: {
        telegramUserId: verified.telegramUserId,
      },
      create: {
        telegramUserId: verified.telegramUserId,
        firstName: verified.firstName,
        lastName: verified.lastName,
        username: verified.username,
        photoUrl: verified.photoUrl,
      },
      update: {
        firstName: verified.firstName,
        lastName: verified.lastName,
        username: verified.username,
        photoUrl: verified.photoUrl,
      },
    });
  }

  /**
   * Existing legacy login implementation.
   *
   * The HTTP POST /auth/telegram endpoint remains
   * disabled by AuthController.
   */
  async login(payload: TelegramLoginPayload): Promise<AuthenticatedSession> {
    const user = await this.verifyTelegramIdentity(payload);

    const token = randomBytes(32).toString('base64url');

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const expiresAt = new Date(
      Date.now() + this.sessionLifetimeDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      token,
      expiresAt,
      user: {
        id: user.id,
        telegramUserId: user.telegramUserId,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        photoUrl: user.photoUrl,
      },
    };
  }

  /**
   * Verify an existing backend session.
   */
  async verifySession(token: string) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new UnauthorizedException('Invalid session token');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const session = await this.prisma.userSession.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: true,
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return session.user;
  }

  /**
   * Revoke an existing backend session.
   */
  async logout(token: string): Promise<void> {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new UnauthorizedException('Invalid session token');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    await this.prisma.userSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
