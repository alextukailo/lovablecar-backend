import { Module, forwardRef } from '@nestjs/common';

import { TelegramModule } from '../telegram/telegram.module';
import { MileageController } from './mileage.controller';
import { MileageService } from './mileage.service';

@Module({
  imports: [forwardRef(() => TelegramModule)],
  controllers: [MileageController],
  providers: [MileageService],
  exports: [MileageService],
})
export class MileageModule {}
