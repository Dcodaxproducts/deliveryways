import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CurrencyDisplayFormat,
  PaymentMethod,
  PlatformDateFormat,
  ServiceChargeType,
  VatHandlingRule,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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

export class PaymentMethodSettingDto {
  @ApiPropertyOptional({ enum: PaymentMethod, example: PaymentMethod.COD })
  @IsEnum(PaymentMethod)
  code!: PaymentMethod;

  @ApiPropertyOptional({ example: 'Cash on delivery' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TaxTypeSettingDto {
  @ApiPropertyOptional({ example: 'STANDARD' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;

  @ApiPropertyOptional({ example: 'Standard VAT' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  label?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, example: 19 })
  @Transform(({ value }) => Number(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percentage!: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateGlobalPaymentMethodsDto {
  @ApiPropertyOptional({ type: [PaymentMethodSettingDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentMethodSettingDto)
  paymentMethods!: PaymentMethodSettingDto[];
}

export class UpdateGlobalTaxTypesDto {
  @ApiPropertyOptional({ type: [TaxTypeSettingDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TaxTypeSettingDto)
  taxTypes!: TaxTypeSettingDto[];
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

  @ApiPropertyOptional({
    minimum: 15,
    maximum: 10080,
    example: 720,
    description:
      'Minutes after which an inactive customer cart is automatically cleared.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(15)
  @Max(10080)
  cartExpiryMinutes?: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'Deprecated. Service charge is configured per restaurant by super admin.',
  })
  @IsOptional()
  @IsBoolean()
  serviceChargeEnabled?: boolean;

  @ApiPropertyOptional({
    enum: ServiceChargeType,
    description:
      'Deprecated. Service charge type is configured per restaurant.',
  })
  @IsOptional()
  @IsEnum(ServiceChargeType)
  serviceChargeType?: ServiceChargeType;

  @ApiPropertyOptional({
    minimum: 0,
    example: 5,
    description:
      'Deprecated. Service charge value is configured per restaurant.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  serviceChargeValue?: number;

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

  @ApiPropertyOptional({ type: [PaymentMethodSettingDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentMethodSettingDto)
  paymentMethods?: PaymentMethodSettingDto[];

  @ApiPropertyOptional({ type: [TaxTypeSettingDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TaxTypeSettingDto)
  taxTypes?: TaxTypeSettingDto[];
}
