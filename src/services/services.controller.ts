import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Controller('cars/:carId/services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  create(@Param('carId') carId: string, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(carId, dto);
  }

  @Get()
  findAll(@Param('carId') carId: string) {
    return this.servicesService.findAll(carId);
  }

  @Get(':id')
  findOne(@Param('carId') carId: string, @Param('id') id: string) {
    return this.servicesService.findOne(carId, id);
  }

  @Patch(':id')
  update(
    @Param('carId') carId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(carId, id, dto);
  }

  @Delete(':id')
  remove(@Param('carId') carId: string, @Param('id') id: string) {
    return this.servicesService.remove(carId, id);
  }
}
