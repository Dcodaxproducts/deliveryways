import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  CouponAudience,
  CouponDiscountType,
  CouponStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { QueryDto } from '../../common/dto';

export class CouponInputDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: CouponAudience,
    default: CouponAudience.BOTH,
    description: 'Customer audience allowed to see and use this campaign',
  })
  @IsOptional()
  @IsEnum(CouponAudience)
  audience?: CouponAudience;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ enum: CouponDiscountType })
  @IsEnum(CouponDiscountType)
  discountType!: CouponDiscountType;

  @ApiProperty({
    description:
      'Flat discount amount, percentage value, or final scoped-item bundle price when discountType is FIXED_PRICE.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsesPerCustomer?: number;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  expiresAt!: string;

  @ApiPropertyOptional({ description: 'Optional menu item scope' })
  @IsOptional()
  @IsString()
  scopeMenuItemId?: string;

  @ApiPropertyOptional({ description: 'Optional category scope' })
  @IsOptional()
  @IsString()
  scopeCategoryId?: string;
}

export class CreateCouponDto extends CouponInputDto {
  @ApiPropertyOptional({
    description:
      'Required when the authenticated user does not have restaurant context.',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}

export class UpdateCouponDto extends PartialType(CouponInputDto) {
  @ApiPropertyOptional({
    description:
      'Restaurant scope for clients that toggle coupons from scoped lists.',
  })
  @IsOptional()
  @Transform(
    ({ obj, value }: { obj: { restaurant_id?: unknown }; value: unknown }) =>
      value ?? obj.restaurant_id,
  )
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({
    description: 'Snake-case alias for restaurantId.',
  })
  @IsOptional()
  @IsString()
  restaurant_id?: string;

  @ApiPropertyOptional({ enum: CouponStatus })
  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class ListCouponsDto extends QueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: CouponStatus })
  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;
}

export class ValidateCouponDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  subtotal!: number;

  @ApiProperty({ description: 'Optional for scoped coupon checks' })
  @IsOptional()
  @IsString({ each: true })
  menuItemIds?: string[];

  @ApiProperty({ description: 'Optional for scoped coupon checks' })
  @IsOptional()
  @IsString({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({
    description: 'Optional customer id override (admin only)',
  })
  @IsOptional()
  @IsString()
  customerId?: string;
}

export class SetCouponStatusDto {
  @ApiPropertyOptional({
    description:
      'Required when the authenticated user does not have restaurant context.',
  })
  @IsOptional()
  @Transform(
    ({ obj, value }: { obj: { restaurant_id?: unknown }; value: unknown }) =>
      value ?? obj.restaurant_id,
  )
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({
    description: 'Snake-case alias for restaurantId.',
  })
  @IsOptional()
  @IsString()
  restaurant_id?: string;

  @ApiProperty({ enum: CouponStatus })
  @IsEnum(CouponStatus)
  status!: CouponStatus;
}

export class SetCouponStatusScopeQueryDto {
  @ApiPropertyOptional({
    description:
      'Restaurant scope fallback for clients that send status scope in query params.',
  })
  @IsOptional()
  @Transform(
    ({ obj, value }: { obj: { restaurant_id?: unknown }; value: unknown }) =>
      value ?? obj.restaurant_id,
  )
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({
    description: 'Snake-case alias for restaurantId.',
  })
  @IsOptional()
  @IsString()
  restaurant_id?: string;
}
