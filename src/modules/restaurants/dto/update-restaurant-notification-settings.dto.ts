import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

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

export class UpdateRestaurantNotificationSettingsDto {
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
