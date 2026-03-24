import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString } from 'class-validator';
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

export class AdminForceDeleteUsersDto {
  @ApiProperty({
    type: [String],
    description: 'Email addresses to hard-delete',
  })
  @IsArray()
  @IsEmail({}, { each: true })
  emails!: string[];
}
