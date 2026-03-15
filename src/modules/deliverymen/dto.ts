import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliverymanStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
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
    enum: DeliverymanStatus,
    default: DeliverymanStatus.OFFLINE,
  })
  @IsOptional()
  @IsEnum(DeliverymanStatus)
  status?: DeliverymanStatus;
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
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDeliverymanStatusDto {
  @ApiProperty({ enum: DeliverymanStatus })
  @IsEnum(DeliverymanStatus)
  status!: DeliverymanStatus;
}

export class AssignDeliverymanOrderDto {
  @ApiProperty()
  @IsString()
  orderId!: string;
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
