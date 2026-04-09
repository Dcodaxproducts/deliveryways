import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { AdminListQueryDto } from '../../common/dto';

export class AdminListCustomersDto extends AdminListQueryDto {
  @ApiPropertyOptional({ description: 'Filter customers by restaurant' })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}

export class AdminCustomerDetailsQueryDto {
  @ApiPropertyOptional({
    description: 'Restaurant scope for super admin lookups',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}

export class UpdateAdminCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Profile avatar URL (uploaded by frontend)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;
}

export class UpdateAdminCustomerStatusDto {
  @ApiProperty({
    description: 'Set customer account active/inactive state',
  })
  @IsBoolean()
  isActive!: boolean;
}

export class AdminForceDeleteUsersDto {
  @ApiProperty({
    type: [String],
    description: 'Email addresses to hard-delete',
  })
  @IsArray()
  @IsEmail({}, { each: true })
  emails!: string[];
}

export const ADMIN_DASHBOARD_TREND_RANGE_VALUES = [
  'daily',
  'weekly',
  'monthly',
] as const;
export type AdminDashboardTrendRange =
  (typeof ADMIN_DASHBOARD_TREND_RANGE_VALUES)[number];

export const ADMIN_DASHBOARD_TOP_RESTAURANTS_RANGE_VALUES = [
  'all-time',
  'daily',
  'weekly',
  'monthly',
] as const;
export type AdminDashboardTopRestaurantsRange =
  (typeof ADMIN_DASHBOARD_TOP_RESTAURANTS_RANGE_VALUES)[number];

export class AdminDashboardScopedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class AdminDashboardRestaurantTrendQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_DASHBOARD_TREND_RANGE_VALUES,
    default: 'daily',
  })
  @IsOptional()
  @IsIn(ADMIN_DASHBOARD_TREND_RANGE_VALUES)
  range?: AdminDashboardTrendRange;
}

export class AdminDashboardOrdersTrendQueryDto extends AdminDashboardScopedQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_DASHBOARD_TREND_RANGE_VALUES,
    default: 'daily',
  })
  @IsOptional()
  @IsIn(ADMIN_DASHBOARD_TREND_RANGE_VALUES)
  range?: AdminDashboardTrendRange;
}

export class AdminDashboardTopRestaurantsQueryDto extends AdminDashboardScopedQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_DASHBOARD_TOP_RESTAURANTS_RANGE_VALUES,
    default: 'all-time',
  })
  @IsOptional()
  @IsIn(ADMIN_DASHBOARD_TOP_RESTAURANTS_RANGE_VALUES)
  range?: AdminDashboardTopRestaurantsRange;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 5 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 5;
}
