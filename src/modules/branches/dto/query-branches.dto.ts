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

  @ApiPropertyOptional({ description: 'Latitude for nearest-branch sorting' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude for nearest-branch sorting' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
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

  @ApiPropertyOptional({ description: 'Latitude for nearest-branch sorting' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude for nearest-branch sorting' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  lng?: number;
}
