import {
  IsDateString,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

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
}
