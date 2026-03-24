import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AdminListQueryDto, QueryDto } from '../../../common/dto';

export class ListBranchesDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    description:
      'Restaurant id to fetch branches for. Super admin may fetch all or filter by restaurant; other roles use token restaurant scope.',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({
    description:
      'Sort branches by nearest distance using the customer default address or a scoped customerId address.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  nearest?: boolean;

  @ApiPropertyOptional({
    description:
      'Target customer id when admin/staff fetch nearest branches on behalf of a customer.',
  })
  @IsOptional()
  @IsString()
  customerId?: string;
}

export class ListPublicBranchesDto extends QueryDto {
  @ApiPropertyOptional({
    description:
      'Tenant id owning the restaurant. Optional when restaurantId is enough to derive it.',
  })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ description: 'Restaurant id to fetch public branches for' })
  @IsString()
  @IsNotEmpty()
  restaurantId!: string;
}
