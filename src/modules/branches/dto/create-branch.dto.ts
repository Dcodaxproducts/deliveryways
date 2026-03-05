import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { OrderTypeEnum, PaymentMethodEnum } from '../../../common/enums';

class DeliveryConfigDto {
  @ApiProperty()
  @IsNumber()
  radiusKm!: number;

  @ApiProperty()
  @IsNumber()
  minOrderAmount!: number;

  @ApiProperty()
  @IsNumber()
  deliveryFee!: number;
}

class AutomationConfigDto {
  @ApiProperty()
  @IsBoolean()
  autoAcceptOrders!: boolean;

  @ApiProperty()
  @IsNumber()
  estimatedPrepTime!: number;
}

export class BranchSettingsDto {
  @ApiProperty({ enum: OrderTypeEnum, isArray: true })
  @IsArray()
  @IsEnum(OrderTypeEnum, { each: true })
  allowedOrderTypes!: OrderTypeEnum[];

  @ApiProperty({ enum: PaymentMethodEnum, isArray: true })
  @IsArray()
  @IsEnum(PaymentMethodEnum, { each: true })
  allowedPaymentMethods!: PaymentMethodEnum[];

  @ApiProperty({ type: DeliveryConfigDto })
  @ValidateNested()
  @Type(() => DeliveryConfigDto)
  deliveryConfig!: DeliveryConfigDto;

  @ApiProperty({ type: AutomationConfigDto })
  @ValidateNested()
  @Type(() => AutomationConfigDto)
  automation!: AutomationConfigDto;
}

export class CreateBranchDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  restaurantId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: BranchSettingsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BranchSettingsDto)
  settings?: BranchSettingsDto;
}
