import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { AdminListQueryDto, QueryDto } from '../../../common/dto';

export class ListBranchesDto extends AdminListQueryDto {
  @ApiProperty({ description: 'Restaurant id to fetch branches for' })
  @IsString()
  @IsNotEmpty()
  restaurantId!: string;
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
