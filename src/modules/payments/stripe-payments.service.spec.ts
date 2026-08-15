import { ConfigService } from '@nestjs/config';
import { StripePaymentsService } from './stripe-payments.service';

describe('StripePaymentsService', () => {
  const createService = (customDomain: string | null = null) => {
    const createPaymentIntent = jest.fn().mockResolvedValue({ id: 'pi_test' });
    const paymentMethodDomains = {
      list: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({
        id: 'pmd_test',
        domain_name: customDomain,
        enabled: true,
        apple_pay: { status: 'active' },
        google_pay: { status: 'active' },
      }),
      update: jest.fn(),
      validate: jest.fn(),
    };
    const service = new StripePaymentsService(
      {
        get: jest.fn((key: string, fallback?: string) => {
          const values: Record<string, string> = {
            STRIPE_SECRET_KEY: 'sk_test_example',
            STRIPE_PUBLISHABLE_KEY: 'pk_test_example',
            STRIPE_CURRENCY: 'EUR',
          };

          return values[key] ?? fallback;
        }),
      } as unknown as ConfigService,
      {
        findRestaurantCheckoutDomain: jest.fn().mockResolvedValue({
          customDomain,
          customDomainVerifiedAt: customDomain ? new Date() : null,
        }),
      } as never,
    );
    Object.defineProperty(service, 'stripe', {
      value: {
        paymentIntents: {
          create: createPaymentIntent,
        },
        paymentMethodDomains,
      },
    });

    return { service, createPaymentIntent, paymentMethodDomains };
  };

  it('creates card intents that retain Apple Pay and Google Pay eligibility', async () => {
    const { service, createPaymentIntent } = createService();

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

  it('registers a verified custom domain once for Apple Pay and Google Pay', async () => {
    const { service, paymentMethodDomains } = createService(
      'www.american-corner.de',
    );
    const input = {
      amount: 12.5,
      currency: 'EUR',
      metadata: {
        paymentTransactionId: 'payment-1',
        orderId: 'order-1',
        customerId: 'customer-1',
        restaurantId: 'restaurant-1',
      },
      description: 'DeliveryWay order order-1',
    };

    await service.createPaymentIntent(input);
    await service.createPaymentIntent(input);

    expect(paymentMethodDomains.list).toHaveBeenCalledTimes(1);
    expect(paymentMethodDomains.create).toHaveBeenCalledWith({
      domain_name: 'www.american-corner.de',
      enabled: true,
    });
  });

  it('validates an existing domain when either wallet is inactive', async () => {
    const { service, paymentMethodDomains } = createService(
      'www.american-corner.de',
    );
    paymentMethodDomains.list.mockResolvedValue({
      data: [
        {
          id: 'pmd_existing',
          domain_name: 'www.american-corner.de',
          enabled: true,
          apple_pay: { status: 'inactive' },
          google_pay: { status: 'active' },
        },
      ],
    });
    paymentMethodDomains.validate.mockResolvedValue({
      id: 'pmd_existing',
      domain_name: 'www.american-corner.de',
      enabled: true,
      apple_pay: { status: 'active' },
      google_pay: { status: 'active' },
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

    expect(paymentMethodDomains.validate).toHaveBeenCalledWith('pmd_existing');
  });

  it('keeps card checkout available when domain registration is temporarily unavailable', async () => {
    const { service, createPaymentIntent, paymentMethodDomains } =
      createService('www.american-corner.de');
    paymentMethodDomains.list.mockRejectedValue(
      new Error('Stripe domain API unavailable'),
    );

    await expect(
      service.createPaymentIntent({
        amount: 12.5,
        currency: 'EUR',
        metadata: {
          paymentTransactionId: 'payment-1',
          orderId: 'order-1',
          customerId: 'customer-1',
          restaurantId: 'restaurant-1',
        },
        description: 'DeliveryWay order order-1',
      }),
    ).resolves.toEqual({ id: 'pi_test' });

    expect(createPaymentIntent).toHaveBeenCalledTimes(1);
  });
});
