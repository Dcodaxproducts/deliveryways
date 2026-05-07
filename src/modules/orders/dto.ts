import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { QueryDto } from '../../common/dto';
import { OrderTypeEnum, PaymentMethodEnum } from '../../common/enums';

export const ORDER_ITEM_SECTION_SLOT_VALUES = ['LEFT', 'RIGHT'] as const;

export class OrderItemModifierDto {
  @ApiProperty()
  @IsString()
  modifierId!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class OrderItemSectionDto {
  @ApiProperty({ enum: ORDER_ITEM_SECTION_SLOT_VALUES })
  @IsIn(ORDER_ITEM_SECTION_SLOT_VALUES)
  slot!: (typeof ORDER_ITEM_SECTION_SLOT_VALUES)[number];

  @ApiProperty()
  @IsString()
  menuItemId!: string;
}

export class OrderItemDto {
  @ApiProperty()
  @IsString()
  menuItemId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variationId?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ type: [OrderItemModifierDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemModifierDto)
  modifiers?: OrderItemModifierDto[];

  @ApiPropertyOptional({ type: [OrderItemSectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemSectionDto)
  sections?: OrderItemSectionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class QuoteOrderDto {
  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiPropertyOptional({
    description: 'Target customer id for admin-created orders',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ enum: OrderTypeEnum })
  @IsEnum(OrderTypeEnum)
  orderType!: OrderTypeEnum;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional({
    description:
      'Optional explicit selected restaurant menu context. Timed-menu enforcement only applies when provided.',
  })
  @IsOptional()
  @IsString()
  restaurantMenuId?: string;

  @ApiPropertyOptional({ minimum: 0, example: 250 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @Min(0)
  walletAmount?: number;

  @ApiPropertyOptional({ minimum: 1, example: 100 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  loyaltyPoints?: number;

  @ApiProperty({
    description: 'Requested order time in ISO 8601 format',
    example: '2026-03-24T19:30:00.000Z',
  })
  @IsDateString()
  orderTime!: string;
}

export class CreateOrderDto extends QuoteOrderDto {
  @ApiProperty({ enum: PaymentMethodEnum })
  @IsEnum(PaymentMethodEnum)
  paymentMethod!: PaymentMethodEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerNote?: string;
}

export const ORDER_LIST_KIND_VALUES = ['order', 'group-orders'] as const;

export class ListOrdersDto extends QueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: OrderTypeEnum })
  @IsOptional()
  @IsEnum(OrderTypeEnum)
  orderType?: OrderTypeEnum;

  @ApiPropertyOptional({
    enum: ORDER_LIST_KIND_VALUES,
    description:
      'Filter orders list to only regular orders or only group-checkout orders',
  })
  @IsOptional()
  @IsIn(ORDER_LIST_KIND_VALUES)
  kind?: (typeof ORDER_LIST_KIND_VALUES)[number];
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional({
    description:
      'Required when marking a delivery order as DELIVERED after out-for-delivery.',
  })
  @IsOptional()
  @IsString()
  deliveryOtp?: string;
}

export class CancelOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
