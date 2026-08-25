import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
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
  ValidateNested,
} from 'class-validator';
import { AdminListQueryDto } from '../../common/dto';
import {
  CouponAudience,
  CouponCampaignKind,
  CouponDealSelectionMode,
  CouponDiscountType,
  CouponStatus,
  DeliverymanStatus,
  GeneratedInvoiceKind,
  GeneratedInvoiceStatus,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { OrderTypeEnum } from '../../common/enums';

export class AdminListCustomersDto extends AdminListQueryDto {
  @ApiPropertyOptional({ description: 'Filter customers by restaurant' })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({
    description: 'Filter registered or guest customer accounts',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isGuest?: boolean;
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

export class RejectBusinessAdminDto {
  @ApiPropertyOptional({
    description: 'Reason stored on subscription refund/cancellation records',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
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

export class SignQzChallengeDto {
  @ApiProperty({
    description: 'Exact QZ Tray challenge payload to sign',
    maxLength: 16384,
  })
  @IsString()
  @MaxLength(16384)
  challenge!: string;
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

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  excludeStatus?: OrderStatus;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  successfulOnly?: boolean;

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

export class AdminExportDeliverymenCsvQueryDto extends AdminReportsScopedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: DeliverymanStatus })
  @IsOptional()
  @IsEnum(DeliverymanStatus)
  status?: DeliverymanStatus;
}

export class AdminExportCampaignsCsvQueryDto extends AdminReportsScopedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: CouponStatus })
  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;

  @ApiPropertyOptional({ enum: CouponDiscountType })
  @IsOptional()
  @IsEnum(CouponDiscountType)
  discountType?: CouponDiscountType;
}

export const ADMIN_REPORT_EXPORT_EMAIL_TYPES = [
  'menu',
  'orders',
  'customers',
  'deliverymen',
  'coupons',
  'promotions',
  'happy-hours',
] as const;
export type AdminReportExportEmailType =
  (typeof ADMIN_REPORT_EXPORT_EMAIL_TYPES)[number];

export class AdminEmailReportExportDto extends AdminReportsScopedQueryDto {
  @ApiProperty({ enum: ADMIN_REPORT_EXPORT_EMAIL_TYPES })
  @IsIn(ADMIN_REPORT_EXPORT_EMAIL_TYPES)
  type!: AdminReportExportEmailType;

  @ApiProperty({ example: 'manager@example.com' })
  @IsEmail()
  email!: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffRoleId?: string;
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

export class AdminGeneratedInvoicesQueryDto extends AdminReportsScopedQueryDto {
  @ApiPropertyOptional({ enum: GeneratedInvoiceKind })
  @IsOptional()
  @IsEnum(GeneratedInvoiceKind)
  kind?: GeneratedInvoiceKind;

  @ApiPropertyOptional({ enum: GeneratedInvoiceKind })
  @IsOptional()
  @IsEnum(GeneratedInvoiceKind)
  excludeKind?: GeneratedInvoiceKind;

  @ApiPropertyOptional({ enum: GeneratedInvoiceStatus })
  @IsOptional()
  @IsEnum(GeneratedInvoiceStatus)
  status?: GeneratedInvoiceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subscriptionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class AdminGeneratedInvoicePdfQueryDto extends AdminReportsScopedQueryDto {
  @ApiPropertyOptional({ enum: GeneratedInvoiceKind })
  @IsOptional()
  @IsEnum(GeneratedInvoiceKind)
  kind?: GeneratedInvoiceKind;
}

export class AdminInvoicesQueryDto extends AdminReportsScopedQueryDto {
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

  @ApiPropertyOptional({ enum: ['FLAT', 'PERCENTAGE', 'FIXED_PRICE'] })
  @IsOptional()
  @IsIn(['FLAT', 'PERCENTAGE', 'FIXED_PRICE'])
  discountType?: 'FLAT' | 'PERCENTAGE' | 'FIXED_PRICE';

  @ApiPropertyOptional({ enum: ['active', 'scheduled', 'expired', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'scheduled', 'expired', 'inactive'])
  lifecycle?: 'active' | 'scheduled' | 'expired' | 'inactive';
}

export class AdminPromotionStatsQueryDto extends AdminReportsScopedQueryDto {}

export class AdminDealCategoryScopeDto {
  @ApiProperty()
  @IsString()
  menuCategoryId!: string;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Required item count from this category for flexible deals.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  itemLimit?: number;

  @ApiPropertyOptional({
    description:
      'Optional variation forced for all selected deal items in this category.',
  })
  @IsOptional()
  @IsString()
  variationId?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Optional allow-list of items from this category. Empty means every active category item is eligible.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includedMenuItemIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Items excluded from this category rule after applying its allow-list.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedMenuItemIds?: string[];
}

export class ReorderAdminDealsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedDealIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class AdminPromotionBaseDto {
  @ApiPropertyOptional({
    description:
      'Optional internal code. Leave empty for automatic promotions/deals.',
  })
  @IsOptional()
  @IsString()
  code?: string;

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

  @ApiPropertyOptional({
    description: 'Promotion/deal image URL used as thumbnail in customer apps.',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Alias for imageUrl when frontend sends thumbnail wording.',
  })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ enum: ['FLAT', 'PERCENTAGE', 'FIXED_PRICE'] })
  @IsIn(['FLAT', 'PERCENTAGE', 'FIXED_PRICE'])
  discountType!: 'FLAT' | 'PERCENTAGE' | 'FIXED_PRICE';

  @ApiProperty({
    description:
      'Flat discount amount, percentage value, or final bundle price when discountType is FIXED_PRICE.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue!: number;

  @ApiPropertyOptional({
    description:
      'Flat discount amount, percentage value, or final bundle price when discountType is FIXED_PRICE.',
  })
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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeMenuItemIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeCategoryIds?: string[];

  @ApiPropertyOptional({
    type: [AdminDealCategoryScopeDto],
    description:
      'Category scope rules for flexible deals, including per-category item limits and forced variations.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminDealCategoryScopeDto)
  scopeCategories?: AdminDealCategoryScopeDto[];

  @ApiPropertyOptional({
    enum: CouponDealSelectionMode,
    description:
      'FIXED_ITEMS requires every scoped item; FLEXIBLE_ITEMS applies to any required quantity from scoped items/categories.',
  })
  @IsOptional()
  @IsEnum(CouponDealSelectionMode)
  dealSelectionMode?: CouponDealSelectionMode;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Required item count for FLEXIBLE_ITEMS deals, for example 2 for any-2.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  dealRequiredQuantity?: number;

  @ApiPropertyOptional({
    enum: ['ORDER_TOTAL', 'SCOPED_ITEMS'],
    default: 'SCOPED_ITEMS',
  })
  @IsOptional()
  @IsIn(['ORDER_TOTAL', 'SCOPED_ITEMS'])
  applyMode?: 'ORDER_TOTAL' | 'SCOPED_ITEMS';

  @ApiPropertyOptional({
    default: true,
    description: 'Auto-apply this promotion without coupon code.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  autoApply?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAdminPromotionDto extends AdminPromotionBaseDto {}

export class CreateAdminGiftCardDto extends OmitType(AdminPromotionBaseDto, [
  'discountType',
  'discountValue',
  'maxDiscountAmount',
  'minOrderAmount',
  'scopeMenuItemId',
  'scopeCategoryId',
  'scopeMenuItemIds',
  'scopeCategoryIds',
  'scopeCategories',
  'applyMode',
  'autoApply',
] as const) {
  @ApiProperty({
    description: 'Wallet amount credited when the gift card code is redeemed.',
    minimum: 0,
    example: 1000,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;
}

export class CreateAdminDealDto extends OmitType(AdminPromotionBaseDto, [
  'discountType',
  'maxDiscountAmount',
  'minOrderAmount',
  'scopeMenuItemId',
  'scopeCategoryId',
  'applyMode',
  'autoApply',
  'startsAt',
  'expiresAt',
] as const) {
  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'Optional for deals. Null keeps the start date empty.',
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'Optional for deals. Null keeps the end date empty.',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiPropertyOptional({
    type: [String],
    minItems: 2,
    description:
      'Selected menu item IDs included in this deal. Required for fixed item deals unless category scope is used for a flexible deal.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeMenuItemIds?: string[];

  @ApiPropertyOptional({
    type: [AdminDealCategoryScopeDto],
    description:
      'Category scope rules for flexible deals, including per-category item limits and forced variations.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminDealCategoryScopeDto)
  scopeCategories?: AdminDealCategoryScopeDto[];
}

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

  @ApiPropertyOptional({ enum: CouponAudience })
  @IsOptional()
  @IsEnum(CouponAudience)
  audience?: CouponAudience;

  @ApiPropertyOptional({
    description: 'Promotion/deal image URL used as thumbnail in customer apps.',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Alias for imageUrl when frontend sends thumbnail wording.',
  })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: ['FLAT', 'PERCENTAGE', 'FIXED_PRICE'] })
  @IsOptional()
  @IsIn(['FLAT', 'PERCENTAGE', 'FIXED_PRICE'])
  discountType?: 'FLAT' | 'PERCENTAGE' | 'FIXED_PRICE';

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

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeMenuItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeCategoryId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeMenuItemIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeCategoryIds?: string[];

  @ApiPropertyOptional({
    enum: CouponDealSelectionMode,
    description:
      'FIXED_ITEMS requires every scoped item; FLEXIBLE_ITEMS applies to any required quantity from scoped items/categories.',
  })
  @IsOptional()
  @IsEnum(CouponDealSelectionMode)
  dealSelectionMode?: CouponDealSelectionMode;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Required item count for FLEXIBLE_ITEMS deals, for example 2 for any-2.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  dealRequiredQuantity?: number;

  @ApiPropertyOptional({ enum: ['ORDER_TOTAL', 'SCOPED_ITEMS'] })
  @IsOptional()
  @IsIn(['ORDER_TOTAL', 'SCOPED_ITEMS'])
  applyMode?: 'ORDER_TOTAL' | 'SCOPED_ITEMS';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  autoApply?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminGiftCardDto extends OmitType(UpdateAdminPromotionDto, [
  'discountType',
  'maxDiscountAmount',
  'minOrderAmount',
  'scopeMenuItemId',
  'scopeCategoryId',
  'scopeMenuItemIds',
  'scopeCategoryIds',
  'applyMode',
  'autoApply',
] as const) {
  @ApiPropertyOptional({
    description: 'Wallet amount credited when the gift card code is redeemed.',
    minimum: 0,
    example: 1000,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;
}

export class UpdateAdminDealDto extends OmitType(UpdateAdminPromotionDto, [
  'discountType',
  'maxDiscountAmount',
  'minOrderAmount',
  'scopeMenuItemId',
  'scopeCategoryId',
  'applyMode',
  'autoApply',
] as const) {
  @ApiPropertyOptional({
    type: [String],
    minItems: 2,
    description: 'Selected menu item IDs included in this deal.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeMenuItemIds?: string[];

  @ApiPropertyOptional({
    type: [AdminDealCategoryScopeDto],
    description:
      'Category scope rules for flexible deals, including per-category item limits and forced variations.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminDealCategoryScopeDto)
  scopeCategories?: AdminDealCategoryScopeDto[];
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
  connectionType?: 'USB' | 'LAN' | 'BLUETOOTH' | 'CLOUD' | null;

  @ApiPropertyOptional({ enum: ['A4', 'A5', '80MM', '58MM'], default: '80MM' })
  @IsOptional()
  @IsIn(['A4', 'A5', '80MM', '58MM'])
  paperSize?: 'A4' | 'A5' | '80MM' | '58MM';

  @ApiPropertyOptional({
    enum: ['PIXEL_HTML', 'ESC_POS'],
    default: 'PIXEL_HTML',
  })
  @IsOptional()
  @IsIn(['PIXEL_HTML', 'ESC_POS'])
  printMode?: 'PIXEL_HTML' | 'ESC_POS';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  printerName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  printerTarget?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ipAddress?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  queueName?: string | null;
}

export class AdminPrintingStatusQueryDto extends AdminPrintingScopedQueryDto {}

export class ReportAdminPrinterEventDto {
  @ApiProperty({ enum: ['success', 'failed', 'warning'] })
  @IsIn(['success', 'failed', 'warning'])
  status!: 'success' | 'failed' | 'warning';

  @ApiProperty({
    enum: ['discovery', 'connection', 'test_print', 'order_print'],
  })
  @IsIn(['discovery', 'connection', 'test_print', 'order_print'])
  event!: 'discovery' | 'connection' | 'test_print' | 'order_print';

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  printerName?: string;
}

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
