export const DEFAULT_CUSTOMER_APP_FAQ_CATEGORIES = [
  'Orders',
  'Delivery',
  'Payments',
  'Policy',
] as const;

export const CUSTOMER_APP_FAQ_CATEGORY_VALUES =
  DEFAULT_CUSTOMER_APP_FAQ_CATEGORIES;

export const CUSTOMER_APP_FAQ_STATUS_VALUES = ['DRAFT', 'PUBLISHED'] as const;
export const CUSTOMER_APP_FAQ_VISIBILITY_VALUES = [
  'PUBLIC',
  'AUTHENTICATED',
] as const;

export type CustomerAppFaqStatus =
  (typeof CUSTOMER_APP_FAQ_STATUS_VALUES)[number];
export type CustomerAppFaqVisibility =
  (typeof CUSTOMER_APP_FAQ_VISIBILITY_VALUES)[number];

export interface CustomerAppFaqItem {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  status: CustomerAppFaqStatus;
  visibility: CustomerAppFaqVisibility;
  createdByUserId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export function extractCustomerAppFaqCategories(items: CustomerAppFaqItem[]) {
  const categories = new Set<string>(DEFAULT_CUSTOMER_APP_FAQ_CATEGORIES);

  for (const item of items) {
    if (item.category) {
      categories.add(item.category);
    }
  }

  return Array.from(categories);
}

export function normalizeCustomerAppFaqItem(
  item: unknown,
  fallbackId: string,
): CustomerAppFaqItem | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return null;
  }

  const faq = item as Record<string, unknown>;
  const question = readTrimmedString(faq.question);
  const answer = readTrimmedString(faq.answer);

  if (!question || !answer) {
    return null;
  }

  return {
    id: readTrimmedString(faq.id) ?? fallbackId,
    question,
    answer,
    category: readTrimmedString(faq.category) ?? null,
    status:
      readEnumValue(faq.status, CUSTOMER_APP_FAQ_STATUS_VALUES) ?? 'PUBLISHED',
    visibility:
      readEnumValue(faq.visibility, CUSTOMER_APP_FAQ_VISIBILITY_VALUES) ??
      'PUBLIC',
    createdByUserId: readTrimmedString(faq.createdByUserId) ?? null,
    createdAt: readTrimmedString(faq.createdAt) ?? null,
    updatedAt: readTrimmedString(faq.updatedAt) ?? null,
  };
}

function readTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readEnumValue<const T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
): T[number] | null {
  if (typeof value !== 'string') {
    return null;
  }

  return allowedValues.includes(value as T[number])
    ? (value as T[number])
    : null;
}
