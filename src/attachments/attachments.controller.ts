import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedRequest } from '../auth/session-auth.guard';
import { AttachmentsService } from './attachments.service';

type FileDto = { fileName: string; mimeType: string; size: number };
type ConfirmDto = FileDto & { storageKey: string };

@Controller('cars/:carId/services/:serviceId/attachments')
@UseGuards(SessionAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('upload-url')
  prepare(@Req() req: AuthenticatedRequest, @Param('carId') carId: string, @Param('serviceId') serviceId: string, @Body() body: FileDto) {
    return this.attachments.prepare(req.user.id, carId, serviceId, body);
  }

  @Post()
  confirm(@Req() req: AuthenticatedRequest, @Param('carId') carId: string, @Param('serviceId') serviceId: string, @Body() body: ConfirmDto) {
    return this.attachments.confirm(req.user.id, carId, serviceId, body);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Param('carId') carId: string, @Param('serviceId') serviceId: string) {
    return this.attachments.list(req.user.id, carId, serviceId);
  }

  @Get(':id/url')
  view(@Req() req: AuthenticatedRequest, @Param('carId') carId: string, @Param('serviceId') serviceId: string, @Param('id') id: string) {
    return this.attachments.view(req.user.id, carId, serviceId, id);
  }

  @Delete(':id')
  remove(@Req() req: AuthenticatedRequest, @Param('carId') carId: string, @Param('serviceId') serviceId: string, @Param('id') id: string) {
    return this.attachments.remove(req.user.id, carId, serviceId, id);
  }
}
