import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
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

  async create(carId: string, dto: CreateServiceDto) {
    await this.ensureCarExists(carId);

    return this.prisma.serviceRecord.create({
      data: {
        carId,
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

  async findAll(carId: string) {
    await this.ensureCarExists(carId);

    return this.prisma.serviceRecord.findMany({
      where: { carId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(carId: string, id: string) {
    const service = await this.prisma.serviceRecord.findFirst({
      where: {
        id,
        carId,
      },
    });

    if (!service) {
      throw new NotFoundException(
        `Service record with ID ${id} not found for car ${carId}`,
      );
    }

    return service;
  }

  async update(carId: string, id: string, dto: UpdateServiceDto) {
    await this.findOne(carId, id);

    const data: Prisma.ServiceRecordUpdateInput = {
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
      where: { id, carId },
      data,
    });

    if (result.count === 0) {
      throw new NotFoundException(
        `Service record with ID ${id} not found for car ${carId}`,
      );
    }

    return this.findOne(carId, id);
  }

  async remove(carId: string, id: string) {
    const result = await this.prisma.serviceRecord.deleteMany({
      where: {
        id,
        carId,
      },
    });

    if (result.count === 0) {
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
