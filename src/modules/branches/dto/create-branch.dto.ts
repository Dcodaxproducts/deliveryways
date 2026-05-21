import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { OrderTypeEnum, PaymentMethodEnum } from '../../../common/enums';

export const BRANCH_DELIVERY_PRICING_MODES = [
  'RADIUS',
  'ZONE',
  'POSTAL_CODE',
] as const;

class DeliveryZoneCoordinateDto {
  @ApiProperty()
  @IsNumber()
  lat!: number;

  @ApiProperty()
  @IsNumber()
  lng!: number;
}

class DeliveryZoneDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsNumber()
  deliveryFee!: number;

  @ApiProperty({ type: [DeliveryZoneCoordinateDto] })
  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => DeliveryZoneCoordinateDto)
  polygon!: DeliveryZoneCoordinateDto[];
}

class PostalCodeDeliveryRuleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  postalCode!: string;

  @ApiProperty()
  @IsNumber()
  deliveryFee!: number;
}

class DeliveryConfigDto {
  @ApiPropertyOptional({ enum: BRANCH_DELIVERY_PRICING_MODES })
  @IsOptional()
  @IsIn(BRANCH_DELIVERY_PRICING_MODES)
  mode?: (typeof BRANCH_DELIVERY_PRICING_MODES)[number];

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

  @ApiPropertyOptional({ type: [DeliveryZoneDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryZoneDto)
  zones?: DeliveryZoneDto[];

  @ApiPropertyOptional({ type: [PostalCodeDeliveryRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostalCodeDeliveryRuleDto)
  postalCodeRules?: PostalCodeDeliveryRuleDto[];
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
  @ApiPropertyOptional({
    description:
      'Customer-facing estimated delivery time in minutes for this branch',
    example: 45,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryTime?: number;

  @ApiPropertyOptional({
    description:
      'Whether customers can create table reservations for this branch',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  tableReservationsEnabled?: boolean;

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
  @ApiPropertyOptional({
    description:
      'Optional for scoped logged-in users; token restaurant scope is used when available. Required for super admin.',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

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

  @ApiProperty({ description: 'Latitude coordinate for the branch address' })
  @IsString()
  @IsNotEmpty()
  @IsLatitude()
  lat!: string;

  @ApiProperty({ description: 'Longitude coordinate for the branch address' })
  @IsString()
  @IsNotEmpty()
  @IsLongitude()
  lng!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

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
