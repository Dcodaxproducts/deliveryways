import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliverymanStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { QueryDto } from '../../common/dto';

export class CreateDeliverymanDto {
  @ApiPropertyOptional({
    description: 'Optional for scoped admins; token restaurant scope is used',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @ApiPropertyOptional({
    description:
      'Temporary password for deliveryman app login. Falls back to phone when omitted.',
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    enum: DeliverymanStatus,
    default: DeliverymanStatus.OFFLINE,
  })
  @IsOptional()
  @IsEnum(DeliverymanStatus)
  status?: DeliverymanStatus;
}

export class DeliverymanSignupDto {
  @ApiPropertyOptional({
    description: 'Optional guard; branch restaurant scope is used when omitted',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @ApiProperty()
  @IsString()
  password!: string;
}

export class UpdateDeliverymanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateMyDeliverymanProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicleNumber?: string;
}

export class UpdateMyDeliverymanTwoFactorDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

const DELIVERYMAN_STATUS_INPUTS = [
  ...Object.values(DeliverymanStatus),
  'ONLINE',
  'OFFLINE',
] as const;

export class UpdateDeliverymanStatusDto {
  @ApiProperty({ enum: DELIVERYMAN_STATUS_INPUTS })
  @IsIn(DELIVERYMAN_STATUS_INPUTS)
  status!: DeliverymanStatus | 'ONLINE' | 'OFFLINE';
}

export class AssignDeliverymanOrderDto {
  @ApiProperty()
  @IsString()
  orderId!: string;
}

export class UpdateDeliverymanLocationDto {
  @ApiProperty({ example: 31.5204 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 74.3587 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

export class UpdateMyDeliverymanStatusDto {
  @ApiProperty({ enum: ['ONLINE', 'OFFLINE'] })
  @IsIn(['ONLINE', 'OFFLINE'])
  status!: 'ONLINE' | 'OFFLINE';
}

export class ListDeliverymenDto extends QueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: DeliverymanStatus })
  @IsOptional()
  @IsEnum(DeliverymanStatus)
  status?: DeliverymanStatus;
}
