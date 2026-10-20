import {
  IsDateString,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class SaveCustomNotificationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_+\-/]+$/)
  timeZone!: string;
}
