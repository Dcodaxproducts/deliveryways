import {
  DEFAULT_LOCALE,
  LOCALIZATION_ENTITY_TYPES,
  LOCALIZATION_FIELD_ALLOWLIST,
  LocalizationEntityType,
} from './localization.constants';

const LOCALE_PATTERN = /^[a-z]{2,10}(-[a-z0-9]{2,10})?$/;

export function normalizeLocale(
  locale: string | null | undefined,
  fallback = DEFAULT_LOCALE,
): string {
  const normalizedFallback = normalizeLocaleStrict(fallback);
  if (!locale) {
    return normalizedFallback;
  }

  const normalized = locale.trim().replace('_', '-').toLowerCase();
  if (!normalized) {
    return normalizedFallback;
  }

  return LOCALE_PATTERN.test(normalized) ? normalized : normalizedFallback;
}

export function normalizeLocaleStrict(locale: string): string {
  const normalized = locale.trim().replace('_', '-').toLowerCase();

  if (!LOCALE_PATTERN.test(normalized)) {
    throw new Error(`Invalid locale: ${locale}`);
  }

  return normalized;
}

export function isLocalizationEntityType(
  value: string,
): value is LocalizationEntityType {
  return LOCALIZATION_ENTITY_TYPES.includes(value as LocalizationEntityType);
}

export function pickAllowedTranslationFields(
  entityType: LocalizationEntityType,
  fields: Record<string, unknown>,
): Record<string, string | null> {
  const allowedFields = new Set<string>(
    LOCALIZATION_FIELD_ALLOWLIST[entityType],
  );
  const picked: Record<string, string | null> = {};

  for (const [field, value] of Object.entries(fields)) {
    if (!allowedFields.has(field)) {
      continue;
    }

    if (value === null) {
      picked[field] = null;
      continue;
    }

    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length) {
      picked[field] = trimmed;
    }
  }

  return picked;
}

export function applyTranslationFields<T extends Record<string, unknown>>(
  source: T,
  translatedFields: Record<string, string | null> | null | undefined,
): T {
  if (!translatedFields) {
    return source;
  }

  return {
    ...source,
    ...Object.fromEntries(
      Object.entries(translatedFields).filter(([, value]) => value !== null),
    ),
  };
}
