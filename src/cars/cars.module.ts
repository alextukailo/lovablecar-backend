
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SessionAuthGuard } from '../auth/session-auth.guard';

import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';

@Module({
  imports: [AuthModule],
  controllers: [CarsController],
  providers: [CarsService, SessionAuthGuard],
})
export class CarsModule {}
