/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';

import {
  TelegramAuthService,
  type TelegramLoginPayload,
} from './telegram-auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly telegramAuthService: TelegramAuthService) {}

  private getBearerToken(authorization: string | undefined): string {
    if (!authorization) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(authorization);

    if (!match) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    return match[1];
  }

  /**
   * Accepts a signed Telegram Login Widget payload.
   *
   * This is NOT Telegram Mini App initData or
   * Telegram OIDC authorization-code data.
   *
   * Do not expose this route publicly until the
   * browser login flow, validation, replay protection,
   * and rate limiting are completed.
   */
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  async loginWithTelegram(@Body() payload: TelegramLoginPayload) {
    return this.telegramAuthService.login(payload);
  }

  /**
   * Returns the user associated with a valid session.
   */
  @Get('me')
  async getCurrentUser(@Headers('authorization') authorization?: string) {
    const token = this.getBearerToken(authorization);

    const user = await this.telegramAuthService.verifySession(token);

    return {
      id: user.id,
      telegramUserId: user.telegramUserId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      photoUrl: user.photoUrl,
    };
  }

  /**
   * Revokes the current session.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    const token = this.getBearerToken(authorization);

    await this.telegramAuthService.verifySession(token);
    await this.telegramAuthService.logout(token);
  }
}
