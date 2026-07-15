import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { OrderTypeEnum, PaymentMethodEnum } from '../../common/enums';
import {
  GuestOrderContactDto,
  GuestOrderDeliveryAddressDto,
} from '../orders/dto';

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

export class CartItemModifierSelectionDto {
  @ApiProperty()
  @IsString()
  modifierGroupId!: string;

  @ApiProperty({ type: [CartItemModifierDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemModifierDto)
  modifiers!: CartItemModifierDto[];
}

export class CartItemSectionDto {
  @ApiProperty({ enum: CART_ITEM_SECTION_SLOT_VALUES })
  @IsIn(CART_ITEM_SECTION_SLOT_VALUES)
  slot!: (typeof CART_ITEM_SECTION_SLOT_VALUES)[number];

  @ApiProperty()
  @IsString()
  menuItemId!: string;
}

export class ReorderCartDto {
  @ApiProperty({
    description: 'Previous order id to copy into the active cart',
  })
  @IsString()
  orderId!: string;
}

export class AddCartItemDto {
  @ApiPropertyOptional({
    description:
      'Required when creating a cart from the first add-to-cart action',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: OrderTypeEnum })
  @IsOptional()
  @IsEnum(OrderTypeEnum)
  orderType?: OrderTypeEnum;

  @ApiProperty()
  @IsString()
  menuItemId!: string;

  @ApiPropertyOptional({
    description:
      'Fixed-price deal id when adding a ready-made deal item without customizations.',
  })
  @IsOptional()
  @IsString()
  dealId?: string;

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

  @ApiPropertyOptional({ type: [CartItemModifierSelectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemModifierSelectionDto)
  modifierSelections?: CartItemModifierSelectionDto[];

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

  @ApiPropertyOptional({ type: [CartItemModifierSelectionDto], nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemModifierSelectionDto)
  modifierSelections?: CartItemModifierSelectionDto[] | null;

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

export class UpdateCartDealDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
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
  @ValidateIf((_object, value) => value !== null)
  @IsOptional()
  @IsDateString()
  orderTime?: string | null;

  @ApiPropertyOptional({
    description:
      'Alias for scheduled delivery/takeaway time. If provided, it is saved as orderTime.',
    example: '2026-03-24T19:30:00.000Z',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsOptional()
  @IsDateString()
  scheduledDeliveryAt?: string | null;

  @ApiPropertyOptional({
    description: 'Optional customer tip saved on cart and applied at checkout',
    minimum: 0,
    example: 150,
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tipAmount?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  customerNote?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Alias for customerNote.',
  })
  @IsOptional()
  @IsString()
  note?: string | null;

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

export class QuoteCartDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  deliveryAddressId?: string | null;
}

export class CheckoutCartDto {
  @ApiPropertyOptional({
    description:
      'Requested order time in ISO 8601 format. Falls back to saved cart orderTime, then current time.',
    example: '2026-03-24T19:30:00.000Z',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsOptional()
  @IsDateString()
  orderTime?: string | null;

  @ApiPropertyOptional({
    description:
      'Alias for scheduled delivery/takeaway time. If provided, it overrides saved cart orderTime at checkout.',
    example: '2026-03-24T19:30:00.000Z',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsOptional()
  @IsDateString()
  scheduledDeliveryAt?: string | null;

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

  @ApiPropertyOptional({
    description:
      'Optional customer tip override for checkout. Falls back to saved cart tipAmount.',
    minimum: 0,
    example: 150,
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tipAmount?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  customerNote?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Alias for customerNote.',
  })
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({
    type: GuestOrderContactDto,
    description:
      'Required for guest customer checkout so the branch can contact the guest and record privacy-policy consent.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestOrderContactDto)
  guestContact?: GuestOrderContactDto;

  @ApiPropertyOptional({
    type: GuestOrderDeliveryAddressDto,
    description:
      'Inline delivery address for guest customer cart checkout. Used instead of a saved deliveryAddressId.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestOrderDeliveryAddressDto)
  guestDeliveryAddress?: GuestOrderDeliveryAddressDto;
}
