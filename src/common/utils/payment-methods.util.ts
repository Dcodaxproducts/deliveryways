import { PaymentMethod } from '@prisma/client';

type PaymentMethodScope = {
  platformMethods: readonly PaymentMethod[] | null;
  restaurantSettings: unknown;
  branchSettings: unknown;
};

const LEGACY_PAYMENT_METHODS = [
  PaymentMethod.COD,
  PaymentMethod.CARD_ON_DELIVERY,
  PaymentMethod.PAYPAL,
  PaymentMethod.WALLET,
] as const;

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readPaymentMethods = (value: unknown): PaymentMethod[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const methods = value.filter(
    (method): method is PaymentMethod =>
      typeof method === 'string' &&
      Object.values(PaymentMethod).includes(method as PaymentMethod),
  );

  return methods.length > 0 ? [...new Set(methods)] : null;
};

export const resolveAvailablePaymentMethods = ({
  platformMethods,
  restaurantSettings,
}: PaymentMethodScope): PaymentMethod[] => {
  const platform =
    platformMethods === null
      ? [...LEGACY_PAYMENT_METHODS]
      : [...new Set(platformMethods)];
  const restaurant = asObject(restaurantSettings);
  const restaurantPayments = asObject(restaurant.payments);
  const restaurantMethodSettings = asObject(restaurantPayments.methods);
  const restaurantMethods = readPaymentMethods(
    restaurantMethodSettings.allowedPaymentMethods,
  );
  const customerMethods = readPaymentMethods(
    restaurantMethodSettings.customerPaymentMethods,
  );

  return platform.filter(
    (method) =>
      (!restaurantMethods || restaurantMethods.includes(method)) &&
      (!customerMethods || customerMethods.includes(method)),
  );
};
