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

import { CarsService } from './cars.service';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';

@Controller('cars')
@UseGuards(SessionAuthGuard)
export class CarsController {
  constructor(private readonly carsService: CarsService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() createCarDto: CreateCarDto,
  ) {
    return this.carsService.create(request.user.id, createCarDto);
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.carsService.findAll(request.user.id);
  }

  @Get(':id')
  findOne(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.carsService.findOne(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() updateCarDto: UpdateCarDto,
  ) {
    return this.carsService.update(request.user.id, id, updateCarDto);
  }

  @Delete(':id')
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.carsService.remove(request.user.id, id);
  }
}
