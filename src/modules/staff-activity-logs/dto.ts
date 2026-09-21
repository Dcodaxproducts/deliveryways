import { ApiPropertyOptional } from '@nestjs/swagger';
import { StaffActivityAction } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { QueryDto } from '../../common/dto';

export class ListStaffActivityLogsDto extends QueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({ enum: StaffActivityAction })
  @IsOptional()
  @IsEnum(StaffActivityAction)
  action?: StaffActivityAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}
