/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
   * 1. Validate the browser proof and confirmation code.
   * 2. Atomically count the confirmation attempt.
   * 3. Generate OAuth state, PKCE verifier, and nonce.
   * 4. Store encrypted proof and attempt number.
   * 5. Return Telegram's authorization URL.
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

    /*
     * Count and validate the six-digit code.
     * Store the exact reserved attempt number.
     */
    const validatedAttemptNumber =
      await this.mobileLogin.assertApprovalAvailable(
        transactionId,
        browserState,
        confirmationCode,
      );

    /*
     * Generate OAuth state, PKCE, and nonce.
     */
    const request = this.oidc.createAuthorizationRequest();

    /*
     * Store one short-lived OIDC attempt.
     * Sensitive proof values are encrypted at rest.
     */
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
   * - Exchanges the authorization code using PKCE.
   * - Verifies Telegram's signed ID token and nonce.
   * - Restores the encrypted browser proof.
   * - Approves the mobile transaction only if
   *   the original confirmation attempt is current.
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

    /*
     * Look up the OIDC attempt by the hashed state.
     * Never use the OAuth state as a database ID.
     */
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

    /*
     * Atomically consume the state before processing
     * either an OAuth error or an authorization code.
     */
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

    /*
     * Handle an authorization refusal without
     * exposing Telegram's raw error details.
     */
    if (typeof oauthError === 'string' && oauthError) {
      response
        .status(400)
        .type('text/plain')
        .send(
          'Telegram login was cancelled or declined. Return to LovableCar and try again.',
        );
      return;
    }

    if (typeof code !== 'string' || !code) {
      throw new BadRequestException('Missing Telegram authorization code');
    }

    /*
     * Verify the original confirmation attempt.
     */
    if (
      attempt.validatedAttemptNumber === null ||
      !Number.isInteger(attempt.validatedAttemptNumber)
    ) {
      throw new UnauthorizedException('Missing validated confirmation attempt');
    }

    if (!attempt.browserStateEncrypted || !attempt.confirmationCodeEncrypted) {
      throw new UnauthorizedException('Missing login confirmation proof');
    }

    /*
     * Exchange Telegram's authorization code
     * using the stored PKCE verifier.
     */
    const idToken = await this.oidc.exchangeCode(code, attempt.codeVerifier);

    /*
     * Verify Telegram's ID token signature,
     * issuer, audience, expiry, and nonce.
     */
    const verified = await this.oidc.verifyIdToken(idToken, attempt.nonce);

    /*
     * Restore the original browser proof.
     * These values were never included in the
     * Telegram authorization URL.
     */
    const browserState = decryptOidcProof(attempt.browserStateEncrypted);

    const confirmationCode = decryptOidcProof(
      attempt.confirmationCodeEncrypted,
    );

    /*
     * Approve only if the confirmation-attempt
     * counter still matches the value recorded
     * before the Telegram redirect.
     */
    await this.mobileLogin.approveOidc(
      attempt.transactionId,
      browserState,
      verified,
      confirmationCode,
      attempt.validatedAttemptNumber,
    );

    /*
     * Never return a mobile session token
     * to the browser.
     */
    response
      .status(200)
      .type('text/plain')
      .send('Login approved. Return to LovableCar to continue.');
  }
}
