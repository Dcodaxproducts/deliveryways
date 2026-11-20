import {
  GeneratedInvoiceKind,
  GeneratedInvoiceStatus,
  OrderStatus,
  PackageBillingModel,
  PackageCommissionType,
  PackagePayoutCycle,
  Prisma,
} from '@prisma/client';
import { PackagePlansRepository } from './package-plans.repository';

describe('PackagePlansRepository public landing visibility', () => {
  const query = {
    page: 1,
    limit: 10,
    sortBy: 'createdAt',
    sortOrder: 'DESC' as const,
    landingOnly: true,
  };

  const makeRepository = (
    items: Array<{ id: string }>,
    total = items.length,
  ) => {
    const findMany = jest
      .fn<Promise<Array<{ id: string }>>, [Prisma.PackagePlanFindManyArgs]>()
      .mockResolvedValue(items);
    const count = jest.fn().mockResolvedValue(total);
    const prisma = {
      packagePlan: { findMany, count },
      $transaction: jest
        .fn()
        .mockImplementation((operations) =>
          Promise.all(operations as Array<Promise<unknown>>),
        ),
    };

    return {
      repository: new PackagePlansRepository(prisma as never),
      findMany,
    };
  };

  it('uses showOnLanding only for the legacy unconfigured selection', async () => {
    const { repository, findMany } = makeRepository([]);

    await repository.listPublicPlans(query, null);

    const args = findMany.mock.calls[0]?.[0];
    expect(args.where?.deletedAt).toBeNull();
    expect(args.where?.isActive).toBe(true);
    expect(args.where?.showOnLanding).toBe(true);
    expect(args.skip).toBe(0);
    expect(args.take).toBe(10);
  });

  it('queries only selected active plans without database pagination', async () => {
    const { repository, findMany } = makeRepository([
      { id: 'plan-1' },
      { id: 'plan-3' },
    ]);

    const result = await repository.listPublicPlans(query, [
      'plan-3',
      'deleted-plan',
      'plan-1',
    ]);

    expect(result.items.map((plan) => plan.id)).toEqual(['plan-1', 'plan-3']);
    const args = findMany.mock.calls[0]?.[0];
    expect(args.where?.id).toEqual({
      in: ['plan-3', 'deleted-plan', 'plan-1'],
    });
    expect(args.where?.showOnLanding).toBeUndefined();
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
  });

  it('keeps an explicit empty selection empty without fallback', async () => {
    const { repository, findMany } = makeRepository([], 0);

    const result = await repository.listPublicPlans(query, []);

    expect(result).toEqual({ items: [], total: 0 });
    const args = findMany.mock.calls[0]?.[0];
    expect(args.where?.id).toEqual({ in: [] });
    expect(args.where?.showOnLanding).toBeUndefined();
  });
});

type CreateWalletTransactionCall = {
  data: {
    subscriptionInvoiceKey: string;
    amount: Prisma.Decimal;
    balanceAfter: Prisma.Decimal;
  };
};

describe('PackagePlansRepository wallet settlement', () => {
  const input = {
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    subscriptionId: 'subscription-1',
    settlementKey: 'subscription-1:period-1',
    invoiceNumber: 'SUB-INV-1',
    amountDue: new Prisma.Decimal(75),
    currency: 'EUR',
    periodFrom: new Date('2026-06-01T00:00:00.000Z'),
    periodTo: new Date('2026-07-01T00:00:00.000Z'),
    createdBy: 'system:invoice-automation',
  };

  it('returns an existing settlement without debiting the wallet again', async () => {
    const updateMany = jest.fn();
    const tx = {
      restaurantWalletTransaction: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wallet-tx-1',
          walletAccountId: 'wallet-1',
          amount: new Prisma.Decimal(-75),
          balanceAfter: new Prisma.Decimal(25),
        }),
      },
      restaurantWalletAccount: {
        findUnique: jest.fn(),
        updateMany,
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const repository = new PackagePlansRepository(prisma as never);

    const result = await repository.settleSubscriptionInvoiceFromWallet(input);

    expect(result.appliedAmount).toEqual(new Prisma.Decimal(75));
    expect(result.walletTransactionId).toBe('wallet-tx-1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('uses an optimistic balance update and stores the unique settlement key', async () => {
    const create = jest.fn((args: CreateWalletTransactionCall) => {
      void args;
      return Promise.resolve({ id: 'wallet-tx-1' });
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      restaurantWalletTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
      restaurantWalletAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wallet-1',
          balance: new Prisma.Decimal(100),
          currency: 'EUR',
        }),
        updateMany,
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const repository = new PackagePlansRepository(prisma as never);

    const result = await repository.settleSubscriptionInvoiceFromWallet(input);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'wallet-1',
        balance: new Prisma.Decimal(100),
        currency: 'EUR',
      },
      data: { balance: { decrement: new Prisma.Decimal(75) } },
    });
    const createCall = create.mock.calls[0]?.[0];

    expect(createCall?.data.subscriptionInvoiceKey).toBe(
      'subscription-1:period-1',
    );
    expect(createCall?.data.amount).toEqual(new Prisma.Decimal(-75));
    expect(createCall?.data.balanceAfter).toEqual(new Prisma.Decimal(25));
    expect(result.balanceAfter).toEqual(new Prisma.Decimal(25));
  });
});

