/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import type { Response } from 'express';

import { PrismaService } from '../prisma/prisma.service';
import { TelegramOidcService } from './telegram-oidc.service';
import { MobileLoginService } from './mobile-login.service';
import { encryptOidcProof, decryptOidcProof } from './oidc-proof-crypto';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{10,100}$/;
const BROWSER_STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CONFIRMATION_CODE_PATTERN = /^[0-9]{6}$/;

const MOBILE_CALLBACK_SCHEME = 'lovablecarmobile://auth/callback';

function createMobileCallbackUrl(
  transactionId: string,
  browserState: string,
  error?: string,
): string {
  const callback = new URL(MOBILE_CALLBACK_SCHEME);

  callback.searchParams.set('transactionId', transactionId);

  callback.searchParams.set('state', browserState);

  if (error) {
    callback.searchParams.set('error', error);
  }

  return callback.toString();
}

@Controller('auth/telegram')
export class TelegramOidcController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oidc: TelegramOidcService,
    private readonly mobileLogin: MobileLoginService,
  ) {}

  /**
   * Start Telegram OIDC authorization.
   *
   * 1. Validate browser proof and confirmation code.
   * 2. Atomically count the confirmation attempt.
   * 3. Generate OAuth state, PKCE verifier and nonce.
   * 4. Store encrypted proof and attempt number.
   * 5. Return Telegram authorization URL.
   */
  @Post('start')
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  async start(
    @Body()
    body: {
      transactionId: string;
      browserState: string;
      confirmationCode: string;
    },
  ) {
    const { transactionId, browserState, confirmationCode } = body ?? {};

    if (
      typeof transactionId !== 'string' ||
      !TRANSACTION_ID_PATTERN.test(transactionId) ||
      typeof browserState !== 'string' ||
      !BROWSER_STATE_PATTERN.test(browserState) ||
      typeof confirmationCode !== 'string' ||
      !CONFIRMATION_CODE_PATTERN.test(confirmationCode)
    ) {
      throw new BadRequestException('Invalid Telegram login request');
    }

    const validatedAttemptNumber =
      await this.mobileLogin.assertApprovalAvailable(
        transactionId,
        browserState,
        confirmationCode,
      );

    const request = this.oidc.createAuthorizationRequest();

    await this.prisma.telegramOidcAttempt.create({
      data: {
        transactionId,
        stateHash: sha256(request.state),
        codeVerifier: request.codeVerifier,
        nonce: request.nonce,

        validatedAttemptNumber,

        browserStateEncrypted: encryptOidcProof(browserState),

        confirmationCodeEncrypted: encryptOidcProof(confirmationCode),

        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return {
      authorizationUrl: request.authorizationUrl,
    };
  }

  /**
   * Telegram OAuth callback.
   *
   * The callback:
   * - Validates and consumes OAuth state.
   * - Exchanges authorization code using PKCE.
   * - Verifies Telegram's signed ID token and nonce.
   * - Restores encrypted browser proof.
   * - Approves the mobile transaction.
   * - Redirects to the LovableCar app.
   */
  @Get('callback')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Content-Type-Options', 'nosniff')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oauthError: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    if (typeof state !== 'string' || !BROWSER_STATE_PATTERN.test(state)) {
      throw new BadRequestException('Invalid Telegram authorization state');
    }

    const attempt = await this.prisma.telegramOidcAttempt.findFirst({
      where: {
        stateHash: sha256(state),
        consumedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!attempt) {
      throw new UnauthorizedException(
        'Telegram authorization expired or already used',
      );
    }

    const consumed = await this.prisma.telegramOidcAttempt.updateMany({
      where: {
        id: attempt.id,
        consumedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        consumedAt: new Date(),
      },
    });

    if (consumed.count !== 1) {
      throw new UnauthorizedException('Telegram authorization already used');
    }

    if (!attempt.browserStateEncrypted || !attempt.confirmationCodeEncrypted) {
      throw new UnauthorizedException('Missing login confirmation proof');
    }

    const browserState = decryptOidcProof(attempt.browserStateEncrypted);

    if (!BROWSER_STATE_PATTERN.test(browserState)) {
      throw new UnauthorizedException('Invalid mobile login state');
    }

    /*
     * Handle Telegram authorization refusal.
     * Return to LovableCar with a non-sensitive error.
     */
    if (typeof oauthError === 'string' && oauthError) {
      response.redirect(
        302,
        createMobileCallbackUrl(
          attempt.transactionId,
          browserState,
          'telegram_denied',
        ),
      );

      return;
    }

    if (typeof code !== 'string' || !code) {
      throw new BadRequestException('Missing Telegram authorization code');
    }

    if (
      attempt.validatedAttemptNumber === null ||
      !Number.isInteger(attempt.validatedAttemptNumber)
    ) {
      throw new UnauthorizedException('Missing validated confirmation attempt');
    }

    /*
     * Restore original confirmation proof.
     */
    const confirmationCode = decryptOidcProof(
      attempt.confirmationCodeEncrypted,
    );

    if (!CONFIRMATION_CODE_PATTERN.test(confirmationCode)) {
      throw new UnauthorizedException('Invalid confirmation proof');
    }

    /*
     * Exchange Telegram authorization code
     * using the stored PKCE verifier.
     */
    const idToken = await this.oidc.exchangeCode(code, attempt.codeVerifier);

    /*
     * Verify ID token signature, issuer,
     * audience, expiration and nonce.
     */
    const verified = await this.oidc.verifyIdToken(idToken, attempt.nonce);

    /*
     * Approve only if the original confirmation
     * attempt is still valid.
     */
    await this.mobileLogin.approveOidc(
      attempt.transactionId,
      browserState,
      verified,
      confirmationCode,
      attempt.validatedAttemptNumber,
    );

    /*
     * Redirect to LovableCar.
     *
     * IMPORTANT:
     * Never include a session token, PKCE verifier
     * or Telegram ID token in this URL.
     */
    response.redirect(
      302,
      createMobileCallbackUrl(attempt.transactionId, browserState),
    );
  }
}
