import { HttpStatus } from '@nestjs/common';

export type ApiErrorParams = Record<
  string,
  string | number | boolean | string[]
>;

export type ApiErrorContract = {
  code: string;
  params?: ApiErrorParams;
};

const GENERIC_CODES = new Set([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE_ENTITY',
  'INTERNAL_ERROR',
]);

const STATUS_CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'AUTHENTICATION_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'ACCESS_FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.CONFLICT]: 'RESOURCE_CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.BAD_GATEWAY]: 'UPSTREAM_SERVICE_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

const DOMAIN_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\btenant\b/i, 'TENANT'],
  [/\bbranch\b/i, 'BRANCH'],
  [/\brestaurant\b/i, 'RESTAURANT'],
  [/\b(cart|basket)\b/i, 'CART'],
  [/\border\b/i, 'ORDER'],
  [/\b(payment|transaction|refund|stripe|paypal)\b/i, 'PAYMENT'],
  [/\b(menu item|menu|modifier|variation)\b/i, 'MENU'],
  [/\b(address|delivery area|delivery zone)\b/i, 'ADDRESS'],
  [/\b(customer|user|account)\b/i, 'USER'],
  [/\b(coupon|promotion|deal|gift card)\b/i, 'PROMOTION'],
];

const normalizeExplicitCode = (
  code: string | undefined,
): string | undefined => {
  const normalized = code?.trim();
  if (!normalized || !/^[A-Z][A-Z0-9_]*$/.test(normalized)) return undefined;
  return normalized;
};

const getDomain = (message: string): string | undefined =>
  DOMAIN_PATTERNS.find(([pattern]) => pattern.test(message))?.[1];

const parseCount = (value: string): number => Number.parseInt(value, 10);

export const resolveApiErrorContract = (
  message: string,
  status: number,
  explicitCode?: string,
): ApiErrorContract => {
  const preservedCode = normalizeExplicitCode(explicitCode);
  if (preservedCode && !GENERIC_CODES.has(preservedCode)) {
    return { code: preservedCode };
  }

  const missingModifiers = message.match(
    /^(.+?) requires modifier selection\(s\):\s*(.+)$/i,
  );
  if (missingModifiers) {
    return {
      code: 'MODIFIER_SELECTION_REQUIRED',
      params: {
        itemName: missingModifiers[1].trim(),
        modifierNames: missingModifiers[2]
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      },
    };
  }

  const minimumSelections = message.match(
    /^(.+?) requires at least (\d+) (?:modifier )?selection\(s\)\.?$/i,
  );
  if (minimumSelections) {
    return {
      code: 'MODIFIER_MIN_SELECTIONS_NOT_MET',
      params: {
        groupName: minimumSelections[1].trim(),
        minSelections: parseCount(minimumSelections[2]),
      },
    };
  }

  const maximumSelections = message.match(
    /^(.+?) allows at most (\d+) (?:modifier )?selection\(s\)\.?$/i,
  );
  if (maximumSelections) {
    return {
      code: 'MODIFIER_MAX_SELECTIONS_EXCEEDED',
      params: {
        groupName: maximumSelections[1].trim(),
        maxSelections: parseCount(maximumSelections[2]),
      },
    };
  }

  const minimumItems = message.match(
    /^(.+?) requires at least (\d+) (?:eligible )?item\(s\)\.?$/i,
  );
  if (minimumItems) {
    return {
      code: 'MINIMUM_ITEM_QUANTITY_NOT_MET',
      params: {
        itemName: minimumItems[1].trim(),
        minQuantity: parseCount(minimumItems[2]),
      },
    };
  }

  const requiredField = message.match(/^([A-Za-z0-9_.[\]-]+) is required\.?$/i);
  if (requiredField) {
    return {
      code: 'REQUIRED_FIELD_MISSING',
      params: { field: requiredField[1] },
    };
  }

  const requiredContext = message.match(
    /^(Tenant|Branch|Restaurant) context is required\.?$/i,
  );
  if (requiredContext) {
    return { code: `${requiredContext[1].toUpperCase()}_CONTEXT_REQUIRED` };
  }

  if (/delivery is not available/i.test(message)) {
    return { code: 'DELIVERY_UNAVAILABLE' };
  }
  if (/pickup is not available/i.test(message)) {
    return { code: 'PICKUP_UNAVAILABLE' };
  }
  if (/menu is not available|menu item is unavailable/i.test(message)) {
    return { code: 'MENU_UNAVAILABLE' };
  }
  if (
    /invalid credentials|incorrect (email|password)|login failed/i.test(message)
  ) {
    return { code: 'INVALID_CREDENTIALS' };
  }
  if (
    /missing access token|token is required|not authenticated/i.test(message)
  ) {
    return { code: 'AUTHENTICATION_REQUIRED' };
  }
  if (/token.*(expired|invalid)|invalid.*token/i.test(message)) {
    return { code: 'INVALID_AUTH_TOKEN' };
  }
  if (/already contains items from another branch/i.test(message)) {
    return { code: 'CART_BRANCH_CONFLICT' };
  }

  const domain = getDomain(message);
  if (/not found|does not exist|may have been deleted/i.test(message)) {
    return { code: domain ? `${domain}_NOT_FOUND` : 'RESOURCE_NOT_FOUND' };
  }
  if (/already exists|already registered|unavailable|in use/i.test(message)) {
    return { code: domain ? `${domain}_CONFLICT` : 'RESOURCE_CONFLICT' };
  }
  if (
    /not (allowed|authorized)|outside your|can only|access is required/i.test(
      message,
    )
  ) {
    return { code: domain ? `${domain}_ACCESS_FORBIDDEN` : 'ACCESS_FORBIDDEN' };
  }

  return {
    code: preservedCode ?? STATUS_CODES[status] ?? 'INTERNAL_ERROR',
  };
};
