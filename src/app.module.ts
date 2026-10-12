
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { CarsModule } from './cars/cars.module';
import { ServicesModule } from './services/services.module';
import { MaintenanceModule } from './maintenance/maintenance.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    CarsModule,
    ServicesModule,
    MaintenanceModule,
  ],
})
export class AppModule {}
