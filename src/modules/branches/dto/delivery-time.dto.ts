import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateBranchDeliveryTimeDto {
  @ApiProperty({
    description: 'Customer-facing estimated delivery time in minutes.',
    example: 45,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  deliveryTime!: number;
}
