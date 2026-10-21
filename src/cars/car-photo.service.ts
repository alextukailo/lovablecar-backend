import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsStorage } from '../attachments/attachments.storage';

const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const MAX_SIZE = 10 * 1024 * 1024;

type PhotoInput = {
  fileName: string;
  mimeType: string;
  size: number;
};

@Injectable()
export class CarPhotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AttachmentsStorage,
  ) {}

  private async ownedCar(userId: string, carId: string) {
    const car = await this.prisma.car.findFirst({
      where: {
        id: carId,
        ownerId: userId,
      },
    });

    if (!car) {
      throw new NotFoundException('Car not found');
    }

    return car;
  }

  private validate(dto: PhotoInput) {
    if (
      !dto ||
      typeof dto.fileName !== 'string' ||
      !dto.fileName.trim() ||
      dto.fileName.length > 200
    ) {
      throw new BadRequestException('Invalid file name');
    }

    if (
      typeof dto.mimeType !== 'string' ||
      !Object.prototype.hasOwnProperty.call(TYPES, dto.mimeType)
    ) {
      throw new BadRequestException('Unsupported image type');
    }

    if (
      !Number.isSafeInteger(dto.size) ||
      dto.size <= 0 ||
      dto.size > MAX_SIZE
    ) {
      throw new BadRequestException('Photo must be at most 10 MB');
    }
  }

  async prepare(userId: string, carId: string, dto: PhotoInput) {
    await this.ownedCar(userId, carId);

    this.validate(dto);

    const storageKey =
      `${userId}/${carId}/car-photo/` +
      `${randomUUID()}.${TYPES[dto.mimeType]}`;

    const signed = await this.storage.createUploadUrl(storageKey);

    return {
      storageKey,
      signedUrl: signed.signedUrl,
    };
  }

  async confirm(
    userId: string,
    carId: string,
    dto: PhotoInput & { storageKey: string },
  ) {
    const car = await this.ownedCar(userId, carId);

    this.validate(dto);

    const prefix = `${userId}/${carId}/car-photo/`;

    const filename =
      typeof dto.storageKey === 'string' && dto.storageKey.startsWith(prefix)
        ? dto.storageKey.slice(prefix.length)
        : '';

    const extension = TYPES[dto.mimeType];

    if (!new RegExp(`^[0-9a-f-]{36}\\.${extension}$`).test(filename)) {
      throw new BadRequestException('Invalid photo storage key');
    }

    const info = await this.storage.getFileInfo(dto.storageKey);

    if (!info) {
      throw new BadRequestException('Photo not uploaded');
    }

    const file = info as typeof info & {
      size?: number | string;
      metadata?: Record<string, unknown>;
    };

    const rawSize =
      file.size ??
      file.metadata?.size ??
      file.metadata?.contentLength ??
      file.metadata?.content_length;

    const actualSize = rawSize == null ? NaN : Number(rawSize);

    if (
      !Number.isSafeInteger(actualSize) ||
      actualSize !== dto.size ||
      actualSize > MAX_SIZE
    ) {
      throw new BadRequestException(
        `Uploaded photo size does not match ` +
          `(expected ${dto.size}, got ${actualSize})`,
      );
    }

    const rawMime = file.metadata?.mimetype ?? file.metadata?.contentType;

    if (
      typeof rawMime === 'string' &&
      rawMime.split(';')[0].trim().toLowerCase() !== dto.mimeType
    ) {
      throw new BadRequestException('Uploaded photo type does not match');
    }

    await this.prisma.car.update({
      where: { id: car.id },
      data: {
        photoStorageKey: dto.storageKey,
      },
    });

    if (car.photoStorageKey && car.photoStorageKey !== dto.storageKey) {
      try {
        await this.storage.deleteFile(car.photoStorageKey);
      } catch (error) {
        console.warn('Old car photo cleanup failed', error);
      }
    }

    return { ok: true };
  }

  async getUrl(userId: string, carId: string) {
    const car = await this.ownedCar(userId, carId);

    if (!car.photoStorageKey) {
      return { url: null };
    }

    return {
      url: await this.storage.createDownloadUrl(car.photoStorageKey),
    };
  }

  async remove(userId: string, carId: string) {
    const car = await this.ownedCar(userId, carId);

    if (!car.photoStorageKey) {
      return { ok: true };
    }

    await this.storage.deleteFile(car.photoStorageKey);

    await this.prisma.car.update({
      where: { id: car.id },
      data: {
        photoStorageKey: null,
      },
    });

    return { ok: true };
  }
}
