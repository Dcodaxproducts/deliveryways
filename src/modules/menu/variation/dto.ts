import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { QueryDto } from '../../../common/dto';

export class MenuVariationModifierPriceOverrideDto {
  @ApiProperty()
  @IsString()
  modifierId!: string;

  @ApiProperty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  priceDelta!: number;
}

export class CreateMenuVariationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({
    description:
      'Optional category to assign this centralized variation immediately',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({
    description:
      'Deprecated default price. Use item variation price overrides for actual item pricing.',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [MenuVariationModifierPriceOverrideDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuVariationModifierPriceOverrideDto)
  modifierPriceOverrides?: MenuVariationModifierPriceOverrideDto[];
}

export class UpdateMenuVariationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({
    description:
      'Deprecated default price. Use item variation price overrides for actual item pricing.',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [MenuVariationModifierPriceOverrideDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuVariationModifierPriceOverrideDto)
  modifierPriceOverrides?: MenuVariationModifierPriceOverrideDto[];
}

export class ListMenuVariationsDto extends QueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({
    description: 'When provided, lists variations assigned to this category',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class SyncCategoryVariationsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  variationIds!: string[];
}
