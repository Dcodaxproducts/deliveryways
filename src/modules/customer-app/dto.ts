import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { QueryDto } from '../../common/dto';

export class CustomerAppCustomerScopeDto {
  @ApiPropertyOptional({
    description:
      'Target customer id when admin/staff manages customer favorites',
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
