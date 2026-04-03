import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosOrderDraftStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { QueryDto } from '../../common/dto';
import { OrderTypeEnum, PaymentMethodEnum } from '../../common/enums';

export class CreatePosOrderDto {
  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty({ enum: OrderTypeEnum })
  @IsEnum(OrderTypeEnum)
  orderType!: OrderTypeEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guestName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guestPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tableLabel?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  guestCount?: number;

  @ApiPropertyOptional({ enum: PaymentMethodEnum })
  @IsOptional()
  @IsEnum(PaymentMethodEnum)
  paymentMethod?: PaymentMethodEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePosOrderDto {
  @ApiPropertyOptional({ enum: OrderTypeEnum })
  @IsOptional()
  @IsEnum(OrderTypeEnum)
  orderType?: OrderTypeEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guestName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guestPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tableLabel?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  guestCount?: number | null;

  @ApiPropertyOptional({ enum: PaymentMethodEnum })
  @IsOptional()
  @IsEnum(PaymentMethodEnum)
  paymentMethod?: PaymentMethodEnum | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  couponCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class ListPosOrdersDto extends QueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: PosOrderDraftStatus })
  @IsOptional()
  @IsEnum(PosOrderDraftStatus)
  status?: PosOrderDraftStatus;

  @ApiPropertyOptional({ enum: OrderTypeEnum })
  @IsOptional()
  @IsEnum(OrderTypeEnum)
  orderType?: OrderTypeEnum;
}
