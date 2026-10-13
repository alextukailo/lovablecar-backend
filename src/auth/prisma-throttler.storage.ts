import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

type CounterRow = {
  count: number;
  expiresAt: Date;
};

@Injectable()
export class PrismaThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly prisma: PrismaService) {}

  private hashKey(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (
      !Number.isFinite(ttl) ||
      ttl <= 0 ||
      !Number.isFinite(limit) ||
      limit < 1
    ) {
      throw new Error('Invalid rate-limiter configuration');
    }

    /*
     * This adapter implements fixed-window limits.
     *
     * It does not support a separate block duration.
     * Reject incompatible configuration rather than
     * silently applying incorrect security behavior.
     */
    if (blockDuration > 0 && blockDuration !== ttl) {
      throw new Error(
        'Custom blockDuration is not supported by PostgreSQL rate limiter',
      );
    }

    const keyHash = this.hashKey(`${throttlerName}:${key}`);

    const expiresAt = new Date(Date.now() + ttl);

    /*
     * Atomic PostgreSQL upsert:
     *
     * - New window: count = 1.
     * - Active window: increment count.
     * - Expired window: reset count to 1.
     *
     * Concurrent requests cannot overwrite each
     * other's counters.
     */
    const rows = await this.prisma.$queryRaw<CounterRow[]>`
      INSERT INTO "RateLimitCounter" (
        "id",
        "keyHash",
        "count",
        "expiresAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${keyHash},
        1,
        ${expiresAt},
        NOW(),
        NOW()
      )
      ON CONFLICT ("keyHash")
      DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitCounter"."expiresAt" <= NOW()
            THEN 1
          ELSE "RateLimitCounter"."count" + 1
        END,
        "expiresAt" = CASE
          WHEN "RateLimitCounter"."expiresAt" <= NOW()
            THEN EXCLUDED."expiresAt"
          ELSE "RateLimitCounter"."expiresAt"
        END,
        "updatedAt" = NOW()
      RETURNING
        "count",
        "expiresAt"
    `;

    const row = rows[0];

    if (!row) {
      throw new Error('Rate-limit counter update returned no row');
    }

    const totalHits = Number(row.count);

    /*
     * The fixed window blocks the sixth request
     * when limit = 5.
     *
     * Blocked requests continue increasing count,
     * but they do not extend the expiry.
     */
    const isBlocked = totalHits > limit;

    const remainingSeconds = Math.max(
      0,
      Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000),
    );

    return {
      totalHits,
      timeToExpire: remainingSeconds,
      isBlocked,
      timeToBlockExpire: isBlocked ? remainingSeconds : 0,
    };
  }
}
