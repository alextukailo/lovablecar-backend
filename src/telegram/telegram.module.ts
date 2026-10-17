import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MileageModule } from '../mileage/mileage.module';

import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramLinkController } from './telegram-link.controller';

@Module({
  imports: [AuthModule, forwardRef(() => MileageModule)],

  controllers: [TelegramController, TelegramLinkController],

  providers: [TelegramService, TelegramLinkService],

  exports: [TelegramService, TelegramLinkService],
})
export class TelegramModule {}
