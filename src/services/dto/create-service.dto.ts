import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

export class ServiceMaintenanceScheduleDto {
  @IsBoolean()
  enabled!: boolean;

  @ValidateIf(
    (object: ServiceMaintenanceScheduleDto) =>
      object.enabled &&
      object.intervalKm !== undefined &&
      object.intervalKm !== null,
  )
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  intervalKm?: number;

  @ValidateIf(
    (object: ServiceMaintenanceScheduleDto) =>
      object.enabled &&
      object.intervalMonths !== undefined &&
      object.intervalMonths !== null,
  )
  @IsInt()
  @Min(1)
  @Max(600)
  intervalMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  warningKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  warningDays?: number;
}

export class CreateServiceDto {
  @IsDateString()
  date!: string;

  @IsInt()
  @Min(0)
  mileage!: number;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumberString()
  cost?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsString()
  workshop?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ServiceMaintenanceScheduleDto)
  maintenanceSchedule?: ServiceMaintenanceScheduleDto;
}
