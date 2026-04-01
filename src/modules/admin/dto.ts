import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AdminListQueryDto } from '../../common/dto';

export class AdminListCustomersDto extends AdminListQueryDto {
  @ApiPropertyOptional({ description: 'Filter customers by restaurant' })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}

export class AdminCustomerDetailsQueryDto {
  @ApiPropertyOptional({
    description: 'Restaurant scope for super admin lookups',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}

export class UpdateAdminCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

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

  @ApiPropertyOptional({
    description: 'Profile avatar URL (uploaded by frontend)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;
}

export class UpdateAdminCustomerStatusDto {
  @ApiProperty({
    description: 'Set customer account active/inactive state',
  })
  @IsBoolean()
  isActive!: boolean;
}

export class AdminForceDeleteUsersDto {
  @ApiProperty({
    type: [String],
    description: 'Email addresses to hard-delete',
  })
  @IsArray()
  @IsEmail({}, { each: true })
  emails!: string[];
}
