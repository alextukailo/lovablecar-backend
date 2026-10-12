import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { CarsModule } from './cars/cars.module';
import { ServicesModule } from './services/services.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { AuthModule } from './auth/auth.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    CarsModule,
    ServicesModule,
    MaintenanceModule,
    AuthModule,
    TelegramModule,
  ],
})
export class AppModule {}
