import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { QueryDto } from '../../common/dto';

export class CustomerAppCustomerScopeDto {
  @ApiPropertyOptional({
    description:
      'Target customer id when admin/staff manages customer app data on behalf of a customer',
  })
  @IsOptional()
  @IsString()
  customerId?: string;
}

export class ToggleFavoriteDto {
  @ApiProperty()
  @IsString()
  menuItemId!: string;
}

export class PublicRestaurantQueryDto {
  @ApiPropertyOptional({
    description:
      'Optional for authenticated customers; token restaurant scope is used when available',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Optional FAQ category filter' })
  @IsOptional()
  @IsString()
  category?: string;
}

export class PublicMenuItemBySlugQueryDto extends PublicRestaurantQueryDto {}

export class ListCustomerFavoritesQueryDto extends QueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class ListCuisinesQueryDto extends QueryDto {
  @ApiPropertyOptional({
    description:
      'Optional for authenticated customers; token restaurant scope is used when available',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class ListCuisineItemsQueryDto extends QueryDto {
  @ApiPropertyOptional({
    description:
      'Optional for authenticated customers; token restaurant scope is used when available',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class ListPromotionalItemsQueryDto extends PublicRestaurantQueryDto {
  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 25 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(25)
  limit = 8;
}

export class ListCustomerPromotionsQueryDto extends PublicRestaurantQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class HomeScreenQueryDto extends PublicRestaurantQueryDto {
  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 25 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(25)
  promotionLimit = 8;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 25 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(25)
  cuisineLimit = 12;
}

export class RedeemLoyaltyPointsDto {
  @ApiProperty({ minimum: 1, example: 100 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  points!: number;

  @ApiPropertyOptional({
    enum: ['WALLET'],
    description: 'Current supported target is wallet credit',
  })
  @IsOptional()
  @IsString()
  target?: 'WALLET';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class RedeemGiftCardDto {
  @ApiProperty({
    description: 'Gift card code scanned or entered by the customer',
    example: 'GIFT-ABCD1234',
  })
  @IsString()
  code!: string;

  @ApiPropertyOptional({
    description: 'Optional branch context for branch-scoped gift cards',
  })
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class CreateTableReservationDto {
  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty({
    description: 'Reservation date/time in ISO 8601 format',
    example: '2026-03-30T19:30:00.000Z',
  })
  @IsDateString()
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

export const TABLE_RESERVATION_STATUS_VALUES = [
  'REQUESTED',
  'CONFIRMED',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type TableReservationStatus =
  (typeof TABLE_RESERVATION_STATUS_VALUES)[number];

export class ListTableReservationsQueryDto extends QueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class ListAdminTableReservationsQueryDto extends ListTableReservationsQueryDto {
  @ApiPropertyOptional({
    description:
      'Required for super admin/business admin tokens without restaurant scope',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ enum: TABLE_RESERVATION_STATUS_VALUES })
  @IsOptional()
  @IsIn(TABLE_RESERVATION_STATUS_VALUES)
  status?: (typeof TABLE_RESERVATION_STATUS_VALUES)[number];
}

export class UpdateTableReservationStatusDto {
  @ApiProperty({ enum: TABLE_RESERVATION_STATUS_VALUES })
  @IsIn(TABLE_RESERVATION_STATUS_VALUES)
  status!: TableReservationStatus;

  @ApiPropertyOptional({
    description:
      'Required for super admin/business admin tokens without restaurant scope',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Optional customer scope to avoid scanning all customers',
  })
  @IsOptional()
  @IsString()
  customerId?: string;
}

export class WalletLoyaltyQuoteDto {
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
}

export class ListWalletHistoryQueryDto extends QueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class CreateWalletTopUpDto {
  @ApiProperty({ minimum: 0.01, example: 1000 })
  @Transform(({ value }) => Number(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ maxLength: 50, example: 'PKR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Wallet top-up from app checkout flow' })
  @IsOptional()
  @IsString()
  note?: string;
}
