import { OrderStatus, PaymentMethod, UserRole } from '@prisma/client';
import { AdminDashboardRepository } from './admin-dashboard.repository';

describe('AdminDashboardRepository', () => {
  it('includes successful order totals in the global overview', async () => {
    const prisma = {
      $transaction: jest.fn((queries: unknown[]) => Promise.resolve(queries)),
      tenant: {
        count: jest.fn().mockReturnValueOnce(3).mockReturnValueOnce(2),
      },
      restaurant: {
        count: jest.fn().mockReturnValueOnce(12).mockReturnValueOnce(10),
      },
      branch: {
        count: jest.fn().mockReturnValueOnce(20).mockReturnValueOnce(18),
      },
      user: {
        count: jest.fn().mockReturnValueOnce(50).mockReturnValueOnce(45),
      },
      order: {
        aggregate: jest.fn().mockReturnValue({
          _count: { id: 240 },
          _sum: { totalAmount: 13842.5 },
        }),
      },
    };
    const repository = new AdminDashboardRepository(prisma as never);

    await expect(repository.getOverview()).resolves.toMatchObject({
      restaurants: { total: 12, active: 10, inactive: 2 },
      orders: { total: 240, revenue: 13842.5, currency: 'EUR' },
    });
    const orderAggregateCalls = prisma.order.aggregate.mock
      .calls as unknown as Array<
      [{ where: { status: { in: OrderStatus[] } } }]
    >;
    expect(orderAggregateCalls[0][0].where.status.in).toEqual(
      expect.arrayContaining([OrderStatus.CONFIRMED, OrderStatus.DELIVERED]),
    );
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
});
