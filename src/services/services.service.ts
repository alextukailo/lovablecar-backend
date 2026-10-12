import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

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

  async create(userId: string, carId: string, dto: CreateServiceDto) {
    await this.ensureCarOwnedByUser(userId, carId);

    return this.prisma.serviceRecord.create({
      data: {
        car: {
          connect: {
            id: carId,
            ownerId: userId,
          },
        },
        date: new Date(dto.date),
        mileage: dto.mileage,
        title: dto.title,
        description: dto.description,
        workshop: dto.workshop,
        currency: dto.currency ?? 'BYN',
        ...(dto.cost !== undefined
          ? { cost: new Prisma.Decimal(dto.cost) }
          : {}),
      },
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
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
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
    const data: Prisma.ServiceRecordUpdateManyMutationInput = {
      ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
      ...(dto.mileage !== undefined ? { mileage: dto.mileage } : {}),
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.workshop !== undefined ? { workshop: dto.workshop } : {}),
      ...(dto.cost !== undefined ? { cost: new Prisma.Decimal(dto.cost) } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
    };

    const result = await this.prisma.serviceRecord.updateMany({
      where: {
        id,
        carId,
        car: {
          ownerId: userId,
        },
      },
      data,
    });

    if (result.count !== 1) {
      throw new NotFoundException(
        `Service record with ID ${id} not found for car ${carId}`,
      );
    }

    return this.findOne(userId, carId, id);
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
