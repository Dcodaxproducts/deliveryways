import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BillingInterval,
  PackageBillingModel,
  PackageCommissionType,
  PackagePayoutCycle,
  PaymentStatus,
  SubscriptionAdjustmentDirection,
  SubscriptionAdjustmentSource,
  SubscriptionDeductionStatus,
  SubscriptionDeductionType,
  SubscriptionStatus,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AdminListQueryDto } from '../../common/dto';

export class ListPackagePlansDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: PackageBillingModel })
  @IsOptional()
  @IsEnum(PackageBillingModel)
  billingModel?: PackageBillingModel;
}

export class CreatePackagePlanDto {
  @ApiProperty({ example: 'Growth Plan' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'For growing restaurants' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: PackageBillingModel })
  @IsEnum(PackageBillingModel)
  billingModel!: PackageBillingModel;

  @ApiPropertyOptional({
    enum: BillingInterval,
    default: BillingInterval.MONTHLY,
  })
  @IsOptional()
  @IsEnum(BillingInterval)
  billingInterval?: BillingInterval;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  planPrice?: number;

  @ApiPropertyOptional({
    enum: PackageCommissionType,
    default: PackageCommissionType.PERCENTAGE,
  })
  @IsOptional()
  @IsEnum(PackageCommissionType)
  commissionType?: PackageCommissionType;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  commissionFixedAmount?: number;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Maximum platform commission amount per order',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  commissionCapAmount?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPercentage?: number;

  @ApiPropertyOptional({
    enum: PackagePayoutCycle,
    default: PackagePayoutCycle.WEEKLY,
  })
  @IsOptional()
  @IsEnum(PackagePayoutCycle)
  payoutCycle?: PackagePayoutCycle;

