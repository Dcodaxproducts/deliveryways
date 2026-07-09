import { ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceChargeType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateRestaurantServiceChargeDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ enum: ServiceChargeType })
  @IsOptional()
  @IsEnum(ServiceChargeType)
  type?: ServiceChargeType;

  @ApiPropertyOptional({ minimum: 0, example: 5 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value?: number;
}
