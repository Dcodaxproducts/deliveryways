import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  PushPlatform,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { QueryDto } from '../../common/dto';

export class ListNotificationsDto extends QueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentTransactionId?: string;

  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ enum: NotificationAudience })
  @IsOptional()
  @IsEnum(NotificationAudience)
  audience?: NotificationAudience;

  @ApiPropertyOptional({
    description: 'Filter by seen/unseen state',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  seen?: boolean;
}

export class RegisterPushTokenDto {
  @ApiPropertyOptional({ enum: PushPlatform, default: PushPlatform.ANDROID })
  @IsOptional()
  @IsEnum(PushPlatform)
  platform: PushPlatform = PushPlatform.ANDROID;

  @ApiProperty({
    description: 'Firebase Cloud Messaging registration token',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    example: 'com.dcodax.deliveryway_driver',
  })
  @IsOptional()
  @IsString()
  appPackageName?: string;
}

export class UnregisterPushTokenDto {
  @ApiProperty({
    description: 'Firebase Cloud Messaging registration token',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
