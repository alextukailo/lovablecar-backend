import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { MobileLoginService } from './mobile-login.service';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramOidcService } from './telegram-oidc.service';

import { AuthController } from './auth.controller';
import { MobileLoginController } from './mobile-login.controller';
import { MobileLoginPageController } from './mobile-login-page.controller';
import { TelegramOidcController } from './telegram-oidc.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    AuthController,
    MobileLoginController,
    MobileLoginPageController,
    TelegramOidcController,
  ],
  providers: [TelegramAuthService, TelegramOidcService, MobileLoginService],
  exports: [TelegramAuthService, MobileLoginService],
})
export class AuthModule {}
