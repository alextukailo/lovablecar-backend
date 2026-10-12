import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';

import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, SessionAuthGuard],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
