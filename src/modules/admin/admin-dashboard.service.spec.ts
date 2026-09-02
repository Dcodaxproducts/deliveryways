import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService', () => {
  it('returns restaurant dashboard overview for branch admin scope', async () => {
    const repository = {
      getRestaurantOverview: jest.fn().mockResolvedValue({
        totalOrders: 18,
        totalRevenue: 22500,
        averageOrderValue: 1250,
        activeOrders: 4,
        totalCustomers: 90,
        activeCustomers: 73,
        totalDeliverymen: 7,
        availableDeliverymen: 3,
        totalEmployees: 11,
        activeEmployees: 9,
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getRestaurantOverview(
        {
          uid: 'branch-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: 'BRANCH_ADMIN',
        } as never,
        {},
      ),
    ).resolves.toEqual({
      data: {
        totalOrders: 18,
        totalRevenue: 22500,
        averageOrderValue: 1250,
        activeOrders: 4,
        totalCustomers: 90,
        activeCustomers: 73,
        totalDeliverymen: 7,
        availableDeliverymen: 3,
        totalEmployees: 11,
        activeEmployees: 9,
      },
      message: 'Restaurant dashboard overview fetched successfully',
    });
  });

  it('returns overview stats with active and inactive splits', async () => {
    const repository = {
      getOverview: jest.fn().mockResolvedValue({
        tenants: { total: 10, active: 7, inactive: 3 },
        restaurants: { total: 20, active: 15, inactive: 5 },
        branches: { total: 50, active: 41, inactive: 9 },
        customers: { total: 1000, active: 960, inactive: 40 },
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getOverview({ uid: 'super-1', role: 'SUPER_ADMIN' } as never),
    ).resolves.toEqual({
      data: {
        tenants: { total: 10, active: 7, inactive: 3 },
        restaurants: { total: 20, active: 15, inactive: 5 },
        branches: { total: 50, active: 41, inactive: 9 },
        customers: { total: 1000, active: 960, inactive: 40 },
      },
      message: 'Admin dashboard overview fetched successfully',
    });
  });

  it('allows super-admin-panel staff to load the global overview', async () => {
    const repository = {
      getOverview: jest.fn().mockResolvedValue({
        tenants: { total: 10, active: 7, inactive: 3 },
        restaurants: { total: 20, active: 15, inactive: 5 },
        branches: { total: 50, active: 41, inactive: 9 },
        customers: { total: 1000, active: 960, inactive: 40 },
        orders: { total: 2500 },
      }),
    };
    const service = new AdminDashboardService(repository as never);

    await service.getOverview({
      uid: 'staff-1',
      role: 'STAFF',
      actorType: 'STAFF',
      panelType: 'SUPER_ADMIN',
    } as never);

    expect(repository.getOverview).toHaveBeenCalledTimes(1);
  });

  it('rejects staff from a restaurant panel from the global overview', async () => {
    const repository = { getOverview: jest.fn() };
    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getOverview({
        uid: 'staff-1',
        role: 'STAFF',
        actorType: 'STAFF',
        panelType: 'BUSINESS_ADMIN',
      } as never),
    ).rejects.toThrow('Super-admin dashboard access is required');
    expect(repository.getOverview).not.toHaveBeenCalled();
  });

  it('returns restaurant trend data', async () => {
    const repository = {
      getOverview: jest.fn(),
      getRestaurantTrend: jest.fn().mockResolvedValue({
        range: 'daily',
        totalCreatedInRange: 6,
        points: [
          { key: '2026-04-01', label: 'Mon', value: 1, cumulativeTotal: 11 },
        ],
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getRestaurantTrend({ range: 'daily' }),
    ).resolves.toEqual({
      data: {
        range: 'daily',
        totalCreatedInRange: 6,
        points: [
          {
            key: '2026-04-01',
            label: 'Mon',
            value: 1,
            cumulativeTotal: 11,
          },
        ],
      },
      message: 'Admin dashboard restaurant trend fetched successfully',
    });
    expect(repository.getRestaurantTrend).toHaveBeenCalledWith('daily');
  });

  it('returns scoped orders trend data for business admin', async () => {
    const repository = {
      getOverview: jest.fn(),
      getRestaurantTrend: jest.fn(),
      findRestaurantScope: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
      }),
      getOrdersTrend: jest.fn().mockResolvedValue({
        range: 'monthly',
        totalOrdersInRange: 28,
        points: [
          { key: '2026-04', label: 'Apr', value: 28, cumulativeTotal: 140 },
        ],
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getOrdersTrend(
        {
          uid: 'business-1',
          tid: 'tenant-1',
          role: 'BUSINESS_ADMIN',
        } as never,
        { range: 'monthly', restaurantId: 'restaurant-1' },
      ),
    ).resolves.toEqual({
      data: {
        range: 'monthly',
        totalOrdersInRange: 28,
        points: [
          {
            key: '2026-04',
            label: 'Apr',
            value: 28,
            cumulativeTotal: 140,
          },
        ],
      },
      message: 'Admin dashboard orders trend fetched successfully',
    });
    expect(repository.getOrdersTrend).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
      },
      'monthly',
    );
  });

  it('locks branch admin trend queries to own branch', async () => {
    const repository = {
      getOverview: jest.fn(),
      getRestaurantTrend: jest.fn(),
      getOrdersTrend: jest.fn().mockResolvedValue({
        range: 'daily',
        totalOrdersInRange: 10,
        points: [],
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await service.getOrdersTrend(
      {
        uid: 'branch-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: 'BRANCH_ADMIN',
      } as never,
      { range: 'daily', branchId: 'branch-1' },
    );

    expect(repository.getOrdersTrend).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      'daily',
    );
  });

  it('returns top performing restaurants data', async () => {
    const repository = {
      getOverview: jest.fn(),
      getRestaurantTrend: jest.fn(),
      getTopPerformingRestaurants: jest.fn().mockResolvedValue({
        range: 'all-time',
        items: [
          {
            rank: 1,
            restaurantId: 'restaurant-1',
            name: 'Dragon Wok',
            slug: 'dragon-wok',
            logoUrl: null,
            coverImage: null,
            ordersCount: 342,
            customersCount: 180,
          },
          {
            rank: 2,
            restaurantId: 'restaurant-2',
            name: 'KFC',
            slug: 'kfc',
            logoUrl: null,
            coverImage: null,
            ordersCount: 0,
            customersCount: 12,
          },
        ],
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getTopPerformingRestaurants(
        {
          uid: 'super-1',
          role: 'SUPER_ADMIN',
        } as never,
        { range: 'all-time', limit: 5 },
      ),
    ).resolves.toEqual({
      data: {
        range: 'all-time',
        items: [
          {
            rank: 1,
            restaurantId: 'restaurant-1',
            name: 'Dragon Wok',
            slug: 'dragon-wok',
            logoUrl: null,
            coverImage: null,
            ordersCount: 342,
            customersCount: 180,
          },
          {
            rank: 2,
            restaurantId: 'restaurant-2',
            name: 'KFC',
            slug: 'kfc',
            logoUrl: null,
            coverImage: null,
            ordersCount: 0,
            customersCount: 12,
          },
        ],
      },
      message: 'Admin dashboard top restaurants fetched successfully',
    });
    expect(repository.getTopPerformingRestaurants).toHaveBeenCalledWith(
      {},
      'all-time',
      5,
    );
  });

  it('returns scoped revenue trend data for business admin', async () => {
    const repository = {
      getRevenueTrend: jest.fn().mockResolvedValue({
        range: 'weekly',
        totalRevenueInRange: 25000,
        currency: 'PKR',
        points: [
          {
            key: '2026-04-01_2026-04-07',
            label: 'Apr 1 - Apr 7',
            value: 12000,
            cumulativeTotal: 12000,
          },
        ],
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getRevenueTrend(
        {
          uid: 'business-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: 'BUSINESS_ADMIN',
        } as never,
        { range: 'weekly', restaurantId: 'restaurant-1' },
      ),
    ).resolves.toEqual({
      data: {
        range: 'weekly',
        totalRevenueInRange: 25000,
        currency: 'PKR',
        points: [
          {
            key: '2026-04-01_2026-04-07',
            label: 'Apr 1 - Apr 7',
            value: 12000,
            cumulativeTotal: 12000,
          },
        ],
      },
      message: 'Admin dashboard revenue trend fetched successfully',
    });

    expect(repository.getRevenueTrend).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
      },
      'weekly',
    );
  });

  it('returns order stats for branch admin scope', async () => {
    const repository = {
      getOrdersStats: jest.fn().mockResolvedValue({
        totalOrders: 15,
        totalRevenue: 18000,
        averageOrderValue: 1200,
        statusBreakdown: [{ status: 'DELIVERED', count: 8 }],
        paymentStatusBreakdown: [{ status: 'PAID', count: 10 }],
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getOrdersStats(
        {
          uid: 'branch-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: 'BRANCH_ADMIN',
        } as never,
        {},
      ),
    ).resolves.toEqual({
      data: {
        totalOrders: 15,
        totalRevenue: 18000,
        averageOrderValue: 1200,
        statusBreakdown: [{ status: 'DELIVERED', count: 8 }],
        paymentStatusBreakdown: [{ status: 'PAID', count: 10 }],
      },
      message: 'Admin dashboard order stats fetched successfully',
    });
  });

  it('returns customer stats for super admin scope', async () => {
    const repository = {
      getCustomersStats: jest.fn().mockResolvedValue({
        totalCustomers: 200,
        activeCustomers: 170,
        inactiveCustomers: 30,
        newCustomersLast30Days: 42,
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getCustomersStats(
        {
          uid: 'super-1',
          role: 'SUPER_ADMIN',
        } as never,
        {},
      ),
    ).resolves.toEqual({
      data: {
        totalCustomers: 200,
        activeCustomers: 170,
        inactiveCustomers: 30,
        newCustomersLast30Days: 42,
      },
      message: 'Admin dashboard customer stats fetched successfully',
    });
  });

  it('returns business owner stats for super admin dashboard', async () => {
    const repository = {
      getBusinessOwnersStats: jest.fn().mockResolvedValue({
        totalBusinessOwners: 12,
        activeBusinessOwners: 9,
        inactiveBusinessOwners: 3,
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(service.getBusinessOwnersStats()).resolves.toEqual({
      data: {
        totalBusinessOwners: 12,
        activeBusinessOwners: 9,
        inactiveBusinessOwners: 3,
      },
      message: 'Admin dashboard business owner stats fetched successfully',
    });
  });

  it('returns deliverymen stats for business admin scope', async () => {
    const repository = {
      getDeliverymenStats: jest.fn().mockResolvedValue({
        totalDeliverymen: 8,
        activeDeliverymen: 6,
        inactiveDeliverymen: 2,
        statusBreakdown: [{ status: 'AVAILABLE', count: 3 }],
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getDeliverymenStats(
        {
          uid: 'business-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: 'BUSINESS_ADMIN',
        } as never,
        {},
      ),
    ).resolves.toEqual({
      data: {
        totalDeliverymen: 8,
        activeDeliverymen: 6,
        inactiveDeliverymen: 2,
        statusBreakdown: [{ status: 'AVAILABLE', count: 3 }],
      },
      message: 'Admin dashboard deliverymen stats fetched successfully',
    });
  });

  it('returns employee stats for business admin scope', async () => {
    const repository = {
      getEmployeesStats: jest.fn().mockResolvedValue({
        totalEmployees: 12,
        activeEmployees: 10,
        inactiveEmployees: 2,
        totalRoles: 3,
        roleBreakdown: [{ staffRoleId: 'role-1', name: 'Cashier', count: 5 }],
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getEmployeesStats(
        {
          uid: 'business-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: 'BUSINESS_ADMIN',
        } as never,
        {},
      ),
    ).resolves.toEqual({
      data: {
        totalEmployees: 12,
        activeEmployees: 10,
        inactiveEmployees: 2,
        totalRoles: 3,
        roleBreakdown: [{ staffRoleId: 'role-1', name: 'Cashier', count: 5 }],
      },
      message: 'Admin dashboard employee stats fetched successfully',
    });
  });

  it('returns system alerts with resolved tenant scope', async () => {
    const repository = {
      getSystemAlerts: jest.fn().mockResolvedValue({
        items: [
          {
            key: 'failed-payments',
            severity: 'warning',
            title: 'Failed payments detected',
            message: '3 payment attempts failed in the last 24 hours',
            count: 3,
          },
        ],
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getSystemAlerts(
        {
          uid: 'business-1',
          tid: 'tenant-1',
          role: 'BUSINESS_ADMIN',
        } as never,
        {},
      ),
    ).resolves.toEqual({
      data: {
        items: [
          {
            key: 'failed-payments',
            severity: 'warning',
            title: 'Failed payments detected',
            message: '3 payment attempts failed in the last 24 hours',
            count: 3,
          },
        ],
      },
      message: 'Admin dashboard system alerts fetched successfully',
    });
  });

  it('returns recent activity with requested limit', async () => {
    const repository = {
      getRecentActivity: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'order-1',
            type: 'ORDER',
            title: 'New order activity',
            description: 'Order order-1 is currently PLACED',
            occurredAt: new Date('2026-04-15T10:00:00.000Z'),
            entityId: 'order-1',
            entityType: 'order',
          },
        ],
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getRecentActivity(
        {
          uid: 'super-1',
          role: 'SUPER_ADMIN',
        } as never,
        { limit: 5 },
      ),
    ).resolves.toEqual({
      data: {
        items: [
          {
            id: 'order-1',
            type: 'ORDER',
            title: 'New order activity',
            description: 'Order order-1 is currently PLACED',
            occurredAt: new Date('2026-04-15T10:00:00.000Z'),
            entityId: 'order-1',
            entityType: 'order',
          },
        ],
      },
      message: 'Admin dashboard recent activity fetched successfully',
    });

    expect(repository.getRecentActivity).toHaveBeenCalledWith({}, 5);
  });
});
