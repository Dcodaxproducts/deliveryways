import { PaymentMethod } from '@prisma/client';
import { resolveAvailablePaymentMethods } from './payment-methods.util';

describe('resolveAvailablePaymentMethods', () => {
  it('uses the restaurant-wide customer selection for every branch', () => {
    expect(
      resolveAvailablePaymentMethods({
        platformMethods: [
          PaymentMethod.COD,
          PaymentMethod.STRIPE,
          PaymentMethod.PAYPAL,
        ],
        restaurantSettings: {
          payments: {
            methods: {
              allowedPaymentMethods: [PaymentMethod.COD, PaymentMethod.STRIPE],
              customerPaymentMethods: [PaymentMethod.STRIPE],
            },
          },
        },
        branchSettings: {
          allowedPaymentMethods: [PaymentMethod.COD],
        },
      }),
    ).toEqual([PaymentMethod.STRIPE]);
  });

  it('ignores legacy branch payment restrictions', () => {
    expect(
      resolveAvailablePaymentMethods({
        platformMethods: [PaymentMethod.COD, PaymentMethod.STRIPE],
        restaurantSettings: {
          payments: {
            methods: {
              allowedPaymentMethods: [PaymentMethod.COD, PaymentMethod.STRIPE],
              customerPaymentMethods: [PaymentMethod.COD, PaymentMethod.STRIPE],
            },
          },
        },
        branchSettings: { allowedPaymentMethods: [PaymentMethod.COD] },
      }),
    ).toEqual([PaymentMethod.COD, PaymentMethod.STRIPE]);
  });

  it('treats missing restaurant lists as no restriction', () => {
    expect(
      resolveAvailablePaymentMethods({
        platformMethods: [PaymentMethod.STRIPE, PaymentMethod.JAZZCASH],
        restaurantSettings: {},
        branchSettings: {},
      }),
    ).toEqual([PaymentMethod.STRIPE, PaymentMethod.JAZZCASH]);
  });

  it('uses legacy methods only when platform configuration is unavailable', () => {
    expect(
      resolveAvailablePaymentMethods({
        platformMethods: null,
        restaurantSettings: {},
        branchSettings: {},
      }),
    ).toEqual([
      PaymentMethod.COD,
      PaymentMethod.CARD_ON_DELIVERY,
      PaymentMethod.PAYPAL,
      PaymentMethod.WALLET,
    ]);
  });

  it('returns no methods when the platform explicitly enables none', () => {
    expect(
      resolveAvailablePaymentMethods({
        platformMethods: [],
        restaurantSettings: {},
        branchSettings: {},
      }),
    ).toEqual([]);
  });
});
