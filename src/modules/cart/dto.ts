import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderTypeEnum, PaymentMethodEnum } from '../../common/enums';

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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  couponCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  customerNote?: string | null;
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
}

export class QuoteCartDto {}

export class CheckoutCartDto {
  @ApiPropertyOptional({
    description:
      'Requested order time in ISO 8601 format. Defaults to current time when omitted.',
    example: '2026-03-24T19:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  orderTime?: string;

  @ApiProperty({ enum: PaymentMethodEnum })
  @IsEnum(PaymentMethodEnum)
  paymentMethod!: PaymentMethodEnum;
}
