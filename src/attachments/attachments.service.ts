/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Injectable,
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

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AttachmentsStorage,
  ) {}

  private async checkAccess(userId: string, carId: string, serviceId: string) {
    const service = await this.prisma.serviceRecord.findFirst({
      where: { id: serviceId, carId, car: { ownerId: userId } },
      select: { id: true },
    });
    if (!service) throw new NotFoundException('Service not found');
  }

  private validate(fileName: string, mimeType: string, size: number) {
    if (
      typeof fileName !== 'string' ||
      !fileName.trim() ||
      fileName.length > 200
    )
      throw new BadRequestException('Invalid file name');
    if (!Object.hasOwn(TYPES, mimeType))
      throw new BadRequestException('Unsupported file type');
    if (!Number.isInteger(size) || size <= 0 || size > MAX_SIZE)
      throw new BadRequestException('File must be 1 byte to 10 MB');
  }

  async prepare(
    userId: string,
    carId: string,
    serviceId: string,
    dto: { fileName: string; mimeType: string; size: number },
  ) {
    await this.checkAccess(userId, carId, serviceId);
    this.validate(dto.fileName, dto.mimeType, dto.size);
    const storageKey = `${userId}/${carId}/${serviceId}/${randomUUID()}.${TYPES[dto.mimeType]}`;
    const upload = await this.storage.createUploadUrl(storageKey);
    return {
      storageKey,
      signedUrl: upload.signedUrl,
      token: upload.token,
      path: upload.path,
    };
  }

  async confirm(
    userId: string,
    carId: string,
    serviceId: string,
    dto: {
      storageKey: string;
      fileName: string;
      mimeType: string;
      size: number;
    },
  ) {
    await this.checkAccess(userId, carId, serviceId);
    this.validate(dto.fileName, dto.mimeType, dto.size);
    const prefix = `${userId}/${carId}/${serviceId}/`;
    const extension = TYPES[dto.mimeType];
    if (
      typeof dto.storageKey !== 'string' ||
      !dto.storageKey.startsWith(prefix) ||
      !new RegExp(`^[0-9a-f-]{36}\\.${extension}$`).test(
        dto.storageKey.slice(prefix.length),
      )
    ) {
      throw new BadRequestException('Invalid storage key');
    }
    const info = await this.storage.getFileInfo(dto.storageKey);
    if (!info) throw new BadRequestException('File has not been uploaded');
    const actualSize = Number(
      info.metadata?.size ??
        info.metadata?.contentLength ??
        info.metadata?.content_length,
    );
    if (
      !Number.isFinite(actualSize) ||
      actualSize !== dto.size ||
      actualSize > MAX_SIZE
    )
      throw new BadRequestException('Uploaded file size does not match');
    const actualMime = String(
      info.metadata?.mimetype ??
        info.metadata?.contentType ??
        info.metadata?.content_type ??
        '',
    );
    if (actualMime && actualMime !== dto.mimeType)
      throw new BadRequestException('Uploaded file type does not match');
    return this.prisma.serviceAttachment.upsert({
      where: { storageKey: dto.storageKey },
      create: {
        serviceId,
        storageKey: dto.storageKey,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        size: dto.size,
      },
      update: {},
    });
  }

  async list(userId: string, carId: string, serviceId: string) {
    await this.checkAccess(userId, carId, serviceId);
    return this.prisma.serviceAttachment.findMany({
      where: { serviceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async view(userId: string, carId: string, serviceId: string, id: string) {
    await this.checkAccess(userId, carId, serviceId);
    const file = await this.prisma.serviceAttachment.findFirst({
      where: { id, serviceId },
    });
    if (!file) throw new NotFoundException('Attachment not found');
    return { url: await this.storage.createDownloadUrl(file.storageKey) };
  }

  async remove(userId: string, carId: string, serviceId: string, id: string) {
    await this.checkAccess(userId, carId, serviceId);
    const file = await this.prisma.serviceAttachment.findFirst({
      where: { id, serviceId },
    });
    if (!file) throw new NotFoundException('Attachment not found');
    await this.storage.deleteFile(file.storageKey);
    await this.prisma.serviceAttachment.delete({ where: { id: file.id } });
    return { ok: true };
  }
}
