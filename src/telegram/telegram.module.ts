import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { TelegramController } from './telegram.controller';
import { TelegramLinkController } from './telegram-link.controller';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramService } from './telegram.service';

import { MaintenanceNotificationWorker } from './maintenance-notification.worker';
import { MaintenanceNotificationDevController } from './maintenance-notification-dev.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    TelegramController,
    TelegramLinkController,
    MaintenanceNotificationDevController,
  ],
  providers: [
    TelegramService,
    TelegramLinkService,
    MaintenanceNotificationWorker,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
