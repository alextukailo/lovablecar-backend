import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MaintenanceNotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';

const DAY_MS = 86_400_000;
const LEASE_MS = 10 * 60_000;
const RETRY_MS = 5 * 60_000;

@Injectable()
export class MaintenanceNotificationWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MaintenanceNotificationWorker.name);

  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (
      this.config.get<string>('MAINTENANCE_NOTIFICATIONS_ENABLED') === 'false'
    ) {
      return;
    }

    const minutes = Number(
      this.config.get<string>('MAINTENANCE_NOTIFICATION_INTERVAL_MINUTES') ??
        '60',
    );

    const interval =
      Number.isFinite(minutes) && minutes >= 1 ? minutes * 60_000 : 3_600_000;

    this.timer = setInterval(() => void this.run(), interval);

    void this.run();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async run(now = new Date()): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const schedules = await this.prisma.maintenanceSchedule.findMany({
        where: {
          enabled: true,
          car: {
            owner: {
              telegramConnection: {
                is: {
                  notificationsEnabled: true,
                },
              },
            },
          },
        },
        include: {
          car: {
            include: {
              owner: {
                include: {
                  telegramConnection: true,
                },
              },
            },
          },
        },
      });

      for (const schedule of schedules) {
        const chatId = schedule.car.owner?.telegramConnection?.chatId;

        if (!chatId) {
          continue;
        }

        const days = schedule.nextDueDate
          ? Math.ceil((schedule.nextDueDate.getTime() - now.getTime()) / DAY_MS)
          : null;

        const km =
          schedule.nextDueMileage === null
            ? null
            : schedule.nextDueMileage - schedule.car.mileage;

        const overdue = days !== null && days < 0;

        const due = (days !== null && days === 0) || (km !== null && km <= 0);

        const upcoming =
          (days !== null && days > 0 && days <= schedule.warningDays) ||
          (km !== null && km > 0 && km <= schedule.warningKm);

        const type: MaintenanceNotificationType | null = overdue
          ? 'OVERDUE'
          : due
            ? 'DUE'
            : upcoming
              ? 'UPCOMING'
              : null;

        if (!type) {
          continue;
        }

        // A cycle changes when the last completion
        // changes its service baseline.
        const cycleKey = [
          schedule.lastServiceDate?.toISOString() ?? '',
          schedule.lastServiceMileage ?? '',
          schedule.nextDueDate?.toISOString() ?? '',
          schedule.nextDueMileage ?? '',
        ].join('|');

        const key = {
          maintenanceScheduleId_cycleKey_type: {
            maintenanceScheduleId: schedule.id,
            cycleKey,
            type,
          },
        };

        const existing = await this.prisma.maintenanceNotification.findUnique({
          where: key,
        });

        if (existing?.sentAt) {
          continue;
        }

        if (
          existing &&
          existing.createdAt.getTime() >
            now.getTime() - (existing.error ? RETRY_MS : LEASE_MS)
        ) {
          continue;
        }

        let claimed = false;

        if (existing) {
          const result = await this.prisma.maintenanceNotification.updateMany({
            where: {
              id: existing.id,
              sentAt: null,
              createdAt: {
                lte: new Date(
                  now.getTime() - (existing.error ? RETRY_MS : LEASE_MS),
                ),
              },
            },
            data: {
              error: null,
              createdAt: now,
              telegramChatId: chatId,
            },
          });

          claimed = result.count === 1;
        } else {
          try {
            await this.prisma.maintenanceNotification.create({
              data: {
                maintenanceScheduleId: schedule.id,
                cycleKey,
                type,
                telegramChatId: chatId,
                createdAt: now,
              },
            });

            claimed = true;
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            ) {
              continue;
            }

            throw error;
          }
        }

        if (!claimed) {
          continue;
        }

        const details = [
          schedule.nextDueDate
            ? `Next date: ${schedule.nextDueDate.toISOString().slice(0, 10)}`
            : null,

          schedule.nextDueMileage !== null
            ? `Next mileage: ${schedule.nextDueMileage} km (${km} km remaining)`
            : null,
        ]
          .filter(Boolean)
          .join('\n');

        try {
          await this.telegram.sendMaintenanceReminder({
            chatId,
            carName: `${schedule.car.make} ${schedule.car.model}`,
            maintenanceTitle:
              schedule.customTitle || schedule.type.replace(/_/g, ' '),
            status: type,
            details,
          });

          await this.prisma.maintenanceNotification.updateMany({
            where: {
              ...key.maintenanceScheduleId_cycleKey_type,
              createdAt: now,
              sentAt: null,
            },
            data: {
              sentAt: new Date(),
              error: null,
            },
          });
        } catch (error) {
          this.logger.warn(
            `Failed maintenance reminder for schedule ${schedule.id}`,
          );

          await this.prisma.maintenanceNotification.updateMany({
            where: {
              ...key.maintenanceScheduleId_cycleKey_type,
              createdAt: now,
              sentAt: null,
            },
            data: {
              error:
                error instanceof Error
                  ? error.message.slice(0, 500)
                  : 'Unknown delivery error',
            },
          });
        }
      }
    } catch (error) {
      this.logger.error(
        'Maintenance reminder scan failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}
