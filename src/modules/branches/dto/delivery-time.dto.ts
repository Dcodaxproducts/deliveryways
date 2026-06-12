import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateBranchDeliveryTimeDto {
  @ApiPropertyOptional({
    description: 'Customer-facing estimated delivery time in minutes.',
    example: 45,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryTime?: number;

  @ApiPropertyOptional({
    description: 'Customer-facing delivery time-slot interval in minutes.',
    example: 15,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  deliveryIntervalMinutes?: number;

  @ApiPropertyOptional({
    description: 'Customer-facing pickup time-slot interval in minutes.',
    example: 10,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  pickupIntervalMinutes?: number;
}
