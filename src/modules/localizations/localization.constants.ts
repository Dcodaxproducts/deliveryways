export const DEFAULT_LOCALE = 'en';

export const LOCALIZATION_ENTITY_TYPES = [
  'RESTAURANT',
  'BRANCH',
  'RESTAURANT_MENU',
  'CUISINE',
  'MENU_CATEGORY',
  'MENU_ITEM',
  'MENU_ITEM_VARIATION',
  'MODIFIER_GROUP',
  'MODIFIER',
  'COUPON',
] as const;

export type LocalizationEntityType = (typeof LOCALIZATION_ENTITY_TYPES)[number];

export const LOCALIZATION_FIELD_ALLOWLIST = {
  RESTAURANT: ['name', 'tagline', 'bio'],
  BRANCH: ['name', 'description'],
  RESTAURANT_MENU: ['name', 'description'],
  CUISINE: ['name', 'description'],
  MENU_CATEGORY: ['name', 'description'],
  MENU_ITEM: ['name', 'description', 'ingredients', 'nutritionalInformation'],
  MENU_ITEM_VARIATION: ['name', 'description'],
  MODIFIER_GROUP: ['name', 'description'],
  MODIFIER: ['name'],
  COUPON: ['title', 'description'],
} as const satisfies Record<LocalizationEntityType, readonly string[]>;

export type LocalizationFieldName =
  (typeof LOCALIZATION_FIELD_ALLOWLIST)[LocalizationEntityType][number];
