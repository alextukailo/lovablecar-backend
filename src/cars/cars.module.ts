import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SessionAuthGuard } from '../auth/session-auth.guard';

import { AttachmentsStorage } from '../attachments/attachments.storage';

import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { CarPhotoService } from './car-photo.service';

@Module({
  imports: [AuthModule],
  controllers: [CarsController],
  providers: [
    CarsService,
    CarPhotoService,
    AttachmentsStorage,
    SessionAuthGuard,
  ],
})
export class CarsModule {}
