import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';
import { MaintenanceNotificationWorker } from './maintenance-notification.worker';

const now = new Date('2026-10-15T12:00:00.000Z');

const baseSchedule = {
  id: 'schedule-1',
  enabled: true,
  type: 'OIL_CHANGE',
  customTitle: null,
  lastServiceDate: null,
  lastServiceMileage: null,
  nextDueDate: new Date('2026-10-17T12:00:00.000Z'),
  nextDueMileage: null,
  warningDays: 7,
  warningKm: 500,
  car: {
    make: 'Honda',
    model: 'Civic',
    mileage: 50000,
    owner: {
      telegramConnection: {
        chatId: '123',
      },
    },
  },
};

type AsyncMock<T> = jest.Mock<(...args: unknown[]) => Promise<T>>;

type MaintenanceScheduleMock = {
  findMany: AsyncMock<unknown[]>;
};

type MaintenanceNotificationMock = {
  findUnique: AsyncMock<unknown>;
  create: AsyncMock<unknown>;
  updateMany: AsyncMock<{ count: number }>;
};

type PrismaMock = {
  maintenanceSchedule: MaintenanceScheduleMock;
  maintenanceNotification: MaintenanceNotificationMock;
};

type TelegramMock = {
  sendMaintenanceReminder: AsyncMock<void>;
};

describe('MaintenanceNotificationWorker', () => {
  let prisma: PrismaMock;
  let telegram: TelegramMock;
  let worker: MaintenanceNotificationWorker;

  beforeEach(() => {
    prisma = {
      maintenanceSchedule: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown[]>>()
          .mockResolvedValue([baseSchedule]),
      },

      maintenanceNotification: {
        findUnique: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue(null),

        create: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue({}),

        updateMany: jest
          .fn<(...args: unknown[]) => Promise<{ count: number }>>()
          .mockResolvedValue({ count: 1 }),
      },
    };

    telegram = {
      sendMaintenanceReminder: jest
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockResolvedValue(undefined),
    };

    const config = {
      get: jest.fn<() => string | undefined>(),
    };

    worker = new MaintenanceNotificationWorker(
      prisma as unknown as PrismaService,
      telegram as unknown as TelegramService,
      config as unknown as ConfigService,
    );
  });

  it('sends upcoming reminder and records delivery', async () => {
    await worker.run(now);

    expect(telegram.sendMaintenanceReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'UPCOMING',
        chatId: '123',
      }),
    );

    expect(prisma.maintenanceNotification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sentAt: expect.any(Date),
        }),
      }),
    );
  });

  it('does not resend delivered reminders', async () => {
    prisma.maintenanceNotification.findUnique.mockResolvedValue({
      sentAt: now,
    });

    await worker.run(now);

    expect(telegram.sendMaintenanceReminder).not.toHaveBeenCalled();
  });

  it('does not steal active leases', async () => {
    prisma.maintenanceNotification.findUnique.mockResolvedValue({
      sentAt: null,
      error: null,
      createdAt: now,
    });

    await worker.run(now);

    expect(telegram.sendMaintenanceReminder).not.toHaveBeenCalled();
  });

  it('reclaims expired leases across workers', async () => {
    prisma.maintenanceNotification.findUnique.mockResolvedValue({
      id: 'claim-1',
      sentAt: null,
      error: null,
      createdAt: new Date(now.getTime() - 11 * 60_000),
    });

    await worker.run(now);

    expect(prisma.maintenanceNotification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdAt: now,
        }),
      }),
    );

    expect(telegram.sendMaintenanceReminder).toHaveBeenCalledTimes(1);
  });

  it('retries failed delivery after backoff', async () => {
    prisma.maintenanceNotification.findUnique.mockResolvedValue({
      id: 'claim-1',
      sentAt: null,
      error: 'network',
      createdAt: new Date(now.getTime() - 6 * 60_000),
    });

    await worker.run(now);

    expect(telegram.sendMaintenanceReminder).toHaveBeenCalledTimes(1);
  });

  it('records failure without marking delivered', async () => {
    telegram.sendMaintenanceReminder.mockRejectedValue(
      new Error('Telegram unavailable'),
    );

    await worker.run(now);

    expect(prisma.maintenanceNotification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          error: 'Telegram unavailable',
        },
      }),
    );

    expect(prisma.maintenanceNotification.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sentAt: expect.any(Date),
        }),
      }),
    );
  });

  it('does not notify when outside the warning window', async () => {
    prisma.maintenanceSchedule.findMany.mockResolvedValue([
      {
        ...baseSchedule,
        nextDueDate: new Date('2026-12-01T12:00:00.000Z'),
      },
    ]);

    await worker.run(now);

    expect(telegram.sendMaintenanceReminder).not.toHaveBeenCalled();
  });

  it('does not notify when the connection is absent', async () => {
    prisma.maintenanceSchedule.findMany.mockResolvedValue([
      {
        ...baseSchedule,
        car: {
          ...baseSchedule.car,
          owner: {
            telegramConnection: null,
          },
        },
      },
    ]);

    await worker.run(now);

    expect(telegram.sendMaintenanceReminder).not.toHaveBeenCalled();
  });
});
