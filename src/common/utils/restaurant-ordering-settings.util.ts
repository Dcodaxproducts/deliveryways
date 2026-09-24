import { Prisma } from '@prisma/client';

export interface RestaurantOrderingSettings {
  preorderEnabled: boolean;
  tipsEnabled: boolean;
}

const asObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const extractRestaurantOrderingSettings = (
  settings: Prisma.JsonValue | null | undefined,
): RestaurantOrderingSettings => {
  const ordering = asObject(asObject(settings).ordering);

  return {
    preorderEnabled:
      typeof ordering.preorderEnabled === 'boolean'
        ? ordering.preorderEnabled
        : true,
    tipsEnabled:
      typeof ordering.tipsEnabled === 'boolean' ? ordering.tipsEnabled : true,
  };
};

export const mergeRestaurantOrderingSettings = (
  settings: Prisma.JsonValue | null | undefined,
  update: Partial<RestaurantOrderingSettings>,
): Prisma.JsonObject => {
  const root = asObject(settings);
  const ordering = asObject(root.ordering);

  return {
    ...root,
    ordering: {
      ...ordering,
      ...(update.preorderEnabled !== undefined
        ? { preorderEnabled: update.preorderEnabled }
        : {}),
      ...(update.tipsEnabled !== undefined
        ? { tipsEnabled: update.tipsEnabled }
        : {}),
    },
  } as Prisma.JsonObject;
};
