import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { MaintenanceType } from '@prisma/client';

import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedRequest } from '../auth/session-auth.guard';

import { MaintenanceService } from './maintenance.service';

type MaintenanceScheduleDto = {
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

type CompleteMaintenanceDto = {
  mileage: number;
  completedAt: string;
  notes?: string | null;

  /**
   * Unique identifier for one logical
   * maintenance completion.
   *
   * The mobile app must reuse this key
   * when retrying the same request.
   */
  idempotencyKey: string;
};

@Controller('cars/:carId/maintenance')
@UseGuards(SessionAuthGuard)
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Param('carId') carId: string,
    @Body() body: MaintenanceScheduleDto,
  ) {
    return this.maintenanceService.create(request.user.id, carId, body);
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest, @Param('carId') carId: string) {
    return this.maintenanceService.findAll(request.user.id, carId);
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('carId') carId: string,
    @Param('id') id: string,
  ) {
    return this.maintenanceService.findOne(request.user.id, carId, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('carId') carId: string,
    @Param('id') id: string,
    @Body() body: MaintenanceScheduleDto,
  ) {
    return this.maintenanceService.update(request.user.id, carId, id, body);
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('carId') carId: string,
    @Param('id') id: string,
  ) {
    return this.maintenanceService.remove(request.user.id, carId, id);
  }

  @Post(':id/complete')
  complete(
    @Req() request: AuthenticatedRequest,
    @Param('carId') carId: string,
    @Param('id') id: string,
    @Body() body: CompleteMaintenanceDto,
  ) {
    return this.maintenanceService.complete(request.user.id, carId, id, body);
  }
}