describe('PackagePlansRepository commission order recognition', () => {
  it('filters confirmed fulfillment states by order creation period', async () => {
    const findMany = jest
      .fn<Promise<unknown[]>, [Prisma.OrderFindManyArgs]>()
      .mockResolvedValue([]);
    const repository = new PackagePlansRepository({
      order: { findMany },
    } as never);
    const fromDate = new Date('2026-06-01T00:00:00.000Z');
    const toDate = new Date('2026-07-01T00:00:00.000Z');

    await repository.listPaidRestaurantOrders(
      'restaurant-1',
      fromDate,
      toDate,
      true,
    );

    const findManyArgs = findMany.mock.calls[0]?.[0];
    expect(findManyArgs?.where?.restaurantId).toBe('restaurant-1');
    const recognizedStatuses = (
      findManyArgs?.where?.status as { in?: OrderStatus[] } | undefined
    )?.in;
    expect(recognizedStatuses).toContain(OrderStatus.CONFIRMED);
    expect(recognizedStatuses).toContain(OrderStatus.DELIVERED);
    expect(findManyArgs?.where?.createdAt).toEqual({
      gte: fromDate,
      lt: toDate,
    });
    expect(findManyArgs?.orderBy).toEqual([{ createdAt: 'asc' }]);
    expect(findManyArgs?.where).not.toHaveProperty('paymentStatus');
    expect(findManyArgs?.where).not.toHaveProperty('paidAt');
  });
});

describe('PackagePlansRepository monthly payout history', () => {
  it('loads finalized overlapping payouts and excludes the current source', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PackagePlansRepository({
      generatedInvoice: { findMany },
    } as never);
    const monthFrom = new Date('2026-09-01T00:00:00.000Z');
    const monthTo = new Date('2026-10-01T00:00:00.000Z');

    await repository.listRestaurantMonthlyPayoutInvoices(
      'restaurant-1',
      monthFrom,
      monthTo,
      'restaurant-1:current-period',
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        kind: GeneratedInvoiceKind.WEEKLY_PAYOUT,
        status: GeneratedInvoiceStatus.SENT,
        restaurantId: 'restaurant-1',
        periodFrom: { lt: monthTo },
        periodTo: { gt: monthFrom },
        sourceKey: { not: 'restaurant-1:current-period' },
      },
      select: {
        id: true,
        sourceKey: true,
        periodFrom: true,
        periodTo: true,
        snapshot: true,
      },
      orderBy: [{ periodFrom: 'asc' }, { createdAt: 'asc' }],
    });
  });
});

