import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
} from '@prisma/client';
import { AdminReportsRepository } from './admin-reports.repository';

describe('AdminReportsRepository', () => {
  it('applies excluded status and schedule dates to order report aggregation', async () => {
    const order = {
      aggregate: jest
        .fn()
        .mockResolvedValueOnce({
          _count: { id: 0 },
          _sum: { deliveryFee: 0, discountAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { totalAmount: 0 },
          _avg: { totalAmount: 0 },
        }),
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const orderItem = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = {
      order,
      orderItem,
      $transaction: jest.fn((queries: Array<Promise<unknown>>) =>
        Promise.all(queries),
      ),
    };
    const repository = new AdminReportsRepository(prisma as never);

    await repository.getOrdersReport(
      { restaurantId: 'restaurant-1' },
      {
        excludeStatus: OrderStatus.PAYMENT_PENDING,
        fromDate: '2026-08-21T00:00:00.000Z',
        toDate: '2026-08-21T23:59:59.999Z',
        orderTimeFrom: '2026-08-22T00:00:00.000Z',
        orderTimeTo: '2026-08-22T23:59:59.999Z',
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
    expect(order.aggregate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(order.aggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          ...expectedWhere,
          status: {
            in: expect.arrayContaining([
              OrderStatus.CONFIRMED,
              OrderStatus.DELIVERED,
            ]),
          },
        }),
      }),
    );
    expect(order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { order: expectedWhere } }),
    );
  });

  it('recognizes full confirmed order totals by cash and digital method', async () => {
    const prisma = {
      order: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({
            _count: { id: 3 },
            _sum: { deliveryFee: 6, discountAmount: 2 },
          })
          .mockResolvedValueOnce({
            _sum: { totalAmount: 75 },
            _avg: { totalAmount: 25 },
          }),
        groupBy: jest.fn().mockResolvedValue([
          { paymentMethod: PaymentMethod.COD, _sum: { totalAmount: 30 } },
          { paymentMethod: PaymentMethod.STRIPE, _sum: { totalAmount: 25 } },
          { paymentMethod: PaymentMethod.WALLET, _sum: { totalAmount: 20 } },
        ]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
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
      totalOrders: 3,
      totalRevenue: 75,
      averageOrderValue: 25,
      codAmount: 30,
      digitalAmount: 45,
    });
    expect(prisma.order.aggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: expect.arrayContaining([OrderStatus.CONFIRMED]) },
        }),
      }),
    );
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
      {},
    );

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
