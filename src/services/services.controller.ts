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

import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedRequest } from '../auth/session-auth.guard';

import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Controller('cars/:carId/services')
@UseGuards(SessionAuthGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Param('carId') carId: string,
    @Body() dto: CreateServiceDto,
  ) {
    return this.servicesService.create(request.user.id, carId, dto);
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest, @Param('carId') carId: string) {
    return this.servicesService.findAll(request.user.id, carId);
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('carId') carId: string,
    @Param('id') id: string,
  ) {
    return this.servicesService.findOne(request.user.id, carId, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('carId') carId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(request.user.id, carId, id, dto);
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('carId') carId: string,
    @Param('id') id: string,
  ) {
    return this.servicesService.remove(request.user.id, carId, id);
  }
}
