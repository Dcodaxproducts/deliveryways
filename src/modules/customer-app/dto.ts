import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
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
  @ApiProperty()
  @IsString()
  restaurantId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;
}

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
  @ApiProperty()
  @IsString()
  restaurantId!: string;

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
  @ApiProperty()
  @IsString()
  restaurantId!: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
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

export class ListTableReservationsQueryDto extends QueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
