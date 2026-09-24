import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
} from '@prisma/client';
import { AdminReportsRepository } from './admin-reports.repository';

describe('AdminReportsRepository', () => {
  it('includes restaurant-level billing invoices for an authorized branch scope', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new AdminReportsRepository({
      generatedInvoice: { findMany },
    } as never);

    await repository.listGeneratedInvoices(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      { kind: 'SUBSCRIPTION' } as never,
    );

    const findManyCalls = findMany.mock.calls as unknown as Array<
      [{ where: Record<string, unknown> }]
    >;
    const findManyCall = findManyCalls[0][0];
    expect(findManyCall.where).toMatchObject({
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      OR: [{ branchId: 'branch-1' }, { branchId: null }],
      kind: 'SUBSCRIPTION',
    });
  });

  it('allows an authorized branch to view a restaurant-level billing PDF', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new AdminReportsRepository({
      generatedInvoice: { findFirst },
    } as never);

    await repository.findGeneratedInvoiceById(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      'invoice-1',
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'invoice-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        OR: [{ branchId: 'branch-1' }, { branchId: null }],
      },
    });
  });

  it('applies excluded status and schedule dates to order report aggregation', async () => {
    const order = {
      aggregate: jest
        .fn()
        .mockResolvedValueOnce({
          _count: { id: 0 },
          _sum: { deliveryFee: 0, discountAmount: 0 },
        })
        .mockResolvedValueOnce({
          _count: { id: 0 },
          _sum: { totalAmount: 0 },
          _avg: { totalAmount: 0 },
        }),
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const orderItem = { findMany: jest.fn().mockResolvedValue([]) };
    const restaurantPayoutRequest = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      order,
      orderItem,
      restaurantPayoutRequest,
      $transaction: jest.fn((queries: Array<Promise<unknown>>) =>
        Promise.all(queries),
      ),
    };
    const repository = new AdminReportsRepository(prisma as never);

    await repository.getOrdersReport(
      { restaurantId: 'restaurant-1' },
      {
        excludeStatus: OrderStatus.PAYMENT_PENDING,
        fromDate: '2026-08-21',
        toDate: '2026-08-21',
        orderTimeFrom: '2026-08-22',
        orderTimeTo: '2026-08-22',
        isScheduled: true,
      },
    );

    const expectedWhere = {
      restaurantId: 'restaurant-1',
      status: { not: OrderStatus.PAYMENT_PENDING },
      createdAt: {
        gte: new Date('2026-08-21T00:00:00.000Z'),
        lte: new Date('2026-08-21T23:59:59.999Z'),
      },
      orderTime: {
        gte: new Date('2026-08-22T00:00:00.000Z'),
        lte: new Date('2026-08-22T23:59:59.999Z'),
      },
      isScheduled: true,
    };
    const aggregateCalls = order.aggregate.mock.calls as Array<
      [
        {
          where?: Omit<typeof expectedWhere, 'status'> & {
            status?: { not?: OrderStatus; in?: OrderStatus[] };
          };
        },
      ]
    >;
    const firstAggregate = aggregateCalls[0]?.[0];
    const secondAggregate = aggregateCalls[1]?.[0];

    expect(firstAggregate?.where).toEqual(expectedWhere);
    const { status: _excludedStatus, ...sharedWhere } = expectedWhere;
    void _excludedStatus;
    expect(secondAggregate?.where).toMatchObject(sharedWhere);
    expect(secondAggregate?.where?.status?.in).toEqual(
      expect.arrayContaining([OrderStatus.CONFIRMED, OrderStatus.DELIVERED]),
    );
    expect(order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { order: expectedWhere } }),
    );
    const payoutCalls = restaurantPayoutRequest.findMany.mock
      .calls as unknown as Array<[{ where: { createdAt: unknown } }]>;
    expect(payoutCalls[0][0].where.createdAt).toEqual(expectedWhere.createdAt);
  });

  it('reconciles all matching orders while recognizing successful revenue', async () => {
    const prisma = {
      order: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({
            _count: { id: 4 },
            _sum: { deliveryFee: 6, discountAmount: 2 },
          })
          .mockResolvedValueOnce({
            _count: { id: 2 },
            _sum: { totalAmount: 50 },
            _avg: { totalAmount: 25 },
          }),
        groupBy: jest.fn().mockResolvedValue([
          { paymentMethod: PaymentMethod.COD, _sum: { totalAmount: 30 } },
          { paymentMethod: PaymentMethod.STRIPE, _sum: { totalAmount: 20 } },
        ]),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { status: OrderStatus.CONFIRMED },
            { status: OrderStatus.DELIVERED },
            { status: OrderStatus.CANCELLED },
            { status: OrderStatus.REJECTED },
          ])
          .mockResolvedValueOnce([
            { paymentMethod: PaymentMethod.COD },
            { paymentMethod: PaymentMethod.STRIPE },
          ])
          .mockResolvedValueOnce([
            {
              id: 'order-cash',
              status: OrderStatus.CONFIRMED,
              orderType: 'DELIVERY',
              sourceGroupOrder: null,
              createdAt: new Date('2026-08-28T12:00:00.000Z'),
              paymentMethod: PaymentMethod.COD,
              paymentStatus: PaymentStatus.PENDING,
              totalAmount: 30,
            },
            {
              id: 'order-online',
              status: OrderStatus.DELIVERED,
              orderType: 'DELIVERY',
              sourceGroupOrder: { id: 'group-1' },
              createdAt: new Date('2026-08-28T12:15:00.000Z'),
              paymentMethod: PaymentMethod.STRIPE,
              paymentStatus: PaymentStatus.PAID,
              totalAmount: 20,
            },
            {
              id: 'order-cancelled',
              status: OrderStatus.CANCELLED,
              orderType: 'TAKEAWAY',
              sourceGroupOrder: null,
              createdAt: new Date('2026-08-28T12:30:00.000Z'),
              paymentMethod: PaymentMethod.CARD_ON_DELIVERY,
              paymentStatus: PaymentStatus.PENDING,
              totalAmount: 0,
            },
            {
              id: 'order-rejected',
              status: OrderStatus.REJECTED,
              orderType: 'DELIVERY',
              sourceGroupOrder: null,
              createdAt: new Date('2026-08-28T13:00:00.000Z'),
              paymentMethod: PaymentMethod.WALLET,
              paymentStatus: PaymentStatus.FAILED,
              totalAmount: 0,
            },
          ]),
      },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      restaurantPayoutRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'payout-1',
            createdAt: new Date('2026-08-28T15:00:00.000Z'),
            status: 'PAID',
            amount: 40,
            currency: 'EUR',
            paidAt: new Date('2026-08-29T09:00:00.000Z'),
            paymentReference: 'BANK-1',
          },
        ]),
      },
      $transaction: jest.fn((queries: Array<Promise<unknown>>) =>
        Promise.all(queries),
      ),
    };
    const repository = new AdminReportsRepository(prisma as never);

    const result = await repository.getOrdersReport(
      { restaurantId: 'restaurant-1' },
      { excludeStatus: OrderStatus.PAYMENT_PENDING },
    );

    expect(result).toMatchObject({
      totalOrders: 4,
      successfulOrders: 2,
      cancelledOrders: 1,
      rejectedOrders: 1,
      totalRevenue: 50,
      averageOrderValue: 25,
      codAmount: 30,
      digitalAmount: 20,
      offlineOrderCount: 1,
      offlineAmount: 30,
      onlineOrderCount: 1,
      onlineAmount: 20,
    });
    expect(
      result.statusBreakdown.reduce((total, entry) => total + entry.count, 0),
    ).toBe(result.totalOrders);
    expect(result.orders).toHaveLength(result.totalOrders);
    expect(result.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'order-cash',
          status: OrderStatus.CONFIRMED,
          orderType: 'DELIVERY',
          groupOrderId: null,
          paymentMethod: PaymentMethod.COD,
          totalAmount: 30,
        }),
        expect.objectContaining({
          id: 'order-online',
          status: OrderStatus.DELIVERED,
          groupOrderId: 'group-1',
        }),
        expect.objectContaining({
          id: 'order-cancelled',
          status: OrderStatus.CANCELLED,
        }),
        expect.objectContaining({
          id: 'order-rejected',
          status: OrderStatus.REJECTED,
        }),
      ]),
    );
    expect(result.payoutActivity).toEqual([
      expect.objectContaining({
        id: 'payout-1',
        amount: 40,
        status: 'PAID',
        paymentReference: 'BANK-1',
      }),
    ]);
    const aggregateCalls = prisma.order.aggregate.mock.calls as Array<
      [{ where?: { status?: { in?: OrderStatus[] } } }]
    >;
    const recognizedRevenueAggregate = aggregateCalls[1]?.[0];
    expect(recognizedRevenueAggregate?.where?.status?.in).toEqual(
      expect.arrayContaining([OrderStatus.CONFIRMED]),
    );
  });

  it('filters order rows to the same successful statuses used by totals', async () => {
    const order = {
      aggregate: jest
        .fn()
        .mockResolvedValueOnce({
          _count: { id: 1 },
          _sum: { deliveryFee: 0, discountAmount: 0 },
        })
        .mockResolvedValueOnce({
          _count: { id: 1 },
          _sum: { totalAmount: 100 },
          _avg: { totalAmount: 100 },
        }),
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const orderItem = { findMany: jest.fn().mockResolvedValue([]) };
    const restaurantPayoutRequest = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      order,
      orderItem,
      restaurantPayoutRequest,
      $transaction: jest.fn((queries: Array<Promise<unknown>>) =>
        Promise.all(queries),
      ),
    };
    const repository = new AdminReportsRepository(prisma as never);

    await repository.getOrdersReport(
      { restaurantId: 'restaurant-1' },
      { successfulOnly: true },
    );

    const findManyCalls = order.findMany.mock.calls as unknown as Array<
      [{ where: { status: { in: OrderStatus[] } } }]
    >;
    const successfulRowsCall = findManyCalls[1][0];
    const reportRowsCall = findManyCalls[2][0];
    expect(successfulRowsCall.where.status.in).toContain(OrderStatus.CONFIRMED);
    expect(reportRowsCall.where.status.in).toContain(OrderStatus.CONFIRMED);
    expect(reportRowsCall).toMatchObject({
      orderBy: [{ createdAt: 'asc' }],
    });
  });

  it('counts successful REFUNDED transactions in refunded and net revenue', async () => {
    const paymentTransaction = {
      aggregate: jest
        .fn()
        .mockResolvedValueOnce({ _sum: { amount: 100 } })
        .mockResolvedValueOnce({ _sum: { amount: 25 } }),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest
        .fn()
        .mockResolvedValueOnce([
          { paymentMethod: PaymentMethod.STRIPE, _sum: { amount: 100 } },
        ])
        .mockResolvedValueOnce([
          { paymentMethod: PaymentMethod.STRIPE, _sum: { amount: 25 } },
        ]),
    };
    const prisma = {
      order: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { id: 1 },
          _sum: {
            totalAmount: 100,
            taxAmount: 0,
            deliveryFee: 0,
            discountAmount: 0,
          },
          _avg: { totalAmount: 100 },
        }),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([
          {
            paymentMethod: PaymentMethod.COD,
            _sum: { totalAmount: 50 },
          },
        ]),
      },
      paymentTransaction,
      $transaction: jest.fn((queries: Array<Promise<unknown>>) =>
        Promise.all(queries),
      ),
    };
    const repository = new AdminReportsRepository(prisma as never);

    const result = await repository.getFinancialReport(
      { tenantId: 'tenant-1', restaurantId: 'restaurant-1' },
      { fromDate: '2026-08-21', toDate: '2026-08-21' },
    );

    const financialAggregateCalls = prisma.order.aggregate.mock
      .calls as unknown as Array<
      [{ where: { createdAt: { gte: Date; lte: Date } } }]
    >;
    const financialAggregateCall = financialAggregateCalls[0][0];
    expect(financialAggregateCall.where.createdAt).toEqual({
      gte: new Date('2026-08-21T00:00:00.000Z'),
      lte: new Date('2026-08-21T23:59:59.999Z'),
    });
    expect(result.refundedAmount).toBe(25);
    expect(result.netRevenue).toBe(75);
    expect(result.codAmount).toBe(50);
    expect(result.onlineAmount).toBe(75);
    expect(result.stripeAmount).toBe(75);
    expect(result.paypalAmount).toBe(0);
    expect(result.paymentMethodRevenue).toEqual([
      {
        paymentMethod: PaymentMethod.STRIPE,
        received: 100,
        refunded: 25,
        netReceived: 75,
      },
    ]);
    const orderGroupByCalls = prisma.order.groupBy.mock
      .calls as unknown as Array<
      [
        {
          where: {
            status?: { in?: OrderStatus[] };
            paymentStatus?: PaymentStatus;
          };
        },
      ]
    >;
    const successfulOrdersByMethod = orderGroupByCalls[0][0];
    expect(successfulOrdersByMethod.where.status?.in).toEqual(
      expect.arrayContaining([OrderStatus.CONFIRMED, OrderStatus.DELIVERED]),
    );
    expect(successfulOrdersByMethod.where.paymentStatus).toBeUndefined();
    type PaymentQueryCall = [
      {
        where: {
          type: PaymentTransactionType;
          status: PaymentStatus;
        };
      },
    ];
    const aggregateCalls = paymentTransaction.aggregate.mock
      .calls as unknown as PaymentQueryCall[];
    const groupByCalls = paymentTransaction.groupBy.mock
      .calls as unknown as PaymentQueryCall[];

    expect(aggregateCalls[1][0].where).toMatchObject({
      type: PaymentTransactionType.REFUND,
      status: PaymentStatus.REFUNDED,
    });
    expect(groupByCalls[1][0].where).toMatchObject({
      type: PaymentTransactionType.REFUND,
      status: PaymentStatus.REFUNDED,
    });
  });
});
