import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { MileageController } from './mileage.controller';
import { MileageService } from './mileage.service';
@Module({ imports: [TelegramModule], controllers: [MileageController], providers: [MileageService], exports: [MileageService] })
export class MileageModule {}
