import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';

import {
  CustomNotificationsController,
  CustomNotificationsCronController,
} from './custom-notifications.controller';

import { CustomNotificationsService } from './custom-notifications.service';

@Module({
  imports: [PrismaModule, AuthModule, TelegramModule],
  controllers: [
    CustomNotificationsController,
    CustomNotificationsCronController,
  ],
  providers: [CustomNotificationsService],
})
export class CustomNotificationsModule {}
