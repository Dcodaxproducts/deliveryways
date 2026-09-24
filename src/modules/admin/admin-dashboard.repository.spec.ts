import { OrderStatus, PaymentMethod, UserRole } from '@prisma/client';
import { AdminDashboardRepository } from './admin-dashboard.repository';

describe('AdminDashboardRepository', () => {
  it('includes successful order count and revenue in the superadmin overview', async () => {
    const prisma = {
      $transaction: jest.fn((queries: unknown[]) => Promise.resolve(queries)),
      tenant: {
        count: jest.fn().mockReturnValueOnce(2).mockReturnValueOnce(1),
      },
      restaurant: {
        count: jest.fn().mockReturnValueOnce(3).mockReturnValueOnce(2),
      },
      branch: {
        count: jest.fn().mockReturnValueOnce(4).mockReturnValueOnce(3),
      },
      user: {
        count: jest.fn().mockReturnValueOnce(5).mockReturnValueOnce(4),
      },
      order: {
        aggregate: jest.fn().mockReturnValue({
          _count: { id: 6 },
          _sum: { totalAmount: 321.5 },
        }),
      },
    };
    const globalSettings = {
      getDefaultCurrencyCode: jest.fn().mockResolvedValue('GBP'),
    };
    const repository = new AdminDashboardRepository(
      prisma as never,
      globalSettings as never,
    );

    await expect(repository.getOverview()).resolves.toEqual({
      tenants: { total: 2, active: 1, inactive: 1 },
      restaurants: { total: 3, active: 2, inactive: 1 },
      branches: { total: 4, active: 3, inactive: 1 },
      customers: { total: 5, active: 4, inactive: 1 },
      orders: { total: 6, revenue: 321.5, currency: 'GBP' },
    });
    const aggregateCalls = prisma.order.aggregate.mock
      .calls as unknown as Array<
      [{ where: { status: { in: OrderStatus[] } } }]
    >;
    const aggregateCall = aggregateCalls[0][0];
    expect(aggregateCall.where.status.in).toEqual(
      expect.arrayContaining([OrderStatus.CONFIRMED, OrderStatus.DELIVERED]),
    );
    expect(globalSettings.getDefaultCurrencyCode).toHaveBeenCalledTimes(1);
  });

  it('uses successful orders for dashboard totals while retaining cancellation breakdown', async () => {
    const prisma = {
      $transaction: jest.fn((queries: unknown[]) => Promise.resolve(queries)),
      order: {
        aggregate: jest.fn().mockReturnValue({
          _count: { id: 2 },
          _sum: { totalAmount: 1008 },
          _avg: { totalAmount: 504 },
        }),
        groupBy: jest.fn().mockReturnValue([
          {
            paymentMethod: PaymentMethod.COD,
            _sum: { totalAmount: 408 },
          },
          {
            paymentMethod: PaymentMethod.STRIPE,
            _sum: { totalAmount: 600 },
          },
        ]),
        findMany: jest.fn().mockReturnValue([
          { status: OrderStatus.DELIVERED, paymentStatus: 'PAID' },
          { status: OrderStatus.CANCELLED, paymentStatus: 'CANCELLED' },
        ]),
      },
    };
    const repository = new AdminDashboardRepository(prisma as never);

    const result = await repository.getOrdersStats(
      { restaurantId: 'restaurant-1' },
      'order',
    );

    const aggregateCalls = prisma.order.aggregate.mock
      .calls as unknown as Array<
      [{ where: { restaurantId: string; status: { in: OrderStatus[] } } }]
    >;
    const aggregateCall = aggregateCalls[0][0];
    expect(aggregateCall.where.restaurantId).toBe('restaurant-1');
    expect(aggregateCall.where.status.in).toContain(OrderStatus.CONFIRMED);
    expect(aggregateCall.where.status.in).toContain(OrderStatus.DELIVERED);
    expect(result.totalOrders).toBe(2);
    expect(result.totalRevenue).toBe(1008);
    expect(result.codAmount).toBe(408);
    expect(result.digitalAmount).toBe(600);
    expect(result.statusBreakdown).toContainEqual({
      status: OrderStatus.CANCELLED,
      count: 1,
    });
    const groupByCalls = prisma.order.groupBy.mock.calls as unknown as Array<
      [
        {
          where: {
            restaurantId: string;
            sourceGroupOrder: { is: null };
          };
        },
      ]
    >;
    expect(groupByCalls[0][0].where).toMatchObject({
      restaurantId: 'restaurant-1',
      sourceGroupOrder: { is: null },
    });
  });

  it('counts business owner stats using the same non-deleted owner/tenant filter as the includeInactive superadmin list', async () => {
    const prisma = {
      $transaction: jest.fn((queries: unknown[]) => Promise.resolve(queries)),
      tenant: {
        count: jest.fn().mockReturnValueOnce(68).mockReturnValueOnce(66),
      },
    };
    const repository = new AdminDashboardRepository(prisma as never);

    await expect(repository.getBusinessOwnersStats()).resolves.toEqual({
      totalBusinessOwners: 68,
      activeBusinessOwners: 66,
      inactiveBusinessOwners: 2,
    });

    expect(prisma.tenant.count).toHaveBeenNthCalledWith(1, {
      where: {
        deletedAt: null,
        owner: {
          role: UserRole.BUSINESS_ADMIN,
          deletedAt: null,
        },
      },
    });
    expect(prisma.tenant.count).toHaveBeenNthCalledWith(2, {
      where: {
        deletedAt: null,
        isActive: true,
        owner: {
          role: UserRole.BUSINESS_ADMIN,
          deletedAt: null,
          isActive: true,
        },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('counts all scoped employee roles including roles without employees', async () => {
    const prisma = {
      $transaction: jest.fn((queries: unknown[]) => Promise.resolve(queries)),
      staffUser: {
        count: jest.fn().mockReturnValueOnce(4).mockReturnValueOnce(3),
        findMany: jest.fn().mockReturnValue([
          {
            staffRoleId: 'role-1',
            staffRole: { name: 'Cashier' },
          },
          {
            staffRoleId: 'role-1',
            staffRole: { name: 'Cashier' },
          },
        ]),
      },
      staffRole: {
        count: jest.fn().mockReturnValue(3),
      },
    };
    const repository = new AdminDashboardRepository(prisma as never);

    await expect(
      repository.getEmployeesStats({ tenantId: 'tenant-1' }),
    ).resolves.toMatchObject({
      totalEmployees: 4,
      activeEmployees: 3,
      inactiveEmployees: 1,
      totalRoles: 3,
      roleBreakdown: [{ staffRoleId: 'role-1', name: 'Cashier', count: 2 }],
    });

    expect(prisma.staffRole.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        tenantId: 'tenant-1',
      },
    });
  });

  it('keeps range fallback cumulative semantics in a Prisma transaction', async () => {
    const count = jest.fn().mockResolvedValue(5);
    const findMany = jest.fn().mockResolvedValue([{ createdAt: new Date() }]);
    const transaction = jest.fn((queries: Array<Promise<unknown>>) =>
      Promise.all(queries),
    );
    const repository = new AdminDashboardRepository({
      order: { count, findMany },
      $transaction: transaction,
    } as never);

    const result = await repository.getOrdersTrend(
      { branchId: 'branch-1' },
      'daily',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
    expect(result.range).toBe('daily');
    expect(result.period.explicit).toBe(false);
    expect(result.points.at(-1)?.cumulativeTotal).toBe(6);
  });

  it.each([
    ['daily', '2026-09-01', '2026-09-03', 3],
    ['weekly', '2026-09-01', '2026-09-15', 3],
    ['monthly', '2026-01-15', '2026-03-02', 3],
    [undefined, '2026-09-01', '2026-09-03', 3],
  ] as const)(
    'uses deterministic UTC %s buckets for explicit periods',
    async (range, fromDate, toDate, expectedBuckets) => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn();
      const repository = new AdminDashboardRepository({
        order: { findMany, count },
      } as never);

      const result = await repository.getOrdersTrend(
        { tenantId: 'tenant-1', restaurantId: 'restaurant-1' },
        { range, fromDate, toDate, kind: 'order' },
      );

      expect(result.points).toHaveLength(expectedBuckets);
      expect(result.range).toBe(range ?? 'daily');
      expect(result.period).toEqual({
        fromDate: `${fromDate}T00:00:00.000Z`,
        toDate: new Date(
          new Date(`${toDate}T00:00:00.000Z`).getTime() + 86_399_999,
        ).toISOString(),
        timeZone: 'UTC',
        explicit: true,
      });
      expect(count).not.toHaveBeenCalled();
      const findManyCalls = findMany.mock.calls as unknown as Array<
        [{ where: Record<string, unknown> }]
      >;
      const where = findManyCalls[0][0].where;
      expect(where).toMatchObject({
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        sourceGroupOrder: { is: null },
        createdAt: {
          gte: new Date(`${fromDate}T00:00:00.000Z`),
          lt: new Date(
            new Date(`${toDate}T00:00:00.000Z`).getTime() + 86_400_000,
          ),
        },
      });
      expect(where).not.toHaveProperty('status');
    },
  );

  it('keeps paid revenue semantics while applying explicit period and group scope', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        amount: 25,
        currency: 'EUR',
        createdAt: new Date('2026-09-03T23:59:59.999Z'),
      },
    ]);
    const repository = new AdminDashboardRepository(
      { paymentTransaction: { findMany } } as never,
      { getDefaultCurrencyCode: jest.fn().mockResolvedValue('EUR') } as never,
    );

    const result = await repository.getRevenueTrend(
      { restaurantId: 'restaurant-1', branchId: 'branch-1' },
      {
        fromDate: '2026-09-01',
        toDate: '2026-09-03',
        kind: 'group-orders',
      },
    );

    expect(result.totalRevenueInRange).toBe(25);
    const findManyCalls = findMany.mock.calls as unknown as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(findManyCalls[0][0].where).toMatchObject({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      type: 'CHARGE',
      status: 'PAID',
      order: { is: { sourceGroupOrder: { isNot: null } } },
      createdAt: {
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lt: new Date('2026-09-04T00:00:00.000Z'),
      },
    });
  });
});
