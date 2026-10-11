import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';

@Injectable()
export class CarsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCarDto: CreateCarDto) {
    const { isPrimary, ...data } = createCarDto;

    return this.prisma.$transaction(async (tx) => {
      if (isPrimary === true) {
        await tx.car.updateMany({
          where: {
            isPrimary: true,
          },
          data: {
            isPrimary: false,
          },
        });
      }

      return tx.car.create({
        data: {
          ...data,
          isPrimary: isPrimary ?? false,
        },
      });
    });
  }

  async findAll() {
    return this.prisma.car.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const car = await this.prisma.car.findUnique({
      where: { id },
      include: {
        serviceRecords: {
          orderBy: {
            date: 'desc',
          },
        },
      },
    });

    if (!car) {
      throw new NotFoundException(`Car with ID ${id} not found`);
    }

    return car;
  }

  async update(id: string, updateCarDto: UpdateCarDto) {
    const { isPrimary, ...data } = updateCarDto;

    return this.prisma.$transaction(async (tx) => {
      const existingCar = await tx.car.findUnique({
        where: { id },
      });

      if (!existingCar) {
        throw new NotFoundException(`Car with ID ${id} not found`);
      }

      if (isPrimary === true) {
        await tx.car.updateMany({
          where: {
            isPrimary: true,
            id: {
              not: id,
            },
          },
          data: {
            isPrimary: false,
          },
        });
      }

      return tx.car.update({
        where: { id },
        data: {
          ...data,
          ...(isPrimary !== undefined ? { isPrimary } : {}),
        },
      });
    });
  }

  async remove(id: string) {
    const car = await this.prisma.car.findUnique({
      where: { id },
    });

    if (!car) {
      throw new NotFoundException(`Car with ID ${id} not found`);
    }

    await this.prisma.car.delete({
      where: { id },
    });

    return {
      message: 'Car deleted successfully',
      id,
    };
  }
}
