import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { MaintenanceType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import {
  CreateServiceDto,
  ServiceMaintenanceScheduleDto,
} from './dto/create-service.dto';

import { UpdateServiceDto } from './dto/update-service.dto';

const MAX_DATABASE_INTEGER = 2_147_483_647;

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureCarOwnedByUser(
    userId: string,
    carId: string,
  ): Promise<void> {
    const car = await this.prisma.car.findFirst({
      where: {
        id: carId,
        ownerId: userId,
      },
      select: {
        id: true,
      },
    });

    if (!car) {
      throw new NotFoundException(`Car with ID ${carId} not found`);
    }
  }

  private normalizeTitle(title: string): string {
    return title.trim().replace(/\s+/g, ' ').toLowerCase();
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

  private validateSchedule(input: ServiceMaintenanceScheduleDto): void {
    if (!input.enabled) {
      return;
    }

    if (input.intervalKm == null && input.intervalMonths == null) {
      throw new BadRequestException(
        'An enabled maintenance schedule requires intervalKm or intervalMonths',
      );
    }

    if (
      input.intervalKm != null &&
      (!Number.isInteger(input.intervalKm) || input.intervalKm <= 0)
    ) {
      throw new BadRequestException('intervalKm must be a positive integer');
    }

    if (
      input.intervalMonths != null &&
      (!Number.isInteger(input.intervalMonths) || input.intervalMonths <= 0)
    ) {
      throw new BadRequestException(
        'intervalMonths must be a positive integer',
      );
    }
  }

  private buildScheduleData(
    input: ServiceMaintenanceScheduleDto,
    service: {
      date: Date;
      mileage: number;
      title: string;
    },
  ) {
    this.validateSchedule(input);

    const intervalKm = input.intervalKm ?? null;

    const intervalMonths = input.intervalMonths ?? null;

    const nextDueMileage =
      intervalKm !== null ? service.mileage + intervalKm : null;

    if (nextDueMileage !== null && nextDueMileage > MAX_DATABASE_INTEGER) {
      throw new BadRequestException(
        'Calculated nextDueMileage exceeds the database integer limit',
      );
    }

    const nextDueDate =
      intervalMonths !== null
        ? this.addMonths(service.date, intervalMonths)
        : null;

    if (nextDueDate !== null && Number.isNaN(nextDueDate.getTime())) {
      throw new BadRequestException('Calculated nextDueDate is invalid');
    }

    return {
      type: MaintenanceType.CUSTOM,
      customTitle: service.title.trim(),

      enabled: input.enabled,

      intervalKm,
      intervalMonths,

      lastServiceMileage: service.mileage,
      lastServiceDate: service.date,

      nextDueMileage,
      nextDueDate,

      warningKm: input.warningKm ?? 500,
      warningDays: input.warningDays ?? 7,
    };
  }

  private async findMatchingSchedule(
    tx: Prisma.TransactionClient,
    carId: string,
    title: string,
    excludeId?: string,
  ) {
    const schedules = await tx.maintenanceSchedule.findMany({
      where: {
        carId,
        type: MaintenanceType.CUSTOM,
        enabled: true,
        ...(excludeId
          ? {
              id: {
                not: excludeId,
              },
            }
          : {}),
      },
      select: {
        id: true,
        customTitle: true,
        sourceServiceRecordId: true,
      },
    });

    const normalizedTitle = this.normalizeTitle(title);

    const matches = schedules.filter(
      (schedule) =>
        schedule.customTitle != null &&
        this.normalizeTitle(schedule.customTitle) === normalizedTitle,
    );

    // Ambiguous matches must not be renewed
    // automatically.
    if (matches.length !== 1) {
      return null;
    }

    return matches[0];
  }

  private async saveMaintenanceSchedule(
    tx: Prisma.TransactionClient,
    carId: string,
    service: {
      id: string;
      date: Date;
      mileage: number;
      title: string;
    },
    input: ServiceMaintenanceScheduleDto,
  ): Promise<void> {
    const existingLinkedSchedule = await tx.maintenanceSchedule.findUnique({
      where: {
        sourceServiceRecordId: service.id,
      },
    });

    if (!input.enabled) {
      if (existingLinkedSchedule) {
        await tx.maintenanceSchedule.update({
          where: {
            id: existingLinkedSchedule.id,
          },
          data: {
            enabled: false,
          },
        });
      }

      return;
    }

    const data = this.buildScheduleData(input, service);

    if (existingLinkedSchedule) {
      await tx.maintenanceSchedule.update({
        where: {
          id: existingLinkedSchedule.id,
        },
        data,
      });

      return;
    }

    const matchingSchedule = await this.findMatchingSchedule(
      tx,
      carId,
      service.title,
    );

    if (matchingSchedule) {
      await tx.maintenanceSchedule.update({
        where: {
          id: matchingSchedule.id,
        },
        data: {
          ...data,

          // The latest completed service becomes
          // the schedule's source record.
          sourceServiceRecordId: service.id,
        },
      });

      return;
    }

    await tx.maintenanceSchedule.create({
      data: {
        car: {
          connect: {
            id: carId,
          },
        },

        ...data,

        sourceServiceRecord: {
          connect: {
            id: service.id,
          },
        },
      },
    });
  }

  async create(userId: string, carId: string, dto: CreateServiceDto) {
    await this.ensureCarOwnedByUser(userId, carId);

    return this.prisma.$transaction(async (tx) => {
      const service = await tx.serviceRecord.create({
        data: {
          car: {
            connect: {
              id: carId,
            },
          },

          date: new Date(dto.date),
          mileage: dto.mileage,
          title: dto.title,
          description: dto.description,
          workshop: dto.workshop,
          currency: dto.currency ?? 'BYN',

          ...(dto.cost !== undefined
            ? {
                cost: new Prisma.Decimal(dto.cost),
              }
            : {}),
        },
      });

      if (dto.maintenanceSchedule) {
        await this.saveMaintenanceSchedule(
          tx,
          carId,
          service,
          dto.maintenanceSchedule,
        );
      }

      return tx.serviceRecord.findUniqueOrThrow({
        where: {
          id: service.id,
        },
        include: {
          maintenanceSchedule: true,
        },
      });
    });
  }

  async findAll(userId: string, carId: string) {
    await this.ensureCarOwnedByUser(userId, carId);

    return this.prisma.serviceRecord.findMany({
      where: {
        carId,
        car: {
          ownerId: userId,
        },
      },
      include: {
        maintenanceSchedule: true,
      },
      orderBy: {
        date: 'desc',
      },
    });
  }

  async findOne(userId: string, carId: string, id: string) {
    const service = await this.prisma.serviceRecord.findFirst({
      where: {
        id,
        carId,
        car: {
          ownerId: userId,
        },
      },

      include: {
        maintenanceSchedule: true,
      },
    });

    if (!service) {
      throw new NotFoundException(
        `Service record with ID ${id} not found for car ${carId}`,
      );
    }

    return service;
  }

  async update(
    userId: string,
    carId: string,
    id: string,
    dto: UpdateServiceDto,
  ) {
    await this.ensureCarOwnedByUser(userId, carId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.serviceRecord.findFirst({
        where: {
          id,
          carId,
          car: {
            ownerId: userId,
          },
        },
      });

      if (!existing) {
        throw new NotFoundException(
          `Service record with ID ${id} not found for car ${carId}`,
        );
      }

      const data: Prisma.ServiceRecordUpdateInput = {
        ...(dto.date !== undefined
          ? {
              date: new Date(dto.date),
            }
          : {}),

        ...(dto.mileage !== undefined
          ? {
              mileage: dto.mileage,
            }
          : {}),

        ...(dto.title !== undefined
          ? {
              title: dto.title,
            }
          : {}),

        ...(dto.description !== undefined
          ? {
              description: dto.description,
            }
          : {}),

        ...(dto.workshop !== undefined
          ? {
              workshop: dto.workshop,
            }
          : {}),

        ...(dto.cost !== undefined
          ? {
              cost: new Prisma.Decimal(dto.cost),
            }
          : {}),

        ...(dto.currency !== undefined
          ? {
              currency: dto.currency,
            }
          : {}),
      };

      const service = await tx.serviceRecord.update({
        where: {
          id: existing.id,
        },
        data,
      });

      if (dto.maintenanceSchedule !== undefined) {
        await this.saveMaintenanceSchedule(
          tx,
          carId,
          service,
          dto.maintenanceSchedule,
        );
      } else {
        // If the user edits the service date,
        // mileage, or title, refresh the linked
        // schedule's calculated due values.
        const linkedSchedule = await tx.maintenanceSchedule.findUnique({
          where: {
            sourceServiceRecordId: service.id,
          },
        });

        if (
          linkedSchedule &&
          (dto.date !== undefined ||
            dto.mileage !== undefined ||
            dto.title !== undefined)
        ) {
          const nextDueMileage =
            linkedSchedule.intervalKm !== null
              ? service.mileage + linkedSchedule.intervalKm
              : null;

          if (
            nextDueMileage !== null &&
            nextDueMileage > MAX_DATABASE_INTEGER
          ) {
            throw new BadRequestException(
              'Calculated nextDueMileage exceeds the database integer limit',
            );
          }

          const nextDueDate =
            linkedSchedule.intervalMonths !== null
              ? this.addMonths(service.date, linkedSchedule.intervalMonths)
              : null;

          await tx.maintenanceSchedule.update({
            where: {
              id: linkedSchedule.id,
            },
            data: {
              customTitle: service.title.trim(),

              lastServiceMileage: service.mileage,

              lastServiceDate: service.date,

              nextDueMileage,
              nextDueDate,
            },
          });
        }
      }

      return tx.serviceRecord.findUniqueOrThrow({
        where: {
          id: service.id,
        },
        include: {
          maintenanceSchedule: true,
        },
      });
    });
  }

  async remove(userId: string, carId: string, id: string) {
    const result = await this.prisma.serviceRecord.deleteMany({
      where: {
        id,
        carId,
        car: {
          ownerId: userId,
        },
      },
    });

    if (result.count !== 1) {
      throw new NotFoundException(
        `Service record with ID ${id} not found for car ${carId}`,
      );
    }

    return {
      message: 'Service record deleted successfully',
      id,
    };
  }
}
