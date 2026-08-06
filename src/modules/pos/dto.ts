import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosOrderDraftStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { QueryDto } from '../../common/dto';
import { OrderTypeEnum, PaymentMethodEnum } from '../../common/enums';

export class PosDraftItemModifierDto {
  @ApiProperty()
  @IsString()
  modifierId!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class PosDraftItemModifierSelectionDto {
  @ApiProperty()
  @IsString()
  modifierGroupId!: string;

  @ApiPropertyOptional({
    description:
      'Selected modifier id. POS also accepts the cart-style nested modifiers array for compatibility.',
  })
  @IsOptional()
  @IsString()
  modifierId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ type: [PosDraftItemModifierDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosDraftItemModifierDto)
  modifiers?: PosDraftItemModifierDto[];
}

export class CreatePosDraftItemDto {
  @ApiProperty()
  @IsString()
  menuItemId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variationId?: string;

  @ApiProperty({ minimum: 1 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ type: [PosDraftItemModifierDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosDraftItemModifierDto)
  modifiers?: PosDraftItemModifierDto[];

  @ApiPropertyOptional({ type: [PosDraftItemModifierSelectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosDraftItemModifierSelectionDto)
  modifierSelections?: PosDraftItemModifierSelectionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePosDraftItemDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ type: [PosDraftItemModifierDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosDraftItemModifierDto)
  modifiers?: PosDraftItemModifierDto[];

  @ApiPropertyOptional({ type: [PosDraftItemModifierSelectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosDraftItemModifierSelectionDto)
  modifierSelections?: PosDraftItemModifierSelectionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class CreatePosOrderDto {
  @ApiPropertyOptional({
    description:
      'Optional for branch-scoped actors; token branch scope is used automatically',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

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

export class CreatePosWalkInCustomerDto {
  @ApiPropertyOptional({
    description:
      'Optional for branch-scoped actors; token branch scope is used automatically',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guestName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guestPhone?: string;
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

export class CreatePosWalkInReservationDto {
  @ApiPropertyOptional({
    description:
      'Optional for branch-scoped actors; token branch scope is used automatically',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

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

  @ApiProperty({
    description: 'Reservation date/time in ISO 8601 format',
    example: '2026-03-30T19:30:00.000Z',
  })
  @IsString()
  reservationDate!: string;

  @ApiProperty({ minimum: 1, maximum: 50, example: 4 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  guestCount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
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
