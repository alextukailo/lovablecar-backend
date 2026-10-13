import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { MobileLoginService } from './mobile-login.service';
import { TelegramAuthService } from './telegram-auth.service';

import { AuthController } from './auth.controller';
import { MobileLoginController } from './mobile-login.controller';
import { MobileLoginPageController } from './mobile-login-page.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    AuthController,
    MobileLoginController,
    MobileLoginPageController,
  ],
  providers: [TelegramAuthService, MobileLoginService],
  exports: [TelegramAuthService, MobileLoginService],
})
export class AuthModule {}
