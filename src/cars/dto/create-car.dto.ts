/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCarDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  make: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  model: string;

  @IsInt()
  @Min(1886)
  @Max(2100)
  year: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  engine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  licensePlate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileage?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
