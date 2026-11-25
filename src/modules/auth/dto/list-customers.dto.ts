import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { AdminListQueryDto } from '../../../common/dto';

export class ListCustomersDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    enum: ['createdAt', 'email', 'isActive', 'isVerified'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'email', 'isActive', 'isVerified'])
  sortBy = 'createdAt';

  @ApiPropertyOptional({
    description: 'Optional restaurant scope for super admin',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({ description: 'Optional branch scope' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by verification status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filter guest sessions (true) or registered customers (false)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isGuest?: boolean;

  @ApiPropertyOptional({
    description: 'Inclusive customer creation date start',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Inclusive customer creation date end' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
