/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
import { CarPhotoService } from './car-photo.service';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';

@Controller('cars')
@UseGuards(SessionAuthGuard)
export class CarsController {
  constructor(
    private readonly carsService: CarsService,
    private readonly carPhoto: CarPhotoService,
  ) {}

  @Post(':id/photo/upload-url')
  preparePhoto(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body()
    body: {
      fileName: string;
      mimeType: string;
      size: number;
    },
  ) {
    return this.carPhoto.prepare(req.user.id, id, body);
  }

  @Post(':id/photo')
  confirmPhoto(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body()
    body: {
      fileName: string;
      mimeType: string;
      size: number;
      storageKey: string;
    },
  ) {
    return this.carPhoto.confirm(req.user.id, id, body);
  }

  @Get(':id/photo')
  photoUrl(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.carPhoto.getUrl(req.user.id, id);
  }

  @Delete(':id/photo')
  deletePhoto(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.carPhoto.remove(req.user.id, id);
  }

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
