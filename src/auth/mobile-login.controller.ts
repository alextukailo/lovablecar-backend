import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateBy,
  ValidateNested,
} from 'class-validator';

import { MobileLoginService } from './mobile-login.service';
import { TelegramAuthService } from './telegram-auth.service';

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{10,100}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CONFIRMATION_CODE_PATTERN = /^[0-9]{6}$/;
const TELEGRAM_HASH_PATTERN = /^[a-fA-F0-9]{64}$/;

function IsTelegramInteger() {
  return ValidateBy({
    name: 'isTelegramInteger',
    validator: {
      validate(value: unknown): boolean {
        if (typeof value === 'number') {
          return Number.isSafeInteger(value) && value > 0;
        }

        if (typeof value === 'string') {
          return (
            /^[0-9]+$/.test(value) &&
            Number.isSafeInteger(Number(value)) &&
            Number(value) > 0
          );
        }

        return false;
      },

      defaultMessage(): string {
        return 'Must be a positive integer or numeric string';
      },
    },
  });
}

class StartMobileLoginDto {
  @IsString()
  @Matches(SHA256_HEX_PATTERN)
  challengeHash!: string;
}

class TelegramLoginDto {
  @IsDefined()
  @IsTelegramInteger()
  id!: number | string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  @IsDefined()
  @IsTelegramInteger()
  auth_date!: number | string;

  @IsString()
  @Matches(TELEGRAM_HASH_PATTERN)
  hash!: string;
}

class ApproveMobileLoginDto {
  @IsString()
  @Matches(TRANSACTION_ID_PATTERN)
  transactionId!: string;

  @IsString()
  @Matches(BASE64URL_PATTERN)
  browserState!: string;

  @IsString()
  @Matches(CONFIRMATION_CODE_PATTERN)
  confirmationCode!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => TelegramLoginDto)
  telegram!: TelegramLoginDto;
}

class ExchangeMobileLoginDto {
  @IsString()
  @Matches(TRANSACTION_ID_PATTERN)
  transactionId!: string;

  @IsString()
  @Matches(BASE64URL_PATTERN)
  challenge!: string;
}

@Controller('auth/mobile')
export class MobileLoginController {
  constructor(
    private readonly mobileLoginService: MobileLoginService,
    private readonly telegramAuthService: TelegramAuthService,
  ) {}

  /**
   * Create a short-lived mobile login transaction.
   *
   * The device retains the original challenge.
   * Only its SHA-256 hash is sent to the backend.
   */
  @Post('start')
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  async start(@Body() body: StartMobileLoginDto) {
    return this.mobileLoginService.create(body.challengeHash);
  }

  /**
   * Approve a mobile login transaction.
   *
   * 1. Check transaction availability.
   * 2. Verify Telegram's signed payload.
   * 3. Reserve a confirmation-code attempt.
   * 4. Atomically reserve the Telegram signature,
   *    upsert the user, and approve the transaction.
   *
   * The browser never receives a session token.
   */
  @Post('approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  async approve(@Body() body: ApproveMobileLoginDto): Promise<void> {
    await this.mobileLoginService.assertApprovalAvailable(
      body.transactionId,
      body.browserState,
      body.confirmationCode,
    );

    /*
     * Telegram signature verification is read-only.
     * Invalid signatures cannot create or modify users.
     */
    const verified = this.telegramAuthService.verifyTelegramPayload(
      body.telegram,
    );

    /*
     * The service handles confirmation attempts,
     * replay protection, user upsert, and approval.
     */
    await this.mobileLoginService.approve(
      body.transactionId,
      body.browserState,
      verified,
      body.telegram.hash,
      body.confirmationCode,
    );
  }

  /**
   * Exchange the device-held challenge for a session.
   *
   * The challenge is never placed in a URL.
   * The service enforces one-time exchange.
   */
  @Post('exchange')
  @Throttle({
    default: {
      limit: 10,
      ttl: 60_000,
    },
  })
  async exchange(@Body() body: ExchangeMobileLoginDto) {
    return this.mobileLoginService.exchange(body.transactionId, body.challenge);
  }
}
