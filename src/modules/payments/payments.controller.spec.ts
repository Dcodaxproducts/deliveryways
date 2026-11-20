import { PaymentsController } from './payments.controller';

describe('PaymentsController Stripe transfer idempotency', () => {
  it('forwards the caller-supplied stable key unchanged', async () => {
    const paymentsService = {
      createRestaurantStripeTransfer: jest.fn().mockResolvedValue({
        data: { id: 'request-1' },
        message: 'Restaurant provider payout completed successfully',
      }),
    };
    const controller = new PaymentsController(paymentsService as never);
    const user = { uid: 'super-1', role: 'SUPER_ADMIN' } as never;
    const dto = {
      amount: 125,
      currency: 'EUR',
      idempotencyKey: 'weekly-payout-2026-11-20',
    };

    const result = await controller.createRestaurantStripeTransfer(
      user,
      'restaurant-1',
      dto,
    );

    expect(paymentsService.createRestaurantStripeTransfer).toHaveBeenCalledWith(
      user,
      'restaurant-1',
      dto,
    );
    expect(result.data.id).toBe('request-1');
  });
});
