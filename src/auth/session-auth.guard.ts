/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

import { TelegramAuthService } from './telegram-auth.service';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    telegramUserId: string;
  };
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly telegramAuthService: TelegramAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Authentication required');
    }

    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);

    if (!match) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    const token = match[1];

    const user = await this.telegramAuthService.verifySession(token);

    request.user = {
      id: user.id,
      telegramUserId: user.telegramUserId,
    };

    return true;
  }
}
