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
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { QueryDto } from '../../../common/dto';

export const MENU_ITEM_PRICING_MODE_VALUES = ['SINGLE', 'MULTIPLE'] as const;
export const MENU_ITEM_LABEL_VALUES = [
  'SPICY',
  'NON_ALCOHOLIC',
  'ALCOHOLIC',
  'VEGAN',
  'VEGETARIAN',
] as const;

export const DEFAULT_MENU_ITEM_LABELS = MENU_ITEM_LABEL_VALUES.map((value) => ({
  value,
  label: value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' '),
}));

const parseJsonArray = (value: unknown): unknown => {
  if (Array.isArray(value) || value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
};

const parseStringList = (value: unknown): unknown => {
  if (Array.isArray(value) || value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export class AllergenAdditiveTemplateEntryDto {
  @ApiProperty({ description: 'Short code used on menu items, e.g. A or 1' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;

  @ApiProperty({ description: 'Full customer-facing text for this code' })
  @IsString()
  label!: string;
}

export class UpdateAllergenAdditiveTemplatesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({ type: [AllergenAdditiveTemplateEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllergenAdditiveTemplateEntryDto)
  allergens?: AllergenAdditiveTemplateEntryDto[];

  @ApiPropertyOptional({ type: [AllergenAdditiveTemplateEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllergenAdditiveTemplateEntryDto)
  additives?: AllergenAdditiveTemplateEntryDto[];
}

export class CreateProductLabelDto {
  @ApiPropertyOptional({ description: 'Stable value, e.g. SPICY' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  value?: string;

  @ApiProperty({ description: 'Customer/admin display text, e.g. Spicy' })
  @IsString()
  label!: string;
}

export class UpdateProductLabelDto {
  @ApiPropertyOptional({ description: 'New stable value, e.g. HOT' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  value?: string;

  @ApiPropertyOptional({ description: 'Customer/admin display text' })
  @IsOptional()
  @IsString()
  label?: string;
}

export class UpdateAllergenAdditiveTemplateEntryDto {
  @ApiPropertyOptional({ description: 'New short code, e.g. B or 2' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  code?: string;

  @ApiPropertyOptional({ description: 'Full customer-facing text' })
  @IsOptional()
  @IsString()
  label?: string;
}

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
  labels?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => parseStringList(value))
  @IsArray()
  @IsString({ each: true })
  allergenFlags?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Allergen/additive template codes, e.g. "A,1"',
  })
  @IsOptional()
  @Transform(({ value }) => parseStringList(value))
  @IsArray()
  @IsString({ each: true })
  allergenCodes?: string[];

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
    default: false,
    description:
      'When true, the item must have at least minSelect modifier selections in cart/order flows.',
  })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({
    default: 0,
    description:
      'Minimum total modifier selections required for this item. This is item-level modifier count, not item quantity and not per modifier/group.',
    example: 1,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  minSelect?: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Maximum total modifier selections allowed for this item. This is item-level modifier count, not item quantity and not per modifier/group. Null means no maximum.',
    example: 3,
  })
  @IsOptional()
  @Transform(({ value }) => (value === null ? null : Number(value)))
  @IsInt()
  @Min(1)
  maxSelect?: number | null;

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
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemModifierPriceOverrideDto)
  modifiers?: MenuItemModifierPriceOverrideDto[];

  @ApiPropertyOptional({
    type: [MenuItemModifierPriceOverrideDto],
    description: 'Deprecated alias. Use modifiers for direct item assignment.',
  })
  @IsOptional()
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemModifierPriceOverrideDto)
  modifierPriceOverrides?: MenuItemModifierPriceOverrideDto[];

  @ApiPropertyOptional({ type: [MenuItemVariationPriceOverrideDto] })
  @IsOptional()
  @Transform(({ value }) => parseJsonArray(value))
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
  labels?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => parseStringList(value))
  @IsArray()
  @IsString({ each: true })
  allergenFlags?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Allergen/additive template codes, e.g. "A,1"',
  })
  @IsOptional()
  @Transform(({ value }) => parseStringList(value))
  @IsArray()
  @IsString({ each: true })
  allergenCodes?: string[];

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
    description:
      'When true, the item must have at least minSelect modifier selections in cart/order flows.',
  })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({
    description:
      'Minimum total modifier selections required for this item. This is item-level modifier count, not item quantity and not per modifier/group.',
    example: 1,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  minSelect?: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Maximum total modifier selections allowed for this item. This is item-level modifier count, not item quantity and not per modifier/group. Null means no maximum.',
    example: 3,
  })
  @IsOptional()
  @Transform(({ value }) => (value === null ? null : Number(value)))
  @IsInt()
  @Min(1)
  maxSelect?: number | null;

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
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemModifierPriceOverrideDto)
  modifiers?: MenuItemModifierPriceOverrideDto[];

  @ApiPropertyOptional({
    type: [MenuItemModifierPriceOverrideDto],
    description: 'Deprecated alias. Use modifiers for direct item assignment.',
  })
  @IsOptional()
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemModifierPriceOverrideDto)
  modifierPriceOverrides?: MenuItemModifierPriceOverrideDto[];

  @ApiPropertyOptional({ type: [MenuItemVariationPriceOverrideDto] })
  @IsOptional()
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemVariationPriceOverrideDto)
  variationPriceOverrides?: MenuItemVariationPriceOverrideDto[];
}

export class DuplicateMenuItemDto {
  @ApiPropertyOptional({ description: 'Optional duplicated item name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Optional duplicated item slug' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ description: 'Optional duplicated item SKU' })
  @IsOptional()
  @IsString()
  sku?: string;
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
