import { ConfigService } from '@nestjs/config';
import { StripePaymentsService } from './stripe-payments.service';

describe('StripePaymentsService', () => {
  it('creates card-only payment intents', async () => {
    const createPaymentIntent = jest.fn().mockResolvedValue({ id: 'pi_test' });
    const service = new StripePaymentsService({
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          STRIPE_SECRET_KEY: 'sk_test_example',
          STRIPE_PUBLISHABLE_KEY: 'pk_test_example',
          STRIPE_CURRENCY: 'EUR',
        };

        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService);
    Object.defineProperty(service, 'stripe', {
      value: {
        paymentIntents: {
          create: createPaymentIntent,
        },
      },
    });

    await service.createPaymentIntent({
      amount: 12.5,
      currency: 'EUR',
      metadata: {
        paymentTransactionId: 'payment-1',
        orderId: 'order-1',
        customerId: 'customer-1',
        restaurantId: 'restaurant-1',
      },
      description: 'DeliveryWay order order-1',
    });

    expect(createPaymentIntent).toHaveBeenCalledWith({
      amount: 1250,
      currency: 'eur',
      payment_method_types: ['card'],
      metadata: {
        paymentTransactionId: 'payment-1',
        orderId: 'order-1',
        customerId: 'customer-1',
        restaurantId: 'restaurant-1',
      },
      description: 'DeliveryWay order order-1',
    });
  });
});
