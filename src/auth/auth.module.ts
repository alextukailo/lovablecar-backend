import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { TelegramAuthService } from './telegram-auth.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [TelegramAuthService],
  exports: [TelegramAuthService],
})
export class AuthModule {}
