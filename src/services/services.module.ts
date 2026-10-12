import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SessionAuthGuard } from '../auth/session-auth.guard';

import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [AuthModule],
  controllers: [ServicesController],
  providers: [ServicesService, SessionAuthGuard],
})
export class ServicesModule {}
