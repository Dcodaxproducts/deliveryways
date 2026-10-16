/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { OrderStatus } from '@prisma/client';
import { AnalyticsCopilotRepository } from './analytics-copilot.repository';

const aggregate = jest.fn();
const orderGroupBy = jest.fn();
const itemGroupBy = jest.fn();
const staffGroupBy = jest.fn();
const rawQuery = jest.fn();
const transaction = jest.fn();
const prisma = {
  order: { aggregate, groupBy: orderGroupBy },
  orderItem: { groupBy: itemGroupBy },
  staffActivityLog: { groupBy: staffGroupBy },
  $queryRaw: rawQuery,
  $transaction: transaction,
};

describe('AnalyticsCopilotRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    aggregate.mockReturnValue('sales-query');
    orderGroupBy
      .mockReturnValueOnce('status-query')
      .mockReturnValueOnce('payment-query');
    itemGroupBy.mockReturnValue('items-query');
    rawQuery.mockReturnValue('hours-query');
    staffGroupBy.mockReturnValue('staff-query');
    transaction.mockResolvedValue([
      {
        _count: { id: 5 },
        _sum: { totalAmount: 200 },
        _avg: { totalAmount: 40 },
      },
      [
        { status: OrderStatus.CANCELLED, _count: { id: 1 } },
        { status: OrderStatus.DELIVERED, _count: { id: 5 } },
      ],
      [{ paymentMethod: 'COD', _count: { id: 5 }, _sum: { totalAmount: 200 } }],
      [
        {
          menuItemId: 'item-1',
          _sum: { quantity: 7, lineTotal: 140 },
          _max: { menuItemName: 'Burger' },
        },
      ],
      [{ hour: 18, orderCount: BigInt(5), revenue: 200 }],
      [{ staffUserId: 'staff-1', staffName: 'Alex', _count: { id: 3 } }],
    ]);
  });

  it('uses six fixed aggregate/group queries with tenant, restaurant, date, and hard group limits', async () => {
    const repository = new AnalyticsCopilotRepository(prisma as never);
    const result = await repository.getSnapshot(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        ownerUserId: 'owner-1',
      },
      {
        fromDate: '2026-10-10',
        toDate: '2026-10-16',
        startUtc: new Date('2026-10-10T00:00:00Z'),
        endExclusiveUtc: new Date('2026-10-17T00:00:00Z'),
        dayCount: 7,
      },
      'Europe/Berlin',
    );
    expect(transaction.mock.calls[0][0]).toHaveLength(6);
    expect(itemGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        where: {
          order: expect.objectContaining({
            tenantId: 'tenant-1',
            restaurantId: 'restaurant-1',
            branchId: 'branch-1',
            status: { in: expect.arrayContaining([OrderStatus.DELIVERED]) },
          }),
        },
      }),
    );
    expect(staffGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        where: expect.objectContaining({
          ownerUserId: 'owner-1',
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
        }),
      }),
    );
    expect(result).toMatchObject({
      sales: { successfulOrders: 5, revenue: 200 },
      cancellations: { cancelledOrders: 1, consideredOrders: 6, rate: 16.67 },
      busyHours: [{ hour: 18, orderCount: 5 }],
      staffPerformance: [{ displayName: 'Alex', activityCount: 3 }],
    });
  });
});
