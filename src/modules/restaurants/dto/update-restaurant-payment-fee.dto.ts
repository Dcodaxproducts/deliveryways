import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentFeePayer, ServiceChargeType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateRestaurantPaymentFeeDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ enum: ServiceChargeType })
  @IsOptional()
  @IsEnum(ServiceChargeType)
  type?: ServiceChargeType;

  @ApiPropertyOptional({ minimum: 0, example: 2.9 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value?: number;

  @ApiPropertyOptional({ enum: PaymentFeePayer })
  @IsOptional()
  @IsEnum(PaymentFeePayer)
  payer?: PaymentFeePayer;
}
