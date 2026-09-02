import {
  GeneratedInvoiceKind,
  GeneratedInvoiceStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { PackagePlansRepository } from './package-plans.repository';

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
