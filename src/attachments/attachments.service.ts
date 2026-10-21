/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsStorage } from './attachments.storage';

const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

const MAX_SIZE = 10 * 1024 * 1024;

type AttachmentDto = {
  fileName: string;
  mimeType: string;
  size: number;
};

type ConfirmAttachmentDto = AttachmentDto & {
  storageKey: string;
};

type StorageFileInfo = {
  size?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AttachmentsStorage,
  ) {}

  // --------------------------------------------
  // ACCESS CONTROL
  // --------------------------------------------

  private async checkAccess(userId: string, carId: string, serviceId: string) {
    const service = await this.prisma.serviceRecord.findFirst({
      where: {
        id: serviceId,
        carId,
        car: {
          ownerId: userId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }
  }

  // --------------------------------------------
  // FILE VALIDATION
  // --------------------------------------------

  private validate(fileName: string, mimeType: string, size: number) {
    if (
      typeof fileName !== 'string' ||
      !fileName.trim() ||
      fileName.length > 200
    ) {
      throw new BadRequestException('Invalid file name');
    }

    if (
      typeof mimeType !== 'string' ||
      !Object.prototype.hasOwnProperty.call(TYPES, mimeType)
    ) {
      throw new BadRequestException('Unsupported file type');
    }

    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SIZE) {
      throw new BadRequestException('File must be 1 byte to 10 MB');
    }
  }

  // --------------------------------------------
  // FILE SIZE FROM SUPABASE METADATA
  // --------------------------------------------

  private getActualFileSize(info: StorageFileInfo): number {
    const metadata = info.metadata ?? {};

    const candidates = [
      info.size,
      metadata.size,
      metadata.contentLength,
      metadata.content_length,
    ];

    for (const candidate of candidates) {
      if (candidate === null || candidate === undefined || candidate === '') {
        continue;
      }

      const size = Number(candidate);

      if (Number.isSafeInteger(size) && size >= 0) {
        return size;
      }
    }

    return NaN;
  }

  // --------------------------------------------
  // FILE MIME TYPE FROM SUPABASE METADATA
  // --------------------------------------------

  private getActualMimeType(info: StorageFileInfo): string | null {
    const metadata = info.metadata ?? {};

    const rawMimeType =
      metadata.mimetype ?? metadata.contentType ?? metadata.content_type;

    if (typeof rawMimeType !== 'string' || !rawMimeType.trim()) {
      return null;
    }

    return rawMimeType.split(';')[0].trim().toLowerCase();
  }

  // --------------------------------------------
  // PREPARE UPLOAD
  // --------------------------------------------

  async prepare(
    userId: string,
    carId: string,
    serviceId: string,
    dto: AttachmentDto,
  ) {
    await this.checkAccess(userId, carId, serviceId);

    this.validate(dto.fileName, dto.mimeType, dto.size);

    const extension = TYPES[dto.mimeType];

    const storageKey = [
      userId,
      carId,
      serviceId,
      `${randomUUID()}.${extension}`,
    ].join('/');

    const upload = await this.storage.createUploadUrl(storageKey);

    return {
      storageKey,
      signedUrl: upload.signedUrl,
      token: upload.token,
      path: upload.path,
    };
  }

  // --------------------------------------------
  // CONFIRM UPLOAD
  // --------------------------------------------

  async confirm(
    userId: string,
    carId: string,
    serviceId: string,
    dto: ConfirmAttachmentDto,
  ) {
    await this.checkAccess(userId, carId, serviceId);

    this.validate(dto.fileName, dto.mimeType, dto.size);

    const prefix = `${userId}/${carId}/${serviceId}/`;

    const extension = TYPES[dto.mimeType];

    if (
      typeof dto.storageKey !== 'string' ||
      !dto.storageKey.startsWith(prefix)
    ) {
      throw new BadRequestException('Invalid storage key');
    }

    const filePart = dto.storageKey.slice(prefix.length);

    const validFileName = new RegExp(`^[0-9a-f-]{36}\\.${extension}$`);

    if (!validFileName.test(filePart)) {
      throw new BadRequestException('Invalid storage key');
    }

    // Retrieve uploaded file information.

    const info = await this.storage.getFileInfo(dto.storageKey);

    if (!info) {
      throw new BadRequestException('File has not been uploaded');
    }

    const storageInfo = info as StorageFileInfo;

    const actualSize = this.getActualFileSize(storageInfo);

    const actualMime = this.getActualMimeType(storageInfo);

    // Diagnostics: byte counts only, no signed URLs.

    this.logger.log(
      `Attachment size comparison: ${JSON.stringify({
        expectedSize: dto.size,
        actualSize: Number.isFinite(actualSize) ? actualSize : null,
        difference: Number.isFinite(actualSize) ? actualSize - dto.size : null,
        expectedMimeType: dto.mimeType,
        actualMimeType: actualMime,
        metadataKeys: Object.keys(storageInfo.metadata ?? {}),
      })}`,
    );

    // Verify exact uploaded byte count.

    if (
      !Number.isSafeInteger(actualSize) ||
      actualSize <= 0 ||
      actualSize > MAX_SIZE ||
      actualSize !== dto.size
    ) {
      this.logger.warn(
        `Attachment size mismatch: ${JSON.stringify({
          expectedSize: dto.size,
          actualSize: Number.isFinite(actualSize) ? actualSize : null,
        })}`,
      );

      throw new BadRequestException('Uploaded file size does not match');
    }

    // Verify MIME type.

    if (actualMime && actualMime !== dto.mimeType) {
      this.logger.warn(
        `Attachment MIME mismatch: ${JSON.stringify({
          expectedMimeType: dto.mimeType,
          actualMimeType: actualMime,
        })}`,
      );

      throw new BadRequestException('Uploaded file type does not match');
    }

    // Save attachment metadata in PostgreSQL.

    return this.prisma.serviceAttachment.upsert({
      where: {
        storageKey: dto.storageKey,
      },

      create: {
        serviceId,
        storageKey: dto.storageKey,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        size: actualSize,
      },

      update: {},
    });
  }

  // --------------------------------------------
  // LIST ATTACHMENTS
  // --------------------------------------------

  async list(userId: string, carId: string, serviceId: string) {
    await this.checkAccess(userId, carId, serviceId);

    return this.prisma.serviceAttachment.findMany({
      where: {
        serviceId,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // --------------------------------------------
  // GET SIGNED DOWNLOAD URL
  // --------------------------------------------

  async view(userId: string, carId: string, serviceId: string, id: string) {
    await this.checkAccess(userId, carId, serviceId);

    const file = await this.prisma.serviceAttachment.findFirst({
      where: {
        id,
        serviceId,
      },
    });

    if (!file) {
      throw new NotFoundException('Attachment not found');
    }

    const url = await this.storage.createDownloadUrl(file.storageKey);

    return { url };
  }

  // --------------------------------------------
  // DELETE ATTACHMENT
  // --------------------------------------------

  async remove(userId: string, carId: string, serviceId: string, id: string) {
    await this.checkAccess(userId, carId, serviceId);

    const file = await this.prisma.serviceAttachment.findFirst({
      where: {
        id,
        serviceId,
      },
    });

    if (!file) {
      throw new NotFoundException('Attachment not found');
    }

    await this.storage.deleteFile(file.storageKey);

    await this.prisma.serviceAttachment.delete({
      where: {
        id: file.id,
      },
    });

    return {
      ok: true,
    };
  }
}
