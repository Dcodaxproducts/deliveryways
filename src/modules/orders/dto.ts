import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { QueryDto } from '../../common/dto';
import { OrderTypeEnum, PaymentMethodEnum } from '../../common/enums';

export const ORDER_ITEM_SECTION_SLOT_VALUES = ['LEFT', 'RIGHT'] as const;

const trimStringValue = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmailValue = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

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

export class OrderItemModifierSelectionDto {
  @ApiProperty()
  @IsString()
  modifierGroupId!: string;

  @ApiProperty({ type: [OrderItemModifierDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemModifierDto)
  modifiers!: OrderItemModifierDto[];
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

  @ApiPropertyOptional({
    description:
      'Fixed-price deal id when quoting a ready-made deal item without customizations.',
  })
  @IsOptional()
  @IsString()
  dealId?: string;

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

  @ApiPropertyOptional({ type: [OrderItemModifierSelectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemModifierSelectionDto)
  modifierSelections?: OrderItemModifierSelectionDto[];

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

export class GuestOrderContactDto {
  @ApiProperty({ example: 'Max Mustermann' })
  @Transform(({ value }) => trimStringValue(value as unknown))
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/\p{L}/u)
  firstName!: string;

  @ApiPropertyOptional({ example: 'Khan' })
  @IsOptional()
  @Transform(({ value }) => trimStringValue(value as unknown))
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ example: 'guest@example.com' })
  @Transform(({ value }) => normalizeEmailValue(value as unknown))
  @IsEmail()
  @MaxLength(254)
  @Matches(/^(?!.*@guest\.deliveryways?(?:\.local)?$).+$/i)
  email!: string;

  @ApiPropertyOptional({ example: '+49 151 23456789' })
  @IsOptional()
  @Transform(({ value }) => trimStringValue(value as unknown))
  @IsString()
  @MaxLength(30)
  @Matches(/^(?=(?:\D*\d){7,15}\D*$)[+()\d\s./-]+$/)
  phone?: string;

  @ApiProperty({
    description:
      'Must be true when a guest accepts the restaurant privacy/data policy before checkout.',
    example: true,
  })
  @IsBoolean()
  privacyPolicyAccepted!: boolean;
}

export class GuestOrderDeliveryAddressDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street!: string;

  @ApiPropertyOptional({ description: 'Customer house number' })
  @IsOptional()
  @IsString()
  houseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiPropertyOptional({
    description: 'Legacy second address line. Prefer houseNumber.',
  })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  country!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @IsLatitude()
  lat!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @IsLongitude()
  lng!: string;
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

  @ApiPropertyOptional({ enum: PaymentMethodEnum })
  @IsOptional()
  @IsEnum(PaymentMethodEnum)
  paymentMethod?: PaymentMethodEnum;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  @ApiPropertyOptional({
    type: GuestOrderDeliveryAddressDto,
    description:
      'Inline delivery address for guest customer checkout. Used instead of deliveryAddressId.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestOrderDeliveryAddressDto)
  guestDeliveryAddress?: GuestOrderDeliveryAddressDto;

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

  @ApiPropertyOptional({
    description: 'Optional customer tip applied to the order total',
    minimum: 0,
    example: 150,
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tipAmount?: number;

  @ApiPropertyOptional({
    description:
      'Requested order time in ISO 8601 format. Optional for pickup/takeaway checkout.',
    example: '2026-03-24T19:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  orderTime?: string;

  @ApiPropertyOptional({
    description:
      'True only when orderTime was explicitly selected as a scheduled order.',
  })
  @IsOptional()
  @IsBoolean()
  isScheduled?: boolean;
}

export class CreateOrderDto extends QuoteOrderDto {
  @ApiProperty({ enum: PaymentMethodEnum })
  @IsEnum(PaymentMethodEnum)
  declare paymentMethod: PaymentMethodEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerNote?: string;

  @ApiPropertyOptional({
    type: GuestOrderContactDto,
    description:
      'Required for guest customer order placement so branch can contact the guest.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestOrderContactDto)
  guestContact?: GuestOrderContactDto;
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

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  excludeStatus?: OrderStatus;

  @ApiPropertyOptional({ enum: OrderTypeEnum })
  @IsOptional()
  @IsEnum(OrderTypeEnum)
  orderType?: OrderTypeEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  orderTimeFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  orderTimeTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isScheduled?: boolean;

  @ApiPropertyOptional({
    enum: ORDER_LIST_KIND_VALUES,
    description:
      'Filter orders list to only regular orders or only group-checkout orders',
  })
  @IsOptional()
  @IsIn(ORDER_LIST_KIND_VALUES)
  kind?: (typeof ORDER_LIST_KIND_VALUES)[number];
}

export const DELIVERY_FULFILLMENT_MODE_VALUES = ['IN_APP', 'EXTERNAL'] as const;

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional({
    description:
      'Required when a branch accepts an order by moving it from PLACED to CONFIRMED.',
    example: '2026-03-24T19:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  orderTime?: string;

  @ApiPropertyOptional({
    enum: DELIVERY_FULFILLMENT_MODE_VALUES,
    description:
      'Use EXTERNAL when the branch sends a delivery order with an offline/outside rider instead of an in-app deliveryman.',
  })
  @IsOptional()
  @IsIn(DELIVERY_FULFILLMENT_MODE_VALUES)
  deliveryFulfillmentMode?: (typeof DELIVERY_FULFILLMENT_MODE_VALUES)[number];

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

export class SubmitOrderReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
