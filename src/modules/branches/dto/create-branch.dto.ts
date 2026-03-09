import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
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

  @ApiProperty()
  @IsBoolean()
  isFreeDelivery!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  freeDeliveryThreshold?: number;
}

class AutomationConfigDto {
  @ApiProperty()
  @IsBoolean()
  autoAcceptOrders!: boolean;

  @ApiProperty()
  @IsNumber()
  estimatedPrepTime!: number;
}

class TaxationConfigDto {
  @ApiProperty()
  @IsNumber()
  taxPercentage!: number;
}

class BranchContactDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
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

  @ApiProperty({ type: TaxationConfigDto })
  @ValidateNested()
  @Type(() => TaxationConfigDto)
  taxation!: TaxationConfigDto;

  @ApiPropertyOptional({ type: BranchContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BranchContactDto)
  contact?: BranchContactDto;
}

export class CreateBranchAdminDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    description: 'Optional password. If omitted, backend generates one.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
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

  @ApiPropertyOptional({
    type: CreateBranchAdminDto,
    description: 'Optional branch admin account to create with this branch.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateBranchAdminDto)
  branchAdmin?: CreateBranchAdminDto;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street!: string;

  @ApiPropertyOptional({ description: 'Area or sector' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  country!: string;

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
