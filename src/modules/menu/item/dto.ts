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

export const MENU_ITEM_PRICING_MODE_VALUES = ['SINGLE', 'MULTIPLE'] as const;

export class MenuItemModifierPriceOverrideDto {
  @ApiProperty()
  @IsString()
  modifierId!: string;

  @ApiProperty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  priceDelta!: number;
}

export class MenuItemVariationModifierPriceOverrideDto {
  @ApiProperty()
  @IsString()
  modifierId!: string;

  @ApiProperty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  priceDelta!: number;
}

export class MenuItemVariationPriceOverrideDto {
  @ApiProperty()
  @IsString()
  variationId!: string;

  @ApiProperty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  price!: number;

  @ApiPropertyOptional({
    description: 'Optional exact pickup/takeaway price for this item variation',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  pickupPrice?: number;

  @ApiPropertyOptional({
    description:
      'Optional item-specific variation text/label shown on item variation screen',
  })
  @IsOptional()
  @IsString()
  displayText?: string;

  @ApiPropertyOptional({ type: [MenuItemVariationModifierPriceOverrideDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemVariationModifierPriceOverrideDto)
  modifierPriceOverrides?: MenuItemVariationModifierPriceOverrideDto[];
}

export class CreateMenuItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiProperty()
  @IsString()
  categoryId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description:
      'Optional. Backend generates a unique slug from name when omitted or duplicated.',
  })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ingredients?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nutritionalInformation?: string;

  @ApiPropertyOptional({ description: 'Uploaded allergens PDF URL' })
  @IsOptional()
  @IsString()
  allergenPdfUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    enum: MENU_ITEM_PRICING_MODE_VALUES,
    default: 'SINGLE',
  })
  @IsOptional()
  @IsIn(MENU_ITEM_PRICING_MODE_VALUES)
  pricingMode?: (typeof MENU_ITEM_PRICING_MODE_VALUES)[number];

  @ApiProperty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  basePrice!: number;

  @ApiPropertyOptional({
    description:
      'Extra amount added for delivery orders when pricingMode is MULTIPLE',
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  deliveryPriceAdjustment?: number;

  @ApiPropertyOptional({
    description:
      'Extra amount added for takeaway orders when pricingMode is MULTIPLE',
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  takeawayPriceAdjustment?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  prepTimeMinutes?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryFlags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergenFlags?: string[];

  @ApiPropertyOptional({
    description: 'Optional separate drink deposit (Pfand) amount',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  depositAmount?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Enables half-and-half split pizza selection for this item',
  })
  @IsOptional()
  @IsBoolean()
  supportsSplitPizza?: boolean;

  @ApiPropertyOptional({
    type: [MenuItemModifierPriceOverrideDto],
    description: 'Direct modifiers assigned to this item',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemModifierPriceOverrideDto)
  modifiers?: MenuItemModifierPriceOverrideDto[];

  @ApiPropertyOptional({
    type: [MenuItemModifierPriceOverrideDto],
    description: 'Deprecated alias. Use modifiers for direct item assignment.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemModifierPriceOverrideDto)
  modifierPriceOverrides?: MenuItemModifierPriceOverrideDto[];

  @ApiPropertyOptional({ type: [MenuItemVariationPriceOverrideDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemVariationPriceOverrideDto)
  variationPriceOverrides?: MenuItemVariationPriceOverrideDto[];
}

export class BulkCreateMenuItemsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiProperty({ type: [CreateMenuItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMenuItemDto)
  items!: CreateMenuItemDto[];
}

export class UpdateMenuItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ingredients?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nutritionalInformation?: string;

  @ApiPropertyOptional({ description: 'Uploaded allergens PDF URL' })
  @IsOptional()
  @IsString()
  allergenPdfUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: MENU_ITEM_PRICING_MODE_VALUES })
  @IsOptional()
  @IsIn(MENU_ITEM_PRICING_MODE_VALUES)
  pricingMode?: (typeof MENU_ITEM_PRICING_MODE_VALUES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  basePrice?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  deliveryPriceAdjustment?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  takeawayPriceAdjustment?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  prepTimeMinutes?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryFlags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergenFlags?: string[];

  @ApiPropertyOptional({
    description: 'Optional separate drink deposit (Pfand) amount',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  depositAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Enables half-and-half split pizza selection for this item',
  })
  @IsOptional()
  @IsBoolean()
  supportsSplitPizza?: boolean;

  @ApiPropertyOptional({
    type: [MenuItemModifierPriceOverrideDto],
    description: 'Direct modifiers assigned to this item',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemModifierPriceOverrideDto)
  modifiers?: MenuItemModifierPriceOverrideDto[];

  @ApiPropertyOptional({
    type: [MenuItemModifierPriceOverrideDto],
    description: 'Deprecated alias. Use modifiers for direct item assignment.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemModifierPriceOverrideDto)
  modifierPriceOverrides?: MenuItemModifierPriceOverrideDto[];

  @ApiPropertyOptional({ type: [MenuItemVariationPriceOverrideDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemVariationPriceOverrideDto)
  variationPriceOverrides?: MenuItemVariationPriceOverrideDto[];
}

export class ListMenuItemsDto extends QueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Optional restaurant menu filter' })
  @IsOptional()
  @IsString()
  menuId?: string;

  @ApiPropertyOptional({
    description: 'Legacy alias for menuId',
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  menu_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  includeInactive?: boolean;

  @ApiPropertyOptional({
    description: 'When true, returns both active and inactive items',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  all?: boolean;

  @ApiPropertyOptional({
    description: 'When true, returns only inactive items',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  inactive?: boolean;

  @ApiPropertyOptional({
    description: 'When true, returns only items with split pizza enabled',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  supportsSplitPizza?: boolean;
}

export class ReorderMenuEntryDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ minimum: 0 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderMenuItemsDto {
  @ApiPropertyOptional({
    description: 'When provided, reorders menu item links inside this menu',
  })
  @IsOptional()
  @IsString()
  menuId?: string;

  @ApiProperty({ type: [ReorderMenuEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderMenuEntryDto)
  items!: ReorderMenuEntryDto[];
}
