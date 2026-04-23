import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { AdminListQueryDto } from '../../common/dto';
import { CouponCampaignKind, OrderStatus, PaymentStatus } from '@prisma/client';
import { OrderTypeEnum } from '../../common/enums';

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

export class AdminDashboardRevenueTrendQueryDto extends AdminDashboardScopedQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_DASHBOARD_TREND_RANGE_VALUES,
    default: 'daily',
  })
  @IsOptional()
  @IsIn(ADMIN_DASHBOARD_TREND_RANGE_VALUES)
  range?: AdminDashboardTrendRange;
}

export class AdminDashboardOrdersStatsQueryDto extends AdminDashboardScopedQueryDto {}

export class AdminDashboardCustomersStatsQueryDto extends AdminDashboardScopedQueryDto {}

export class AdminDashboardRestaurantOverviewQueryDto extends AdminDashboardScopedQueryDto {}

export class AdminDashboardDeliverymenStatsQueryDto extends AdminDashboardScopedQueryDto {}

export class AdminDashboardEmployeesStatsQueryDto extends AdminDashboardScopedQueryDto {}

export class AdminDashboardSystemAlertsQueryDto extends AdminDashboardScopedQueryDto {}

export class AdminDashboardRecentActivityQueryDto extends AdminDashboardScopedQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
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

export class AdminReportsScopedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class AdminExportMenuCsvQueryDto extends AdminReportsScopedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Optional restaurant menu filter' })
  @IsOptional()
  @IsString()
  menuId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}

export class AdminExportOrdersCsvQueryDto extends AdminReportsScopedQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: OrderTypeEnum })
  @IsOptional()
  @IsEnum(OrderTypeEnum)
  orderType?: OrderTypeEnum;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ enum: ['order', 'group-orders'] })
  @IsOptional()
  @IsIn(['order', 'group-orders'])
  kind?: 'order' | 'group-orders';

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class AdminExportCustomersCsvQueryDto extends AdminReportsScopedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class AdminOrdersReportQueryDto extends AdminExportOrdersCsvQueryDto {}

export class AdminFinancialReportQueryDto extends AdminReportsScopedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class AdminPromotionsOverviewQueryDto extends AdminReportsScopedQueryDto {}

export class AdminListPromotionsQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: CouponCampaignKind })
  @IsOptional()
  @IsEnum(CouponCampaignKind)
  kind?: CouponCampaignKind;

  @ApiPropertyOptional({ enum: ['active', 'scheduled', 'expired', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'scheduled', 'expired', 'inactive'])
  lifecycle?: 'active' | 'scheduled' | 'expired' | 'inactive';
}

export class AdminPromotionStatsQueryDto extends AdminReportsScopedQueryDto {}

export class AdminPromotionBaseDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ enum: ['FLAT', 'PERCENTAGE'] })
  @IsIn(['FLAT', 'PERCENTAGE'])
  discountType!: 'FLAT' | 'PERCENTAGE';

  @ApiProperty()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeMenuItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeCategoryId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAdminPromotionDto extends AdminPromotionBaseDto {}

export class UpdateAdminPromotionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: ['FLAT', 'PERCENTAGE'] })
  @IsOptional()
  @IsIn(['FLAT', 'PERCENTAGE'])
  discountType?: 'FLAT' | 'PERCENTAGE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue?: number;

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

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeMenuItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAdminHappyHourDto extends AdminPromotionBaseDto {
  @ApiProperty({
    type: [Number],
    description: 'UTC days, 0=Sunday ... 6=Saturday',
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  activeDays!: number[];

  @ApiProperty({ example: '14:00' })
  @IsString()
  dailyStartTime!: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  dailyEndTime!: string;
}

export class UpdateAdminHappyHourDto extends UpdateAdminPromotionDto {
  @ApiPropertyOptional({
    type: [Number],
    description: 'UTC days, 0=Sunday ... 6=Saturday',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  activeDays?: number[];

  @ApiPropertyOptional({ example: '14:00' })
  @IsOptional()
  @IsString()
  dailyStartTime?: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsOptional()
  @IsString()
  dailyEndTime?: string;
}

export class AdminPrintingScopedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class UpdateAdminPrintingSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoPrintOnNewOrder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoPrintOnStatusChange?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  printCustomerReceipt?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  printKitchenTicket?: boolean;

  @ApiPropertyOptional({ enum: ['USB', 'LAN', 'BLUETOOTH', 'CLOUD'] })
  @IsOptional()
  @IsIn(['USB', 'LAN', 'BLUETOOTH', 'CLOUD'])
  connectionType?: 'USB' | 'LAN' | 'BLUETOOTH' | 'CLOUD';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  printerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  printerTarget?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  queueName?: string;
}

export class AdminPrintingStatusQueryDto extends AdminPrintingScopedQueryDto {}

export class AdminPrintingLogsQueryDto extends AdminPrintingScopedQueryDto {
  @ApiPropertyOptional({ enum: ['success', 'failed', 'warning'] })
  @IsOptional()
  @IsIn(['success', 'failed', 'warning'])
  status?: 'success' | 'failed' | 'warning';

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