  @ApiPropertyOptional({
    description: 'Terms and conditions document URL or storage key',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  termsDocumentUrl?: string;

  @ApiPropertyOptional({ default: 'PKR' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional({ description: 'Feature flags and limits for the plan' })
  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdatePackagePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: PackageBillingModel })
  @IsOptional()
  @IsEnum(PackageBillingModel)
  billingModel?: PackageBillingModel;

  @ApiPropertyOptional({ enum: BillingInterval })
  @IsOptional()
  @IsEnum(BillingInterval)
  billingInterval?: BillingInterval;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  planPrice?: number;

  @ApiPropertyOptional({ enum: PackageCommissionType })
  @IsOptional()
  @IsEnum(PackageCommissionType)
  commissionType?: PackageCommissionType;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  commissionFixedAmount?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  commissionCapAmount?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPercentage?: number;

  @ApiPropertyOptional({ enum: PackagePayoutCycle })
  @IsOptional()
  @IsEnum(PackagePayoutCycle)
  payoutCycle?: PackagePayoutCycle;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  termsDocumentUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class ListTenantSubscriptionsDto extends AdminListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}

export class AssignTenantSubscriptionDto {
  @ApiProperty()
  @IsString()
  tenantId!: string;

  @ApiPropertyOptional({
    description:
      'Optional restaurant scope. Empty means tenant-wide subscription.',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiProperty()
  @IsString()
  packagePlanId!: string;

  @ApiPropertyOptional({ enum: PaymentStatus, default: PaymentStatus.PENDING })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({
    enum: PackagePayoutCycle,
    description:
      'Restaurant-specific payout cycle override. Empty uses package plan payout cycle.',
  })
  @IsOptional()
  @IsEnum(PackagePayoutCycle)
  payoutCycleOverride?: PackagePayoutCycle | null;

  @ApiPropertyOptional({
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextBillingAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateTenantSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  packagePlanId?: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({
    enum: PackagePayoutCycle,
    description:
      'Restaurant-specific payout cycle override. Empty uses package plan payout cycle.',
  })
  @IsOptional()
  @IsEnum(PackagePayoutCycle)
  payoutCycleOverride?: PackagePayoutCycle | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextBillingAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SendTenantSubscriptionInvoiceDto {
  @ApiPropertyOptional({
    description:
      'Optional override recipient. Defaults to restaurant billing/support email.',
    example: 'billing@restaurant.test',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class WeeklyRestaurantPayoutInvoiceQueryDto {
  @ApiProperty()
  @IsString()
  restaurantId!: string;

  @ApiPropertyOptional({
    description: 'Inclusive period start. Defaults to the last 7 days.',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Exclusive period end. Defaults to now.',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class SendWeeklyRestaurantPayoutInvoiceDto extends WeeklyRestaurantPayoutInvoiceQueryDto {
  @ApiPropertyOptional({
    description:
      'Optional override recipient. Defaults to restaurant billing/support email.',
    example: 'billing@restaurant.test',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class ListSubscriptionDeductionsDto extends AdminListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subscriptionId?: string;

  @ApiPropertyOptional({ enum: SubscriptionDeductionType })
  @IsOptional()
  @IsEnum(SubscriptionDeductionType)
  type?: SubscriptionDeductionType;

  @ApiPropertyOptional({ enum: SubscriptionAdjustmentDirection })
  @IsOptional()
  @IsEnum(SubscriptionAdjustmentDirection)
  direction?: SubscriptionAdjustmentDirection;

  @ApiPropertyOptional({ enum: SubscriptionAdjustmentSource })
  @IsOptional()
  @IsEnum(SubscriptionAdjustmentSource)
  source?: SubscriptionAdjustmentSource;

  @ApiPropertyOptional({ example: 'POS' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  moduleCode?: string;

  @ApiPropertyOptional({ enum: SubscriptionDeductionStatus })
  @IsOptional()
  @IsEnum(SubscriptionDeductionStatus)
  status?: SubscriptionDeductionStatus;
}

export class CreateSubscriptionDeductionDto {
  @ApiProperty()
  @IsString()
  tenantId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subscriptionId?: string;

  @ApiPropertyOptional({ enum: SubscriptionDeductionType })
  @IsOptional()
  @IsEnum(SubscriptionDeductionType)
  type?: SubscriptionDeductionType;

  @ApiPropertyOptional({
    enum: SubscriptionAdjustmentDirection,
    default: SubscriptionAdjustmentDirection.CREDIT,
    description:
      'CHARGE increases the subscription invoice. CREDIT reduces it.',
  })
  @IsOptional()
  @IsEnum(SubscriptionAdjustmentDirection)
  direction?: SubscriptionAdjustmentDirection;

  @ApiPropertyOptional({
    enum: SubscriptionAdjustmentSource,
    default: SubscriptionAdjustmentSource.CUSTOM,
    description:
      'MODULE is for fixed restaurant-specific module fees such as POS.',
  })
  @IsOptional()
  @IsEnum(SubscriptionAdjustmentSource)
  source?: SubscriptionAdjustmentSource;

  @ApiPropertyOptional({
    example: 'POS',
    description: 'Required for MODULE charges. Stored uppercase.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  moduleCode?: string;

  @ApiProperty({ example: 'Manual adjustment' })
  @IsString()
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ minimum: 0.01 })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ default: 'PKR' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({ description: 'Earliest billing run date to apply' })
  @IsOptional()
  @IsDateString()
  appliesFrom?: string;
}

export class UpdateSubscriptionDeductionDto {
  @ApiPropertyOptional({ enum: SubscriptionDeductionStatus })
  @IsOptional()
  @IsEnum(SubscriptionDeductionStatus)
  status?: SubscriptionDeductionStatus;

  @ApiPropertyOptional({ enum: SubscriptionAdjustmentDirection })
  @IsOptional()
  @IsEnum(SubscriptionAdjustmentDirection)
  direction?: SubscriptionAdjustmentDirection;

  @ApiPropertyOptional({ enum: SubscriptionAdjustmentSource })
  @IsOptional()
  @IsEnum(SubscriptionAdjustmentSource)
  source?: SubscriptionAdjustmentSource;

  @ApiPropertyOptional({ example: 'POS' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  moduleCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ minimum: 0.01 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({ default: 'PKR' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  appliesFrom?: string;
}

export class MonthlyInvoiceDatevExportQueryDto {
  @ApiProperty({ example: 2026 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(2000)
  year!: number;

  @ApiProperty({ example: 7, minimum: 1, maximum: 12 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({ description: 'DATEV revenue account placeholder' })
  @IsOptional()
  @IsString()
  revenueAccount?: string;

  @ApiPropertyOptional({ description: 'DATEV debtor account placeholder' })
  @IsOptional()
  @IsString()
  debtorAccount?: string;

  @ApiPropertyOptional({ description: 'DATEV tax account placeholder' })
  @IsOptional()
  @IsString()
  taxAccount?: string;
}
