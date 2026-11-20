import { Prisma } from '@prisma/client';
import { AutomaticPayoutDispatcherService } from './automatic-payout-dispatcher.service';
import { RestaurantPayoutProvider } from './dto';

describe('AutomaticPayoutDispatcherService', () => {
  const transfer = (settings: Prisma.JsonValue) => ({
    id: 'transfer-1',
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    generatedInvoiceId: 'invoice-1',
    payoutRequestId: null,
    provider: null,
    state: 'PREPARING',
    amount: new Prisma.Decimal(125),
    currency: 'EUR',
    idempotencyKey: 'payout-invoice-invoice-1',
    providerReference: null,
    claimToken: 'claim-1',
    claimExpiresAt: new Date(),
    nextAttemptAt: null,
    attempts: 1,
    lastError: null,
    providerSubmittedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    restaurant: { id: 'restaurant-1', settings },
  });

  const makeService = (settings: Prisma.JsonValue) => {
    const updates: Record<string, unknown>[] = [];
    const updateMany = jest.fn((args: Record<string, unknown>) => {
      updates.push(args);
      return Promise.resolve({ count: 1 });
    });
    const prisma = {
      automaticPayoutTransfer: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'transfer-1' }]),
        updateMany,
        findUniqueOrThrow: jest.fn().mockResolvedValue(transfer(settings)),
      },
    };
    const stripePaymentsService = { createTransfer: jest.fn() };
    const service = new AutomaticPayoutDispatcherService(
      prisma as never,
      { getPayoutProviderSettings: jest.fn() } as never,
      { decrypt: jest.fn() } as never,
      stripePaymentsService as never,
    );
    return { service, prisma, stripePaymentsService, updates };
  };

  it('blocks PayPal automation with an honest reconciliation reason', async () => {
    const { service, stripePaymentsService, updates } = makeService({
      payments: {
        payoutProviders: {
          configurations: {
            PAYPAL: {
              enabled: true,
              approvedAt: '2026-06-01T00:00:00.000Z',
              approvedBy: 'super-admin-1',
              publicDetails: { recipientEmail: 'merchant@example.com' },
            },
          },
        },
      },
    });

    const result = await service.dispatchDuePayouts(
      new Date('2026-07-01T00:00:00.000Z'),
    );

    expect(result).toEqual({
      succeeded: 0,
      blocked: 1,
      retrying: 0,
      unknown: 0,
    });
    expect(stripePaymentsService.createTransfer).not.toHaveBeenCalled();
    const blockedData = updates
      .map((args) => args.data as Record<string, unknown>)
      .find((data) => data.state === 'BLOCKED');
    expect(blockedData?.provider).toBe(RestaurantPayoutProvider.PAYPAL);
    expect(blockedData?.lastError).toContain('reconciliation');
  });

  it('submits the finalized eligible amount to Stripe automatically', async () => {
    const { service, stripePaymentsService } = makeService({
      payments: {
        payoutProviders: {
          configurations: {
            STRIPE: {
              enabled: true,
              approvedAt: '2026-06-01T00:00:00.000Z',
              approvedBy: 'super-admin-1',
              publicDetails: { accountId: 'acct_123' },
            },
          },
        },
      },
    });
    jest
      .spyOn(
        service as unknown as {
          resolveStripeCredentials: () => Promise<Record<string, string>>;
        },
        'resolveStripeCredentials',
      )
      .mockResolvedValue({
        secretKey: 'sk_test_123',
        publishableKey: 'pk_test_123',
        webhookSecret: 'whsec_123',
      });
    jest
      .spyOn(
        service as unknown as {
          reserve: (id: string, claimToken: string, now: Date) => Promise<void>;
        },
        'reserve',
      )
      .mockResolvedValue(undefined);
    const complete = jest
      .spyOn(
        service as unknown as {
          complete: (
            id: string,
            claimToken: string,
            providerReference: string,
            now: Date,
          ) => Promise<void>;
        },
        'complete',
      )
      .mockResolvedValue(undefined);
    stripePaymentsService.createTransfer.mockResolvedValue({ id: 'tr_123' });

    const result = await service.dispatchDuePayouts(
      new Date('2026-07-01T00:00:00.000Z'),
    );

    expect(result.succeeded).toBe(1);
    expect(stripePaymentsService.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 125,
        currency: 'EUR',
        destinationAccountId: 'acct_123',
        idempotencyKey: 'payout-invoice-invoice-1',
      }),
      expect.any(Object),
    );
    expect(complete).toHaveBeenCalledWith(
      'transfer-1',
      expect.any(String),
      'tr_123',
      new Date('2026-07-01T00:00:00.000Z'),
    );
  });

  it('uses durable invoice idempotency and never auto-resends after provider success plus DB failure', async () => {
    const { service, stripePaymentsService, updates } = makeService({
      payments: {
        payoutProviders: {
          configurations: {
            STRIPE: {
              enabled: true,
              approvedAt: '2026-06-01T00:00:00.000Z',
              approvedBy: 'super-admin-1',
              publicDetails: { accountId: 'acct_123' },
            },
          },
        },
      },
    });
    jest
      .spyOn(
        service as unknown as {
          resolveStripeCredentials: () => Promise<Record<string, string>>;
        },
        'resolveStripeCredentials',
      )
      .mockResolvedValue({
        secretKey: 'sk_test_123',
        publishableKey: 'pk_test_123',
        webhookSecret: 'whsec_123',
      });
    jest
      .spyOn(
        service as unknown as {
          reserve: (id: string, claimToken: string, now: Date) => Promise<void>;
        },
        'reserve',
      )
      .mockResolvedValue(undefined);
    jest
      .spyOn(
        service as unknown as {
          complete: (
            id: string,
            claimToken: string,
            providerReference: string,
            now: Date,
          ) => Promise<void>;
        },
        'complete',
      )
      .mockRejectedValue(
        new Error('database unavailable after provider success'),
      );
    stripePaymentsService.createTransfer.mockResolvedValue({ id: 'tr_123' });

    const result = await service.dispatchDuePayouts(
      new Date('2026-07-01T00:00:00.000Z'),
    );

    expect(result.unknown).toBe(1);
    expect(stripePaymentsService.createTransfer).toHaveBeenCalledTimes(1);
    expect(stripePaymentsService.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 125,
        idempotencyKey: 'payout-invoice-invoice-1',
      }),
      expect.any(Object),
    );
    const lastUpdate = updates.at(-1);
    const unknownData = lastUpdate?.data as Record<string, unknown>;
    expect(unknownData.state).toBe('UNKNOWN');
    expect(unknownData.claimToken).toBeNull();
  });
});
