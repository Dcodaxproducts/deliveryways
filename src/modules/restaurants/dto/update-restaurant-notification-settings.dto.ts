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

class EmailNotificationChannelDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 'jhondoe@example.com' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsEmail()
  emailAddress?: string;
}

class PhoneNotificationChannelDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: '+923001234567' })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  phoneNumber?: string;
}

export class UpdateRestaurantNotificationSettingsDto {
  @ApiPropertyOptional({ type: EmailNotificationChannelDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailNotificationChannelDto)
  email?: EmailNotificationChannelDto;

  @ApiPropertyOptional({ type: PhoneNotificationChannelDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PhoneNotificationChannelDto)
  sms?: PhoneNotificationChannelDto;

  @ApiPropertyOptional({ type: PhoneNotificationChannelDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PhoneNotificationChannelDto)
  whatsapp?: PhoneNotificationChannelDto;
}
