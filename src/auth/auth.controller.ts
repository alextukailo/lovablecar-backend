/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';

import { TelegramAuthService } from './telegram-auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly telegramAuthService: TelegramAuthService) {}

  private getBearerToken(authorization: string | undefined): string {
    if (!authorization) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);

    if (!match) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    return match[1];
  }

  /**
   * Legacy direct Telegram login is disabled.
   *
   * A signed Telegram Login Widget response
   * must not create a session directly.
   *
   * Mobile clients must use the transaction-based
   * browser login flow instead.
   */
  @Post('telegram')
  @HttpCode(HttpStatus.GONE)
  legacyTelegramLogin(): {
    message: string;
  } {
    return {
      message: 'Direct Telegram login is disabled. Use the mobile login flow.',
    };
  }

  /**
   * Return the user associated with an existing
   * valid backend session.
   */
  @Get('me')
  async getCurrentUser(
    @Headers('authorization')
    authorization?: string,
  ) {
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
   * Revoke the current backend session.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Headers('authorization')
    authorization?: string,
  ): Promise<void> {
    const token = this.getBearerToken(authorization);

    await this.telegramAuthService.verifySession(token);

    await this.telegramAuthService.logout(token);
  }
}
