import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { MaintenanceType } from '@prisma/client';
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
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post()
  create(@Param('carId') carId: string, @Body() body: MaintenanceScheduleDto) {
    return this.maintenanceService.create(carId, body);
  }

  @Get()
  findAll(@Param('carId') carId: string) {
    return this.maintenanceService.findAll(carId);
  }

  @Get(':id')
  findOne(@Param('carId') carId: string, @Param('id') id: string) {
    return this.maintenanceService.findOne(carId, id);
  }

  @Patch(':id')
  update(
    @Param('carId') carId: string,
    @Param('id') id: string,
    @Body() body: MaintenanceScheduleDto,
  ) {
    return this.maintenanceService.update(carId, id, body);
  }

  @Delete(':id')
  remove(@Param('carId') carId: string, @Param('id') id: string) {
    return this.maintenanceService.remove(carId, id);
  }

  @Post(':id/complete')
  complete(
    @Param('carId') carId: string,
    @Param('id') id: string,
    @Body() body: CompleteMaintenanceDto,
  ) {
    return this.maintenanceService.complete(carId, id, body);
  }
}
