import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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
