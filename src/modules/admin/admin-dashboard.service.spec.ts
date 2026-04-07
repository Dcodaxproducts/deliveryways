import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService', () => {
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

    await expect(service.getOverview()).resolves.toEqual({
      data: {
        tenants: { total: 10, active: 7, inactive: 3 },
        restaurants: { total: 20, active: 15, inactive: 5 },
        branches: { total: 50, active: 41, inactive: 9 },
        customers: { total: 1000, active: 960, inactive: 40 },
      },
      message: 'Admin dashboard overview fetched successfully',
    });
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
        ],
      }),
    };

    const service = new AdminDashboardService(repository as never);

    await expect(
      service.getTopPerformingRestaurants({ range: 'all-time', limit: 5 }),
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
        ],
      },
      message: 'Admin dashboard top restaurants fetched successfully',
    });
    expect(repository.getTopPerformingRestaurants).toHaveBeenCalledWith(
      'all-time',
      5,
    );
  });
});