describe('PackagePlansRepository monthly payout allocation', () => {
  const input = {
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    subscriptionId: 'subscription-1',
    localMonth: '2026-06',
    timezone: 'Europe/Berlin',
    currency: 'EUR',
    sourceKey: 'restaurant-1:week-1:2026-06',
    grossCommissionableAmount: new Prisma.Decimal(400),
    commissionableOrderCount: 1,
    availablePayoutAmount: new Prisma.Decimal(400),
    availableForMonthlyFeeAmount: new Prisma.Decimal(380),
    packagePlanId: 'plan-1',
    billingModel: PackageBillingModel.HYBRID,
    commissionType: PackageCommissionType.PERCENTAGE,
    commissionCapAmount: new Prisma.Decimal(79),
    commissionPercentage: new Prisma.Decimal(5),
    commissionFixedAmount: new Prisma.Decimal(0),
    vatPercentage: new Prisma.Decimal(19),
    monthlyFeeAmount: new Prisma.Decimal(159),
    payoutCycle: PackagePayoutCycle.WEEKLY,
    payoutOpportunities: 4,
    expectedCommissionAmount: new Prisma.Decimal(20),
    expectedMonthlyFeeAmount: new Prisma.Decimal('39.75'),
    snapshotHash: 'a'.repeat(64),
  };

  it('returns the unique existing allocation on concurrent retry', async () => {
    const existing = { id: 'allocation-1', sourceKey: input.sourceKey };
    const tx = {
      restaurantPayoutAllocation: {
        findUnique: jest.fn().mockResolvedValue(existing),
      },
    };
    let transactionAttempt = 0;
    let capturedOptions: unknown;
    const transaction = jest.fn(
      (
        callback: (client: typeof tx) => Promise<unknown>,
        options?: unknown,
      ) => {
        transactionAttempt += 1;
        capturedOptions = options;
        return transactionAttempt === 1
          ? Promise.reject(
              Object.assign(new Error('serialization conflict'), {
                code: 'P2034',
              }),
            )
          : callback(tx);
      },
    );
    const repository = new PackagePlansRepository({
      $transaction: transaction,
    } as never);

    await expect(repository.allocateMonthlyPayout(input)).resolves.toEqual(
      existing,
    );
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(capturedOptions).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('records a partial special payout without commission or monthly-fee duplication', async () => {
    let capturedAllocation: Record<string, unknown> = {};
    const create = jest.fn(({ data }: { data: Record<string, unknown> }) => {
      capturedAllocation = data;
      return Promise.resolve({ id: 'allocation-special', ...data });
    });
    let capturedLedgerUpdate: {
      data?: {
        commissionAllocatedAmount?: Prisma.Decimal;
        monthlyFeeAllocatedAmount?: Prisma.Decimal;
      };
    } = {};
    const update = jest.fn((args: typeof capturedLedgerUpdate) => {
      capturedLedgerUpdate = args;
      return Promise.resolve({ id: 'ledger-1' });
    });
    const tx = {
      tenantSubscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 'subscription-1' }),
      },
      restaurantPayoutAllocation: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(2),
        create,
      },
      restaurantPayoutMonthlyLedger: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            commissionAllocatedAmount: new Prisma.Decimal(45),
            monthlyFeeAllocatedAmount: new Prisma.Decimal('79.50'),
          },
        }),
        upsert: jest.fn().mockResolvedValue({
          id: 'ledger-1',
          finalizedAt: null,
          commissionCapAmount: new Prisma.Decimal(79),
          commissionAllocatedAmount: new Prisma.Decimal(45),
          monthlyFeeAmount: new Prisma.Decimal(159),
          payoutCycle: PackagePayoutCycle.WEEKLY,
          payoutOpportunities: 4,
          monthlyFeeAllocatedAmount: new Prisma.Decimal('79.50'),
        }),
        update,
      },
    };
    const repository = new PackagePlansRepository({
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as never);

    await repository.allocateMonthlyPayout({
      ...input,
      sourceKey: 'restaurant-1:special:request-1:2026-06',
      availablePayoutAmount: new Prisma.Decimal(12),
      availableForMonthlyFeeAmount: new Prisma.Decimal(12),
      expectedCommissionAmount: new Prisma.Decimal(0),
      expectedMonthlyFeeAmount: new Prisma.Decimal(0),
      isSpecialPayout: true,
    });

    expect(capturedAllocation).toMatchObject({
      sequence: 3,
      commissionAmount: new Prisma.Decimal(0),
      monthlyFeeAmount: new Prisma.Decimal(0),
      availablePayoutAmount: new Prisma.Decimal(12),
      isSpecialPayout: true,
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(capturedLedgerUpdate.data?.commissionAllocatedAmount).toEqual(
      new Prisma.Decimal(45),
    );
    expect(capturedLedgerUpdate.data?.monthlyFeeAllocatedAmount).toEqual(
      new Prisma.Decimal('79.50'),
    );
  });

  it('carries restaurant-month cap and fee across a replacement subscription id', async () => {
    let capturedAllocation: Record<string, unknown> = {};
    const tx = {
      tenantSubscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 'subscription-2' }),
      },
      restaurantPayoutAllocation: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(2),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          capturedAllocation = data;
          return Promise.resolve({ id: 'allocation-2', ...data });
        }),
      },
      restaurantPayoutMonthlyLedger: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            commissionAllocatedAmount: new Prisma.Decimal(50),
            monthlyFeeAllocatedAmount: new Prisma.Decimal('79.50'),
          },
        }),
        upsert: jest.fn().mockResolvedValue({
          id: 'ledger-2',
          finalizedAt: null,
          commissionCapAmount: new Prisma.Decimal(79),
          commissionAllocatedAmount: new Prisma.Decimal(0),
          monthlyFeeAmount: new Prisma.Decimal(159),
          payoutCycle: PackagePayoutCycle.WEEKLY,
          payoutOpportunities: 4,
          monthlyFeeAllocatedAmount: new Prisma.Decimal(0),
          commissionType: PackageCommissionType.PERCENTAGE,
          commissionPercentage: new Prisma.Decimal(5),
          commissionFixedAmount: new Prisma.Decimal(0),
        }),
        update: jest.fn().mockResolvedValue({ id: 'ledger-2' }),
      },
    };
    const repository = new PackagePlansRepository({
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as never);

    await repository.allocateMonthlyPayout({
      ...input,
      subscriptionId: 'subscription-2',
      sourceKey: 'restaurant-1:week-3:2026-06',
      expectedCommissionAmount: new Prisma.Decimal(20),
      expectedMonthlyFeeAmount: new Prisma.Decimal('39.75'),
    });

    expect(tx.restaurantPayoutMonthlyLedger.aggregate).toHaveBeenCalledWith({
      where: { restaurantId: 'restaurant-1', localMonth: '2026-06' },
      _sum: {
        commissionAllocatedAmount: true,
        monthlyFeeAllocatedAmount: true,
      },
    });
    expect(capturedAllocation).toMatchObject({
      commissionAmount: new Prisma.Decimal(20),
      monthlyFeeAmount: new Prisma.Decimal('39.75'),
    });
  });

  it('claims a payout email outbox only once so retries cannot duplicate delivery', async () => {
    type UpdateManyArgs = {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    let capturedClaim: UpdateManyArgs | null = null;
    let claimAttempt = 0;
    const updateMany = jest.fn((args: UpdateManyArgs) => {
      capturedClaim ??= args;
      claimAttempt += 1;
      return Promise.resolve({ count: claimAttempt === 1 ? 1 : 0 });
    });
    const findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'outbox-1',
      generatedInvoiceId: 'invoice-1',
      recipientEmail: 'billing@example.test',
    });
    const tx = {
      payoutInvoiceEmailOutbox: { updateMany, findUniqueOrThrow },
    };
    const repository = new PackagePlansRepository({
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as never);

    await expect(
      repository.claimPayoutInvoiceEmail(
        'invoice-1',
        new Date('2026-07-01T10:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ id: 'outbox-1' });
    await expect(
      repository.claimPayoutInvoiceEmail(
        'invoice-1',
        new Date('2026-07-01T10:01:00.000Z'),
      ),
    ).resolves.toBeNull();
    expect(findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(capturedClaim).toMatchObject({
      where: {
        generatedInvoiceId: 'invoice-1',
        sentAt: null,
        deliveryState: { in: ['PENDING', 'RETRY_WAIT'] },
        claimToken: null,
        attempts: { lt: 8 },
        OR: [
          { nextAttemptAt: null },
          { nextAttemptAt: { lte: new Date('2026-07-01T10:00:00.000Z') } },
        ],
      },
      data: {
        deliveryState: 'PREPARING',
        claimExpiresAt: new Date('2026-07-01T10:05:00.000Z'),
      },
    });
  });

  it('releases a failed lease with exponential backoff and fencing token', async () => {
    type UpdateManyArgs = {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    let capturedFailure: UpdateManyArgs | null = null;
    const updateMany = jest.fn((args: UpdateManyArgs) => {
      capturedFailure = args;
      return Promise.resolve({ count: 1 });
    });
    const repository = new PackagePlansRepository({
      payoutInvoiceEmailOutbox: { updateMany },
    } as never);

    await repository.markPayoutInvoiceEmailFailed({
      outboxId: 'outbox-1',
      claimToken: 'claim-1',
      attempts: 3,
      failedAt: new Date('2026-07-01T10:00:00.000Z'),
      error: 'smtp unavailable',
    });

    expect(capturedFailure).toMatchObject({
      where: {
        id: 'outbox-1',
        claimToken: 'claim-1',
        deliveryState: 'PREPARING',
        sentAt: null,
      },
      data: {
        deliveryState: 'RETRY_WAIT',
        claimToken: null,
        claimExpiresAt: null,
        nextAttemptAt: new Date('2026-07-01T10:02:00.000Z'),
      },
    });
  });

  it('fences stale workers when marking provider-accepted mail sent', async () => {
    let sentAttempt = 0;
    const updateMany = jest.fn(() => {
      sentAttempt += 1;
      return Promise.resolve({ count: sentAttempt === 1 ? 1 : 0 });
    });
    type EventCreateArgs = { data: { metadata?: unknown } };
    let capturedEvent: EventCreateArgs | null = null;
    const createEvent = jest.fn((args: EventCreateArgs) => {
      capturedEvent = args;
      return Promise.resolve({});
    });
    const tx = {
      payoutInvoiceEmailOutbox: { updateMany },
      generatedInvoice: { update: jest.fn().mockResolvedValue({}) },
      generatedInvoiceEvent: { create: createEvent },
    };
    const repository = new PackagePlansRepository({
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as never);
    const input = {
      outboxId: 'outbox-1',
      generatedInvoiceId: 'invoice-1',
      recipientEmail: 'billing@example.test',
      claimToken: 'claim-current',
      providerMessageKey: 'payout-invoice-invoice-1@deliveryways.app',
      sentAt: new Date('2026-07-01T10:01:00.000Z'),
    };

    await expect(repository.markPayoutInvoiceEmailSent(input)).resolves.toBe(
      true,
    );
    await expect(repository.markPayoutInvoiceEmailSent(input)).resolves.toBe(
      false,
    );
    expect(tx.generatedInvoice.update).toHaveBeenCalledTimes(1);
    expect(capturedEvent).toMatchObject({
      data: {
        metadata: {
          outboxId: 'outbox-1',
          providerMessageKey: input.providerMessageKey,
        },
      },
    });
  });

  it('retries an expired pre-send claim but quarantines an expired SMTP claim as UNKNOWN', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const tx = {
      payoutInvoiceEmailOutbox: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'before-send', deliveryState: 'PREPARING' },
          { id: 'after-send', deliveryState: 'SENDING' },
        ]),
        updateMany: jest.fn((args: Record<string, unknown>) => {
          updates.push(args);
          return Promise.resolve({ count: 1 });
        }),
      },
    };
    const repository = new PackagePlansRepository({
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as never);
    const now = new Date('2026-07-01T10:10:00.000Z');

    await expect(
      repository.reconcileExpiredPayoutInvoiceEmailClaims(now, 2),
    ).resolves.toEqual({ retryable: 1, unknown: 1 });
    expect(updates[0]).toMatchObject({
      where: {
        id: { in: ['before-send'] },
        deliveryState: 'PREPARING',
      },
      data: {
        deliveryState: 'RETRY_WAIT',
        nextAttemptAt: now,
      },
    });
    expect(updates[1]).toMatchObject({
      where: {
        id: { in: ['after-send'] },
        deliveryState: 'SENDING',
      },
      data: {
        deliveryState: 'UNKNOWN',
        nextAttemptAt: null,
        reconciliationRequiredAt: now,
      },
    });
  });

  it('never includes UNKNOWN delivery outcomes in automatic resend candidates', async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    const repository = new PackagePlansRepository({
      payoutInvoiceEmailOutbox: {
        findMany: jest.fn((args: { where: Record<string, unknown> }) => {
          capturedWhere = args.where;
          return Promise.resolve([]);
        }),
      },
    } as never);

    await repository.listDuePayoutInvoiceEmails(
      new Date('2026-07-01T10:10:00.000Z'),
    );

    expect(capturedWhere).toMatchObject({
      deliveryState: { in: ['PENDING', 'RETRY_WAIT'] },
      claimToken: null,
    });
  });

  it('moves an uncertain SMTP error to UNKNOWN without scheduling a resend', async () => {
    let captured: Record<string, unknown> | undefined;
    const repository = new PackagePlansRepository({
      payoutInvoiceEmailOutbox: {
        updateMany: jest.fn((args: Record<string, unknown>) => {
          captured = args;
          return Promise.resolve({ count: 1 });
        }),
      },
    } as never);
    const detectedAt = new Date('2026-07-01T10:02:00.000Z');

    await repository.markPayoutInvoiceEmailUnknown({
      outboxId: 'outbox-1',
      claimToken: 'claim-1',
      detectedAt,
      error: 'connection closed after DATA',
    });

    expect(captured).toMatchObject({
      where: {
        id: 'outbox-1',
        claimToken: 'claim-1',
        deliveryState: 'SENDING',
      },
      data: {
        deliveryState: 'UNKNOWN',
        nextAttemptAt: null,
        reconciliationRequiredAt: detectedAt,
      },
    });
  });

  it('allows only one concurrent operator reconciliation to mark delivery', async () => {
    let attempt = 0;
    const current = {
      id: 'outbox-1',
      generatedInvoiceId: 'invoice-1',
      recipientEmail: 'billing@example.test',
      providerMessageKey: 'payout-invoice-invoice-1@deliveryways.app',
      deliveryState: 'UNKNOWN',
      generatedInvoice: { id: 'invoice-1', snapshot: {} },
    };
    const tx = {
      payoutInvoiceEmailOutbox: {
        findUnique: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn(() => {
          attempt += 1;
          return Promise.resolve({ count: attempt === 1 ? 1 : 0 });
        }),
      },
      generatedInvoice: { update: jest.fn().mockResolvedValue({}) },
      generatedInvoiceEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const repository = new PackagePlansRepository({
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as never);
    const input = {
      generatedInvoiceId: 'invoice-1',
      action: 'DELIVERED' as const,
      actorId: 'operator-1',
      reconciledAt: new Date('2026-07-01T10:15:00.000Z'),
      note: 'Confirmed in provider logs',
    };

    await expect(
      repository.reconcilePayoutInvoiceEmail(input),
    ).resolves.toEqual(expect.objectContaining({ deliveryState: 'SENT' }));
    await expect(
      repository.reconcilePayoutInvoiceEmail(input),
    ).resolves.toBeNull();
    expect(tx.generatedInvoice.update).toHaveBeenCalledTimes(1);
    expect(tx.generatedInvoiceEvent.create).toHaveBeenCalledTimes(1);
  });
  it('bounds wallet payout orders by durable unsettled boundary and fixed cursor page', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PackagePlansRepository({
      order: { findMany },
    } as never);
    const from = new Date('2026-08-01T00:00:00.000Z');

    await repository.listRestaurantWalletPayoutOrders('restaurant-1', {
      from,
      cursor: 'order-100',
      take: 501,
    });

    type WalletOrderQuery = {
      where: Record<string, unknown>;
      cursor: { id: string };
      skip: number;
      take: number;
      orderBy: Array<Record<string, string>>;
    };
    const calls = findMany.mock.calls as unknown as Array<[WalletOrderQuery]>;
    const query = calls[0][0];
    expect(query).toMatchObject({
      where: {
        restaurantId: 'restaurant-1',
        OR: [
          { paidAt: { gte: from } },
          { paidAt: null, createdAt: { gte: from } },
        ],
      },
      cursor: { id: 'order-100' },
      skip: 1,
      take: 501,
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  });
});
