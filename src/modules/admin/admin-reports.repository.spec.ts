import {
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
} from '@prisma/client';
import { AdminReportsRepository } from './admin-reports.repository';

describe('AdminReportsRepository', () => {
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
