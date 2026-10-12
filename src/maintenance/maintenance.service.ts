import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MaintenanceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ScheduleInput = {
  type?: MaintenanceType;
  customTitle?: string | null;
  enabled?: boolean;
  intervalKm?: number | null;
  intervalMonths?: number | null;
  lastServiceMileage?: number | null;
  lastServiceDate?: string | Date | null;
  warningKm?: number;
  warningDays?: number;
  notes?: string | null;
};

type ScheduleValues = {
  type: MaintenanceType;
  customTitle: string | null;
  enabled: boolean;
  intervalKm: number | null;
  intervalMonths: number | null;
  lastServiceMileage: number | null;
  lastServiceDate: Date | null;
  warningKm: number;
  warningDays: number;
  notes: string | null;
};

type CompleteMaintenanceInput = {
  mileage: number;
  completedAt: string;
  notes?: string | null;
  idempotencyKey: string;
};

const MAX_DATABASE_INTEGER = 2_147_483_647;

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureCarExists(carId: string) {
    const car = await this.prisma.car.findUnique({
      where: { id: carId },
      select: { id: true },
    });

    if (!car) {
      throw new NotFoundException(`Car with ID ${carId} not found`);
    }
  }

  private async findScheduleOrThrow(carId: string, id: string) {
    const schedule = await this.prisma.maintenanceSchedule.findFirst({
      where: { id, carId },
    });

    if (!schedule) {
      throw new NotFoundException(
        `Maintenance schedule with ID ${id} not found for car ${carId}`,
      );
    }

    return schedule;
  }

  private validateInteger(
    value: unknown,
    field: string,
    allowZero: boolean,
  ): number {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < (allowZero ? 0 : 1) ||
      value > MAX_DATABASE_INTEGER
    ) {
      throw new BadRequestException(
        `${field} must be an integer between ${
          allowZero ? 0 : 1
        } and ${MAX_DATABASE_INTEGER}`,
      );
    }

    return value;
  }

  private optionalPositiveInteger(
    value: unknown,
    field: string,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    return this.validateInteger(value, field, false);
  }

  private parseDate(value: unknown): Date | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (!(typeof value === 'string' || value instanceof Date)) {
      throw new BadRequestException(
        'lastServiceDate must be a valid date string',
      );
    }

    if (typeof value === 'string') {
      if (
        !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)
      ) {
        throw new BadRequestException(
          'lastServiceDate must use YYYY-MM-DD or ISO UTC format',
        );
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const date = new Date(`${value}T00:00:00.000Z`);

        if (
          Number.isNaN(date.getTime()) ||
          date.toISOString().slice(0, 10) !== value
        ) {
          throw new BadRequestException(
            'lastServiceDate must be a real calendar date',
          );
        }

        return date;
      }
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('lastServiceDate must be a valid date');
    }

    return date;
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    const originalDay = result.getUTCDate();

    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);

    const lastDayOfMonth = new Date(
      Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
    ).getUTCDate();

    result.setUTCDate(Math.min(originalDay, lastDayOfMonth));

    return result;
  }

  private calculateNextDue(input: {
    intervalKm: number | null;
    intervalMonths: number | null;
    lastServiceMileage: number | null;
    lastServiceDate: Date | null;
  }) {
    const nextDueMileage =
      input.intervalKm !== null && input.lastServiceMileage !== null
        ? input.lastServiceMileage + input.intervalKm
        : null;

    if (nextDueMileage !== null && nextDueMileage > MAX_DATABASE_INTEGER) {
      throw new BadRequestException(
        'Calculated nextDueMileage exceeds the database integer limit',
      );
    }

    let nextDueDate: Date | null = null;

    if (input.intervalMonths !== null && input.lastServiceDate !== null) {
      nextDueDate = this.addMonths(input.lastServiceDate, input.intervalMonths);

      if (Number.isNaN(nextDueDate.getTime())) {
        throw new BadRequestException(
          'Calculated nextDueDate is outside the supported date range',
        );
      }
    }

    return {
      nextDueMileage,
      nextDueDate,
    };
  }

  private validateInput(input: ScheduleInput, current?: ScheduleValues) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Maintenance schedule must be an object');
    }

    const type = input.type !== undefined ? input.type : current?.type;

    if (!type || !Object.values(MaintenanceType).includes(type)) {
      throw new BadRequestException('A valid maintenance type is required');
    }

    const customTitle =
      input.customTitle !== undefined
        ? input.customTitle
        : (current?.customTitle ?? null);

    if (
      customTitle !== null &&
      (typeof customTitle !== 'string' ||
        customTitle.trim().length === 0 ||
        customTitle.length > 200)
    ) {
      throw new BadRequestException(
        'customTitle must be a non-empty string of at most 200 characters',
      );
    }

    if (type === MaintenanceType.CUSTOM && !customTitle) {
      throw new BadRequestException(
        'customTitle is required for CUSTOM maintenance',
      );
    }

    const enabled =
      input.enabled !== undefined ? input.enabled : (current?.enabled ?? true);

    if (typeof enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean');
    }

    const intervalKm =
      input.intervalKm !== undefined
        ? this.optionalPositiveInteger(input.intervalKm, 'intervalKm')
        : (current?.intervalKm ?? null);

    const intervalMonths =
      input.intervalMonths !== undefined
        ? this.optionalPositiveInteger(input.intervalMonths, 'intervalMonths')
        : (current?.intervalMonths ?? null);

    const lastServiceMileage =
      input.lastServiceMileage !== undefined
        ? input.lastServiceMileage === null
          ? null
          : this.validateInteger(
              input.lastServiceMileage,
              'lastServiceMileage',
              true,
            )
        : (current?.lastServiceMileage ?? null);

    const lastServiceDate =
      input.lastServiceDate !== undefined
        ? this.parseDate(input.lastServiceDate)
        : (current?.lastServiceDate ?? null);

    const warningKm =
      input.warningKm !== undefined
        ? this.validateInteger(input.warningKm, 'warningKm', true)
        : (current?.warningKm ?? 1000);

    const warningDays =
      input.warningDays !== undefined
        ? this.validateInteger(input.warningDays, 'warningDays', true)
        : (current?.warningDays ?? 30);

    if (enabled && intervalKm === null && intervalMonths === null) {
      throw new BadRequestException(
        'An enabled maintenance schedule requires intervalKm or intervalMonths',
      );
    }

    const notes =
      input.notes !== undefined ? input.notes : (current?.notes ?? null);

    if (notes !== null && (typeof notes !== 'string' || notes.length > 5000)) {
      throw new BadRequestException(
        'notes must be a string of at most 5000 characters',
      );
    }

    const nextDue = this.calculateNextDue({
      intervalKm,
      intervalMonths,
      lastServiceMileage,
      lastServiceDate,
    });

    return {
      type,
      customTitle,
      enabled,
      intervalKm,
      intervalMonths,
      lastServiceMileage,
      lastServiceDate,
      warningKm,
      warningDays,
      notes,
      ...nextDue,
    };
  }

  async create(carId: string, input: ScheduleInput) {
    await this.ensureCarExists(carId);

    const data = this.validateInput(input);

    if (data.type === MaintenanceType.CUSTOM) {
      return this.prisma.maintenanceSchedule.create({
        data: {
          carId,
          ...data,
        },
      });
    }

    const existing = await this.prisma.maintenanceSchedule.findFirst({
      where: {
        carId,
        type: data.type,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (existing) {
      const updatedData = this.validateInput(input, existing);

      return this.prisma.maintenanceSchedule.update({
        where: {
          id: existing.id,
        },
        data: updatedData,
      });
    }

    return this.prisma.maintenanceSchedule.create({
      data: {
        carId,
        ...data,
      },
    });
  }

  async findAll(carId: string) {
    await this.ensureCarExists(carId);

    return this.prisma.maintenanceSchedule.findMany({
      where: { carId },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findOne(carId: string, id: string) {
    return this.findScheduleOrThrow(carId, id);
  }

  async update(carId: string, id: string, input: ScheduleInput) {
    const current = await this.findScheduleOrThrow(carId, id);

    const data = this.validateInput(input, current);

    return this.prisma.maintenanceSchedule.update({
      where: { id },
      data,
    });
  }

  async remove(carId: string, id: string) {
    await this.findScheduleOrThrow(carId, id);

    await this.prisma.maintenanceSchedule.delete({
      where: { id },
    });

    return {
      message: 'Maintenance schedule deleted successfully',
      id,
    };
  }

  /**
   * Fetch an existing completion by its
   * idempotency key.
   *
   * The linked service record is the source
   * of truth for the original request details.
   */
  private async findExistingCompletion(key: string) {
    return this.prisma.maintenanceCompletion.findUnique({
      where: {
        idempotencyKey: key,
      },
      include: {
        serviceRecord: true,
        maintenanceSchedule: true,
      },
    });
  }

  /**
   * Return the original completion only when
   * the key belongs to the same request.
   */
  private async replayCompletion(
    key: string,
    carId: string,
    scheduleId: string,
    mileage: number,
    completedAt: Date,
    notes: string | null,
  ) {
    const existing = await this.findExistingCompletion(key);

    if (!existing) {
      return null;
    }

    const sameRequest =
      existing.maintenanceScheduleId === scheduleId &&
      existing.serviceRecord.carId === carId &&
      existing.serviceRecord.mileage === mileage &&
      existing.serviceRecord.date.getTime() === completedAt.getTime() &&
      existing.serviceRecord.description === notes;

    if (!sameRequest) {
      throw new ConflictException(
        'This idempotency key has already been used for different completion details',
      );
    }

    const { serviceRecord, maintenanceSchedule, ...completion } = existing;

    return {
      completion,
      serviceRecord,
      schedule: maintenanceSchedule,
    };
  }

  /**
   * Detect Prisma unique-constraint errors
   * without depending on a specific Prisma
   * exception class import.
   */
  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  /**
   * Complete a maintenance task.
   *
   * A unique idempotency key identifies one
   * logical completion request.
   *
   * The database transaction guarantees that
   * the service record, completion link, and
   * schedule update succeed or fail together.
   *
   * The unique database constraint prevents
   * concurrent requests with the same key
   * from creating duplicate service records.
   */
  async complete(carId: string, id: string, input: CompleteMaintenanceInput) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Completion details must be an object');
    }

    const mileage = this.validateInteger(input.mileage, 'mileage', true);

    if (
      typeof input.completedAt !== 'string' ||
      input.completedAt.trim().length === 0
    ) {
      throw new BadRequestException('completedAt is required');
    }

    const completedAt = this.parseDate(input.completedAt);

    if (!completedAt) {
      throw new BadRequestException('completedAt must be a valid date');
    }

    const notes = input.notes ?? null;

    if (notes !== null && (typeof notes !== 'string' || notes.length > 5000)) {
      throw new BadRequestException(
        'notes must be a string of at most 5000 characters',
      );
    }

    if (
      typeof input.idempotencyKey !== 'string' ||
      input.idempotencyKey.length < 8 ||
      input.idempotencyKey.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(input.idempotencyKey)
    ) {
      throw new BadRequestException(
        'idempotencyKey must be 8–128 characters containing only letters, numbers, underscores, or hyphens',
      );
    }

    const key = input.idempotencyKey;

    // Check before calculating a new schedule
    // deadline. A retry must return its original
    // completion even if schedule settings changed.
    const replay = await this.replayCompletion(
      key,
      carId,
      id,
      mileage,
      completedAt,
      notes,
    );

    if (replay) {
      return replay;
    }

    const current = await this.findScheduleOrThrow(carId, id);

    const nextDue = this.calculateNextDue({
      intervalKm: current.intervalKm,
      intervalMonths: current.intervalMonths,
      lastServiceMileage: mileage,
      lastServiceDate: completedAt,
    });

    const title =
      current.type === MaintenanceType.CUSTOM
        ? current.customTitle?.trim() || 'Custom maintenance'
        : this.getMaintenanceTitle(current.type);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const serviceRecord = await tx.serviceRecord.create({
          data: {
            carId,
            date: completedAt,
            mileage,
            title,
            description: notes,
          },
        });

        const completion = await tx.maintenanceCompletion.create({
          data: {
            maintenanceScheduleId: id,
            serviceRecordId: serviceRecord.id,
            idempotencyKey: key,
          },
        });

        const schedule = await tx.maintenanceSchedule.update({
          where: { id },
          data: {
            lastServiceMileage: mileage,
            lastServiceDate: completedAt,
            ...nextDue,
          },
        });

        return {
          completion,
          serviceRecord,
          schedule,
        };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        // The competing transaction may have
        // committed while this one was running.
        // Its completion can now be replayed.
        const existing = await this.replayCompletion(
          key,
          carId,
          id,
          mileage,
          completedAt,
          notes,
        );

        if (existing) {
          return existing;
        }

        throw new ConflictException(
          'A concurrent completion request was detected. Please retry with the same idempotency key.',
        );
      }

      throw error;
    }
  }

  private getMaintenanceTitle(type: MaintenanceType): string {
    switch (type) {
      case MaintenanceType.ENGINE_OIL:
        return 'Engine oil change';

      case MaintenanceType.TRANSMISSION_OIL:
        return 'Transmission oil change';

      case MaintenanceType.BRAKE_FLUID:
        return 'Brake fluid replacement';

      case MaintenanceType.HALDEX_OIL:
        return 'Haldex oil change';

      case MaintenanceType.CUSTOM:
        return 'Custom maintenance';

      default:
        return 'Maintenance service';
    }
  }
}
