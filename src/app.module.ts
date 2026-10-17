import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

import { CarsModule } from './cars/cars.module';
import { ServicesModule } from './services/services.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { AuthModule } from './auth/auth.module';
import { TelegramModule } from './telegram/telegram.module';
import { MileageModule } from './mileage/mileage.module';

import { PrismaThrottlerStorage } from './auth/prisma-throttler.storage';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,

    ThrottlerModule.forRootAsync({
      imports: [PrismaModule],
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: 100,
          },
        ],
        storage: new PrismaThrottlerStorage(prisma),
      }),
    }),

    CarsModule,
    ServicesModule,
    MaintenanceModule,
    AuthModule,
    TelegramModule,
    MileageModule,
  ],

  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
