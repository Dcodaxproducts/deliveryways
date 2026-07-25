import { PaypalPayoutEnvironment } from './dto';
import { PaypalPayoutsService } from './paypal-payouts.service';

describe('PaypalPayoutsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('authenticates and creates an idempotent payout batch', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token-1' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            batch_header: { payout_batch_id: 'batch-1' },
          }),
          { status: 201 },
        ),
      );
    const service = new PaypalPayoutsService();

    const result = await service.createPayout({
      credentials: {
        clientId: 'client-1',
        clientSecret: 'secret-1',
        recipientEmail: 'owner@example.com',
        environment: PaypalPayoutEnvironment.SANDBOX,
      },
      amount: 125.5,
      currency: 'EUR',
      description: 'Weekly payout',
      idempotencyKey: 'payout-1',
    });

    expect(result).toEqual({ id: 'batch-1' });
    const payoutRequest = fetchMock.mock.calls[1];
    expect(payoutRequest?.[0]).toBe(
      'https://api-m.sandbox.paypal.com/v1/payments/payouts',
    );
    expect(payoutRequest?.[1]?.method).toBe('POST');
    const payoutBody = payoutRequest?.[1]?.body;
    if (typeof payoutBody !== 'string') {
      throw new Error('Expected PayPal payout request body to be JSON');
    }
    expect(payoutBody).toContain('"sender_batch_id":"payout-1"');
  });

  it('does not treat a failed PayPal payout as successful', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token-1' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Receiver is invalid' }), {
          status: 422,
        }),
      );
    const service = new PaypalPayoutsService();

    await expect(
      service.createPayout({
        credentials: {
          clientId: 'client-1',
          clientSecret: 'secret-1',
          recipientEmail: 'owner@example.com',
          environment: PaypalPayoutEnvironment.LIVE,
        },
        amount: 125.5,
        currency: 'EUR',
        description: 'Weekly payout',
        idempotencyKey: 'payout-1',
      }),
    ).rejects.toThrow('Receiver is invalid');
  });
});
