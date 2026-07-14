import { UserRole } from '@prisma/client';
import { AdminDashboardRepository } from './admin-dashboard.repository';

describe('AdminDashboardRepository', () => {
  it('counts business owner stats using the same visible active owner/tenant filter as the superadmin list', async () => {
    const prisma = {
      tenant: {
        count: jest.fn().mockResolvedValue(68),
      },
    };
    const repository = new AdminDashboardRepository(prisma as never);

    await expect(repository.getBusinessOwnersStats()).resolves.toEqual({
      totalBusinessOwners: 68,
      activeBusinessOwners: 68,
      inactiveBusinessOwners: 0,
    });

    expect(prisma.tenant.count).toHaveBeenCalledWith({
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
  });
});
