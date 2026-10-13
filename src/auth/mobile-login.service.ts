import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { VerifiedTelegramUser } from './telegram-auth.service';

const LOGIN_LIFETIME_MS = 5 * 60 * 1000;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const TELEGRAM_REPLAY_LIFETIME_MS = 10 * 60 * 1000;

const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const CODE_PATTERN = /^[0-9]{6}$/;
const SIGNATURE_PATTERN = /^[a-fA-F0-9]{64}$/;

const MAX_CONFIRMATION_ATTEMPTS = 5;

type ReservedAttempt = {
  confirmationAttempts: number;
  confirmationCodeHash: string | null;
};

@Injectable()
export class MobileLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private getConfirmationSecret(): string {
    const secret = this.config.get<string>('MOBILE_LOGIN_CONFIRMATION_SECRET');

    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'Mobile login confirmation is not configured',
      );
    }

    return secret;
  }

  private hashConfirmationCode(transactionId: string, code: string): string {
    return createHmac('sha256', this.getConfirmationSecret())
      .update(`${transactionId}:${code}`)
      .digest('hex');
  }

  private hashesMatch(actual: string | null, expected: string): boolean {
    if (!actual || !HASH_PATTERN.test(actual) || !HASH_PATTERN.test(expected)) {
      return false;
    }

    return timingSafeEqual(
      Buffer.from(actual, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  }

  private validateApprovalInput(
    transactionId: string,
    browserState: string,
    confirmationCode: string,
  ): void {
    if (
      typeof transactionId !== 'string' ||
      !transactionId ||
      typeof browserState !== 'string' ||
      !SECRET_PATTERN.test(browserState) ||
      typeof confirmationCode !== 'string' ||
      !CODE_PATTERN.test(confirmationCode)
    ) {
      throw new BadRequestException('Invalid login approval');
    }
  }

  private validateVerifiedIdentity(verified: VerifiedTelegramUser): void {
    if (
      !verified ||
      typeof verified !== 'object' ||
      typeof verified.telegramUserId !== 'string' ||
      !/^[1-9][0-9]*$/.test(verified.telegramUserId)
    ) {
      throw new BadRequestException('Invalid verified Telegram identity');
    }

    for (const field of [
      'firstName',
      'lastName',
      'username',
      'photoUrl',
    ] as const) {
      const value = verified[field];

      if (value !== null && typeof value !== 'string') {
        throw new BadRequestException('Invalid verified Telegram profile');
      }
    }
  }

  /**
   * Create a short-lived mobile login transaction.
   */
  async create(challengeHash: string) {
    if (
      typeof challengeHash !== 'string' ||
      !HASH_PATTERN.test(challengeHash)
    ) {
      throw new BadRequestException('Invalid login challenge hash');
    }

    const browserState = randomBytes(32).toString('base64url');

    const confirmationCode = randomInt(0, 1_000_000)
      .toString()
      .padStart(6, '0');

    const created = await this.prisma.mobileLoginTransaction.create({
      data: {
        challengeHash,
        browserStateHash: this.sha256(browserState),
        expiresAt: new Date(Date.now() + LOGIN_LIFETIME_MS),
      },
      select: {
        id: true,
      },
    });

    const confirmationCodeHash = this.hashConfirmationCode(
      created.id,
      confirmationCode,
    );

    const transaction = await this.prisma.mobileLoginTransaction.update({
      where: {
        id: created.id,
      },
      data: {
        confirmationCodeHash,
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });

    return {
      transactionId: transaction.id,
      expiresAt: transaction.expiresAt,
      browserState,
      confirmationCode,
    };
  }

  /**
   * Validate a confirmation code and atomically
   * count the attempt.
   *
   * Returns the attempt number so the OIDC flow
   * can bind its callback to this exact attempt.
   */
  async assertApprovalAvailable(
    transactionId: string,
    browserState: string,
    confirmationCode: string,
  ): Promise<number> {
    this.validateApprovalInput(transactionId, browserState, confirmationCode);

    const reserved = await this.reserveAttempt(
      transactionId,
      this.sha256(browserState),
    );

    const expected = this.hashConfirmationCode(transactionId, confirmationCode);

    if (!this.hashesMatch(reserved.confirmationCodeHash, expected)) {
      throw new UnauthorizedException('Invalid confirmation code');
    }

    return reserved.confirmationAttempts;
  }

  /**
   * Atomically count one confirmation attempt.
   *
   * Incorrect attempts remain counted because
   * this SQL operation commits independently.
   */
  private async reserveAttempt(
    transactionId: string,
    browserStateHash: string,
  ): Promise<ReservedAttempt> {
    const rows = await this.prisma.$queryRaw<ReservedAttempt[]>`
        UPDATE "MobileLoginTransaction"
        SET
          "confirmationAttempts" =
            "confirmationAttempts" + 1,
          "updatedAt" = NOW()
        WHERE
          "id" = ${transactionId}
          AND "browserStateHash" = ${browserStateHash}
          AND "status" = 'PENDING'
          AND "expiresAt" > NOW()
          AND "confirmationAttempts" <
            ${MAX_CONFIRMATION_ATTEMPTS}
          AND "confirmationCodeHash" IS NOT NULL
        RETURNING
          "confirmationAttempts",
          "confirmationCodeHash"
      `;

    const reserved = rows[0];

    if (!reserved) {
      throw new UnauthorizedException(
        'Login approval is invalid, expired, or locked',
      );
    }

    return reserved;
  }

  /**
   * Legacy Telegram signed-login approval.
   *
   * This method counts its own confirmation
   * attempt and protects against signature replay.
   */
  async approve(
    transactionId: string,
    browserState: string,
    verified: VerifiedTelegramUser,
    telegramSignature: string,
    confirmationCode: string,
  ): Promise<void> {
    this.validateApprovalInput(transactionId, browserState, confirmationCode);

    this.validateVerifiedIdentity(verified);

    if (
      typeof telegramSignature !== 'string' ||
      !SIGNATURE_PATTERN.test(telegramSignature)
    ) {
      throw new BadRequestException('Invalid Telegram signature');
    }

    const browserStateHash = this.sha256(browserState);

    const expectedCodeHash = this.hashConfirmationCode(
      transactionId,
      confirmationCode,
    );

    const payloadHash = this.sha256(telegramSignature.toLowerCase());

    const reserved = await this.reserveAttempt(transactionId, browserStateHash);

    if (!this.hashesMatch(reserved.confirmationCodeHash, expectedCodeHash)) {
      throw new UnauthorizedException('Invalid confirmation code');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.telegramLoginReplay.create({
          data: {
            payloadHash,
            transactionId,
            expiresAt: new Date(Date.now() + TELEGRAM_REPLAY_LIFETIME_MS),
          },
        });

        const user = await tx.user.upsert({
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
          select: {
            id: true,
          },
        });

        const approved = await tx.mobileLoginTransaction.updateMany({
          where: {
            id: transactionId,
            browserStateHash,
            status: 'PENDING',
            confirmationCodeHash: expectedCodeHash,
            confirmationAttempts: reserved.confirmationAttempts,
            expiresAt: {
              gt: new Date(),
            },
          },
          data: {
            status: 'APPROVED',
            userId: user.id,
            browserStateHash: null,
            confirmationCodeHash: null,
          },
        });

        if (approved.count !== 1) {
          throw new UnauthorizedException(
            'Login already approved, expired, or changed',
          );
        }
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Telegram login response has already been used',
        );
      }

      throw error;
    }
  }

  /**
   * Approve a Telegram OIDC login.
   *
   * The confirmation code was validated and
   * counted before redirecting to Telegram.
   *
   * The callback must present the same attempt
   * number recorded at authorization start.
   */
  async approveOidc(
    transactionId: string,
    browserState: string,
    verified: VerifiedTelegramUser,
    confirmationCode: string,
    validatedAttemptNumber: number,
  ): Promise<void> {
    this.validateApprovalInput(transactionId, browserState, confirmationCode);

    this.validateVerifiedIdentity(verified);

    if (
      !Number.isInteger(validatedAttemptNumber) ||
      validatedAttemptNumber < 1 ||
      validatedAttemptNumber > MAX_CONFIRMATION_ATTEMPTS
    ) {
      throw new UnauthorizedException('Invalid validated confirmation attempt');
    }

    const browserStateHash = this.sha256(browserState);

    const expectedCodeHash = this.hashConfirmationCode(
      transactionId,
      confirmationCode,
    );

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
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
        select: {
          id: true,
        },
      });

      const approved = await tx.mobileLoginTransaction.updateMany({
        where: {
          id: transactionId,
          browserStateHash,
          status: 'PENDING',
          confirmationCodeHash: expectedCodeHash,

          // Reject callbacks if another confirmation
          // attempt occurred after OIDC started.
          confirmationAttempts: validatedAttemptNumber,

          expiresAt: {
            gt: new Date(),
          },
        },
        data: {
          status: 'APPROVED',
          userId: user.id,
          browserStateHash: null,
          confirmationCodeHash: null,
        },
      });

      if (approved.count !== 1) {
        throw new UnauthorizedException(
          'Login already approved, expired, or changed',
        );
      }
    });
  }

  /**
   * Exchange the device-held challenge for
   * a session token exactly once.
   */
  async exchange(transactionId: string, challenge: string) {
    if (
      typeof transactionId !== 'string' ||
      !transactionId ||
      typeof challenge !== 'string' ||
      !SECRET_PATTERN.test(challenge)
    ) {
      throw new UnauthorizedException('Invalid login credentials');
    }

    const challengeHash = this.sha256(challenge);

    const token = randomBytes(32).toString('base64url');

    const tokenHash = this.sha256(token);

    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

    const user = await this.prisma.$transaction(async (tx) => {
      const login = await tx.mobileLoginTransaction.findFirst({
        where: {
          id: transactionId,
          challengeHash,
          status: 'APPROVED',
          expiresAt: {
            gt: new Date(),
          },
          userId: {
            not: null,
          },
        },
        select: {
          userId: true,
        },
      });

      if (!login?.userId) {
        throw new UnauthorizedException(
          'Login transaction is invalid or expired',
        );
      }

      const consumed = await tx.mobileLoginTransaction.updateMany({
        where: {
          id: transactionId,
          challengeHash,
          status: 'APPROVED',
          userId: login.userId,
          expiresAt: {
            gt: new Date(),
          },
        },
        data: {
          status: 'CONSUMED',
          consumedAt: new Date(),
        },
      });

      if (consumed.count !== 1) {
        throw new UnauthorizedException(
          'Login transaction has already been used',
        );
      }

      const verifiedUser = await tx.user.findUnique({
        where: {
          id: login.userId,
        },
        select: {
          id: true,
          telegramUserId: true,
          firstName: true,
          lastName: true,
          username: true,
          photoUrl: true,
        },
      });

      if (!verifiedUser) {
        throw new UnauthorizedException('Authenticated user no longer exists');
      }

      await tx.userSession.create({
        data: {
          userId: verifiedUser.id,
          tokenHash,
          expiresAt,
        },
      });

      return verifiedUser;
    });

    return {
      token,
      expiresAt,
      user,
    };
  }
}
