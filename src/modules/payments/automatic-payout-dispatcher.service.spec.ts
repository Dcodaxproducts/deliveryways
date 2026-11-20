import { AutomaticPayoutTransferState, Prisma } from '@prisma/client';
import { AutomaticPayoutDispatcherService } from './automatic-payout-dispatcher.service';
import { PayoutReconciliationAction, RestaurantPayoutProvider } from './dto';

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
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(transfer(settings)),
      },
    };
    const stripePaymentsService = { createTransfer: jest.fn() };
    const service = new AutomaticPayoutDispatcherService(
      prisma as never,
      { getPayoutProviderSettings: jest.fn() } as never,
      { decrypt: jest.fn() } as never,
      stripePaymentsService as never,
      { createPayout: jest.fn() } as never,
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
    expect(blockedData?.lastError).toContain('manual submission');
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
      'SENDING',
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

  it('uses one durable logical payout for concurrent same-key manual calls', async () => {
    const { service, prisma } = makeService({});
    const completed = {
      ...transfer({}),
      generatedInvoiceId: null,
      provider: RestaurantPayoutProvider.STRIPE,
      state: AutomaticPayoutTransferState.SUCCEEDED,
      idempotencyKey: 'manual-hash',
      payoutRequest: { id: 'request-1' },
    };
    const pending = {
      ...completed,
      state: AutomaticPayoutTransferState.PENDING,
      payoutRequest: null,
    };
    prisma.automaticPayoutTransfer.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completed);
    prisma.automaticPayoutTransfer.create.mockResolvedValue(pending);
    prisma.automaticPayoutTransfer.findUniqueOrThrow.mockResolvedValue(
      completed,
    );
    const dispatch = jest
      .spyOn(
        service as unknown as {
          dispatchOne: (id: string, now: Date) => Promise<'succeeded'>;
        },
        'dispatchOne',
      )
      .mockResolvedValue('succeeded');
    const input = {
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      actorId: 'super-1',
      provider: RestaurantPayoutProvider.STRIPE,
      amount: new Prisma.Decimal(125),
      currency: 'EUR',
      idempotencyKey: 'same-client-key',
      description: 'Manual payout',
    };

    const first = await service.executeManualPayout(input);
    const second = await service.executeManualPayout(input);

    expect(first).toEqual({ id: 'request-1' });
    expect(second).toEqual(first);
    expect(prisma.automaticPayoutTransfer.create).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('requires provider proof before releasing or resending UNKNOWN', async () => {
    const { service } = makeService({});
    await expect(
      service.reconcileUnknownPayout({
        id: 'transfer-1',
        action: PayoutReconciliationAction.RESEND,
        actorId: 'super-1',
        note: 'Provider search found no submission',
      }),
    ).rejects.toThrow('Provider confirmation');
  });

  it('reconciles DELIVERED exactly through the UNKNOWN completion fence', async () => {
    const { service, prisma } = makeService({});
    const complete = jest
      .spyOn(
        service as unknown as {
          complete: (...args: unknown[]) => Promise<void>;
        },
        'complete',
      )
      .mockResolvedValue(undefined);
    prisma.automaticPayoutTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 'transfer-1',
      state: AutomaticPayoutTransferState.SUCCEEDED,
      payoutRequest: { id: 'request-1' },
    });

    await service.reconcileUnknownPayout({
      id: 'transfer-1',
      action: PayoutReconciliationAction.DELIVERED,
      actorId: 'super-1',
      note: 'Confirmed in provider dashboard',
      providerReference: 'tr_confirmed',
    });

    expect(complete).toHaveBeenCalledWith(
      'transfer-1',
      null,
      'tr_confirmed',
      expect.any(Date),
      AutomaticPayoutTransferState.UNKNOWN,
      'super-1',
      'Confirmed in provider dashboard',
    );
  });

  it.each([
    [
      PayoutReconciliationAction.NOT_DELIVERED,
      AutomaticPayoutTransferState.FAILED,
    ],
    [
      PayoutReconciliationAction.RESEND,
      AutomaticPayoutTransferState.RETRY_WAIT,
    ],
  ])(
    'reconciles %s through exactly one reservation release',
    async (action, expectedState) => {
      const { service, prisma } = makeService({});
      const release = jest
        .spyOn(
          service as unknown as {
            releaseReservation: (...args: unknown[]) => Promise<void>;
          },
          'releaseReservation',
        )
        .mockResolvedValue(undefined);
      prisma.automaticPayoutTransfer.findUniqueOrThrow.mockResolvedValue({
        id: 'transfer-1',
        state: expectedState,
      });

      await service.reconcileUnknownPayout({
        id: 'transfer-1',
        action,
        actorId: 'super-1',
        note: 'Provider confirmed no submission',
        providerConfirmedNotSubmitted: true,
      });

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith(
        'transfer-1',
        expectedState,
        expect.any(Date),
        'super-1',
        'Provider confirmed no submission',
      );
    },
  );

  it('atomically releases a reservation when pre-submission retries exhaust', async () => {
    const { service } = makeService({});
    const failAndRelease = jest
      .spyOn(
        service as unknown as {
          failAndRelease: (...args: unknown[]) => Promise<void>;
        },
        'failAndRelease',
      )
      .mockResolvedValue(undefined);
    const now = new Date('2026-07-01T00:00:00.000Z');

    await (
      service as unknown as {
        retryBeforeSubmission: (
          id: string,
          token: string,
          attempts: number,
          error: unknown,
          now: Date,
        ) => Promise<void>;
      }
    ).retryBeforeSubmission(
      'transfer-1',
      'claim-1',
      8,
      new Error('credentials rejected'),
      now,
    );

    expect(failAndRelease).toHaveBeenCalledWith(
      'transfer-1',
      'claim-1',
      expect.any(Error),
      now,
    );
  });

  it('fences expired lease recovery by observed token and expiry', async () => {
    const { service, prisma, updates } = makeService({});
    const expiry = new Date('2026-07-01T00:00:00.000Z');
    prisma.automaticPayoutTransfer.findMany.mockReset().mockResolvedValueOnce([
      {
        id: 'transfer-1',
        state: AutomaticPayoutTransferState.PREPARING,
        claimToken: 'observed-token',
        claimExpiresAt: expiry,
      },
    ]);

    await (
      service as unknown as {
        recoverExpiredClaims: (now: Date, take: number) => Promise<void>;
      }
    ).recoverExpiredClaims(new Date('2026-07-01T00:01:00.000Z'), 10);

    expect(updates[0]?.where).toEqual(
      expect.objectContaining({
        id: 'transfer-1',
        claimToken: 'observed-token',
        claimExpiresAt: expiry,
      }),
    );
  });
});
