import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

const DAY = 24 * 60 * 60 * 1000;
const INTERVAL = 14 * DAY;

@Injectable()
export class MileageService {
  private readonly logger = new Logger(MileageService.name);
  constructor(private readonly prisma: PrismaService, private readonly telegram: TelegramService) {}

  async sendDueReminders(): Promise<{ sent: number; failed: number }> {
    const now = new Date();
    // Seed reminders for new cars. Only cars with owners can receive reminders.
    const cars = await this.prisma.car.findMany({
      where: { ownerId: { not: null }, owner: { telegramConnection: { is: { notificationsEnabled: true } } } },
      select: { id: true },
    });
    for (const car of cars) {
      await this.prisma.mileageReminder.upsert({
        where: { carId: car.id }, create: { carId: car.id }, update: {},
      });
    }
    const due = await this.prisma.mileageReminder.findMany({
      where: { nextDueAt: { lte: now }, pendingSince: null, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        car: { owner: { telegramConnection: { is: { notificationsEnabled: true } } } } },
      select: { carId: true }, take: 100,
    });
    let sent = 0, failed = 0;
    for (const item of due) {
      const claim = await this.prisma.mileageReminder.updateMany({
        where: { carId: item.carId, nextDueAt: { lte: now }, pendingSince: null,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
        data: { leaseUntil: new Date(Date.now() + 2 * 60_000) },
      });
      if (!claim.count) continue;
      try {
        const car = await this.prisma.car.findUnique({
          where: { id: item.carId }, include: { owner: { include: { telegramConnection: true } } },
        });
        const connection = car?.owner?.telegramConnection;
        if (!car || !connection?.notificationsEnabled) continue;
        await this.telegram.sendMessage({ chatId: connection.chatId,
          text: `🚗 Mileage check: ${car.make} ${car.model} (${car.year})\nLast recorded: ${car.mileage.toLocaleString('en-US')} km\n\nReply with:\n/mileage ${car.id} 129200\n\nReplace 129200 with your current odometer reading.`,
        });
        const sentAt = new Date();
        await this.prisma.mileageReminder.update({ where: { carId: car.id }, data: {
          pendingSince: sentAt, lastSentAt: sentAt, nextDueAt: new Date(sentAt.getTime() + INTERVAL), leaseUntil: null,
        } });
        sent++;
      } catch (e) {
        failed++;
        this.logger.warn(`Mileage reminder failed for car ${item.carId}: ${e instanceof Error ? e.message : 'unknown error'}`);
        await this.prisma.mileageReminder.update({ where: { carId: item.carId },
          data: { leaseUntil: null, nextDueAt: new Date(Date.now() + 60 * 60_000) } });
      }
    }
    return { sent, failed };
  }

  async handleMessage(chatId: string, telegramUserId: string, text: string): Promise<boolean> {
    const match = /^\/mileage(?:@\w+)?\s+(\S+)\s+(\d+)\s*$/.exec(text.trim());
    if (!match) return false;
    const [, carId, raw] = match;
    const mileage = Number(raw);
    const connection = await this.prisma.telegramConnection.findUnique({
      where: { chatId }, include: { user: true },
    });
    if (!connection || connection.user.telegramUserId !== telegramUserId) return true;
    const car = await this.prisma.car.findFirst({ where: { id: carId, ownerId: connection.userId } });
    if (!car) {
      await this.telegram.sendMessage({ chatId, text: 'Car not found in your LovableCar account.' });
      return true;
    }
    if (!Number.isSafeInteger(mileage) || mileage < 0 || mileage > 2_147_483_647) {
      await this.telegram.sendMessage({ chatId, text: 'Please enter a valid whole-number mileage in km.' });
      return true;
    }
    if (mileage < car.mileage) {
      await this.telegram.sendMessage({ chatId, text: `The new mileage is below the saved ${car.mileage} km. Nothing was changed. Contact support if the odometer was replaced.` });
      return true;
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Conditional update protects against a stale read or concurrent mileage update.
      const updated = await tx.car.updateMany({ where: { id: car.id, ownerId: connection.userId, mileage: { lte: mileage } }, data: { mileage } });
      if (!updated.count) throw new Error('Mileage changed concurrently; please retry.');
      await tx.mileageReading.create({ data: { carId: car.id, mileage } });
      await tx.mileageReminder.upsert({ where: { carId: car.id }, create: {
        carId: car.id, nextDueAt: new Date(now.getTime() + INTERVAL), lastSubmittedAt: now,
      }, update: { pendingSince: null, leaseUntil: null, lastSubmittedAt: now, nextDueAt: new Date(now.getTime() + INTERVAL) } });
    });
    await this.telegram.sendMessage({ chatId, text: `✅ ${car.make} ${car.model}: mileage saved — ${mileage.toLocaleString('en-US')} km. Next check in 14 days.` });
    return true;
  }
}
