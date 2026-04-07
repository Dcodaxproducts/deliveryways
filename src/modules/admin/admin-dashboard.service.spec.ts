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
});
