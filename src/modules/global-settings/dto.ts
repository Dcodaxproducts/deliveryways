import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CurrencyDisplayFormat,
  PlatformDateFormat,
  VatHandlingRule,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

const normalizeOptionalString = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : '';
};

class NotificationChannelPreferenceDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  whatsapp?: boolean;
}

class NotificationTypesDto {
  @ApiPropertyOptional({ type: NotificationChannelPreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelPreferenceDto)
  newOrder?: NotificationChannelPreferenceDto;

  @ApiPropertyOptional({ type: NotificationChannelPreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelPreferenceDto)
  orderCancelled?: NotificationChannelPreferenceDto;

  @ApiPropertyOptional({ type: NotificationChannelPreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelPreferenceDto)
  printerError?: NotificationChannelPreferenceDto;

  @ApiPropertyOptional({ type: NotificationChannelPreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelPreferenceDto)
  dailyReport?: NotificationChannelPreferenceDto;

  @ApiPropertyOptional({ type: NotificationChannelPreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelPreferenceDto)
  payoutUpdate?: NotificationChannelPreferenceDto;
}

class NotificationSettingsDto {
  @ApiPropertyOptional({ example: 'jhondoe@example.com' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsEmail()
  emailAddress?: string;

  @ApiPropertyOptional({ example: '+923001234567' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: '+923001234567' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  whatsappNumber?: string;

  @ApiPropertyOptional({ type: NotificationTypesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTypesDto)
  notificationTypes?: NotificationTypesDto;
}

export class UpdateGlobalSettingsDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100, example: 5 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  globalTaxPercentage?: number;

  @ApiPropertyOptional({ enum: VatHandlingRule })
  @IsOptional()
  @IsEnum(VatHandlingRule)
  vatHandlingRule?: VatHandlingRule;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, example: 10 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  defaultCommissionPercentage?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, example: 2 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  defaultHybridFeePercentage?: number;

  @ApiPropertyOptional({ example: 'PKR' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  defaultCurrency?: string;

  @ApiPropertyOptional({ enum: CurrencyDisplayFormat })
  @IsOptional()
  @IsEnum(CurrencyDisplayFormat)
  currencyDisplayFormat?: CurrencyDisplayFormat;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  @Matches(/^[A-Za-z]{2,10}(-[A-Za-z0-9]{2,10})?$/)
  defaultLanguage?: string;

  @ApiPropertyOptional({ enum: PlatformDateFormat })
  @IsOptional()
  @IsEnum(PlatformDateFormat)
  dateFormat?: PlatformDateFormat;

  @ApiPropertyOptional({ example: 'Asia/Karachi' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: '#FF6B00' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  @Matches(HEX_COLOR_REGEX)
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#1F2937' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  @Matches(HEX_COLOR_REGEX)
  secondaryColor?: string;

  @ApiPropertyOptional({ example: 'Inter' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  fontFamily?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isTaxEnforced?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCommissionEnforced?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCurrencyEnforced?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isLocalizationEnforced?: boolean;

  @ApiPropertyOptional({ type: NotificationSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationSettingsDto)
  notificationSettings?: NotificationSettingsDto;
}
