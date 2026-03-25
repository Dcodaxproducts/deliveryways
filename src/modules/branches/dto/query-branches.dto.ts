import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
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
      'Latitude used to sort branches by nearest distance. Must be passed with lng.',
    example: 33.6844,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({
    description:
      'Longitude used to sort branches by nearest distance. Must be passed with lat.',
    example: 73.0479,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  lng?: number;
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
