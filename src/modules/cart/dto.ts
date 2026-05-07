import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { OrderTypeEnum, PaymentMethodEnum } from '../../common/enums';

export const CART_ITEM_SECTION_SLOT_VALUES = ['LEFT', 'RIGHT'] as const;

export class CartItemModifierDto {
  @ApiProperty()
  @IsString()
  modifierId!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class CartItemSectionDto {
  @ApiProperty({ enum: CART_ITEM_SECTION_SLOT_VALUES })
  @IsIn(CART_ITEM_SECTION_SLOT_VALUES)
  slot!: (typeof CART_ITEM_SECTION_SLOT_VALUES)[number];

  @ApiProperty()
  @IsString()
  menuItemId!: string;
}

export class AddCartItemDto {
  @ApiPropertyOptional({
    description:
      'Required when creating a cart from the first add-to-cart action',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty()
  @IsString()
  menuItemId!: string;

  @ApiPropertyOptional({
    description:
      'Optional selected restaurant menu context, mainly used when creating a new cart from a timed menu.',
  })
  @IsOptional()
  @IsString()
  restaurantMenuId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variationId?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ type: [CartItemModifierDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemModifierDto)
  modifiers?: CartItemModifierDto[];

  @ApiPropertyOptional({ type: [CartItemSectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemSectionDto)
  sections?: CartItemSectionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateCartItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variationId?: string | null;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ type: [CartItemModifierDto], nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemModifierDto)
  modifiers?: CartItemModifierDto[] | null;

  @ApiPropertyOptional({ type: [CartItemSectionDto], nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemSectionDto)
  sections?: CartItemSectionDto[] | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdateCartDto {
  @ApiPropertyOptional({ enum: OrderTypeEnum })
  @IsOptional()
  @IsEnum(OrderTypeEnum)
  orderType?: OrderTypeEnum;

  @ApiPropertyOptional({ enum: PaymentMethodEnum })
  @IsOptional()
  @IsEnum(PaymentMethodEnum)
  paymentMethod?: PaymentMethodEnum;

  @ApiPropertyOptional({
    description:
      'Requested order time in ISO 8601 format. Saved on cart for later checkout.',
    example: '2026-03-24T19:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  orderTime?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  customerNote?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  restaurantMenuId?: string | null;
}

export class UpdateCartOrderTypeDto {
  @ApiProperty({ enum: OrderTypeEnum })
  @IsEnum(OrderTypeEnum)
  orderType!: OrderTypeEnum;
}

export class UpdateCartCouponDto {
  @ApiProperty()
  @IsString()
  couponCode!: string;
}

export class UpdateCartAddressDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  deliveryAddressId?: string | null;
}

export class CartCustomerScopeDto {
  @ApiPropertyOptional({
    description: 'Target customer id when admin/staff manages a customer cart',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    description:
      'Restaurant scope override when the admin token does not carry restaurantId',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}

export class QuoteCartDto {}

export class CheckoutCartDto {
  @ApiPropertyOptional({
    description:
      'Requested order time in ISO 8601 format. Falls back to saved cart orderTime, then current time.',
    example: '2026-03-24T19:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  orderTime?: string;

  @ApiPropertyOptional({ enum: PaymentMethodEnum })
  @IsOptional()
  @IsEnum(PaymentMethodEnum)
  paymentMethod?: PaymentMethodEnum;

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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  customerNote?: string | null;
}
