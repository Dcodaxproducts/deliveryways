import { InternalServerErrorException } from '@nestjs/common';
import { PaypalOrdersService } from './paypal-orders.service';

describe('PaypalOrdersService', () => {
  const makeService = (values: Record<string, string> = {}) =>
    new PaypalOrdersService({
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
    } as never);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fails closed when global PayPal credentials are missing', async () => {
    const service = makeService({
      PUBLIC_API_BASE_URL: 'https://api.example.com/api/v1',
    });

    await expect(
      service.createOrder({
        amount: 25,
        currency: 'EUR',
        paymentTransactionId: 'payment-1',
        orderId: 'order-1',
        collectShippingAddress: false,
        returnUrl: service.getReturnUrl('order-1'),
        cancelUrl: service.getCancelUrl('order-1'),
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('creates a sandbox PayPal approval order with server-owned amount metadata', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'access-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'paypal-order-1',
            links: [
              { rel: 'payer-action', href: 'https://paypal.test/approve' },
            ],
          }),
      } as Response);
    const service = makeService({
      PAYPAL_CLIENT_ID: 'client-id',
      PAYPAL_CLIENT_SECRET: 'client-secret',
      PAYPAL_ENVIRONMENT: 'SANDBOX',
      PUBLIC_API_BASE_URL: 'https://api.example.com/api/v1',
    });

    const result = await service.createOrder({
      amount: 25,
      currency: 'EUR',
      paymentTransactionId: 'payment-1',
      orderId: 'order-1',
      collectShippingAddress: false,
      returnUrl: service.getReturnUrl('order-1'),
      cancelUrl: service.getCancelUrl('order-1'),
    });

    expect(result).toEqual({
      id: 'paypal-order-1',
      approvalUrl: 'https://paypal.test/approve',
    });
    expect(service.getReturnUrl('payment-1')).toBe(
      'https://api.example.com/api/v1/payments/paypal/return?paymentId=payment-1',
    );
    expect(service.getCancelUrl('payment-1')).toBe(
      'https://api.example.com/api/v1/payments/paypal/cancel?paymentId=payment-1',
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api-m.sandbox.paypal.com/v2/checkout/orders',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = fetchMock.mock.calls[1]?.[1];
    if (typeof request?.body !== 'string') {
      throw new Error('Expected PayPal order request body to be JSON');
    }
    const parsed: unknown = JSON.parse(request.body);
    const body = parsed as {
      purchase_units: Array<{ custom_id: string; amount: { value: string } }>;
      payment_source: {
        paypal: { experience_context: { shipping_preference: string } };
      };
    };
    expect(body.purchase_units[0]?.custom_id).toBe('payment-1');
    expect(body.purchase_units[0]?.amount.value).toBe('25.00');
    expect(
      body.payment_source.paypal.experience_context.shipping_preference,
    ).toBe('NO_SHIPPING');
  });

  it('recovers an already captured PayPal order after a lost capture response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'capture-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Order already captured' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'lookup-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'COMPLETED',
            purchase_units: [
              {
                custom_id: 'payment-1',
                payments: {
                  captures: [
                    {
                      id: 'capture-1',
                      amount: { value: '25.00', currency_code: 'EUR' },
                    },
                  ],
                },
              },
            ],
          }),
      } as Response);
    const service = makeService();

    await expect(
      service.captureOrder({
        paypalOrderId: 'paypal-order-1',
        paymentTransactionId: 'payment-1',
        credentials: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          environment: 'SANDBOX' as never,
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'COMPLETED',
        customId: 'payment-1',
        captureId: 'capture-1',
        amount: '25.00',
        currency: 'EUR',
      }),
    );
  });
});
