import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  RestaurantPayoutRequestStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsArray,
  IsDefined,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QueryDto } from '../../common/dto';

export class CreatePaymentAttemptDto {
  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateSubscriptionPaymentAttemptDto {
  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class SendSubscriptionPaymentRequestDto extends CreateSubscriptionPaymentAttemptDto {
  @ApiPropertyOptional({ description: 'Optional owner email override' })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ description: 'Optional frontend payment page URL' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  paymentUrl?: string;
}

export class MarkSubscriptionManualPaidDto {
  @ApiProperty({
    enum: ['BANK_TRANSFER', 'COD', 'CARD_ON_DELIVERY'],
  })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiProperty({ maxLength: 191 })
  @IsString()
  @MaxLength(191)
  paymentReference!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiptUrl?: string;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  note!: string;
}

export class ListPaymentsDto extends QueryDto {
  @ApiPropertyOptional()
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
  orderId?: string;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentTransactionType })
  @IsOptional()
  @IsEnum(PaymentTransactionType)
  type?: PaymentTransactionType;
}

export class RestaurantPaymentManagementQueryDto extends QueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentTransactionType })
  @IsOptional()
  @IsEnum(PaymentTransactionType)
  type?: PaymentTransactionType;
}

export class UpdatePaymentStatusDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  providerData?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class AdminUpdatePaymentStatusDto extends UpdatePaymentStatusDto {
  @ApiPropertyOptional({
    enum: [PaymentStatus.PAID, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
  })
  @IsEnum(PaymentStatus)
  status!: PaymentStatus;
}

export class RefundPaymentDto {
  @ApiPropertyOptional({ description: 'Defaults to the source charge amount' })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  providerData?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateRestaurantPaymentMethodsDto {
  @ApiPropertyOptional({ enum: PaymentMethod, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(PaymentMethod, { each: true })
  allowedPaymentMethods!: PaymentMethod[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  walletEnabled?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateRestaurantStripeAccountDto {
  @ApiPropertyOptional({ maxLength: 191 })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  accountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  payoutsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  chargesEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onboardingComplete?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dashboardUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateRestaurantStripeTransferDto {
  @ApiPropertyOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  currency?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ maxLength: 191 })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  idempotencyKey?: string;
}

export class RestaurantPayoutBankDetailsDto {
  @ApiPropertyOptional({ example: 'HBL' })
  @IsString()
  @MaxLength(120)
  bankName!: string;

  @ApiPropertyOptional({ example: 'Restaurant Owner' })
  @IsString()
  @MaxLength(160)
  accountTitle!: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsString()
  @MaxLength(80)
  accountNumber!: string;

  @ApiPropertyOptional({ example: 'PK36SCBL0000001123456702' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  iban?: string;

  @ApiPropertyOptional({ example: '03410000000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

export class ListRestaurantPayoutRequestsDto extends QueryDto {
  @ApiPropertyOptional({ enum: RestaurantPayoutRequestStatus })
  @IsOptional()
  @IsEnum(RestaurantPayoutRequestStatus)
  status?: RestaurantPayoutRequestStatus;
}

export class CreateRestaurantPayoutRequestDto {
  @ApiPropertyOptional({ minimum: 0.01 })
  @Transform(({ value }) => Number(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({ type: RestaurantPayoutBankDetailsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RestaurantPayoutBankDetailsDto)
  bankDetails!: RestaurantPayoutBankDetailsDto;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReviewRestaurantPayoutRequestDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class MarkRestaurantPayoutPaidDto {
  @ApiPropertyOptional({ maxLength: 191 })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  paymentReference?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
