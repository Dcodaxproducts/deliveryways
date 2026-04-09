import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AdminLoyaltyProgramQueryDto {
  @ApiPropertyOptional({
    description:
      'Required for super admin/business admin tokens without restaurant scope',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}

export class AdjustCustomerLoyaltyPointsDto {
  @ApiProperty({ minimum: 1, example: 100 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  points!: number;

  @ApiPropertyOptional({
    description: 'Use false to deduct points instead of adding them',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return value === 'true' || value === '1';
  })
  @IsBoolean()
  isCredit = true;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class UpdateLoyaltyProgramDto extends AdminLoyaltyProgramQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pointsPerCurrencyUnit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  currencyAmountPerPoint?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  redemptionValuePerPoint?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
  )
  @IsInt()
  @Min(0)
  minimumRedeemPoints?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
  )
  @IsInt()
  @Min(0)
  pointsExpiryDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return value === 'true' || value === '1';
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return value === 'true' || value === '1';
  })
  @IsBoolean()
  allowWalletConversion?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return value === 'true' || value === '1';
  })
  @IsBoolean()
  allowOrderDiscount?: boolean;
}
