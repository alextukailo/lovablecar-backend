/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { createHash, randomBytes } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';

import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { MobileLoginService } from './mobile-login.service';
import { PrismaThrottlerStorage } from './prisma-throttler.storage';
import type { VerifiedTelegramUser } from './telegram-auth.service';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function numericTelegramId(): string {
  return BigInt(`0x${randomBytes(16).toString('hex')}`).toString();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`SECURITY FAILURE: ${message}`);
  }
}

async function main(): Promise<void> {
  let app: INestApplication | null = null;

  const transactionIds: string[] = [];
  const telegramId = numericTelegramId();

  try {
    app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn'],
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.listen(0, '127.0.0.1');

    const prisma = app.get(PrismaService);
    const mobileLogin = app.get(MobileLoginService);
    const storage = new PrismaThrottlerStorage(prisma);

    const verified: VerifiedTelegramUser = {
      telegramUserId: telegramId,
      firstName: 'Lockout Test',
      lastName: null,
      username: null,
      photoUrl: null,
    };

    /*
     * PART 1
     * Confirmation-code lockout at service level.
     *
     * Calling the service directly isolates the
     * five-attempt rule from HTTP throttling.
     */
    const login = await mobileLogin.create(
      sha256(randomBytes(32).toString('base64url')),
    );

    transactionIds.push(login.transactionId);

    const wrongCode = login.confirmationCode === '000000' ? '999999' : '000000';

    for (let attempt = 1; attempt <= 5; attempt++) {
      let rejected = false;

      try {
        await mobileLogin.approve(
          login.transactionId,
          login.browserState,
          verified,
          randomBytes(32).toString('hex'),
          wrongCode,
        );
      } catch {
        rejected = true;
      }

      assert(rejected, `wrong confirmation attempt ${attempt} accepted`);

      const transaction = await prisma.mobileLoginTransaction.findUnique({
        where: {
          id: login.transactionId,
        },
        select: {
          confirmationAttempts: true,
          status: true,
        },
      });

      assert(
        transaction?.confirmationAttempts === attempt,
        `attempt counter should be ${attempt}`,
      );

      assert(
        transaction.status === 'PENDING',
        'wrong code approved the transaction',
      );
    }

    console.log('PASS: five incorrect codes counted atomically');

    /*
     * Even the correct code must fail once
     * the transaction is locked.
     */
    let lockedRejected = false;

    try {
      await mobileLogin.approve(
        login.transactionId,
        login.browserState,
        verified,
        randomBytes(32).toString('hex'),
        login.confirmationCode,
      );
    } catch {
      lockedRejected = true;
    }

    assert(lockedRejected, 'correct code bypassed five-attempt lockout');

    const locked = await prisma.mobileLoginTransaction.findUnique({
      where: {
        id: login.transactionId,
      },
      select: {
        confirmationAttempts: true,
        status: true,
        userId: true,
      },
    });

    assert(
      locked?.confirmationAttempts === 5 &&
        locked.status === 'PENDING' &&
        locked.userId === null,
      'locked transaction changed unexpectedly',
    );

    console.log('PASS: correct code rejected after lockout');

    /*
     * PART 2
     * PostgreSQL rate-limiter concurrency.
     *
     * Use a unique key so existing development
     * traffic cannot affect the result.
     */
    const rateLimitKey = `local-security-${randomBytes(16).toString('hex')}`;

    const throttlerName = `local-test-${randomBytes(8).toString('hex')}`;

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        storage.increment(rateLimitKey, 60_000, 5, 60_000, throttlerName),
      ),
    );

    const allowed = results.filter((result) => !result.isBlocked);

    const blocked = results.filter((result) => result.isBlocked);

    assert(allowed.length === 5, `expected 5 allowed, got ${allowed.length}`);

    assert(blocked.length === 15, `expected 15 blocked, got ${blocked.length}`);

    const hitCounts = results
      .map((result) => result.totalHits)
      .sort((a, b) => a - b);

    assert(
      hitCounts.every((count, index) => count === index + 1),
      'concurrent requests lost counter updates',
    );

    console.log('PASS: 20 concurrent increments preserved');

    console.log('PASS: exactly five requests allowed');

    console.log('PASS: remaining fifteen requests blocked');

    /*
     * PART 3
     * HTTP guard enforcement.
     *
     * Start endpoint has a five-request limit.
     * Six rapid requests should produce HTTP 429.
     */
    const address = app.getHttpServer().address() as {
      port: number;
    };

    const baseUrl = `http://127.0.0.1:${address.port}`;

    const httpStatuses: number[] = [];

    for (let i = 0; i < 6; i++) {
      const challenge = randomBytes(32).toString('base64url');

      const response = await fetch(`${baseUrl}/auth/mobile/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          challengeHash: sha256(challenge),
        }),
      });

      httpStatuses.push(response.status);

      if (response.status === 201) {
        const json: unknown = await response.json();

        const body =
          typeof json === 'object' && json !== null
            ? (json as { transactionId?: unknown })
            : {};

        const transactionId =
          typeof body.transactionId === 'string'
            ? body.transactionId
            : undefined;

        if (transactionId) {
          transactionIds.push(transactionId);
        }

        if (body.transactionId) {
          transactionIds.push(body.transactionId as string);
        }
      } else {
        await response.text();
      }
    }

    assert(
      httpStatuses.includes(429),
      `HTTP throttling never returned 429: ${httpStatuses.join(', ')}`,
    );

    console.log('PASS: HTTP throttling returned 429');

    /*
     * PART 4
     * Runtime DTO validation.
     */
    const invalidPayload = await fetch(`${baseUrl}/auth/mobile/exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactionId: 'bad',
        challenge: 'bad',
        unexpectedField: 'should fail',
      }),
    });

    assert(
      invalidPayload.status === 400,
      `invalid DTO returned ${invalidPayload.status}`,
    );

    console.log('PASS: runtime DTO validation rejected malformed payload');

    assert(
      invalidPayload.status === 400,
      `invalid DTO returned ${invalidPayload.status}`,
    );

    console.log('PASS: runtime DTO validation rejected malformed payload');

    /*
     * No synthetic user should have been created
     * by rejected confirmation attempts.
     */
    const unexpectedUser = await prisma.user.findUnique({
      where: {
        telegramUserId: telegramId,
      },
    });

    assert(unexpectedUser === null, 'rejected approvals created a user');

    console.log('PASS: rejected attempts created no user');

    console.log('PASS: lockout and rate-limiting security checks');
  } finally {
    if (app) {
      const prisma = app.get(PrismaService);

      try {
        if (transactionIds.length > 0) {
          await prisma.telegramLoginReplay.deleteMany({
            where: {
              transactionId: {
                in: transactionIds,
              },
            },
          });

          await prisma.mobileLoginTransaction.deleteMany({
            where: {
              id: {
                in: transactionIds,
              },
            },
          });
        }

        console.log('Test login transactions cleaned up');
      } finally {
        await app.close();
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
