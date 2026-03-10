import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AdminListQueryDto, QueryDto } from '../../../common/dto';

export class ListBranchesDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    description:
      'Restaurant id to fetch branches for (optional for business/branch admin; token scope is used)',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}

export class ListPublicBranchesDto extends QueryDto {
  @ApiProperty({ description: 'Tenant id owning the restaurant' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ description: 'Restaurant id to fetch public branches for' })
  @IsString()
  @IsNotEmpty()
  restaurantId!: string;
}
