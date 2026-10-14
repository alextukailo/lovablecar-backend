import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';

import { AppModule } from './app.module';

import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
  );

  const allowedOrigins = [
    'https://lovablecar-backend.vercel.app',

    // local development
    'http://localhost:3000',
    'http://localhost:8081',
    'http://localhost:19006',
  ];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      /*
       * Native mobile apps and server-to-server
       * requests do not send Origin.
       */
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS origin not allowed: ${origin}`), false);
    },

    credentials: true,

    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT || 3000, '0.0.0.0');
}

bootstrap();
