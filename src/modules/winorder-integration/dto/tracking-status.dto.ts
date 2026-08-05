import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class WinOrderTrackingStatusDto {
  @IsString()
  @MaxLength(191)
  ordersid!: string;

  @IsString()
  @MaxLength(20)
  trackingstatus!: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deliver_minutes?: number;

  @IsOptional()
  @IsDateString()
  deliver_eta?: string;

  @IsOptional()
  @IsString()
  reject_reason?: string;
}
