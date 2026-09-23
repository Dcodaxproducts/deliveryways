import { PaymentMethod } from '@prisma/client';

export const DIGITAL_PAYMENT_METHODS: readonly PaymentMethod[] = [
  PaymentMethod.STRIPE,
  PaymentMethod.PAYPAL,
  PaymentMethod.EASYPAISA,
  PaymentMethod.JAZZCASH,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.WALLET,
];

export const OFFLINE_PAYMENT_METHODS: readonly PaymentMethod[] = [
  PaymentMethod.COD,
  PaymentMethod.CARD_ON_DELIVERY,
];
