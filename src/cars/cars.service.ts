import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';

@Injectable()
export class CarsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createCarDto: CreateCarDto) {
    const { isPrimary, ...data } = createCarDto;

    return this.prisma.$transaction(async (tx) => {
      if (isPrimary === true) {
        await tx.car.updateMany({
          where: {
            ownerId: userId,
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
          ownerId: userId,
          isPrimary: isPrimary ?? false,
        },
      });
    });
  }

  async findAll(userId: string) {
    return this.prisma.car.findMany({
      where: {
        ownerId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(userId: string, id: string) {
    const car = await this.prisma.car.findFirst({
      where: {
        id,
        ownerId: userId,
      },
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

  async update(userId: string, id: string, updateCarDto: UpdateCarDto) {
    const { isPrimary, ...data } = updateCarDto;

    return this.prisma.$transaction(async (tx) => {
      const existingCar = await tx.car.findFirst({
        where: {
          id,
          ownerId: userId,
        },
      });

      if (!existingCar) {
        throw new NotFoundException(`Car with ID ${id} not found`);
      }

      if (isPrimary === true) {
        await tx.car.updateMany({
          where: {
            ownerId: userId,
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

      const result = await tx.car.updateMany({
        where: {
          id,
          ownerId: userId,
        },
        data: {
          ...data,
          ...(isPrimary !== undefined ? { isPrimary } : {}),
        },
      });

      if (result.count !== 1) {
        throw new NotFoundException(`Car with ID ${id} not found`);
      }

      return tx.car.findFirstOrThrow({
        where: {
          id,
          ownerId: userId,
        },
      });
    });
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.car.deleteMany({
      where: {
        id,
        ownerId: userId,
      },
    });

    if (result.count !== 1) {
      throw new NotFoundException(`Car with ID ${id} not found`);
    }

    return {
      message: 'Car deleted successfully',
      id,
    };
  }
}
