import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { QueryDto } from '../../../common/dto';

export const VARIATION_PRICING_MODE_VALUES = [
  'FIXED',
  'FLAT_ADJUSTMENT',
  'PERCENTAGE_ADJUSTMENT',
] as const;

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
  @ApiProperty()
  @IsString()
  categoryId!: string;

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

  @ApiProperty()
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({
    enum: VARIATION_PRICING_MODE_VALUES,
    default: 'FIXED',
  })
  @IsOptional()
  @IsIn(VARIATION_PRICING_MODE_VALUES)
  pricingMode?: (typeof VARIATION_PRICING_MODE_VALUES)[number];

  @ApiPropertyOptional({
    description:
      'Used for FLAT_ADJUSTMENT and PERCENTAGE_ADJUSTMENT pricing modes.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  adjustmentValue?: number;

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

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ enum: VARIATION_PRICING_MODE_VALUES })
  @IsOptional()
  @IsIn(VARIATION_PRICING_MODE_VALUES)
  pricingMode?: (typeof VARIATION_PRICING_MODE_VALUES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  adjustmentValue?: number;

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
  @ApiProperty()
  @IsString()
  categoryId!: string;
}
